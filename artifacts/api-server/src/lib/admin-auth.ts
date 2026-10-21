import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, adminSessionsTable, adminAttemptsTable } from "@workspace/db";

const cookieName = "ifg_admin";
const ttl = 12 * 60 * 60 * 1000;
export const adminConfigured = () => !!process.env.ADMIN_PASSWORD && !!process.env.SESSION_SECRET;
const digest = (s: string) => createHash("sha256").update(s).digest();
const sessionHash = (token: string) => createHmac("sha256", `${process.env.SESSION_SECRET}:${process.env.ADMIN_PASSWORD}`).update(token).digest("hex");
export async function isAdmin(req: Request) {
  if (!adminConfigured()) return false;
  const token = req.cookies?.[cookieName];
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return false;
  const [session] = await db.select().from(adminSessionsTable).where(and(
    eq(adminSessionsTable.tokenHash, sessionHash(token)), gt(adminSessionsTable.expiresAt, new Date()),
  ));
  return !!session;
}
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (!await isAdmin(req)) { res.status(401).json({ error: "Sign in to Admin first." }); return; }
  next();
}
export function requireAdminMutation(req: Request, res: Response, next: NextFunction): void {
  if (req.get("X-IFG-Admin") !== "1") { res.status(403).json({ error: "Invalid admin request." }); return; }
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  try {
    if (!origin || new URL(origin).host !== host) throw new Error();
  } catch { res.status(403).json({ error: "Admin changes must come from this website." }); return; }
  next();
}
export async function login(req: Request, res: Response, password: string): Promise<void> {
  if (!adminConfigured()) { res.status(503).json({ error: "Set ADMIN_PASSWORD and SESSION_SECRET to enable Admin." }); return; }
  await db.delete(adminAttemptsTable).where(lt(adminAttemptsTable.expiresAt, new Date()));
  const key = createHmac("sha256", process.env.SESSION_SECRET!).update(req.ip ?? "admin").digest("hex");
  const [attempt] = await db.insert(adminAttemptsTable).values({ key, attempts: 1, expiresAt: new Date(Date.now() + 15 * 60 * 1000) })
    .onConflictDoUpdate({ target: adminAttemptsTable.key, set: { attempts: sql`${adminAttemptsTable.attempts} + 1` } }).returning();
  if (attempt!.attempts > 10) {
    res.setHeader("Retry-After", "900");
    res.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." }); return;
  }
  if (!timingSafeEqual(digest(password), digest(process.env.ADMIN_PASSWORD!))) {
    res.status(401).json({ error: "Incorrect admin password." }); return;
  }
  await db.delete(adminAttemptsTable).where(eq(adminAttemptsTable.key, key));
  await db.delete(adminSessionsTable).where(lt(adminSessionsTable.expiresAt, new Date()));
  const previous = req.cookies?.[cookieName];
  if (typeof previous === "string") await db.delete(adminSessionsTable).where(eq(adminSessionsTable.tokenHash, sessionHash(previous)));
  const token = randomBytes(32).toString("hex");
  await db.insert(adminSessionsTable).values({ tokenHash: sessionHash(token), expiresAt: new Date(Date.now() + ttl) });
  res.cookie(cookieName, token, {
    httpOnly: true, sameSite: "strict", secure: req.secure || req.get("x-forwarded-proto") === "https",
    path: "/api/admin", maxAge: ttl,
  });
  res.json({ authenticated: true, configured: true });
}
export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[cookieName];
  if (typeof token === "string") await db.delete(adminSessionsTable).where(eq(adminSessionsTable.tokenHash, sessionHash(token)));
  res.clearCookie(cookieName, { path: "/api/admin", httpOnly: true, sameSite: "strict" });
  res.sendStatus(204);
}
