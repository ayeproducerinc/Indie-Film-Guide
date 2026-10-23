import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, inArray, or, sql } from "drizzle-orm";
import { db, listingsTable, findPlan, PLANS, type Listing } from "@workspace/db";
import {
  GetAdminSessionResponse, LoginAdminBody, GetAdminDashboardResponse, GetAdminDashboardQueryParams, AddAdminListingResponse,
  UpdateAdminListingParams, UpdateAdminListingResponse, DeleteAdminListingParams,
  SetAdminListingStatusParams, SetAdminListingStatusBody, SetAdminListingStatusResponse, ScheduleAdminRenewalPlanBody,
  VerifyAdminListingEinParams, VerifyAdminListingEinBody, VerifyAdminListingEinResponse,
} from "@workspace/api-zod";
import { isAdmin, adminConfigured, requireAdmin, requireAdminMutation, login, logout } from "../lib/admin-auth";
import { validateListing } from "../lib/listing-validation";
import { listingConfig, billingState, specialActive } from "../lib/listing-config";
import { beginCheckout } from "../lib/billing";
import { deleteListing } from "../lib/delete-listing";
import { eligible, graceDaysLeft } from "../lib/payment-policy";
import { scheduleStandardAtRenewal, previewStandardAtRenewal } from "../lib/subscription-billing";
import { GRACE_MS } from "@workspace/db";
import { countWhere, listingPage } from "../lib/listing-pagination";

const router: IRouter = Router();
const adminView = (row: Listing) => ({ ...row, createdAt: row.createdAt.toISOString(),
  pastDueSince: row.pastDueSince?.toISOString() ?? null, pendingPlanAt: row.pendingPlanAt?.toISOString() ?? null,
  graceDaysLeft: graceDaysLeft(row), foundingPriceLocked: row.foundingPriceLocked && !(row.pastDueSince && Date.now() - row.pastDueSince.getTime() >= GRACE_MS) });

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
router.get("/admin/dashboard", async (req, res): Promise<void> => {
  const parsed = GetAdminDashboardQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid admin filters or page." }); return; }
  const { page: requested, status, plan } = parsed.data;
  const active = isNull(listingsTable.deletedAt);
  const matching = and(active, status ? eq(listingsTable.status, status) : undefined, plan ? eq(listingsTable.plan, plan) : undefined);
  const paid = eq(listingsTable.paymentStatus, "Paid");
  // Equivalent to eligible(), including the special government-plan rule.
  const eligibleSql = and(
    or(sql`${listingsTable.providerType} <> 'Nonprofit'`, eq(listingsTable.einVerified, true)),
    or(eq(listingsTable.paymentStatus, "Payment waived"),
      and(eq(listingsTable.plan, "Government"), eq(listingsTable.providerType, "Government"), eq(listingsTable.paymentStatus, "Not required")),
      and(sql`${listingsTable.plan} <> 'Government'`, or(paid, and(
        inArray(listingsTable.plan, PLANS.filter(p => p.billing === "yearly").map(p => p.name)),
        eq(listingsTable.paymentStatus, "Past due"),
        sql`${listingsTable.pastDueSince} > now() - interval '30 days'`,
      )))),
  );
  const revenue = (billing: "yearly" | "lifetime") => sql<number>`${sql.join(
    PLANS.filter(p => p.billing === billing).map(p => sql`${countWhere(and(
      paid, billing === "yearly" ? active : undefined, eq(listingsTable.plan, p.name),
    ))} * ${p.amount / 100}::numeric`), sql` + `,
  )}`.mapWith(Number);
  const [counts] = await db.select({
    total: countWhere(matching), All: countWhere(active),
    Pending: countWhere(and(active, eq(listingsTable.status, "Pending"))),
    Live: countWhere(and(active, eq(listingsTable.status, "Live"))),
    Rejected: countWhere(and(active, eq(listingsTable.status, "Rejected"))),
    liveCount: countWhere(and(active, eq(listingsTable.status, "Live"), eligibleSql)),
    paidCount: countWhere(and(active, paid)),
    recurringRevenue: revenue("yearly"), lifetimeRevenue: revenue("lifetime"),
  }).from(listingsTable);
  const pagination = listingPage(counts.total, requested);
  const rows = await db.select().from(listingsTable).where(matching)
    .orderBy(desc(listingsTable.createdAt), desc(listingsTable.id))
    .limit(pagination.pageSize).offset((pagination.page - 1) * pagination.pageSize);
  res.json(GetAdminDashboardResponse.parse({
    listings: rows.map(adminView), ...pagination,
    statusCounts: { All: counts.All, Pending: counts.Pending, Live: counts.Live, Rejected: counts.Rejected },
    liveCount: counts.liveCount, paidCount: counts.paidCount,
    recurringRevenue: counts.recurringRevenue, lifetimeRevenue: counts.lifetimeRevenue,
    lifetimeSpotsLeft: (await listingConfig()).lifetimeSpotsLeft,
    billingMode: billingState.mode, paymentLinks: billingState.paymentLinks,
  }));
});
router.post("/admin/listings", requireAdminMutation, async (req, res): Promise<void> => {
  const values = validateListing(req.body, true);
  const reference = randomUUID();
  const slug = `${values.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "provider"}-${reference.slice(0, 8)}`;
  const [row] = await db.insert(listingsTable).values({
    ...values, reference, slug, status: "Pending",
    paymentStatus: values.plan === "Government" ? "Not required" : "Unpaid",
    foundingPriceLocked: findPlan(values.plan)?.billing === "yearly" && specialActive(),
  }).returning();
  res.status(201).json(AddAdminListingResponse.parse(adminView(row!)));
});
router.put("/admin/listings/:id", requireAdminMutation, async (req, res): Promise<void> => {
  const params = UpdateAdminListingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid listing." }); return; }
  const values = validateListing(req.body, true);
  const result = await db.transaction(async tx => {
    const [row] = await tx.select().from(listingsTable).where(and(eq(listingsTable.id, params.data.id), isNull(listingsTable.deletedAt))).for("update");
    if (!row) return { status: 404, body: { error: "Listing not found." } };
    if ((row.stripeSubscriptionId || row.stripeCheckoutId || row.checkoutReservationKey || row.stripePaymentIntentId) && (values.plan !== row.plan || values.providerType !== row.providerType)) {
      return { status: 409, body: { error: "This listing has a Stripe checkout/subscription. Its plan and provider type cannot be changed." } };
    }
    const paymentStatus = values.plan !== row.plan
      ? values.plan === "Government" ? "Not required" : "Unpaid" : row.paymentStatus;
    // Editing cannot grant verification. Preserve it only for the same saved EIN.
    const verified = values.providerType === "Nonprofit" && row.providerType === "Nonprofit" && row.ein === values.ein && row.einVerified;
    const status = row.status === "Live" && !eligible({ ...row, ...values, einVerified: verified, paymentStatus }) ? "Pending" : row.status;
    const [updated] = await tx.update(listingsTable).set({ ...values, einVerified: verified, paymentStatus,
      status: values.providerType === "Nonprofit" && !verified && row.status === "Live" ? "Pending" : status }).where(eq(listingsTable.id, row.id)).returning();
    return { status: 200, body: UpdateAdminListingResponse.parse(adminView(updated!)) };
  });
  res.status(result.status).json(result.body);
});
router.post("/admin/listings/:id/verify-ein", requireAdminMutation, async (req, res): Promise<void> => {
  const params = VerifyAdminListingEinParams.safeParse(req.params);
  const body = VerifyAdminListingEinBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Review a valid saved EIN before verifying." }); return; }
  const result = await db.transaction(async tx => {
    const [row] = await tx.select().from(listingsTable).where(and(eq(listingsTable.id, params.data.id), isNull(listingsTable.deletedAt))).for("update");
    if (!row) return { status: 404, body: { error: "Listing not found." } };
    if (row.providerType !== "Nonprofit" || row.ein !== body.data.expectedEin)
      return { status: 409, body: { error: "The saved EIN or provider type changed. Refresh Private details and review it again." } };
    const [updated] = await tx.update(listingsTable).set({ einVerified: true }).where(eq(listingsTable.id, row.id)).returning();
    return { status: 200, body: VerifyAdminListingEinResponse.parse(adminView(updated!)) };
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
    if (body.data.status === "Live" && row.providerType === "Nonprofit" && !row.einVerified)
      return { status: 409, body: { error: "Verify the EIN before approving this nonprofit." } };
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
router.get("/admin/listings/:id/renewal-plan", async (req, res): Promise<void> => {
  const params = UpdateAdminListingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid listing." }); return; }
  try { res.json(await previewStandardAtRenewal(params.data.id)); }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Could not preview renewal change." }); }
});
router.post("/admin/listings/:id/renewal-plan", requireAdminMutation, async (req, res): Promise<void> => {
  const params = UpdateAdminListingParams.safeParse(req.params);
  const body = ScheduleAdminRenewalPlanBody.safeParse(req.body);
  if (!params.success || !body.success || body.data.confirmed !== true) { res.status(400).json({ error: "Confirm the Standard price change at renewal." }); return; }
  try { res.json(UpdateAdminListingResponse.parse(adminView(await scheduleStandardAtRenewal(params.data.id, { ...body.data, expectedEffectiveAt: body.data.expectedEffectiveAt.toISOString() })))); }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Could not schedule renewal change." }); }
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
  const result = await deleteListing(params.data.id);
  if (result.status === 204) res.sendStatus(204);
  else res.status(result.status).json(result.body);
});
export default router;
