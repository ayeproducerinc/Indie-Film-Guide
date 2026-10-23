import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { once } from "node:events";
import { eq, inArray } from "drizzle-orm";
import { db, pool, mailingContactsTable, mailingSignupLimitsTable, adminAttemptsTable } from "@workspace/db";
import { CreateMailingOptInResponse, GetAdminMailingListResponse, OptOutMailingContactResponse } from "@workspace/api-zod";
import { mailingContactsCsv, MAILING_CONSENT_TEXT, MAILING_CONSENT_VERSION } from "./mailing-list";

test("explicit opt-ins persist privately; admin export respects withdrawal and deletion", async () => {
  assert.equal((await pool.query("select current_database() as name")).rows[0].name, "heliumdb");
  // Isolated process-local credentials, never the running app's actual secrets.
  process.env.ADMIN_PASSWORD = `test-only-${randomUUID()}`;
  process.env.SESSION_SECRET = `test-only-${randomUUID()}`;
  const { default: app } = await import("../app");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const email = `mailing-${randomUUID()}@example.invalid`;
  const botEmail = `bot-${randomUUID()}@example.invalid`;
  let cookie = "";
  const limitKey = createHmac("sha256", process.env.SESSION_SECRET).update("mailing:127.0.0.1").digest("hex");
  const loginKey = createHmac("sha256", process.env.SESSION_SECRET).update("127.0.0.1").digest("hex");
  const request = (path: string, method = "GET", body?: unknown, admin = false, extra: Record<string, string> = {}) =>
    fetch(`${origin}/api${path}`, {
      method, headers: {
        "Content-Type": "application/json", Origin: origin,
        ...(admin ? { Cookie: cookie, "X-IFG-Admin": "1" } : {}), ...extra,
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    assert.equal((await request("/admin/mailing-list")).status, 401);
    assert.equal((await request("/admin/mailing-list/export")).status, 401);
    assert.equal((await request("/mailing-list/opt-ins", "POST", { email, consent: false })).status, 400);
    assert.equal((await request("/mailing-list/opt-ins", "POST", { email })).status, 400);
    assert.equal((await request("/mailing-list/opt-ins", "POST", { email: "bad", consent: true })).status, 400);
    assert.equal((await request("/mailing-list/opt-ins", "POST", { email, consent: true }, false, { Origin: "https://foreign.invalid" })).status, 403);
    assert.equal((await request("/mailing-list/opt-ins", "POST", { email, firstName: "x".repeat(5000), consent: true })).status, 413);
    assert.equal((await db.select().from(mailingContactsTable).where(eq(mailingContactsTable.email, email))).length, 0);
    assert.equal((await request("/mailing-list/opt-ins", "POST", { email: botEmail, consent: true, website: "bot" })).status, 200);
    assert.equal((await db.select().from(mailingContactsTable).where(eq(mailingContactsTable.email, botEmail))).length, 0);

    const input = { email: `  ${email.toUpperCase()}  `, firstName: "+SUM(1,2)", consent: true, source: "forged", status: "opted_out" };
    const first = await request("/mailing-list/opt-ins", "POST", input);
    assert.equal(first.status, 200);
    const publicResult = CreateMailingOptInResponse.parse(await first.json());
    assert.deepEqual(Object.keys(publicResult), ["message"]);
    const [saved] = await db.select().from(mailingContactsTable).where(eq(mailingContactsTable.email, email));
    assert.ok(saved);
    assert.equal(saved.source, "homepage");
    assert.equal(saved.status, "active");
    assert.equal(saved.consentText, MAILING_CONSENT_TEXT);
    assert.equal(saved.consentVersion, MAILING_CONSENT_VERSION);
    assert.ok(saved.consentAt instanceof Date);
    const repeats = await Promise.all(Array.from({ length: 3 }, () => request("/mailing-list/opt-ins", "POST", { email, consent: true, firstName: "overwrite" })));
    for (const response of repeats) assert.deepEqual(await response.json(), publicResult);
    const duplicates = await db.select().from(mailingContactsTable).where(eq(mailingContactsTable.email, email));
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0]!.firstName, "+SUM(1,2)");
    assert.equal(duplicates[0]!.consentAt.toISOString(), saved.consentAt.toISOString());
    assert.equal((await request(`/admin/mailing-list/${saved.id}/opt-out`, "PATCH")).status, 401);
    assert.equal((await request(`/admin/mailing-list/${saved.id}`, "DELETE")).status, 401);

    const login = await request("/admin/session", "POST", { password: process.env.ADMIN_PASSWORD }, true);
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const adminPage = await request("/admin/mailing-list?page=1", "GET", undefined, true);
    assert.equal(adminPage.status, 200);
    const contacts = GetAdminMailingListResponse.parse(await adminPage.json());
    assert.ok(contacts.contacts.some((row: { id: string }) => row.id === saved.id));
    assert.equal((await request("/admin/mailing-list?page=-1", "GET", undefined, true)).status, 400);
    const csv = await request("/admin/mailing-list/export", "GET", undefined, true);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type")!, /text\/csv/);
    assert.match(csv.headers.get("content-disposition")!, /attachment/);
    assert.equal(csv.headers.get("cache-control"), "no-store");
    const csvText = await csv.text();
    assert.ok(csvText.includes(email));
    assert.ok(csvText.includes(`"'${saved.firstName}"`), "Formula-like names must be neutralized.");
    assert.match(csvText, /No \(self-submitted opt-in\)/);
    assert.equal((await request(`/admin/mailing-list/${saved.id}/opt-out`, "PATCH", undefined, true, { "X-IFG-Admin": "0" })).status, 403);
    assert.equal((await request(`/admin/mailing-list/${saved.id}`, "DELETE", undefined, true, { Origin: "https://foreign.invalid" })).status, 403);
    const optOut = await request(`/admin/mailing-list/${saved.id}/opt-out`, "PATCH", undefined, true);
    assert.equal(optOut.status, 200);
    const optedOut = OptOutMailingContactResponse.parse(await optOut.json());
    assert.equal(optedOut.status, "opted_out");
    assert.ok(optedOut.optedOutAt);
    assert.ok(!(await (await request("/admin/mailing-list/export", "GET", undefined, true)).text()).includes(email));
    assert.deepEqual(await (await request("/mailing-list/opt-ins", "POST", { email, consent: true })).json(), publicResult);
    const [stillOut] = await db.select().from(mailingContactsTable).where(eq(mailingContactsTable.id, saved.id));
    assert.equal(stillOut!.status, "opted_out");
    const retryOut = OptOutMailingContactResponse.parse(await (await request(`/admin/mailing-list/${saved.id}/opt-out`, "PATCH", undefined, true)).json());
    assert.equal(retryOut.optedOutAt?.toISOString(), optedOut.optedOutAt?.toISOString(), "Retries preserve first withdrawal time.");
    assert.equal((await request(`/admin/mailing-list/${saved.id}`, "DELETE", undefined, true)).status, 204);
    assert.equal((await db.select().from(mailingContactsTable).where(eq(mailingContactsTable.id, saved.id))).length, 0);
    assert.equal((await request(`/admin/mailing-list/${saved.id}`, "DELETE", undefined, true)).status, 404);

    await db.update(mailingSignupLimitsTable).set({ attempts: 60 }).where(eq(mailingSignupLimitsTable.key, limitKey));
    const limited = await request("/mailing-list/opt-ins", "POST", { email, consent: true });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    // A fresh expiry permits signups; no permanent ban from an expired bucket.
    await db.update(mailingSignupLimitsTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(mailingSignupLimitsTable.key, limitKey));
    assert.equal((await request("/mailing-list/opt-ins", "POST", { email, consent: true })).status, 200);
  } finally {
    if (cookie) await request("/admin/session", "DELETE", undefined, true);
    await db.delete(mailingContactsTable).where(inArray(mailingContactsTable.email, [email, botEmail]));
    await db.delete(mailingSignupLimitsTable).where(eq(mailingSignupLimitsTable.key, limitKey));
    await db.delete(adminAttemptsTable).where(eq(adminAttemptsTable.key, loginKey));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});

test("CSV quotes commas and quotes, neutralizes formulas, and excludes opted-out rows", () => {
  const row = {
    id: randomUUID(), email: "test@example.invalid", firstName: 'Film, "Maker"',
    createdAt: new Date(), consentAt: new Date(), consentVersion: MAILING_CONSENT_VERSION,
    consentText: MAILING_CONSENT_TEXT, source: "homepage", status: "active" as const, optedOutAt: null,
  };
  assert.ok(mailingContactsCsv([row]).includes('"Film, ""Maker"""'));
  for (const firstName of ["=2+2", "+SUM(1,2)", "-1+1", "@SUM(1)", "  =2", "\tdata"]) {
    assert.ok(mailingContactsCsv([{ ...row, firstName }]).includes(`"'${firstName}"`));
  }
  assert.ok(!mailingContactsCsv([{ ...row, status: "opted_out" }]).includes(row.email));
});
