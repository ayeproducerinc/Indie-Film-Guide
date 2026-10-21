import { findPlan, GRACE_MS, type Listing } from "@workspace/db";

export function graceDaysLeft(row: Pick<Listing, "paymentStatus" | "pastDueSince">, now = Date.now()) {
  if (row.paymentStatus !== "Past due" || !row.pastDueSince) return 0;
  return Math.max(0, Math.min(30, Math.ceil((row.pastDueSince.getTime() + GRACE_MS - now) / 86400000)));
}
export function eligible(row: Pick<Listing, "plan" | "providerType" | "paymentStatus" | "pastDueSince" | "einVerified">, now = Date.now()) {
  if (row.providerType === "Nonprofit" && !row.einVerified) return false;
  if (row.paymentStatus === "Payment waived") return true;
  if (row.plan === "Government") return row.providerType === "Government" && row.paymentStatus === "Not required";
  return row.paymentStatus === "Paid" || (findPlan(row.plan)?.billing === "yearly" && graceDaysLeft(row, now) > 0);
}
export function subscriptionTransition(row: Pick<Listing, "pastDueSince" | "foundingPriceLocked">, paymentStatus: string, now = new Date()) {
  const expired = !!row.pastDueSince && now.getTime() - row.pastDueSince.getTime() >= GRACE_MS;
  return {
    paymentStatus,
    pastDueSince: paymentStatus === "Past due" ? row.pastDueSince ?? now : paymentStatus === "Paid" ? null : row.pastDueSince,
    foundingPriceLocked: row.foundingPriceLocked && paymentStatus !== "Cancelled" && !expired,
  };
}
export function validPrice(price: { currency: string; unit_amount: number | null; recurring?: { interval: string; interval_count: number } | null }, name: string) {
  const plan = findPlan(name);
  return !!plan && price.currency === plan.currency && price.unit_amount === plan.amount &&
    (plan.billing === "yearly" ? price.recurring?.interval === "year" && price.recurring.interval_count === 1 : plan.billing === "lifetime" && !price.recurring);
}
