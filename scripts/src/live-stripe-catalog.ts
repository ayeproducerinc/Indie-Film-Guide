import type Stripe from "stripe";
import { PLANS } from "@workspace/db";

// Owner-supplied live prices. Never substitute newly created catalog prices.
export const LIVE_PRICE_IDS: Record<string, string> = {
  "Indie Partner": "price_1UTDVQKMfAphuictXAjzTonH",
  Standard: "price_1UTDVMKMfAphuict0qNYYQ4L",
  "Nonprofit Indie Partner": "price_1UTDVHKMfAphuict4AnqsnW7",
  "Nonprofit Standard": "price_1UTDVCKMfAphuictqXj10blS",
  "Lifetime Indie Partner": "price_1UTDVJKMfAphuictzI2R56P8",
};

export class CatalogError extends Error {}

export function validateLivePrice(price: Stripe.Price, name: string) {
  const plan = PLANS.find(p => p.name === name && p.billing !== "free");
  if (!plan || price.id !== LIVE_PRICE_IDS[name] || !price.active || !price.livemode ||
      price.currency !== plan.currency || price.unit_amount !== plan.amount ||
      price.type !== (plan.billing === "yearly" ? "recurring" : "one_time") ||
      (plan.billing === "yearly"
        ? price.recurring?.interval !== "year" || price.recurring.interval_count !== 1 ||
          price.recurring.usage_type !== "licensed" || !!price.recurring.meter
        : !!price.recurring)) {
    throw new CatalogError(`The supplied ${name} price is not an active live price with the approved USD amount and cadence.`);
  }
  if (price.lookup_key && price.lookup_key !== plan.lookupKey)
    throw new CatalogError(`The supplied ${name} price already has a different lookup key. Review it before changing ownership.`);
  if ((price.metadata.app && price.metadata.app !== "indie-film-guide") ||
      (price.metadata.plan && price.metadata.plan !== name))
    throw new CatalogError(`The supplied ${name} price has conflicting application metadata.`);
  return plan;
}
