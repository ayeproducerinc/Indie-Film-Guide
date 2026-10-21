# Indie Film Guide

A mobile-first Georgia film-resource directory: filmmakers browse free, providers submit listings, and only approved, eligible listings appear publicly.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/indie-film-guide run dev` — frontend; use its managed workflow to supply routing and port configuration.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- API contract: `lib/api-spec/openapi.yaml`; regenerate hooks and validation after changes.
- Database: `lib/db/src/schema/listings.ts`.
- Directory/submission API: `artifacts/api-server/src/routes/listings.ts`.
- Frontend: `artifacts/indie-film-guide`.
- Canonical places: `artifacts/api-server/src/data/georgia-locations.json`; source documented beside it.

## Architecture decisions

- Use a bundled Census place list instead of a paid geocoding service so standardized Georgia city selection requires no external credentials or runtime network dependency.
- Preserve Statewide and Nationwide as service coverage, not pretend cities.
- This first milestone covers public directory/detail, provider submissions, About, and Terms. Stripe and protected admin are subsequent milestones; do not imply paid submissions have been charged or approved.

## Product

Public listing search, city/category/stage/rate filters, listing details, and pending provider submissions. Standard $499/year, Indie Partner $199/year, Government free. Payment never changes alphabetical ordering.

## User preferences

- Build from scratch using the supplied requirements and screenshots.
- Separate Website and Phone fields; autocomplete city/state to standardize location data.
- No fake businesses or seeded sample listings. Never publicly expose provider email.
- Keep scope small and straightforward. Show working milestones before progressing to payments/admin.
- Mobile-first at 375px, device light/dark mode, strong blue accent, neutral background, bold condensed headings.

## Gotchas

- Launch-special claims require a valid future `SPECIAL_END_DATE`; never invent a deadline.
- Paid submissions are currently saved Unpaid and Pending. Stripe Checkout/webhooks and admin are not enabled in this milestone.
- Location labels/state are derived server-side from a selected Census GEOID, not trusted client strings.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
