---
name: Shared Stripe account
description: Protect unrelated applications when configuring Indie Film Guide live billing.
---
The live Stripe account is shared with another application. Do not modify, disable, or delete unrelated prices, subscriptions, payment links, or webhooks.

**Why:** Live setup found an enabled webhook belonging to another application. Stripe-sync's managed-webhook discovery may delete endpoints labeled as orphaned Stripe-sync webhooks across the account, not just within this product.

**How to apply:** Scope changes to Indie Film Guide metadata and explicitly supplied prices. Before managed-webhook initialization or a sync-package upgrade, check whether unrelated endpoints match its metadata/description cleanup rules. Never run blanket cleanup. Keep catalog preparation separate from webhook registration so the signing secret is stored only with the correct production database.
