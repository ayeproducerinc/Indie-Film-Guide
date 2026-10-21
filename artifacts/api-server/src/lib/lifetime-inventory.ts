import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { db, listingsTable, LIFETIME_CAP } from "@workspace/db";
import type Stripe from "stripe";
import { getUncachableStripeClient } from "./stripe-client";
import { logger } from "./logger";

// Every checkout, release, and paid transition uses this lock before row locks.
export const lifetimeLock = sql`select pg_advisory_xact_lock(732019981)`;
export const RESERVATION_MS = 35 * 60 * 1000;
export async function lifetimeUsage(tx: Pick<typeof db, "select">) {
  const [row] = await tx.select({ total: sql<number>`count(*)::int` }).from(listingsTable).where(and(
    eq(listingsTable.plan, "Lifetime Indie Partner"),
    or(eq(listingsTable.paymentStatus, "Paid"), isNotNull(listingsTable.checkoutReservedUntil)),
  ));
  return row?.total ?? 0;
}
export async function releaseReservation(id: number, key: string) {
  await db.transaction(async tx => {
    await tx.execute(lifetimeLock);
    await tx.update(listingsTable).set({ checkoutReservedUntil: null, checkoutReservationKey: null })
      .where(and(eq(listingsTable.id, id), eq(listingsTable.checkoutReservationKey, key)));
  });
}
// Missing-session reservations survive uncertain network failures. Recover the
// session from Stripe metadata before releasing capacity; completed sessions
// remain reserved until a verified webhook grants payment.
let reconciling = false;
export async function reconcileLifetimeReservations(client?: Stripe) {
  if (reconciling) return;
  reconciling = true;
  try {
    const rows = await db.select().from(listingsTable).where(and(
      eq(listingsTable.plan, "Lifetime Indie Partner"), isNotNull(listingsTable.checkoutReservedUntil),
      sql`${listingsTable.checkoutReservedUntil} < now()`,
    ));
    if (!rows.length) return;
    const stripe = client ?? await getUncachableStripeClient();
    for (const row of rows) {
      const key = row.checkoutReservationKey;
      if (!key || !row.checkoutReservedUntil) continue;
      let session: Stripe.Checkout.Session | undefined;
      if (row.stripeCheckoutId) session = await stripe.checkout.sessions.retrieve(row.stripeCheckoutId);
      else {
        const since = Math.floor((row.checkoutReservedUntil.getTime() - RESERVATION_MS - 60000) / 1000);
        for await (const candidate of stripe.checkout.sessions.list({ created: { gte: since }, limit: 100 })) {
          if (candidate.metadata?.reservationKey === key && candidate.metadata?.listingReference === row.reference) { session = candidate; break; }
        }
      }
      if (session?.status === "open") {
        try { session = await stripe.checkout.sessions.expire(session.id); } catch { continue; }
      }
      if (session?.status === "complete") {
        await db.update(listingsTable).set({ stripeCheckoutId: session.id })
          .where(and(eq(listingsTable.id, row.id), eq(listingsTable.checkoutReservationKey, key)));
        continue;
      }
      if (!session || session.status === "expired") await releaseReservation(row.id, key);
    }
  } catch (error) {
    logger.warn({ reason: error instanceof Error ? error.message : "Inventory reconciliation failed" }, "Lifetime capacity retained conservatively");
  } finally { reconciling = false; }
}
export { LIFETIME_CAP };
