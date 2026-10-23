import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { once } from "node:events";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, pool, listingsTable, adminAttemptsTable, type InsertListing } from "@workspace/db";
import { GetDirectoryResponse, GetAdminDashboardResponse } from "@workspace/api-zod";
import { countWhere, listingPage } from "./listing-pagination";

test("guide and admin paginate filtered records, not just the loaded page", async () => {
  assert.equal((await pool.query("select current_database() as name")).rows[0].name, "heliumdb");
  process.env.ADMIN_PASSWORD = `test-only-${randomUUID()}`;
  process.env.SESSION_SECRET = `test-only-${randomUUID()}`;
  const { default: app } = await import("../app");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const tag = `IFG-Page-${randomUUID()}`;
  const loginKey = createHmac("sha256", process.env.SESSION_SECRET).update("127.0.0.1").digest("hex");
  let cookie = "";
  let ids: number[] = [];
  const request = (path: string, admin = false, method = "GET", body?: unknown) =>
    fetch(`${origin}/api${path}`, { method, headers: {
      "Content-Type": "application/json", Origin: origin,
      ...(admin ? { Cookie: cookie, "X-IFG-Admin": "1" } : {}),
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const directory = async (query = "") => {
    const response = await request(`/directory?${query}`);
    assert.equal(response.status, 200);
    return GetDirectoryResponse.parse(await response.json());
  };
  const dashboard = async (query = "") => {
    const response = await request(`/admin/dashboard?${query}`, true);
    assert.equal(response.status, 200);
    return GetAdminDashboardResponse.parse(await response.json());
  };
  try {
    assert.equal((await request("/admin/dashboard?page=2")).status, 401);
    const login = await request("/admin/session", true, "POST", { password: process.env.ADMIN_PASSWORD });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const before = await dashboard();
    const publicBefore = await directory();
    const createdAt = new Date(Date.now() + 60000);
    const values: InsertListing[] = Array.from({ length: 26 }, (_, i) => ({
      reference: `${tag}-${i}`, slug: `${tag}-${i}`, name: `${tag} ${i < 20 ? String(i).padStart(2, "0") : i < 22 ? "20 Twin" : `Hidden ${i}`}`,
      description: "Pagination fixture", category: i < 20 ? "Locations" : "Funding & Banking",
      stages: [i < 20 ? "Production" : "Distribution"], coverage: i === 20 ? "Statewide" : "City",
      city: i < 20 ? "Atlanta" : i === 20 ? "" : "Augusta", state: "GA",
      website: "https://example.invalid", phone: "4045550123", email: `pagination-${i}@example.invalid`,
      publicEmail: i === 0, providerType: i === 24 ? "Nonprofit" : "Business", einVerified: false,
      plan: i === 25 ? "Lifetime Indie Partner" : i === 24 ? "Nonprofit Standard" : i % 2 === 0 ? "Indie Partner" : "Standard",
      indieRate: i % 2 === 0, paymentStatus: i === 23 ? "Unpaid" : "Paid",
      status: i === 22 ? "Pending" : "Live", deletedAt: i === 25 ? new Date() : null,
      // Equal timestamps exercise the ID tiebreaker, newer than existing development records.
      createdAt,
    }));
    const inserted = await db.insert(listingsTable).values(values).returning({ id: listingsTable.id });
    ids = inserted.map(row => row.id);
    const search = `q=${encodeURIComponent(tag)}`;
    const first = await directory(search);
    const second = await directory(`${search}&page=2`);
    assert.equal(first.total, 22);
    assert.equal(first.directoryTotal, publicBefore.directoryTotal + 22);
    assert.equal(first.pageSize, 20);
    assert.equal(first.pageCount, 2);
    assert.equal(first.listings.length, 20);
    assert.equal(second.listings.length, 2);
    assert.deepEqual([...first.listings, ...second.listings].map(row => row.id), ids.slice(0, 22));
    assert.equal(new Set([...first.listings, ...second.listings].map(row => row.id)).size, 22);
    assert.ok(first.cities.includes("Augusta"), "Filter options include cities beyond page one.");
    assert.deepEqual(first.cities, second.cities);
    assert.ok("email" in first.listings[0]!);
    assert.ok(!("email" in first.listings[1]!), "Private contact emails must remain private.");
    assert.equal((await directory(`${search}&page=99999`)).page, 2);
    assert.equal((await directory(`${search}&category=Funding%20%26%20Banking&page=2`)).total, 2);
    const stage = await directory(`${search}&stage=Distribution`);
    assert.deepEqual(stage.listings.map(row => row.id), ids.slice(20, 22));
    const city = await directory(`${search}&city=Augusta`);
    assert.deepEqual(city.listings.map(row => row.id), ids.slice(20, 22), "City filters also include statewide coverage.");
    assert.equal((await directory(`${search}&indieOnly=true`)).total, 11);
    assert.equal((await directory(`${search}&indieOnly=false`)).total, 22);
    assert.equal((await directory(`q=${encodeURIComponent(tag + "%")}`)).total, 0);
    assert.equal((await directory(`q=${encodeURIComponent(tag + "_")}`)).total, 0);
    for (const query of ["page=0", "page=-1", "page=1.5", "page=100001", "indieOnly=banana", "page=oops"]) {
      assert.equal((await request(`/directory?${query}`)).status, 400, query);
    }
    const empty = await directory(`q=${tag}-absent&page=99`);
    assert.equal(empty.total, 0);
    assert.equal(empty.page, 1);
    assert.equal(empty.pageCount, 1);

    const admin = await dashboard();
    const adminSecond = await dashboard("page=2");
    assert.equal(admin.pageSize, 20);
    assert.equal(admin.listings.length, 20);
    assert.deepEqual(admin.listings.map(row => row.id), ids.slice(0, 25).reverse().slice(0, 20));
    assert.deepEqual(adminSecond.listings.slice(0, 5).map(row => row.id), ids.slice(0, 5).reverse());
    assert.equal(admin.total, before.total + 25);
    assert.equal(admin.statusCounts.All, before.statusCounts.All + 25);
    assert.equal(admin.statusCounts.Pending, before.statusCounts.Pending + 1);
    assert.equal(admin.statusCounts.Live, before.statusCounts.Live + 24);
    assert.deepEqual(adminSecond.statusCounts, admin.statusCounts);
    assert.equal(admin.liveCount, before.liveCount + 22);
    assert.equal(admin.paidCount, before.paidCount + 24);
    assert.equal(admin.recurringRevenue, before.recurringRevenue + 11 * 199 + 11 * 499 + 199 + 199);
    assert.equal(admin.lifetimeRevenue, before.lifetimeRevenue + 1999, "Keep lifetime revenue's historical inclusion of deleted paid records.");
    const pending = await dashboard("status=Pending&plan=Indie%20Partner");
    assert.ok(pending.listings.every(row => row.status === "Pending" && row.plan === "Indie Partner"));
    const [expectedCount] = await db.select({ total: countWhere(and(isNull(listingsTable.deletedAt), eq(listingsTable.status, "Pending"), eq(listingsTable.plan, "Indie Partner"))) }).from(listingsTable);
    assert.equal(pending.total, expectedCount.total);
    assert.deepEqual(pending.statusCounts, admin.statusCounts);
    assert.equal(pending.recurringRevenue, admin.recurringRevenue);
    assert.equal((await request("/admin/dashboard?page=0", true)).status, 400);
    assert.equal((await request("/admin/dashboard?status=not-a-status", true)).status, 400);
    assert.equal((await dashboard("plan=missing-plan&page=9")).page, 1);

    // Move only our fixtures to an otherwise empty plan to exercise page correction.
    const isolatedPlan = `${tag}-only`;
    await db.update(listingsTable).set({ plan: isolatedPlan }).where(inArray(listingsTable.id, ids.slice(0, 21)));
    const last = await dashboard(`plan=${isolatedPlan}&page=2`);
    assert.equal(last.total, 21);
    assert.equal(last.listings.length, 1);
    await db.update(listingsTable).set({ deletedAt: new Date() }).where(eq(listingsTable.id, last.listings[0]!.id));
    const corrected = await dashboard(`plan=${isolatedPlan}&page=2`);
    assert.equal(corrected.page, 1);
    assert.equal(corrected.total, 20);
    assert.equal(corrected.listings.length, 20);
    const statusChange = await request(`/admin/listings/${corrected.listings[0]!.id}/status`, true, "POST", { status: "Rejected" });
    assert.equal(statusChange.status, 200);
    assert.equal((await dashboard(`plan=${isolatedPlan}&status=Live`)).total, 19);
    assert.equal((await request("/admin/session", true, "DELETE")).status, 204);
    assert.equal((await request("/admin/dashboard", true)).status, 401);
  } finally {
    if (ids.length) await db.delete(listingsTable).where(inArray(listingsTable.id, ids));
    if (cookie) await request("/admin/session", true, "DELETE");
    await db.delete(adminAttemptsTable).where(eq(adminAttemptsTable.key, loginKey));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});

test("page metadata uses twenty rows and clamps empty or disappearing pages", () => {
  assert.deepEqual(listingPage(0, 3), { total: 0, page: 1, pageSize: 20, pageCount: 1 });
  assert.deepEqual(listingPage(43, 2), { total: 43, page: 2, pageSize: 20, pageCount: 3 });
  assert.equal(listingPage(20, 2).page, 1);
});
