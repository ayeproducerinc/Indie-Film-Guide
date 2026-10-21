---
name: Census place data imports
description: Avoid assuming older Gazetteer column layouts when updating standardized city data.
---

Inspect the actual header and delimiter of each Census Gazetteer release before transforming the data. The 2025 national places file is pipe-delimited and includes GEOIDFQ, unlike older tab-delimited layouts.

**Why:** Assuming the older format silently produced zero Georgia rows; changing only the delimiter still left incorrect column assumptions.

**How to apply:** When refreshing place data, identify columns from the header and require a plausible nonzero Georgia place count before replacing the bundled data.
