import type Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";
import { db, listingsTable, findPlan } from "@workspace/db";
import { lifetimeLock } from "./lifetime-inventory";
import { getUncachableStripeClient } from "./stripe-client";

export async function deleteListing(id: number, client?: Stripe) {
  return db.transaction(async tx => {
    await tx.execute(lifetimeLock);
    const [row] = await tx.select().from(listingsTable)
      .where(and(eq(listingsTable.id, id), isNull(listingsTable.deletedAt))).for("update");
    if (!row) return { status: 404, body: { error: "Listing not found." } };
    // A lost creation response may leave a payable Stripe session whose ID is
    // not saved yet. Never delete or release capacity until it is reconciled.
    if (!row.stripeCheckoutId && (row.checkoutReservationKey || row.checkoutReservedUntil)) {
      return { status: 409, body: { error: "Checkout is still being reconciled. Wait for its payment or confirmed expiry before deleting this listing." } };
    }
    if (row.stripeSubscriptionId && row.paymentStatus !== "Cancelled") {
      return { status: 409, body: { error: "Cancel the subscription in Stripe before deleting this listing so the provider is not billed for a deleted listing." } };
    }
    if (row.stripeCheckoutId && !row.stripeSubscriptionId) {
      const stripe = client ?? await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(row.stripeCheckoutId);
      if (session.status === "complete" && (findPlan(row.plan)?.billing === "yearly" || !["Paid", "Refunded"].includes(row.paymentStatus))) {
        return { status: 409, body: { error: "Checkout is complete. Wait for payment processing and cancel any active subscription in Stripe before deleting." } };
      }
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    }
    await tx.update(listingsTable).set({
      deletedAt: new Date(), status: "Rejected", accessTokenHash: null,
      checkoutReservedUntil: null, checkoutReservationKey: null,
    }).where(eq(listingsTable.id, row.id));
    return { status: 204, body: null };
  });
}
