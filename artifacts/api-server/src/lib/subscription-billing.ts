import { and, eq, isNull, sql } from "drizzle-orm";
import { db, listingsTable, findPlan } from "@workspace/db";
import { getUncachableStripeClient } from "./stripe-client";
import { billingState } from "./listing-config";
import { subscriptionTransition } from "./payment-policy";
import { invoiceFullyRefunded } from "./annual-refunds";
import type Stripe from "stripe";

export const idOf = (object: string | { id: string } | null) => typeof object === "string" ? object : object?.id ?? null;
export async function previewStandardAtRenewal(id: number) {
  const [row] = await db.select().from(listingsTable).where(and(eq(listingsTable.id, id), isNull(listingsTable.deletedAt)));
  if (!row || !row.stripeSubscriptionId || !["Indie Partner", "Nonprofit Indie Partner"].includes(row.plan)) throw new Error("Only yearly indie subscriptions can change to Standard at renewal.");
  if (!billingState.available) throw new Error("Stripe billing is unavailable.");
  const stripe = await getUncachableStripeClient();
  const sub = await stripe.subscriptions.retrieve(row.stripeSubscriptionId);
  const item = sub.items.data[0];
  if (!item || sub.status !== "active" || sub.cancel_at_period_end || sub.metadata.listingReference !== row.reference || sub.metadata.app !== "indie-film-guide") throw new Error("Subscription is not eligible for a renewal change.");
  const target = row.providerType === "Nonprofit" ? "Nonprofit Standard" : "Standard";
  return { currentPlan: row.plan, targetPlan: target, currentAmount: item.price.unit_amount ?? findPlan(row.plan)!.amount,
    targetAmount: findPlan(target)!.amount, effectiveAt: new Date(item.current_period_end * 1000).toISOString() };
}

export async function updateFromSubscription(subscriptionId: string, reference?: string, client?: Stripe) {
  const stripe = client ?? await getUncachableStripeClient();
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${subscriptionId}))`);
    const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
    let [listing] = await tx.select().from(listingsTable).where(eq(listingsTable.stripeSubscriptionId, subscriptionId)).for("update");
    if (!listing && reference) [listing] = await tx.select().from(listingsTable).where(eq(listingsTable.reference, reference)).for("update");
    if (!listing || listing.deletedAt || findPlan(listing.plan)?.billing !== "yearly" || listing.paymentStatus === "Payment waived") return;
    if (listing.stripeSubscriptionId && listing.stripeSubscriptionId !== sub.id) return;
    if (!listing.stripeSubscriptionId) {
      if (!listing.stripeCheckoutId) throw new Error("Subscription checkout has not been linked yet.");
      const checkout = await stripe.checkout.sessions.retrieve(listing.stripeCheckoutId);
      if (checkout.mode !== "subscription" || idOf(checkout.subscription) !== sub.id || checkout.metadata?.listingReference !== listing.reference)
        throw new Error("Subscription is not bound to the saved checkout.");
    }
    if (sub.metadata.listingReference !== listing.reference || sub.metadata.app !== "indie-film-guide") throw new Error("Subscription is not bound to this listing.");
    const item = sub.items.data[0];
    let plan = listing.plan;
    const switched = !!listing.pendingPlan && item?.price.id === billingState.prices[listing.pendingPlan];
    if (switched && listing.pendingPlanAt && listing.pendingPlanAt.getTime() > Date.now() + 60000) throw new Error("The scheduled plan change is not effective yet.");
    if (switched) plan = listing.pendingPlan!;
    if (sub.items.data.length !== 1 || !item || item.quantity !== 1 || !billingState.allowedPrices[plan]?.has(item.price.id)) throw new Error("Subscription price does not match the saved listing.");
    if (listing.stripePriceId && !switched && item.price.id !== listing.stripePriceId && item.price.id !== billingState.prices[plan])
      throw new Error("Unexpected subscription price change.");
    const invoice = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
    const paid = sub.status === "active" && invoice?.status === "paid" && item.current_period_end * 1000 > Date.now();
    if (paid && (idOf(invoice.parent?.subscription_details?.subscription ?? null) !== sub.id ||
        invoice.livemode !== sub.livemode))
      throw new Error("The paid invoice is not bound to this subscription and billing mode.");
    const fullyRefunded = paid && await invoiceFullyRefunded(stripe, invoice);
    const paymentStatus = paid ? fullyRefunded ? "Refunded" : "Paid"
      : ["canceled", "unpaid", "incomplete_expired"].includes(sub.status) ? "Cancelled"
      : listing.paymentStatus === "Refunded" ? "Refunded" : sub.status === "past_due" ? "Past due" : "Unpaid";
    // Use invoice time for first failed renewal; webhook delivery delays must not extend grace.
    const firstDue = !listing.pastDueSince && paymentStatus === "Past due"
      ? new Date((invoice?.status_transitions.finalized_at ?? invoice?.created ?? Math.floor(Date.now() / 1000)) * 1000) : listing.pastDueSince;
    const transition = subscriptionTransition({ ...listing, pastDueSince: firstDue }, paymentStatus);
    await tx.update(listingsTable).set({
      ...transition, plan, stripeSubscriptionId: sub.id, stripeCustomerId: idOf(sub.customer), stripePriceId: item.price.id,
      ...(switched ? { pendingPlan: null, pendingPlanAt: null, stripeScheduleId: null,
        indieRate: false, indiePromoCode: "", indieRateDetails: "", indieRedeemHow: "", indieWhoQualifies: "" } : {}),
    }).where(eq(listingsTable.id, listing.id));
  });
}

export async function applyAnnualRefund(chargeId: string, client?: Stripe) {
  const stripe = client ?? await getUncachableStripeClient();
  const charge = await stripe.charges.retrieve(chargeId);
  const intent = idOf(charge.payment_intent);
  if (!intent || !charge.amount_refunded) return;
  const subscriptions = new Set<string>();
  for await (const payment of stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: intent }, status: "paid", limit: 100,
  })) {
    const invoice = await stripe.invoices.retrieve(idOf(payment.invoice)!);
    const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription ?? null);
    if (!subscriptionId || subscriptions.has(subscriptionId)) continue;
    subscriptions.add(subscriptionId);
    const [listing] = await db.select().from(listingsTable).where(and(
      eq(listingsTable.stripeSubscriptionId, subscriptionId), isNull(listingsTable.deletedAt),
    ));
    if (!listing || findPlan(listing.plan)?.billing !== "yearly" || listing.paymentStatus === "Payment waived") continue;
    // Reconcile the subscription's CURRENT invoice under the same lock as all
    // other updates. A delayed refund of an older year cannot hide a new year.
    await updateFromSubscription(subscriptionId, undefined, stripe);
  }
}

export async function applyAnnualRefundUpdate(refundId: string, client?: Stripe) {
  const stripe = client ?? await getUncachableStripeClient();
  const refund = await stripe.refunds.retrieve(refundId);
  const chargeId = idOf(refund.charge);
  if (chargeId) await applyAnnualRefund(chargeId, stripe);
}

export async function scheduleStandardAtRenewal(id: number, expected: { expectedEffectiveAt: string; expectedAmount: number }) {
  const stripe = await getUncachableStripeClient();
  return db.transaction(async tx => {
    const [row] = await tx.select().from(listingsTable).where(and(eq(listingsTable.id, id), isNull(listingsTable.deletedAt))).for("update");
    if (!row || !row.stripeSubscriptionId || !["Indie Partner", "Nonprofit Indie Partner"].includes(row.plan)) throw new Error("Only an active yearly indie subscription can change to Standard at renewal.");
    if (row.pendingPlan) return row; // retries never create a second schedule
    if (!billingState.available) throw new Error("Stripe billing is unavailable.");
    const sub = await stripe.subscriptions.retrieve(row.stripeSubscriptionId);
    if (sub.status !== "active" || sub.cancel_at_period_end || sub.metadata.listingReference !== row.reference || sub.metadata.app !== "indie-film-guide")
      throw new Error("The linked subscription is not eligible for a renewal plan change.");
    const item = sub.items.data[0];
    if (!item || sub.items.data.length !== 1) throw new Error("Unexpected subscription items.");
    const target = row.providerType === "Nonprofit" ? "Nonprofit Standard" : "Standard";
    if (new Date(item.current_period_end * 1000).toISOString() !== expected.expectedEffectiveAt || findPlan(target)!.amount !== expected.expectedAmount)
      throw new Error("The renewal date or price changed. Preview and confirm the change again.");
    const price = billingState.prices[target];
    if (!price) throw new Error("The Standard price is unavailable.");
    let schedule = sub.schedule ? await stripe.subscriptionSchedules.retrieve(idOf(sub.schedule)!)
      : await stripe.subscriptionSchedules.create({ from_subscription: sub.id, metadata: { app: "indie-film-guide", listingReference: row.reference, targetPlan: target } }, { idempotencyKey: `ifg-schedule-${row.reference}-${sub.id}` });
    // Only reuse our own schedule after a prior DB commit/network failure.
    if (sub.schedule && (schedule.metadata?.app !== "indie-film-guide" || schedule.metadata?.listingReference !== row.reference || schedule.metadata?.targetPlan !== target))
      throw new Error("This subscription already has a separate schedule. Review it in Stripe first.");
    schedule = await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release", proration_behavior: "none",
      metadata: { app: "indie-film-guide", listingReference: row.reference, targetPlan: target },
      phases: [
        { start_date: item.current_period_start, end_date: item.current_period_end, items: [{ price: item.price.id, quantity: 1 }], proration_behavior: "none" },
        { duration: { interval: "year", interval_count: 1 }, items: [{ price, quantity: 1 }], proration_behavior: "none",
          metadata: { app: "indie-film-guide", listingReference: row.reference } },
      ],
    }, { idempotencyKey: `ifg-standard-renewal-${row.reference}-${sub.id}` });
    const [updated] = await tx.update(listingsTable).set({
      pendingPlan: target, pendingPlanAt: new Date(item.current_period_end * 1000), stripeScheduleId: schedule.id,
    }).where(eq(listingsTable.id, row.id)).returning();
    return updated!;
  });
}
