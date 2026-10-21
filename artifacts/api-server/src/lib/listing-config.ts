import { db, listingsTable, PLANS, LIFETIME_CAP } from "@workspace/db";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
export const categories = [
  "Locations", "Equipment & Props", "Talent, Crew & On-Set",
  "Business Services & Licensing", "Funding & Banking", "Distribution & Marketing",
];
export const stages = ["Idea", "Production", "Post-Production", "Distribution"];

export const billingState: {
  available: boolean;
  mode: "test" | "live" | "unavailable";
  prices: Record<string, string>;
  allowedPrices: Record<string, Set<string>>;
  paymentLinks: { plan: string; url: string }[];
} = { available: false, mode: "unavailable", prices: {}, allowedPrices: {}, paymentLinks: [] };

export function specialActive() {
  const end = process.env.SPECIAL_END_DATE;
  return !!end && Number.isFinite(Date.parse(end)) && Date.now() < Date.parse(end);
}
export async function listingConfig() {
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(listingsTable).where(and(
    eq(listingsTable.plan, "Lifetime Indie Partner"),
    or(eq(listingsTable.paymentStatus, "Paid"), isNotNull(listingsTable.checkoutReservedUntil)),
  ));
  return {
    specialActive: specialActive(), plans: PLANS,
    lifetimeSpotsLeft: Math.max(0, LIFETIME_CAP - (count?.total ?? 0)),
    billingAvailable: billingState.available,
    billingMode: billingState.mode,
  };
}
