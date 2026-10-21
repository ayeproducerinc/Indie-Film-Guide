import assert from "node:assert/strict";
import { test } from "node:test";
import { eligible, graceDaysLeft, subscriptionTransition, validPrice } from "./payment-policy";
import { GRACE_MS, PLANS } from "@workspace/db";
const now = new Date("2026-10-21T12:00:00Z");
const paid = { plan: "Indie Partner", providerType: "Business", paymentStatus: "Paid", pastDueSince: null, einVerified: false };
test("grace period is visible strictly before 30 days, never for Lifetime", () => {
  const row = { ...paid, paymentStatus: "Past due", pastDueSince: new Date(now.getTime() - GRACE_MS + 1) };
  assert.equal(eligible(row, now.getTime()), true);
  assert.equal(graceDaysLeft(row, now.getTime()), 1);
  assert.equal(eligible(row, now.getTime() + 1), false);
  assert.equal(eligible({ ...row, plan: "Lifetime Indie Partner" }, now.getTime()), false);
  assert.equal(eligible({ ...paid, paymentStatus: "Refunded" }, now.getTime()), false);
  assert.equal(eligible({ ...paid, providerType: "Nonprofit" }, now.getTime()), false);
});
test("grace and founding lock transitions do not reset on retries or late recovery", () => {
  const first = subscriptionTransition({ pastDueSince: null, foundingPriceLocked: true }, "Past due", now);
  assert.deepEqual(subscriptionTransition(first, "Past due", new Date(now.getTime() + 1000)).pastDueSince, now);
  assert.equal(subscriptionTransition(first, "Paid", new Date(now.getTime() + GRACE_MS)).foundingPriceLocked, false);
  assert.equal(subscriptionTransition(first, "Paid", new Date(now.getTime() + 1000)).foundingPriceLocked, true);
  assert.equal(subscriptionTransition(first, "Paid", now).pastDueSince, null);
  assert.equal(subscriptionTransition(first, "Cancelled", now).foundingPriceLocked, false);
});
test("catalog validation rejects wrong amount, currency, cadence or one-time type", () => {
  for (const plan of PLANS.filter(p => p.billing !== "free")) {
    const price = { currency: "usd", unit_amount: plan.amount, recurring: plan.billing === "yearly" ? { interval: "year", interval_count: 1 } : null };
    assert.equal(validPrice(price, plan.name), true);
    assert.equal(validPrice({ ...price, currency: "eur" }, plan.name), false);
    assert.equal(validPrice({ ...price, unit_amount: 1 }, plan.name), false);
    assert.equal(validPrice({ ...price, recurring: { interval: "month", interval_count: 1 } }, plan.name), false);
  }
});
