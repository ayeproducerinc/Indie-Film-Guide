import { createHmac, randomBytes } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { db, mailingContactsTable, mailingSignupLimitsTable } from "@workspace/db";
import { eq, desc, lt, sql } from "drizzle-orm";
import {
  CreateMailingOptInBody, GetAdminMailingListQueryParams, GetAdminMailingListResponse,
  OptOutMailingContactParams, OptOutMailingContactResponse, DeleteMailingContactParams,
} from "@workspace/api-zod";
import { requireAdmin, requireAdminMutation } from "../lib/admin-auth";
import { MAILING_CONSENT_TEXT, MAILING_CONSENT_VERSION, MAILING_RECEIVED, mailingContactView, mailingContactsCsv } from "../lib/mailing-list";

const router: IRouter = Router();
const rateWindowMs = 15 * 60 * 1000;
const fallbackSecret = randomBytes(32);
const pageSize = 50;

function sameOrigin(req: Request) {
  if (!req.get("origin")) return true; // Non-browser clients still require explicit JSON consent.
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  try { return new URL(req.get("origin")!).host === host; } catch { return false; }
}

router.post("/mailing-list/opt-ins", async (req, res): Promise<void> => {
  if (!req.is("application/json")) { res.status(415).json({ error: "Use JSON to submit your opt-in." }); return; }
  if (!sameOrigin(req)) { res.status(403).json({ error: "Please use the signup form on this website." }); return; }
  if (Buffer.byteLength(JSON.stringify(req.body ?? {})) > 4096) {
    res.status(413).json({ error: "Please keep your signup details short." }); return;
  }
  // Keep rate buckets ephemeral and keyed; never persist or log an IP address.
  // Use the actual socket peer rather than trusting caller-controlled forwarding headers.
  const key = createHmac("sha256", process.env.SESSION_SECRET || fallbackSecret).update(`mailing:${req.ip ?? "unknown"}`).digest("hex");
  await db.delete(mailingSignupLimitsTable).where(lt(mailingSignupLimitsTable.expiresAt, new Date()));
  const [limit] = await db.insert(mailingSignupLimitsTable).values({
    key, expiresAt: new Date(Date.now() + rateWindowMs),
  }).onConflictDoUpdate({
    target: mailingSignupLimitsTable.key,
    set: { attempts: sql`${mailingSignupLimitsTable.attempts} + 1` },
  }).returning();
  if (limit!.attempts > 60) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((limit!.expiresAt.getTime() - Date.now()) / 1000))));
    res.status(429).json({ error: "Too many signup attempts. Please try again later." }); return;
  }
  const parsed = CreateMailingOptInBody.safeParse({
    ...req.body,
    email: typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : req.body?.email,
    firstName: typeof req.body?.firstName === "string" ? req.body.firstName.trim() : req.body?.firstName,
  });
  if (!parsed.success || parsed.data.consent !== true ||
    /[\u0000-\u001f\u007f]/.test(parsed.data.firstName ?? "")) {
    res.status(400).json({ error: "Enter a valid email, a first name of up to 80 characters, and agree to receive updates." }); return;
  }
  if (parsed.data.website) { res.json(MAILING_RECEIVED); return; }
  await db.insert(mailingContactsTable).values({
    email: parsed.data.email, firstName: parsed.data.firstName ?? "",
    consentVersion: MAILING_CONSENT_VERSION, consentText: MAILING_CONSENT_TEXT,
    source: "homepage",
  }).onConflictDoNothing({ target: mailingContactsTable.email });
  // Same response for new, duplicate and opted-out addresses. An anonymous
  // repeat signup must not overwrite consent evidence or reactivate a contact.
  res.json(MAILING_RECEIVED);
});

router.get("/admin/mailing-list", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GetAdminMailingListQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid page." }); return; }
  const page = parsed.data.page ?? 1;
  const [contacts, count] = await Promise.all([
    db.select().from(mailingContactsTable).orderBy(desc(mailingContactsTable.createdAt), desc(mailingContactsTable.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(mailingContactsTable),
  ]);
  res.json(GetAdminMailingListResponse.parse({
    contacts: contacts.map(mailingContactView), total: count[0]!.total, page, pageSize,
  }));
});

router.get("/admin/mailing-list/export", requireAdmin, async (_req, res): Promise<void> => {
  const contacts = await db.select().from(mailingContactsTable).where(eq(mailingContactsTable.status, "active")).orderBy(desc(mailingContactsTable.createdAt));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="indie-film-guide-active-opt-ins-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(mailingContactsCsv(contacts));
});

router.patch("/admin/mailing-list/:id/opt-out", requireAdmin, requireAdminMutation, async (req, res): Promise<void> => {
  const parsed = OptOutMailingContactParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid contact." }); return; }
  const [row] = await db.update(mailingContactsTable).set({
    status: "opted_out", optedOutAt: sql`coalesce(${mailingContactsTable.optedOutAt}, now())`,
  }).where(eq(mailingContactsTable.id, parsed.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Contact not found." }); return; }
  res.json(OptOutMailingContactResponse.parse(mailingContactView(row)));
});

router.delete("/admin/mailing-list/:id", requireAdmin, requireAdminMutation, async (req, res): Promise<void> => {
  const parsed = DeleteMailingContactParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid contact." }); return; }
  const [deleted] = await db.delete(mailingContactsTable).where(eq(mailingContactsTable.id, parsed.data.id)).returning({ id: mailingContactsTable.id });
  if (!deleted) { res.status(404).json({ error: "Contact not found." }); return; }
  res.sendStatus(204);
});

export default router;
