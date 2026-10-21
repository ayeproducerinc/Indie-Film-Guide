---
name: Stripe SDK contract changes
description: Verify installed Stripe types rather than copying older Checkout snippets.
---
Consult the installed Stripe SDK declarations before implementing Checkout parameters or subscription-schedule phases.

**Why:** Stripe 23 changed the Checkout creation contract from older examples; repeated attempts using older payment-method parameter names failed typechecking.

**How to apply:** Search the installed SDK's resource declarations when a familiar field is rejected. Do not work around a type error with an unchecked cast or send an outdated API parameter.
