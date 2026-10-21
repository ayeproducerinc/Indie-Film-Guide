// Application policy only. Stripe remains the source of truth for its catalog.
export const PLANS = [
  { name: "Indie Partner", providerType: "Business", amount: 19900, currency: "usd", billing: "yearly", indie: true, lookupKey: "ifg_indie_annual" },
  { name: "Standard", providerType: "Business", amount: 49900, currency: "usd", billing: "yearly", indie: false, lookupKey: "ifg_standard_annual" },
  { name: "Lifetime Indie Partner", providerType: "Business", amount: 199900, currency: "usd", billing: "lifetime", indie: true, lookupKey: "ifg_lifetime_once" },
  { name: "Nonprofit Indie Partner", providerType: "Nonprofit", amount: 9900, currency: "usd", billing: "yearly", indie: true, lookupKey: "ifg_nonprofit_indie_annual" },
  { name: "Nonprofit Standard", providerType: "Nonprofit", amount: 19900, currency: "usd", billing: "yearly", indie: false, lookupKey: "ifg_nonprofit_standard_annual" },
  { name: "Government", providerType: "Government", amount: 0, currency: "usd", billing: "free", indie: false, lookupKey: null },
] as const;
export const LIFETIME_CAP = 10;
export const GRACE_MS = 30 * 24 * 60 * 60 * 1000;
export const findPlan = (name: string) => PLANS.find(p => p.name === name);
