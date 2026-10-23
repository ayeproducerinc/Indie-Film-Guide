import { sql, type SQL } from "drizzle-orm";

export const LISTING_PAGE_SIZE = 20 as const;

export function listingPage(total: number, requested = 1) {
  const pageCount = Math.max(1, Math.ceil(total / LISTING_PAGE_SIZE));
  return { total, page: Math.min(requested, pageCount), pageSize: LISTING_PAGE_SIZE, pageCount };
}

export function countWhere(condition: SQL | undefined) {
  return sql<number>`count(*) filter (where ${condition ?? sql`true`})`.mapWith(Number);
}
