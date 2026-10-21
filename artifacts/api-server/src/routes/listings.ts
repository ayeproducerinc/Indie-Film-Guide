import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, eq, or } from "drizzle-orm";
import { db, listingsTable } from "@workspace/db";
import {
  GetDirectoryResponse, GetListingParams, GetListingResponse,
  GetLocationsResponse, GetListingConfigResponse, SubmitListingBody, SubmitListingResponse,
} from "@workspace/api-zod";
import locations from "../data/georgia-locations.json";
import { categories, stages, listingConfig } from "../lib/listing-config";

const router: IRouter = Router();
const locationMap = new Map(locations.map(location => [location.id, location]));
const publicFields = {
  id: listingsTable.id, slug: listingsTable.slug, name: listingsTable.name,
  description: listingsTable.description, category: listingsTable.category,
  stages: listingsTable.stages, coverage: listingsTable.coverage,
  city: listingsTable.city, state: listingsTable.state, website: listingsTable.website,
  phone: listingsTable.phone, providerType: listingsTable.providerType,
  indieRate: listingsTable.indieRate, indieRateDetails: listingsTable.indieRateDetails,
};
const visible = and(eq(listingsTable.status, "Live"),
  or(eq(listingsTable.paymentStatus, "Paid"),
    and(eq(listingsTable.providerType, "Government"), eq(listingsTable.plan, "Government"), eq(listingsTable.paymentStatus, "Not required"))));

router.get("/directory", async (_req, res): Promise<void> => {
  const listings = await db.select(publicFields).from(listingsTable).where(visible).orderBy(asc(listingsTable.name));
  const cities = [...new Set(listings.filter(l => l.coverage === "City").map(l => l.city))].sort((a, b) => a.localeCompare(b));
  res.json(GetDirectoryResponse.parse({ listings, cities, categories, stages }));
});

router.get("/listings/:slug", async (req, res): Promise<void> => {
  const params = GetListingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid listing URL." }); return; }
  const [listing] = await db.select(publicFields).from(listingsTable).where(and(visible, eq(listingsTable.slug, params.data.slug)));
  if (!listing) { res.status(404).json({ error: "Listing not found." }); return; }
  res.json(GetListingResponse.parse(listing));
});

router.get("/locations", (_req, res): void => {
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.json(GetLocationsResponse.parse(locations));
});

router.get("/listing-config", (_req, res): void => {
  res.json(GetListingConfigResponse.parse(listingConfig()));
});

router.post("/submissions", async (req, res): Promise<void> => {
  const parsed = SubmitListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please check the highlighted fields.", fields: parsed.error.flatten().fieldErrors });
    return;
  }
  const input = parsed.data;
  const fail = (field: string, message: string) => { res.status(400).json({ error: message, fields: { [field]: [message] } }); };
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) { fail("name", "Enter your business name."); return; }
  if (!description) { fail("description", "Describe what you offer."); return; }
  const location = input.locationId ? locationMap.get(input.locationId) : undefined;
  if (input.coverage === "City" && !location) { fail("locationId", "Choose a city from the Georgia suggestions."); return; }
  if ((input.providerType === "Government") !== (input.plan === "Government")) {
    fail("plan", "The free plan is available only to government offices."); return;
  }
  const indieRateDetails = input.plan === "Indie Partner" ? input.indieRateDetails?.trim() ?? "" : "";
  if (input.plan === "Indie Partner" && !indieRateDetails) { fail("indieRateDetails", "Describe your indie filmmaker rate."); return; }
  let website = input.website?.trim() ?? "";
  if (website) {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(website)) website = `https://${website}`;
    try {
      const url = new URL(website);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) throw new Error("Invalid URL");
      website = url.toString();
    } catch { fail("website", "Enter a valid website, such as https://example.com."); return; }
  }
  let phone = input.phone?.trim() ?? "";
  if (phone) {
    if (!/^[+\d\s().-]+$/.test(phone)) { fail("phone", "Enter a valid U.S. phone number."); return; }
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) phone = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith("1")) phone = `+${digits}`;
    else { fail("phone", "Enter a 10-digit U.S. phone number."); return; }
  }
  const reference = randomUUID();
  const slugBase = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "provider";
  const government = input.plan === "Government";
  await db.insert(listingsTable).values({
    reference, slug: `${slugBase}-${reference.slice(0, 8)}`, name, description,
    category: input.category, stages: [...new Set(input.stages)], coverage: input.coverage,
    locationId: input.coverage === "City" ? location!.id : null,
    city: input.coverage === "City" ? location!.city : input.coverage,
    state: input.coverage === "Nationwide" ? "" : "GA",
    website, phone, email: input.email.trim().toLowerCase(),
    providerType: input.providerType, indieRate: input.plan === "Indie Partner",
    indieRateDetails, plan: input.plan, status: "Pending",
    paymentStatus: government ? "Not required" : "Unpaid",
    foundingPriceLocked: listingConfig().specialActive,
  });
  res.status(201).json(SubmitListingResponse.parse({
    reference, status: "Pending", paymentStatus: government ? "Not required" : "Unpaid",
    message: government ? "Your listing has been submitted for review. It is not public yet."
      : "Your listing is saved but not paid yet. Online payments are not enabled yet. You have not been charged, and your listing is not public.",
  }));
});

export default router;
