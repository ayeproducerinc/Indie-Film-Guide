import { getUncachableStripeClient } from "./stripe-client";

async function main() {
  const stripe = await getUncachableStripeClient();
  const definitions = [
    { plan: "Indie Partner", key: "ifg_indie_annual", amount: 19900 },
    { plan: "Standard", key: "ifg_standard_annual", amount: 49900 },
  ];
  const links = [];
  for (const def of definitions) {
    let price = (await stripe.prices.list({ lookup_keys: [def.key], active: true, limit: 1 })).data[0];
    if (!price) {
      const found = await stripe.products.search({ query: `metadata['app']:'indie-film-guide' AND metadata['plan']:'${def.plan}'` });
      const product = found.data[0] ?? await stripe.products.create({
        name: `Indie Film Guide — ${def.plan}`,
        metadata: { app: "indie-film-guide", plan: def.plan },
      }, { idempotencyKey: `ifg-product-${def.key}` });
      price = await stripe.prices.create({
        product: product.id, currency: "usd", unit_amount: def.amount,
        recurring: { interval: "year" }, lookup_key: def.key,
        metadata: { app: "indie-film-guide", plan: def.plan },
      }, { idempotencyKey: `ifg-price-${def.key}` });
    }
    if (price.unit_amount !== def.amount || price.currency !== "usd" || price.recurring?.interval !== "year" || price.recurring.interval_count !== 1)
      throw new Error(`Existing ${def.plan} price does not match the approved annual price.`);
    const existingLinks = await stripe.paymentLinks.list({ active: true, limit: 100 });
    let link = existingLinks.data.find(l => l.metadata.app === "indie-film-guide" && l.metadata.plan === def.plan);
    if (!link) link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { app: "indie-film-guide", plan: def.plan },
      subscription_data: { metadata: { app: "indie-film-guide", plan: def.plan, source: "shared-payment-link" } },
      after_completion: { type: "hosted_confirmation", hosted_confirmation: {
        custom_message: "Payment received. Your listing must still be submitted to Indie Film Guide and approved before it goes live. Keep your receipt for the directory administrator.",
      } },
    }, { idempotencyKey: `ifg-payment-link-${price.id}` });
    links.push({ plan: def.plan, annualUSD: def.amount / 100, priceId: price.id, url: link.url, mode: price.livemode ? "live" : "test" });
  }
  console.log(JSON.stringify({ paymentLinks: links }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Stripe setup failed."); process.exitCode = 1; });
