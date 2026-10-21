import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, listingsTable, type Listing } from "@workspace/db";
import {
  GetAdminSessionResponse, LoginAdminBody, GetAdminDashboardResponse, AddAdminListingResponse,
  UpdateAdminListingParams, UpdateAdminListingResponse, DeleteAdminListingParams,
  SetAdminListingStatusParams, SetAdminListingStatusBody, SetAdminListingStatusResponse,
} from "@workspace/api-zod";
import { isAdmin, adminConfigured, requireAdmin, requireAdminMutation, login, logout } from "../lib/admin-auth";
import { validateListing } from "../lib/listing-validation";
import { listingConfig, billingState } from "../lib/listing-config";
import { beginCheckout } from "../lib/billing";
import { getUncachableStripeClient } from "../lib/stripe-client";

const router: IRouter = Router();
const adminView = (row: Listing) => ({ ...row, createdAt: row.createdAt.toISOString() });
const eligible = (row: Listing) => row.plan === "Government"
  ? row.providerType === "Government" && row.paymentStatus === "Not required"
  : row.paymentStatus === "Paid";

router.get("/admin/session", async (req, res): Promise<void> => {
  res.json(GetAdminSessionResponse.parse({ authenticated: await isAdmin(req), configured: adminConfigured() }));
});
router.post("/admin/session", requireAdminMutation, async (req, res): Promise<void> => {
  const body = LoginAdminBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Enter your admin password." }); return; }
  await login(req, res, body.data.password);
});
router.delete("/admin/session", requireAdminMutation, logout);
router.use("/admin", requireAdmin);
router.get("/admin/dashboard", async (_req, res): Promise<void> => {
  const rows = await db.select().from(listingsTable).where(isNull(listingsTable.deletedAt)).orderBy(desc(listingsTable.createdAt));
  res.json(GetAdminDashboardResponse.parse({
    listings: rows.map(adminView),
    liveCount: rows.filter(l => l.status === "Live" && eligible(l)).length,
    paidCount: rows.filter(l => l.paymentStatus === "Paid").length,
    yearlyRevenue: rows.filter(l => l.paymentStatus === "Paid").reduce((sum, l) => sum + (l.plan === "Indie Partner" ? 199 : l.plan === "Standard" ? 499 : 0), 0),
    billingMode: billingState.mode, paymentLinks: billingState.paymentLinks,
  }));
});
router.post("/admin/listings", requireAdminMutation, async (req, res): Promise<void> => {
  const values = validateListing(req.body);
  const reference = randomUUID();
  const slug = `${values.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "provider"}-${reference.slice(0, 8)}`;
  const [row] = await db.insert(listingsTable).values({
    ...values, reference, slug, status: "Pending",
    paymentStatus: values.plan === "Government" ? "Not required" : "Unpaid",
    foundingPriceLocked: values.plan !== "Government" && listingConfig().specialActive,
  }).returning();
  res.status(201).json(AddAdminListingResponse.parse(adminView(row!)));
});
router.put("/admin/listings/:id", requireAdminMutation, async (req, res): Promise<void> => {
  const params = UpdateAdminListingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid listing." }); return; }
  const values = validateListing(req.body);
  const result = await db.transaction(async tx => {
    const [row] = await tx.select().from(listingsTable).where(and(eq(listingsTable.id, params.data.id), isNull(listingsTable.deletedAt))).for("update");
    if (!row) return { status: 404, body: { error: "Listing not found." } };
    if ((row.stripeSubscriptionId || row.stripeCheckoutId) && (values.plan !== row.plan || values.providerType !== row.providerType)) {
      return { status: 409, body: { error: "This listing has a Stripe checkout/subscription. Its plan and provider type cannot be changed." } };
    }
    const paymentStatus = values.plan !== row.plan
      ? values.plan === "Government" ? "Not required" : "Unpaid" : row.paymentStatus;
    const status = row.status === "Live" && paymentStatus !== "Paid" && values.plan !== "Government" ? "Pending" : row.status;
    const [updated] = await tx.update(listingsTable).set({ ...values, paymentStatus, status }).where(eq(listingsTable.id, row.id)).returning();
    return { status: 200, body: UpdateAdminListingResponse.parse(adminView(updated!)) };
  });
  res.status(result.status).json(result.body);
});
router.post("/admin/listings/:id/status", requireAdminMutation, async (req, res): Promise<void> => {
  const params = SetAdminListingStatusParams.safeParse(req.params);
  const body = SetAdminListingStatusBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid listing or status." }); return; }
  const result = await db.transaction(async tx => {
    const [row] = await tx.select().from(listingsTable).where(and(eq(listingsTable.id, params.data.id), isNull(listingsTable.deletedAt))).for("update");
    if (!row) return { status: 404, body: { error: "Listing not found." } };
    if (body.data.status === "Live" && !eligible(row)) {
      return { status: 409, body: { error: "Not paid yet. Approve after payment comes in." } };
    }
    const [updated] = await tx.update(listingsTable).set({
      status: body.data.status, approvedAt: body.data.status === "Live" ? new Date() : null,
    }).where(eq(listingsTable.id, row.id)).returning();
    return { status: 200, body: SetAdminListingStatusResponse.parse(adminView(updated!)) };
  });
  res.status(result.status).json(result.body);
});
router.post("/admin/listings/:id/checkout", requireAdminMutation, async (req, res): Promise<void> => {
  const params = UpdateAdminListingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid listing." }); return; }
  const [listing] = await db.select({ reference: listingsTable.reference }).from(listingsTable)
    .where(and(eq(listingsTable.id, params.data.id), isNull(listingsTable.deletedAt)));
  if (!listing) { res.status(404).json({ error: "Listing not found." }); return; }
  try {
    const url = await beginCheckout(listing.reference, req.get("origin")!);
    res.json({ url });
  } catch (error) {
    res.status(billingState.available ? 409 : 503).json({ error: error instanceof Error ? error.message : "Could not create checkout." });
  }
});
router.delete("/admin/listings/:id", requireAdminMutation, async (req, res): Promise<void> => {
  const params = DeleteAdminListingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid listing." }); return; }
  const result = await db.transaction(async tx => {
    const [row] = await tx.select().from(listingsTable).where(and(eq(listingsTable.id, params.data.id), isNull(listingsTable.deletedAt))).for("update");
    if (!row) return { status: 404, body: { error: "Listing not found." } };
    if (row.stripeSubscriptionId && row.paymentStatus !== "Cancelled") {
      return { status: 409, body: { error: "Cancel the subscription in Stripe before deleting this listing so the provider is not billed for a deleted listing." } };
    }
    if (row.stripeCheckoutId && !row.stripeSubscriptionId) {
      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(row.stripeCheckoutId);
      if (session.status === "complete") {
        return { status: 409, body: { error: "Checkout is complete. Wait for payment processing and cancel the subscription in Stripe before deleting." } };
      }
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    }
    await tx.update(listingsTable).set({ deletedAt: new Date(), status: "Rejected", accessTokenHash: null }).where(eq(listingsTable.id, row.id));
    return { status: 204, body: null };
  });
  if (result.status === 204) res.sendStatus(204);
  else res.status(result.status).json(result.body);
});
export default router;
