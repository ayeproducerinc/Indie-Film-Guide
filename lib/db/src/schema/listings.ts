import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  stages: text("stages").array().notNull(),
  coverage: text("coverage").notNull(),
  locationId: text("location_id"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  website: text("website").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull(),
  providerType: text("provider_type").notNull(),
  indieRate: boolean("indie_rate").notNull(),
  indieRateDetails: text("indie_rate_details").notNull().default(""),
  plan: text("plan").notNull(),
  status: text("status").notNull().default("Pending"),
  paymentStatus: text("payment_status").notNull().default("Unpaid"),
  foundingPriceLocked: boolean("founding_price_locked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({ id: true, createdAt: true });
export type Listing = typeof listingsTable.$inferSelect;
export type InsertListing = typeof listingsTable.$inferInsert;
