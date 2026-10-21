import type Stripe from "stripe";
import { runMigrations } from "stripe-replit-sync";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool, listingsTable, paymentEventsTable } from "@workspace/db";
import { getStripeSync, getUncachableStripeClient } from "./stripe-client";
import { billingState } from "./listing-config";
import { logger } from "./logger";

export async function initializeBilling() {
  try {
    const stripe = await getUncachableStripeClient();
    await runMigrations({ databaseUrl: process.env.DATABASE_URL! });
    const sync = await getStripeSync();
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (!domain) throw new Error("No application domain is available for the payment webhook.");
    await sync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
    await sync.syncBackfill({ object: "all" });
    // Stripe owns the catalog; read the synced price data, never a duplicate app catalog.
    const { rows } = await pool.query(
      `SELECT id, unit_amount, currency, recurring, livemode, lookup_key FROM stripe.prices
       WHERE active = true AND lookup_key = ANY($1::text[])`,
      [["ifg_indie_annual", "ifg_standard_annual"]],
    );
    for (const [plan, key, amount] of [["Indie Partner", "ifg_indie_annual", 19900], ["Standard", "ifg_standard_annual", 49900]] as const) {
      const price = rows.find(p => p.lookup_key === key);
      if (!price || Number(price.unit_amount) !== amount || price.currency !== "usd" || price.recurring?.interval !== "year" || price.recurring?.interval_count !== 1)
        throw new Error(`Create the approved ${plan} annual Stripe price before enabling checkout.`);
      billingState.prices[plan] = price.id;
    }
    const links = await stripe.paymentLinks.list({ active: true, limit: 100 });
    billingState.paymentLinks = links.data.filter(l => l.metadata.app === "indie-film-guide")
      .map(l => ({ plan: l.metadata.plan!, url: l.url }));
    if (!["Indie Partner", "Standard"].every(plan => billingState.paymentLinks.some(l => l.plan === plan)))
      throw new Error("Create the two Stripe payment links before enabling checkout.");
    const modes = new Set(rows.map(p => p.livemode));
    if (modes.size !== 1) throw new Error("Stripe price modes are inconsistent.");
    billingState.mode = rows[0].livemode ? "live" : "test";
    billingState.available = true;
    logger.info({ mode: billingState.mode }, "Stripe checkout and verified webhooks are ready");
  } catch (error) {
    billingState.available = false;
    billingState.mode = "unavailable";
    logger.warn({ reason: error instanceof Error ? error.message : "Stripe setup failed" }, "Checkout unavailable; connect/configure Stripe and restart");
  }
}

const idOf = (object: string | { id: string } | null) => typeof object === "string" ? object : object?.id ?? null;

// Use the current subscription rather than an old event's embedded object. The
// subscription lock serializes invoice/session events, including out-of-order delivery.
async function updateFromSubscription(subscriptionId: string, reference?: string) {
  const stripe = await getUncachableStripeClient();
  await db.transaction(async tx => {
    await tx.execute((await import("drizzle-orm")).sql`select pg_advisory_xact_lock(hashtext(${subscriptionId}))`);
    const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
    let [listing] = await tx.select().from(listingsTable).where(eq(listingsTable.stripeSubscriptionId, subscriptionId));
    if (!listing && reference) {
      [listing] = await tx.select().from(listingsTable).where(eq(listingsTable.reference, reference));
    }
    if (!listing || listing.deletedAt || listing.plan === "Government") return;
    if (listing.stripeSubscriptionId && listing.stripeSubscriptionId !== sub.id) return;
    const item = sub.items.data[0];
    const expectedPrice = billingState.prices[listing.plan];
    if (!expectedPrice || sub.items.data.length !== 1 || item?.price.id !== expectedPrice) throw new Error("Subscription price does not match the saved listing.");
    if (sub.metadata.listingReference !== listing.reference || sub.metadata.app !== "indie-film-guide") throw new Error("Subscription is not bound to this listing.");
    const invoice = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
    const currentPeriodEnd = item?.current_period_end ?? 0;
    const paid = sub.status === "active" && invoice?.status === "paid" && currentPeriodEnd * 1000 > Date.now();
    const paymentStatus = paid ? "Paid" : ["canceled", "unpaid", "incomplete_expired"].includes(sub.status)
      ? "Cancelled" : sub.status === "past_due" ? "Past due" : "Unpaid";
    await tx.update(listingsTable).set({
      stripeSubscriptionId: sub.id, stripeCustomerId: idOf(sub.customer), paymentStatus,
    }).where(eq(listingsTable.id, listing.id));
  });
}

export async function processListingWebhook(payload: Buffer, signature: string) {
  const sync = await getStripeSync();
  // This verifies the signature against the managed secret BEFORE JSON is trusted.
  await sync.processWebhook(payload, signature);
  const event = JSON.parse(payload.toString("utf8")) as Stripe.Event;
  const [already] = await db.select().from(paymentEventsTable).where(eq(paymentEventsTable.eventId, event.id));
  if (already) return;
  const stripe = await getUncachableStripeClient();
  if (event.type.startsWith("checkout.session.")) {
    const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id);
    const reference = session.metadata?.listingReference;
    if (reference && session.metadata?.app === "indie-film-guide") {
      const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.reference, reference));
      if (listing && listing.stripeCheckoutId === session.id && !listing.deletedAt) {
        const subscriptionId = idOf(session.subscription);
        if (subscriptionId) await updateFromSubscription(subscriptionId, reference);
      }
    }
  } else if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object as Stripe.Subscription;
    await updateFromSubscription(sub.id, sub.metadata.listingReference);
  } else if (event.type.startsWith("invoice.")) {
    const invoice = await stripe.invoices.retrieve((event.data.object as Stripe.Invoice).id);
    const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription ?? null);
    if (subscriptionId) await updateFromSubscription(subscriptionId);
  }
  await db.insert(paymentEventsTable).values({ eventId: event.id }).onConflictDoNothing();
}

export async function beginCheckout(reference: string, origin: string) {
  if (!billingState.available) throw new Error("Checkout is temporarily unavailable. Please try again shortly.");
  const stripe = await getUncachableStripeClient();
  return db.transaction(async tx => {
    const [listing] = await tx.select().from(listingsTable).where(and(eq(listingsTable.reference, reference), isNull(listingsTable.deletedAt))).for("update");
    if (!listing) throw new Error("Submission not found.");
    if (listing.plan === "Government") throw new Error("Government listings do not require payment.");
    if (listing.stripeSubscriptionId || listing.paymentStatus === "Paid") throw new Error("A subscription is already associated with this listing. Contact the administrator rather than paying again.");
    if (listing.stripeCheckoutId) {
      const previous = await stripe.checkout.sessions.retrieve(listing.stripeCheckoutId);
      if (previous.status === "open" && previous.url) return previous.url;
      if (previous.status === "complete") throw new Error("Your checkout is complete. Payment confirmation is being processed; do not pay again.");
    }
    const price = billingState.prices[listing.plan];
    if (!price) throw new Error("The selected plan is unavailable.");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: listing.email,
      client_reference_id: listing.reference,
      line_items: [{ price, quantity: 1 }],
      metadata: { app: "indie-film-guide", listingReference: listing.reference },
      subscription_data: { metadata: { app: "indie-film-guide", listingReference: listing.reference, foundingPriceLocked: String(listing.foundingPriceLocked) } },
      success_url: `${origin}/submitted?checkout=success`,
      cancel_url: `${origin}/submitted?checkout=cancelled`,
    }, { idempotencyKey: `ifg-checkout-${listing.reference}-${listing.stripeCheckoutId ?? "first"}` });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    await tx.update(listingsTable).set({ stripeCheckoutId: session.id }).where(eq(listingsTable.id, listing.id));
    return session.url;
  });
}
