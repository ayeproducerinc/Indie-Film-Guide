import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { PLANS } from "@workspace/db";
import { LIVE_PRICE_IDS, validateLivePrice } from "./live-stripe-catalog";

test("all five supplied live prices match approved policy; unsafe prices are rejected", () => {
  for (const plan of PLANS.filter(p => p.billing !== "free")) {
    const fixture = {
      id: LIVE_PRICE_IDS[plan.name], active: true, livemode: true,
      currency: "usd", unit_amount: plan.amount, lookup_key: null, metadata: {},
      type: plan.billing === "yearly" ? "recurring" : "one_time",
      recurring: plan.billing === "yearly"
        ? { interval: "year", interval_count: 1, usage_type: "licensed", meter: null } : null,
    } as Stripe.Price;
    assert.equal(validateLivePrice(fixture, plan.name).name, plan.name);
    for (const invalid of [
      { livemode: false }, { active: false }, { id: "price_unapproved" },
      { currency: "eur" }, { unit_amount: 1 }, { metadata: { app: "another-app" } },
      { metadata: { plan: "another-plan" } }, { lookup_key: "another_lookup" },
      { recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } },
      { type: plan.billing === "yearly" ? "one_time" : "recurring" },
    ]) {
      assert.throws(() => validateLivePrice({ ...fixture, ...invalid } as Stripe.Price, plan.name));
    }
    if (fixture.recurring) {
      const recurring = fixture.recurring;
      assert.throws(() => validateLivePrice({
        ...fixture, recurring: { ...recurring, usage_type: "metered" },
      }, plan.name));
    }
  }
});
