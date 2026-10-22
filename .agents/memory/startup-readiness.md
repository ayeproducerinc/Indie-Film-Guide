---
name: Publishing startup limits
description: Autoscale readiness timing versus initial live Stripe synchronization.
---
Treat the publishing port-readiness deadline separately from Stripe billing readiness. The API must open its configured port within 60 seconds; the initial live Stripe backfill is not bounded by that deadline.

**Why:** The shared live account contains substantial history, and its first backfill exceeded the platform's startup window despite successful application builds. Smaller development syncs concealed this production-only timing constraint.

**How to apply:** Keep external setup off the critical path to binding the HTTP listener. During billing initialization, keep checkout unavailable and return retryable responses to webhooks rather than accepting events before migrations and signing-secret setup finish. Verify startup with deliberately pending initialization, not only a fast development sync. Do not diagnose successful compilation followed by a port timeout as a frontend build failure.
