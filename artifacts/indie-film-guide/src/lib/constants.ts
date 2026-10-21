export const CATEGORIES = [
  { value: 'Locations', short: 'Locations' },
  { value: 'Equipment & Props', short: 'Equipment & Props' },
  { value: 'Talent, Crew & On-Set', short: 'Talent, Crew & On-Set' },
  { value: 'Business Services & Licensing', short: 'Business & Licensing' },
  { value: 'Funding & Banking', short: 'Funding & Banking' },
  { value: 'Distribution & Marketing', short: 'Distribution & Marketing' },
] as const;
export const STAGES = ['Idea', 'Production', 'Post-Production', 'Distribution'] as const;
export const PRICES = { 'Indie Partner': 199, Standard: 499, Government: 0 } as const;
export function shortCategory(c: string) {
  return CATEGORIES.find((x) => x.value === c)?.short ?? c;
}
export function placeLabel(l: { city: string; coverage: string }) {
  if (l.coverage === 'Statewide') return 'Statewide, Georgia';
  if (l.coverage === 'Nationwide') return 'Nationwide';
  return `${l.city}, GA`;
}
