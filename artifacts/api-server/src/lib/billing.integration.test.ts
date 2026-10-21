// Runs only against development. Stripe is an explicit in-process test double;
// no charges, external Stripe requests, or production writes are made.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, listingsTable } from "@workspace/db";
import { billingState } from "./listing-config";
import { beginCheckout } from "./billing";
import { applyLifetimeSession, applyLifetimeRefund } from "./lifetime-payments";
import { lifetimeUsage, releaseReservation, reconcileLifetimeReservations } from "./lifetime-inventory";
import { updateFromSubscription } from "./subscription-billing";

const ids: number[] = [];
const sessions = new Map<string, any>();
const idempotent = new Map<string, any>();
let refunded = false;
const fake = {
  checkout: { sessions: {
    create: async (params: any, opts: any) => {
      if (idempotent.has(opts.idempotencyKey)) return idempotent.get(opts.idempotencyKey);
      const value = { ...params, id: `cs_test_${randomUUID()}`, url: "https://checkout.stripe.invalid/test", status: "open", payment_status: "unpaid", currency: "usd", amount_total: 199900, payment_intent: "pi_test_lifetime", customer: null };
      sessions.set(value.id, value); idempotent.set(opts.idempotencyKey, value);
      return value;
    },
    retrieve: async (id: string) => { if (!sessions.has(id)) throw new Error("Unknown test session"); return sessions.get(id); },
    expire: async (id: string) => { const s = sessions.get(id); s.status = "expired"; return s; },
    list: () => ({ async *[Symbol.asyncIterator]() { for (const session of sessions.values()) yield session; } }),
    listLineItems: async () => ({ data: [{ price: { id: "price_lifetime" }, quantity: 1 }] }),
  } },
  paymentIntents: { retrieve: async () => ({ status: "succeeded", latest_charge: { amount_refunded: refunded ? 199900 : 0 } }) },
  charges: { retrieve: async () => ({ payment_intent: "pi_test_lifetime", amount_refunded: refunded ? 199900 : 0 }) },
} as unknown as Stripe;
async function insert(extra: Partial<typeof listingsTable.$inferInsert> = {}) {
  const reference = randomUUID();
  const [row] = await db.insert(listingsTable).values({
    reference, slug: `billing-test-${reference}`, name: "Development billing verification", description: "Temporary isolated test",
    category: "Locations", stages: ["Idea"], coverage: "Statewide", city: "Statewide", state: "GA",
    providerType: "Business", indieRate: true, plan: "Lifetime Indie Partner", status: "Pending",
    email: "test@example.invalid", website: "https://example.invalid", phone: "+14045550100", ...extra,
  }).returning();
  ids.push(row!.id); return row!;
}
const cleanup = async () => {
  if (ids.length) await db.delete(listingsTable).where(inArray(listingsTable.id, ids.splice(0)));
  sessions.clear(); idempotent.clear(); refunded = false;
};
before(async () => {
  const identity = await pool.query("select current_database() as name");
  assert.equal(identity.rows[0].name, "heliumdb", "Tests may run only in development.");
  assert.equal(await lifetimeUsage(db), 0, "Existing lifetime inventory must not be changed by tests.");
  billingState.available = true; billingState.prices = { "Lifetime Indie Partner": "price_lifetime", "Indie Partner": "price_current", Standard: "price_standard" };
  billingState.allowedPrices = { "Lifetime Indie Partner": new Set(["price_lifetime"]), "Indie Partner": new Set(["price_current", "price_old"]), Standard: new Set(["price_standard"]) };
});
after(async () => { await cleanup(); await pool.end(); });

test("concurrent final-spot checkouts cannot oversell; retries reuse a reservation", async () => {
  try {
    for (let n = 0; n < 9; n++) await insert({ paymentStatus: "Paid" });
    const a = await insert(); const b = await insert();
    const results = await Promise.allSettled([beginCheckout(a.reference, "https://example.invalid", fake), beginCheckout(b.reference, "https://example.invalid", fake)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const rejection = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    assert.match(rejection.reason.message, /All 10 lifetime spots are taken/);
    assert.equal(await lifetimeUsage(db), 10);
    const winner = results[0]!.status === "fulfilled" ? a : b;
    await beginCheckout(winner.reference, "https://example.invalid", fake);
    assert.equal(sessions.size, 1);
  } finally { await cleanup(); }
});
test("paid completion, replay and refund use authoritative payment state", async () => {
  try {
    const row = await insert(); await beginCheckout(row.reference, "https://example.invalid", fake);
    const session = [...sessions.values()][0]; session.status = "complete"; session.payment_status = "paid";
    await applyLifetimeSession(session, fake); await applyLifetimeSession(session, fake);
    let [saved] = await db.select().from(listingsTable).where(eq(listingsTable.id, row.id));
    assert.equal(saved!.paymentStatus, "Paid"); assert.equal(saved!.stripePaymentIntentId, "pi_test_lifetime");
    assert.equal(saved!.status, "Pending"); assert.equal(saved!.checkoutReservedUntil, null);
    refunded = true; await applyLifetimeRefund("ch_test", fake); await applyLifetimeSession(session, fake);
    [saved] = await db.select().from(listingsTable).where(eq(listingsTable.id, row.id));
    assert.equal(saved!.paymentStatus, "Refunded");
    await assert.rejects(() => beginCheckout(row.reference, "https://example.invalid", fake), /already associated/);
    assert.equal(await lifetimeUsage(db), 0);
  } finally { await cleanup(); }
});
test("expired reservations release; completed sessions keep capacity until webhook", async () => {
  try {
    const expired = await insert({ checkoutReservationKey: "expired-key", checkoutReservedUntil: new Date(Date.now() - 1000), stripeCheckoutId: "cs_expired" });
    const completed = await insert({ checkoutReservationKey: "completed-key", checkoutReservedUntil: new Date(Date.now() - 1000), stripeCheckoutId: "cs_completed" });
    sessions.set("cs_expired", { id: "cs_expired", status: "expired" });
    sessions.set("cs_completed", { id: "cs_completed", status: "complete" });
    await reconcileLifetimeReservations(fake);
    const rows = await db.select().from(listingsTable).where(inArray(listingsTable.id, [expired.id, completed.id]));
    assert.equal(rows.find(r => r.id === expired.id)!.checkoutReservedUntil, null);
    assert.notEqual(rows.find(r => r.id === completed.id)!.checkoutReservedUntil, null);
    await releaseReservation(completed.id, "wrong-key");
    assert.equal(await lifetimeUsage(db), 1);
  } finally { await cleanup(); }
});
test("network failures retain capacity and use the same idempotency key on retry", async () => {
  try {
    const row = await insert();
    let call = 0;
    const uncertain = { ...fake, checkout: { sessions: { ...fake.checkout.sessions,
      create: async (...args: any[]) => { const session = await (fake.checkout.sessions.create as any)(...args); if (++call === 1) throw new Error("Lost Stripe response"); return session; },
    } } } as unknown as Stripe;
    await assert.rejects(() => beginCheckout(row.reference, "https://example.invalid", uncertain), /Lost Stripe response/);
    assert.equal(await lifetimeUsage(db), 1);
    await beginCheckout(row.reference, "https://example.invalid", uncertain);
    assert.equal(sessions.size, 1);
  } finally { await cleanup(); }
});
test("historical founding price remains valid; scheduled Standard switches at renewal", async () => {
  try {
    const row = await insert({ plan: "Indie Partner", stripeSubscriptionId: "sub_test_locked", stripePriceId: "price_old", foundingPriceLocked: true });
    let price = "price_old";
    const subscription = { subscriptions: { retrieve: async () => ({
      id: "sub_test_locked", metadata: { app: "indie-film-guide", listingReference: row.reference }, status: "active",
      customer: null, latest_invoice: { status: "paid" }, items: { data: [{ quantity: 1, price: { id: price }, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] },
    }) } } as unknown as Stripe;
    await updateFromSubscription("sub_test_locked", undefined, subscription);
    let [saved] = await db.select().from(listingsTable).where(eq(listingsTable.id, row.id));
    assert.equal(saved!.paymentStatus, "Paid"); assert.equal(saved!.foundingPriceLocked, true);
    await db.update(listingsTable).set({ pendingPlan: "Standard", pendingPlanAt: new Date(), indiePromoCode: "TEST" }).where(eq(listingsTable.id, row.id));
    price = "price_standard"; await updateFromSubscription("sub_test_locked", undefined, subscription);
    [saved] = await db.select().from(listingsTable).where(eq(listingsTable.id, row.id));
    assert.equal(saved!.plan, "Standard"); assert.equal(saved!.indiePromoCode, ""); assert.equal(saved!.pendingPlan, null);
    price = "price_untrusted";
    await assert.rejects(() => updateFromSubscription("sub_test_locked", undefined, subscription), /does not match/);
  } finally { await cleanup(); }
});
