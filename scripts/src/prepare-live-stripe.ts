import Stripe from "stripe";
import { LIVE_PRICE_IDS, validateLivePrice, CatalogError } from "./live-stripe-catalog";

// Read-only unless explicitly invoked with --apply. Does not import billing
// startup, access either database, create webhooks, or create charges/sessions.
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--apply")) throw new CatalogError("Only --apply is supported.");
  const apply = args.includes("--apply");
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || (!key.startsWith("sk_live_") && !key.startsWith("rk_live_")))
    throw new CatalogError("A live STRIPE_SECRET_KEY is required. The development test key is never used by this script.");
  const stripe = new Stripe(key);
  const account = await stripe.accounts.retrieve(null);
  if (!account.charges_enabled)
    throw new CatalogError("The live Stripe account is not enabled to accept charges. Complete Stripe account activation first.");

  const prices = await Promise.all(Object.entries(LIVE_PRICE_IDS).map(async ([name, id]) => {
    const price = await stripe.prices.retrieve(id, { expand: ["product"] });
    const plan = validateLivePrice(price, name);
    if (typeof price.product === "string" || price.product.deleted || !price.product.active)
      throw new CatalogError(`The supplied ${name} product must be active.`);
    const existing = await stripe.prices.list({ lookup_keys: [plan.lookupKey!], limit: 10 });
    if (existing.data.some(p => p.id !== id))
      throw new CatalogError(`${name} already has another price using its lookup key. No changes have been applied.`);
    return { price, plan };
  }));

  const activeLinks: Stripe.PaymentLink[] = [];
  for await (const link of stripe.paymentLinks.list({ active: true, limit: 100 })) {
    if (link.metadata.app === "indie-film-guide") activeLinks.push(link);
  }
  // Validate all existing links before the first write. Never deactivate live
  // links silently, and never create unrestricted lifetime links.
  const existingByPlan = new Map<string, Stripe.PaymentLink>();
  for (const link of activeLinks) {
    const match = prices.find(p => p.plan.name === link.metadata.plan);
    if (!match) continue;
    if (match.plan.billing === "lifetime")
      throw new CatalogError("An unrestricted lifetime payment link is active. Owner review is required before live setup.");
    const items = await stripe.paymentLinks.listLineItems(link.id, { limit: 2 });
    if (!link.livemode || items.has_more || items.data.length !== 1 ||
        items.data[0]?.price?.id !== match.price.id || items.data[0]?.quantity !== 1)
      throw new CatalogError(`An existing ${match.plan.name} payment link uses different pricing. Owner review is required.`);
    existingByPlan.set(match.plan.name, link);
  }

  const results = [];
  for (const { price, plan } of prices) {
    if (apply && (price.lookup_key !== plan.lookupKey ||
        price.metadata.app !== "indie-film-guide" || price.metadata.plan !== plan.name)) {
      await stripe.prices.update(price.id, {
        lookup_key: plan.lookupKey!,
        metadata: { app: "indie-film-guide", plan: plan.name },
      }, { idempotencyKey: `ifg-adopt-live-price-${price.id}` });
    }
    let link = existingByPlan.get(plan.name);
    if (apply && plan.billing === "yearly" && !link) {
      link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { app: "indie-film-guide", plan: plan.name },
        subscription_data: { metadata: { app: "indie-film-guide", plan: plan.name, source: "shared-payment-link" } },
        after_completion: { type: "hosted_confirmation", hosted_confirmation: {
          custom_message: "Payment received. Your listing must still be submitted to Indie Film Guide and approved before it goes live. Keep your receipt for the directory administrator.",
        } },
      }, { idempotencyKey: `ifg-payment-link-${price.id}` });
    }
    results.push({
      plan: plan.name, priceId: price.id, usd: plan.amount / 100,
      cadence: plan.billing === "yearly" ? "year" : "once",
      lookupReady: apply || price.lookup_key === plan.lookupKey,
      paymentLink: plan.billing === "lifetime"
        ? "/get-listed?plan=Lifetime%20Indie%20Partner" : link?.url ?? "Not created",
    });
  }
  console.log(JSON.stringify({
    mode: "live", accountId: account.id, applied: apply, plans: results,
    note: "No charges, sessions, refunds, database changes, publishing, or webhook creation. Production startup registers its own managed webhook and stores the signing secret in the production database.",
  }, null, 2));
}

main().catch(error => {
  // Stripe authentication messages may contain key fragments; never log them.
  console.error(error instanceof CatalogError ? error.message : "Stripe catalog request failed. Check the key, its permissions, and account access; credentials have not been logged.");
  process.exitCode = 1;
});
