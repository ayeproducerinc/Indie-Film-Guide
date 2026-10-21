import { Router, type IRouter } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db, listingsTable } from "@workspace/db";
import {
  GetDirectoryResponse, GetListingParams, GetListingResponse, GetLocationsResponse,
  GetListingConfigResponse, SubmitListingResponse, GetSubmissionStatusBody,
  GetSubmissionStatusResponse, CreateListingCheckoutResponse,
} from "@workspace/api-zod";
import locations from "../data/georgia-locations.json";
import { billingState, categories, stages, listingConfig } from "../lib/listing-config";
import { validateListing } from "../lib/listing-validation";
import { beginCheckout } from "../lib/billing";

const router: IRouter = Router();
const publicFields = {
  id: listingsTable.id, slug: listingsTable.slug, name: listingsTable.name,
  description: listingsTable.description, category: listingsTable.category,
  stages: listingsTable.stages, coverage: listingsTable.coverage,
  city: listingsTable.city, state: listingsTable.state, website: listingsTable.website,
  phone: listingsTable.phone, providerType: listingsTable.providerType,
  indieRate: listingsTable.indieRate, indieRateDetails: listingsTable.indieRateDetails,
  email: sql<string | null>`CASE WHEN ${listingsTable.publicEmail} THEN ${listingsTable.email} ELSE NULL END`,
};
const visible = and(isNull(listingsTable.deletedAt), eq(listingsTable.status, "Live"),
  or(eq(listingsTable.paymentStatus, "Paid"), eq(listingsTable.paymentStatus, "Payment waived"),
    and(eq(listingsTable.providerType, "Government"), eq(listingsTable.plan, "Government"), eq(listingsTable.paymentStatus, "Not required"))));
function publicView<T extends { email: string | null }>(row: T) {
  const { email, ...rest } = row;
  return email ? { ...rest, email } : rest;
}
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

router.get("/directory", async (_req, res): Promise<void> => {
  const rows = await db.select(publicFields).from(listingsTable).where(visible).orderBy(asc(listingsTable.name));
  const listings = rows.map(publicView);
  const cities = [...new Set(listings.filter(l => l.coverage === "City").map(l => l.city))].sort((a, b) => a.localeCompare(b));
  res.json(GetDirectoryResponse.parse({ listings, cities, categories, stages }));
});

router.get("/listings/:slug", async (req, res): Promise<void> => {
  const params = GetListingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid listing URL." }); return; }
  const [listing] = await db.select(publicFields).from(listingsTable).where(and(visible, eq(listingsTable.slug, params.data.slug)));
  if (!listing) { res.status(404).json({ error: "Listing not found." }); return; }
  res.json(GetListingResponse.parse(publicView(listing)));
});
router.get("/locations", (_req, res): void => {
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.json(GetLocationsResponse.parse(locations));
});
router.get("/listing-config", (_req, res): void => {
  res.json(GetListingConfigResponse.parse(listingConfig()));
});
router.post("/submissions", async (req, res): Promise<void> => {
  const values = validateListing(req.body);
  const reference = randomUUID();
  const accessToken = randomBytes(32).toString("hex");
  const slugBase = values.name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "provider";
  const paymentStatus = values.plan === "Government" ? "Not required" : "Unpaid";
  await db.insert(listingsTable).values({
    ...values, reference, accessTokenHash: hashToken(accessToken),
    slug: `${slugBase}-${reference.slice(0, 8)}`, status: "Pending",
    paymentStatus, foundingPriceLocked: values.plan !== "Government" && listingConfig().specialActive,
  });
  res.status(201).json(SubmitListingResponse.parse({
    reference, accessToken, status: "Pending", paymentStatus,
    message: values.plan === "Government" ? "Your listing has been submitted for review."
      : "Your listing is saved. Complete your annual subscription payment before review.",
  }));
});
router.post("/submissions/:reference/status", async (req, res): Promise<void> => {
  const body = GetSubmissionStatusBody.safeParse(req.body);
  if (!body.success || typeof req.params.reference !== "string") { res.status(400).json({ error: "Invalid submission access." }); return; }
  const [listing] = await db.select().from(listingsTable).where(and(
    eq(listingsTable.reference, req.params.reference), eq(listingsTable.accessTokenHash, hashToken(body.data.token)), isNull(listingsTable.deletedAt),
  ));
  if (!listing) { res.status(404).json({ error: "Submission not found on this device." }); return; }
  res.json(GetSubmissionStatusResponse.parse({
    reference: listing.reference, name: listing.name, plan: listing.plan,
    status: listing.status, paymentStatus: listing.paymentStatus,
    foundingPriceLocked: listing.foundingPriceLocked,
    checkoutAvailable: billingState.available && listing.plan !== "Government" && !listing.stripeSubscriptionId && !["Paid", "Payment waived"].includes(listing.paymentStatus),
    billingMode: billingState.mode,
  }));
});
router.post("/submissions/:reference/checkout", async (req, res): Promise<void> => {
  const body = GetSubmissionStatusBody.safeParse(req.body);
  if (!body.success || typeof req.params.reference !== "string") { res.status(400).json({ error: "Invalid submission access." }); return; }
  const [listing] = await db.select({ reference: listingsTable.reference }).from(listingsTable).where(and(
    eq(listingsTable.reference, req.params.reference), eq(listingsTable.accessTokenHash, hashToken(body.data.token)), isNull(listingsTable.deletedAt),
  ));
  if (!listing) { res.status(404).json({ error: "Submission not found." }); return; }
  // Use the deployed request origin. Never accept an arbitrary return URL from a client.
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  if (!host || !/^[a-z0-9.:-]+$/i.test(host)) { res.status(400).json({ error: "Invalid application host." }); return; }
  const protocol = req.get("x-forwarded-proto") === "https" || req.secure ? "https" : "http";
  try {
    const url = await beginCheckout(listing.reference, `${protocol}://${host}`);
    res.json(CreateListingCheckoutResponse.parse({ url }));
  } catch (error) {
    res.status(billingState.available ? 409 : 503).json({ error: error instanceof Error ? error.message : "Checkout could not be opened." });
  }
});
export default router;
