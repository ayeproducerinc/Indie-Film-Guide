# Indie Film Guide

A mobile-first Georgia film-resource directory: providers submit listings, and only approved, eligible listings appear publicly.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/indie-film-guide run dev` — frontend; use its managed workflow to supply routing and port configuration.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Admin: `ADMIN_PASSWORD` and `SESSION_SECRET` in Secrets. Open `/admin`.
- Billing: native Stripe runtime connection, or manual `STRIPE_SECRET_KEY` (never both). Run `pnpm --filter @workspace/scripts exec tsx src/setup-stripe.ts` to create annual prices and reusable payment links. Restart the API afterward to register the managed webhook and sync Stripe.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)

## Where things live

- API contract: `lib/api-spec/openapi.yaml`; regenerate hooks and validation after changes.
- Database: `lib/db/src/schema/listings.ts`.
- Directory/submission API: `artifacts/api-server/src/routes/listings.ts`.
- Frontend: `artifacts/indie-film-guide`.
- Canonical places: `artifacts/api-server/src/data/georgia-locations.json`; source documented beside it.

## Architecture decisions

- Use a bundled Census place list instead of a paid geocoding service so standardized Georgia city selection requires no external credentials or runtime network dependency.
- Preserve Statewide and Nationwide as service coverage, not pretend cities.
- Public submissions start Pending. Paid-plan eligibility is updated only after a verified Stripe webhook checks the linked subscription and its price; redirects never grant payment or approval. Admin approval is separate.
- Use listing-specific checkout for automatic payment attribution. The admin can generate a checkout link for a saved listing; reusable generic Stripe links are for manual payments and do not automatically approve or link listings.
- Do not delete a listing with an active subscription. Cancel it in Stripe first; pending checkout sessions are expired during deletion.

## Product

Public listing search, city/category/stage/rate filters, listing details, and pending provider submissions. Payment never changes alphabetical ordering. `/pricing` explains all plans. Central application plan definitions live in `lib/db/src/plans.ts`; `/api/listing-config` exposes them to the UI. Stripe remains the owner of its catalog; no parallel catalog tables.

| Plan | Provider | Price | Stripe lookup key |
| --- | --- | --- | --- |
| Indie Partner | Business | $199/year | `ifg_indie_annual` |
| Standard | Business | $499/year | `ifg_standard_annual` |
| Lifetime Indie Partner | Business | $1,999 once | `ifg_lifetime_once` |
| Nonprofit Indie Partner | Nonprofit | $99/year | `ifg_nonprofit_indie_annual` |
| Nonprofit Standard | Nonprofit | $199/year | `ifg_nonprofit_standard_annual` |
| Government | Government | Free | none |

- Indie plans require a 3–20 uppercase-alphanumeric promo code, deal ≤200 characters, redemption instructions ≤120, optional qualification ≤120. Code edits are admin-managed, with no provider account system.
- Nonprofits require a private EIN in `12-3456789` format. Admin must verify the EIN before approval; changing the EIN resets verification.
- Lifetime is capped at 10 paid listings plus durable in-flight reservations, including hidden/deleted paid listings. Serialize allocations with the inventory advisory lock. Reserve before Stripe requests; network failures retain capacity. Release only after authoritative expiry/reconciliation or refund. Lifetime share links MUST go through Get Listed; never create unrestricted lifetime Stripe Payment Links.
- Lifetime payment and refund state comes only from verified webhooks and authoritative Stripe objects. One-time mode, exact amount, currency, price, metadata and saved checkout must match; a replay cannot resurrect a refunded payment. No lifetime renewals or Past due.
- Founding yearly prices accept explicitly owned historical Stripe price IDs. A failed renewal has one 30-day grace period, not reset by repeat events; expiry is evaluated at query time. Cancellation or a failure unresolved for 30 days ends the lock, including late recovery.
- Removing a yearly promo code requires an admin-confirmed Standard price change scheduled at renewal, with date and current/next prices shown. Preserve the current deal until renewal; never charge immediately or create a duplicate subscription. Lifetime must retain a deal.
- `pnpm --filter @workspace/scripts run setup:stripe` creates/validates five paid prices, four annual generic links and the capacity-aware lifetime app link. All required catalog entries must be ready before enabling checkout. Generic annual links require manual attribution.
- Lifetime is nontransferable and lasts while the guide operates, contingent on accuracy and honoring the deal. Terms promise a prorated refund if the guide shuts down within 3 years; no automated shutdown-refund system is implemented.

## User preferences

- Build from scratch using the supplied requirements and screenshots.
- Separate Website and Phone fields; autocomplete city/state to standardize location data.
- No fake businesses or seeded sample listings. Website and phone are required. Provider email is public only when the provider explicitly opts in; existing listings default to private.
- Keep scope small and straightforward.
- Mobile-first at 375px, device light/dark mode, strong blue accent, neutral background, bold condensed headings.

## Gotchas

- Launch-special claims require a valid future `SPECIAL_END_DATE`; never invent a deadline.
- Missing Stripe runtime credentials or catalog keep checkout explicitly unavailable. Do not claim payment links exist until the setup script has succeeded. Test-mode payments are not live billing.
- Location labels/state are derived server-side from a selected Census GEOID, not trusted client strings.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
