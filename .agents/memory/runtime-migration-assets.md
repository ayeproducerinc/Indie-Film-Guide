---
name: Runtime migration assets
description: Why runtime migration packages need their installed directory preserved.
---
Keep packages that locate sibling SQL migration files external to server bundles unless those assets are explicitly copied with equivalent path handling.

**Why:** Stripe sync silently skips migrations when bundling relocates its module away from the SQL directory. Startup can appear to finish migrations but fail later with missing Stripe tables.

**How to apply:** Preserve the installed package boundary when changing the server bundler or deployment packaging. Confirm migration-dependent initialization in the built server, not only a source-run script.
