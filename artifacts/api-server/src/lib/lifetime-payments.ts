import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db, listingsTable, findPlan } from "@workspace/db";
import { getUncachableStripeClient } from "./stripe-client";
import { billingState } from "./listing-config";
import { lifetimeLock } from "./lifetime-inventory";
import { idOf } from "./subscription-billing";

export async function applyLifetimeSession(session: Stripe.Checkout.Session, client?: Stripe) {
  const stripe = client ?? await getUncachableStripeClient();
  if (session.mode !== "payment" || session.metadata?.app !== "indie-film-guide" || !session.metadata.listingReference) return;
  await db.transaction(async tx => {
    await tx.execute(lifetimeLock);
    const [row] = await tx.select().from(listingsTable).where(eq(listingsTable.reference, session.metadata!.listingReference!)).for("update");
    if (!row || row.plan !== "Lifetime Indie Partner" || row.paymentStatus === "Payment waived") return;
    if (row.stripeCheckoutId !== session.id) {
      // Retry an event delivered between Stripe creation and the local ID commit.
      if (row.checkoutReservationKey && session.metadata?.reservationKey === row.checkoutReservationKey) throw new Error("Checkout is still being linked; retry webhook.");
      return;
    }
    if (session.payment_status !== "paid") return;
    const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
    const price = lines.data[0]?.price;
    const def = findPlan(row.plan)!;
    if (lines.data.length !== 1 || !price || !billingState.allowedPrices[row.plan]?.has(price.id) ||
      session.currency !== def.currency || session.amount_total !== def.amount || lines.data[0]?.quantity !== 1)
      throw new Error("Lifetime payment does not match the saved plan.");
    const intentId = idOf(session.payment_intent);
    if (!intentId) throw new Error("Lifetime payment intent is missing.");
    const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    if (intent.status !== "succeeded" || !charge) throw new Error("Lifetime payment is not settled.");
    // Inspect authoritative refund state even on old completion/replay events.
    const refunded = charge.amount_refunded > 0;
    await tx.update(listingsTable).set({
      paymentStatus: refunded ? "Refunded" : "Paid", stripePaymentIntentId: intentId, stripePriceId: price.id,
      stripeCustomerId: idOf(session.customer), checkoutReservedUntil: null, checkoutReservationKey: null,
      pastDueSince: null, foundingPriceLocked: false,
    }).where(eq(listingsTable.id, row.id));
  });
}
export async function applyLifetimeRefund(chargeId: string, client?: Stripe) {
  const stripe = client ?? await getUncachableStripeClient();
  const charge = await stripe.charges.retrieve(chargeId);
  const intentId = idOf(charge.payment_intent);
  if (!intentId || !charge.amount_refunded) return;
  await db.transaction(async tx => {
    await tx.execute(lifetimeLock);
    await tx.update(listingsTable).set({ paymentStatus: "Refunded", checkoutReservedUntil: null, checkoutReservationKey: null })
      .where(and(eq(listingsTable.stripePaymentIntentId, intentId), eq(listingsTable.plan, "Lifetime Indie Partner")));
  });
}
