export const categories = [
  "Locations", "Equipment & Props", "Talent, Crew & On-Set",
  "Business Services & Licensing", "Funding & Banking", "Distribution & Marketing",
];
export const stages = ["Idea", "Production", "Post-Production", "Distribution"];

export const billingState: {
  available: boolean;
  mode: "test" | "live" | "unavailable";
  prices: Record<string, string>;
  paymentLinks: { plan: string; url: string }[];
} = { available: false, mode: "unavailable", prices: {}, paymentLinks: [] };

export function listingConfig() {
  const end = process.env.SPECIAL_END_DATE;
  return {
    specialActive: !!end && Number.isFinite(Date.parse(end)) && Date.now() < Date.parse(end),
    billingAvailable: billingState.available,
    billingMode: billingState.mode,
  };
}
