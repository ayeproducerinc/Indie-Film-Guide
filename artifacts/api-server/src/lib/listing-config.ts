export const categories = [
  "Locations", "Equipment & Props", "Talent, Crew & On-Set",
  "Business Services & Licensing", "Funding & Banking", "Distribution & Marketing",
];
export const stages = ["Idea", "Production", "Post-Production", "Distribution"];

export function listingConfig() {
  const end = process.env.SPECIAL_END_DATE;
  return {
    specialActive: !!end && Number.isFinite(Date.parse(end)) && Date.now() < Date.parse(end),
    billingAvailable: false,
  };
}
