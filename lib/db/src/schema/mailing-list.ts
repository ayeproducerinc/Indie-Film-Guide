import { pgTable, text, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mailingContactsTable = pgTable("mailing_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
  consentVersion: text("consent_version").notNull(),
  consentText: text("consent_text").notNull(),
  source: text("source").notNull(),
  status: text("status", { enum: ["active", "opted_out"] }).notNull().default("active"),
  optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
});

export const insertMailingContactSchema = createInsertSchema(mailingContactsTable).omit({
  id: true, createdAt: true,
});
export type InsertMailingContact = z.infer<typeof insertMailingContactSchema>;
export type MailingContact = typeof mailingContactsTable.$inferSelect;

// Short-lived abuse-prevention buckets contain keyed hashes, not IP addresses.
export const mailingSignupLimitsTable = pgTable("mailing_signup_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
