---
name: Lifetime capacity and deal management
description: Owner-approved checkout reservation and admin-managed promo-code scope.
---
Reserve the ten lifetime spots while checkout is open instead of counting only completed payments. Promo-code changes are admin-managed; do not add provider self-service accounts for this scope.

**Why:** The owner selected checkout reservations to protect the lifetime cap and admin-managed changes as the smaller editing scope.

**How to apply:** Route lifetime purchases through capacity-aware checkout, including shared links. Keep code updates in authenticated admin flows and do not promise provider self-service.

Reservations must survive uncertain Stripe network responses and application commits. Do not free a spot just because its local timer elapsed; confirm Stripe expiry, or retain it for a completed checkout awaiting its webhook.

**Why:** A Stripe session can remain payable even when its creation response is lost. Rolling back local capacity after that failure could let two customers pay for the final spot.

**How to apply:** Treat reservation creation, Stripe session creation, and webhook completion as a recoverable sequence. Refund replays must consult authoritative Stripe refund state before restoring paid status.
