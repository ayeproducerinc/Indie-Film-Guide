import assert from "node:assert/strict";
import { test } from "node:test";
import { PLANS } from "@workspace/db";
import { validateListing } from "./listing-validation";

const base = {
  name: "Validation test", description: "Testing policy without saving a listing",
  category: "Locations", stages: ["Idea"], coverage: "Statewide",
  website: "example.com", phone: "4045550100", email: "test@example.com",
  indiePromoCode: "INDIEFILMGUIDE", indieRateDetails: "10% off",
  indieRedeemHow: "Mention the code", indieWhoQualifies: "Independent productions",
  ein: "12-3456789",
};
test("all six plans validate only for their permitted provider", () => {
  for (const plan of PLANS) {
    const values = validateListing({ ...base, providerType: plan.providerType, plan: plan.name });
    assert.equal(values.indieRate, plan.indie);
    assert.equal(values.einVerified, false);
    for (const providerType of ["Business", "Nonprofit", "Government"].filter(p => p !== plan.providerType))
      assert.throws(() => validateListing({ ...base, providerType, plan: plan.name }));
  }
});
test("deal, EIN and verification boundaries are enforced", () => {
  const input = { ...base, plan: "Nonprofit Indie Partner", providerType: "Nonprofit" };
  for (const change of [{ indiePromoCode: "a!" }, { indieRateDetails: "" }, { indieRedeemHow: "" }, { ein: "123456789" }, { einVerified: true }, { indieRedeemHow: "a".repeat(121) }])
    assert.throws(() => validateListing({ ...input, ...change }));
  assert.equal(validateListing({ ...input, indiePromoCode: "guide123" }).indiePromoCode, "GUIDE123");
  assert.equal(validateListing({ ...input, einVerified: true }, true).einVerified, true);
});
