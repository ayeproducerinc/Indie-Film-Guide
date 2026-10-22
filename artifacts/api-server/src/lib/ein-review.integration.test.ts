// Isolated development fixtures; no real credentials, payments or owner records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { once } from "node:events";
import { eq, inArray } from "drizzle-orm";
import { db, pool, listingsTable, adminSessionsTable } from "@workspace/db";
import { PLANS } from "@workspace/db";
import { SubmitListingResponse, VerifyAdminListingEinResponse, UpdateAdminListingResponse, GetAdminDashboardResponse } from "@workspace/api-zod";

test("nonprofit EIN persists, verifies independently, and resets only when changed", async () => {
  assert.equal((await pool.query("select current_database() as name")).rows[0].name, "heliumdb");
  // These values apply only to this test process, never the running workflows.
  process.env.ADMIN_PASSWORD = "isolated-ein-test-password";
  process.env.SESSION_SECRET = "isolated-ein-test-session";
  const { default: app } = await import("../app");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const ids: number[] = [];
  let tokenHash: string | undefined;
  let cookie = "";
  async function request(path: string, method = "GET", body?: unknown, authenticated = true) {
    return fetch(`${origin}/api${path}`, { method, headers: {
      "Content-Type": "application/json", Origin: origin, "X-IFG-Admin": "1",
      ...(authenticated && cookie ? { Cookie: cookie } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  try {
    const login = await request("/admin/session", "POST", { password: "isolated-ein-test-password" }, false);
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const token = cookie.slice(cookie.indexOf("=") + 1);
    tokenHash = createHmac("sha256", "isolated-ein-test-session:isolated-ein-test-password").update(token).digest("hex");
    for (const plan of ["Nonprofit Standard", "Nonprofit Indie Partner"]) {
      const input = {
        name: `EIN verification test ${randomUUID()}`, description: "Isolated development verification",
        category: "Locations", stages: ["Idea"], coverage: "Statewide", providerType: "Nonprofit", plan,
        website: "https://example.invalid", phone: "(404) 555-0123", email: "test@example.invalid",
        publicEmail: false, ein: "12-3456789",
        ...(plan === "Nonprofit Indie Partner" ? { indiePromoCode: "TEST123", indieRateDetails: "Test discount", indieRedeemHow: "Mention the test code" } : {}),
      };
      const publicForgery = await request("/submissions", "POST", { ...input, einVerified: true }, false);
      assert.equal(publicForgery.status, 400);
      const submitted = await request("/submissions", "POST", input, false);
      assert.equal(submitted.status, 201);
      const { reference } = SubmitListingResponse.parse(await submitted.json());
      const [created] = await db.select().from(listingsTable).where(eq(listingsTable.reference, reference));
      assert.ok(created); ids.push(created.id);
      assert.equal(created.ein, input.ein); assert.equal(created.einVerified, false);
      const path = `/admin/listings/${created.id}`;
      const verifyPath = `${path}/verify-ein`;
      assert.equal((await request(verifyPath, "POST", { expectedEin: input.ein }, false)).status, 401);
      assert.equal((await request(verifyPath, "POST", { expectedEin: "98-7654321" })).status, 409);
      assert.equal((await request(`${path}/status`, "POST", { status: "Live" })).status, 409);
      const verified = await request(verifyPath, "POST", { expectedEin: input.ein });
      assert.equal(verified.status, 200); assert.equal(VerifyAdminListingEinResponse.parse(await verified.json()).einVerified, true);
      assert.equal((await request(verifyPath, "POST", { expectedEin: input.ein })).status, 200);
      // EIN verification never bypasses the independent payment gate.
      assert.equal((await request(`${path}/status`, "POST", { status: "Live" })).status, 409);
      const saved = await request(path, "PUT", { ...input, description: "Ordinary edit preserves verification" });
      assert.equal(saved.status, 200); assert.equal(UpdateAdminListingResponse.parse(await saved.json()).einVerified, true);
      // A synthetic paid fixture tests approval without touching Stripe.
      await db.update(listingsTable).set({ paymentStatus: "Paid" }).where(eq(listingsTable.id, created.id));
      const approved = await request(`${path}/status`, "POST", { status: "Live" });
      assert.equal(approved.status, 200);
      const publicListing = await request(`/listings/${created.slug}`, "GET", undefined, false);
      assert.equal(publicListing.status, 200);
      const publicData = await publicListing.json() as Record<string, unknown>;
      assert.equal(publicData.ein, undefined); assert.equal(publicData.einVerified, undefined);
      assert.equal(publicData.email, undefined);
      const changed = await request(path, "PUT", { ...input, ein: "98-7654321", einVerified: true });
      assert.equal(changed.status, 200);
      const changedData = UpdateAdminListingResponse.parse(await changed.json());
      assert.equal(changedData.ein, "98-7654321"); assert.equal(changedData.einVerified, false);
      assert.equal(changedData.status, "Pending");
      assert.equal((await request(verifyPath, "POST", { expectedEin: input.ein })).status, 409);
      const dashboard = await request("/admin/dashboard");
      assert.equal(dashboard.status, 200);
      const reopened = GetAdminDashboardResponse.parse(await dashboard.json()).listings.find(l => l.id === created.id);
      assert.ok(reopened);
      assert.equal(reopened.ein, "98-7654321"); assert.equal(reopened.einVerified, false);
      assert.equal((await request(verifyPath, "POST", { expectedEin: "98-7654321" })).status, 200);
      assert.equal((await request(`${path}/status`, "POST", { status: "Live" })).status, 200);
    }
    assert.equal(PLANS.filter(p => p.providerType === "Nonprofit").length, 2);
  } finally {
    if (ids.length) await db.delete(listingsTable).where(inArray(listingsTable.id, ids));
    if (tokenHash) await db.delete(adminSessionsTable).where(eq(adminSessionsTable.tokenHash, tokenHash));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool.end();
  }
});
