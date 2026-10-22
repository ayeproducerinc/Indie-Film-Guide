import type Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { runMigrations } from "stripe-replit-sync";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, pool, listingsTable, paymentEventsTable, PLANS, findPlan } from "@workspace/db";
import { getStripeSync, getUncachableStripeClient } from "./stripe-client";
import { billingState } from "./listing-config";
import { logger } from "./logger";
import { validPrice } from "./payment-policy";
import { idOf, updateFromSubscription, applyAnnualRefund, applyAnnualRefundUpdate } from "./subscription-billing";
import { applyLifetimeSession, applyLifetimeRefund } from "./lifetime-payments";
import { lifetimeLock, lifetimeUsage, LIFETIME_CAP, RESERVATION_MS, reconcileLifetimeReservations, releaseReservation } from "./lifetime-inventory";

export async function initializeBilling() {
  billingState.initializing = true;
  billingState.available = false;
  try {
    const stripe = await getUncachableStripeClient();
    await runMigrations({ databaseUrl: process.env.DATABASE_URL! });
    const sync = await getStripeSync();
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (!domain) throw new Error("No application domain is available for the payment webhook.");
    await sync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
    await sync.syncBackfill({ object: "all" });
    const { rows } = await pool.query(`SELECT id, unit_amount, currency, recurring, livemode, lookup_key, metadata FROM stripe.prices`);
    const prices: Record<string, string> = {};
    const allowed: Record<string, Set<string>> = {};
    const modes = new Set<boolean>();
    for (const plan of PLANS.filter(p => p.billing !== "free")) {
      const current = (await stripe.prices.list({ lookup_keys: [plan.lookupKey!], active: true, limit: 1 })).data[0];
      if (!current || !validPrice(current, plan.name)) throw new Error(`Create the approved ${plan.name} Stripe price before enabling checkout.`);
      prices[plan.name] = current.id; allowed[plan.name] = new Set([current.id]); modes.add(current.livemode);
      // Historical prices need explicit catalog ownership and yearly cadence, not
      // just an arbitrary ID saved by a browser or an untrusted webhook.
      for (const old of rows) {
        if (plan.billing === "yearly" && old.metadata?.app === "indie-film-guide" && old.metadata?.plan === plan.name &&
          old.currency === "usd" && old.recurring?.interval === "year" && old.recurring?.interval_count === 1 && Number(old.unit_amount) > 0 && old.livemode === current.livemode)
          allowed[plan.name]!.add(old.id);
      }
    }
    if (modes.size !== 1) throw new Error("Stripe price modes are inconsistent.");
    billingState.prices = prices; billingState.allowedPrices = allowed;
    const links: { plan: string; url: string }[] = [];
    for await (const link of stripe.paymentLinks.list({ active: true, limit: 100 })) {
      if (link.metadata.app !== "indie-film-guide") continue;
      if (link.metadata.plan === "Lifetime Indie Partner") {
        // Legacy/unrestricted lifetime links must never bypass capacity.
        await stripe.paymentLinks.update(link.id, { active: false });
      } else if (PLANS.some(p => p.name === link.metadata.plan && p.billing === "yearly")) {
        const items = await stripe.paymentLinks.listLineItems(link.id, { limit: 2 });
        if (items.data.length !== 1 || items.data[0]?.price?.id !== prices[link.metadata.plan!] || items.data[0]?.quantity !== 1)
          throw new Error(`The ${link.metadata.plan} generic payment link uses the wrong price.`);
        links.push({ plan: link.metadata.plan!, url: link.url });
      }
    }
    if (!PLANS.filter(p => p.billing === "yearly").every(p => links.some(l => l.plan === p.name))) throw new Error("Create all annual Stripe payment links before enabling checkout.");
    links.push({ plan: "Lifetime Indie Partner", url: "/get-listed?plan=Lifetime%20Indie%20Partner" });
    billingState.paymentLinks = links; billingState.mode = [...modes][0] ? "live" : "test";
    await reconcileLifetimeReservations();
    billingState.available = true;
    const timer = setInterval(() => void reconcileLifetimeReservations(), 60000);
    timer.unref();
    logger.info({ mode: billingState.mode }, "Stripe checkout and verified webhooks are ready");
  } catch (error) {
    billingState.available = false; billingState.mode = "unavailable";
    logger.warn({ reason: error instanceof Error ? error.message : "Stripe setup failed" }, "Checkout unavailable; connect/configure Stripe and restart");
  } finally {
    billingState.initializing = false;
  }
}

export async function processListingWebhook(payload: Buffer, signature: string) {
  const sync = await getStripeSync();
  await sync.processWebhook(payload, signature); // verifies raw payload first
  const event = JSON.parse(payload.toString("utf8")) as Stripe.Event;
  const [already] = await db.select().from(paymentEventsTable).where(eq(paymentEventsTable.eventId, event.id));
  if (already) return;
  const stripe = await getUncachableStripeClient();
  if (event.type.startsWith("checkout.session.")) {
    const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id);
    const reference = session.metadata?.listingReference;
    if (reference && session.metadata?.app === "indie-film-guide") {
      if (session.mode === "payment") await applyLifetimeSession(session);
      else {
        const [row] = await db.select().from(listingsTable).where(eq(listingsTable.reference, reference));
        if (row && row.stripeCheckoutId === session.id && !row.deletedAt && idOf(session.subscription))
          await updateFromSubscription(idOf(session.subscription)!, reference);
      }
      if (session.status === "expired" && session.metadata?.reservationKey) {
        const [row] = await db.select().from(listingsTable).where(eq(listingsTable.reference, reference));
        if (row) await releaseReservation(row.id, session.metadata.reservationKey);
      }
    }
  } else if (event.type === "charge.refunded") {
    const chargeId = (event.data.object as Stripe.Charge).id;
    await applyLifetimeRefund(chargeId, stripe);
    await applyAnnualRefund(chargeId, stripe);
  } else if (["refund.created", "refund.updated", "refund.failed", "charge.refund.updated"].includes(event.type)) {
    await applyAnnualRefundUpdate((event.data.object as Stripe.Refund).id, stripe);
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

// Webhooks remain the ongoing billing path. A private status poll may recover a
// delayed initial payment using Stripe's authoritative saved session, never a
// success redirect or any browser-supplied payment/session ID.
export async function reconcileCheckoutPayment(reference: string, client?: Stripe) {
  const [row] = await db.select().from(listingsTable).where(eq(listingsTable.reference, reference));
  if (!row || row.deletedAt || row.paymentStatus !== "Unpaid" || !row.stripeCheckoutId) return;
  const stripe = client ?? await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(row.stripeCheckoutId);
  if (session.status !== "complete" || session.payment_status !== "paid") return;
  if (session.metadata?.app !== "indie-film-guide" || session.metadata.listingReference !== row.reference)
    throw new Error("Checkout is not bound to this listing.");
  if (session.mode === "payment") await applyLifetimeSession(session, stripe);
  else if (session.mode === "subscription" && idOf(session.subscription))
    await updateFromSubscription(idOf(session.subscription)!, row.reference, stripe);
}

export async function beginCheckout(reference: string, origin: string, client?: Stripe) {
  if (billingState.initializing)
    throw new Error("Billing is initializing; checkout is temporarily unavailable. Please retry shortly.");
  const stripe = billingState.available ? client ?? await getUncachableStripeClient() : null;
  // Commit a durable inventory reservation BEFORE making a network request:
  // even a lost response or DB commit failure cannot free a still-payable spot.
  const reserved = await db.transaction(async tx => {
    await tx.execute(lifetimeLock);
    const [row] = await tx.select().from(listingsTable).where(and(eq(listingsTable.reference, reference), isNull(listingsTable.deletedAt))).for("update");
    if (!row) throw new Error("Submission not found.");
    const plan = findPlan(row.plan);
    if (!plan || plan.billing === "free") throw new Error("Government listings do not require payment.");
    if (row.paymentStatus === "Payment waived") throw new Error("Payment is temporarily waived for this listing. Checkout is not required.");
    if (!stripe) throw new Error("Checkout is temporarily unavailable. Please try again shortly.");
    if (row.stripeSubscriptionId || row.stripePaymentIntentId || ["Paid", "Refunded"].includes(row.paymentStatus))
      throw new Error("Payment is already associated with this listing. Contact the administrator rather than paying again.");
    if (row.stripeCheckoutId) {
      const previous = await stripe.checkout.sessions.retrieve(row.stripeCheckoutId);
      if (previous.status === "open" && previous.url) return { row, existingUrl: previous.url };
      if (previous.status === "complete") throw new Error("Your checkout is complete. Payment confirmation is being processed; do not pay again.");
    }
    if (row.checkoutReservationKey && !row.stripeCheckoutId) {
      if (row.checkoutReservedUntil && row.checkoutReservedUntil.getTime() < Date.now() + 30 * 60000) throw new Error("Your previous checkout is being reconciled. Please try again shortly.");
      return { row, existingUrl: null };
    }
    if (plan.billing === "lifetime" && await lifetimeUsage(tx) >= LIFETIME_CAP) throw new Error("All 10 lifetime spots are taken.");
    const [updated] = await tx.update(listingsTable).set({
      checkoutReservationKey: randomUUID(), stripeCheckoutId: null,
      checkoutReservedUntil: plan.billing === "lifetime" ? new Date(Date.now() + RESERVATION_MS) : null,
    }).where(eq(listingsTable.id, row.id)).returning();
    return { row: updated!, existingUrl: null };
  });
  if (reserved.existingUrl) return reserved.existingUrl;
  const row = reserved.row;
  const price = billingState.prices[row.plan];
  if (!stripe || !price) throw new Error("The selected plan is unavailable.");
  const lifetime = findPlan(row.plan)?.billing === "lifetime";
  const metadata = { app: "indie-film-guide", listingReference: row.reference, reservationKey: row.checkoutReservationKey! };
  const session = await stripe.checkout.sessions.create({
    mode: lifetime ? "payment" : "subscription", customer_email: row.email,
    client_reference_id: row.reference, line_items: [{ price, quantity: 1 }], metadata,
    ...(lifetime ? { allowed_payment_method_types: ["card"] as NonNullable<Stripe.Checkout.SessionCreateParams["allowed_payment_method_types"]>,
      expires_at: Math.floor(row.checkoutReservedUntil!.getTime() / 1000), payment_intent_data: { metadata } }
      : { subscription_data: { metadata: { ...metadata, foundingPriceLocked: String(row.foundingPriceLocked) } } }),
    success_url: `${origin}/submitted?checkout=success`, cancel_url: `${origin}/submitted?checkout=cancelled`,
  }, { idempotencyKey: `ifg-checkout-${row.reference}-${row.checkoutReservationKey}` });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  await db.update(listingsTable).set({ stripeCheckoutId: session.id, stripePriceId: price })
    .where(and(eq(listingsTable.id, row.id), eq(listingsTable.checkoutReservationKey, row.checkoutReservationKey!)));
  return session.url;
}
