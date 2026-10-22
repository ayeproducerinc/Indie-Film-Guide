---
name: Stripe operation discovery
description: Verify Stripe MCP search results before selecting a read or write operation.
---

Treat Stripe MCP operation search as fuzzy discovery, not an exact match. Select an operation only after checking its returned HTTP method and endpoint against the intended resource and action; inspect its parameter schema before calling it.

**Why:** Narrow semantic searches have returned unrelated resources or omitted the requested update operation. Trusting the first result would select the wrong API contract.

**How to apply:** When discovery is incomplete, broaden the result limit and resource query, then select the matching returned operation. Keep the verified account context and test/live mode unchanged.
