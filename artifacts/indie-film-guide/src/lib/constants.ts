export const CATEGORIES = [
  { value: 'Locations', short: 'Locations', mobile: 'Places' },
  { value: 'Equipment & Props', short: 'Equipment & Props', mobile: 'Gear' },
  { value: 'Talent, Crew & On-Set', short: 'Talent, Crew & On-Set', mobile: 'Crew' },
  { value: 'Business Services & Licensing', short: 'Business & Licensing', mobile: 'Biz' },
  { value: 'Funding & Banking', short: 'Funding & Banking', mobile: 'Funding' },
  { value: 'Distribution & Marketing', short: 'Distribution & Marketing', mobile: 'Release' },
] as const;
export const STAGES = ['Idea', 'Production', 'Post-Production', 'Distribution'] as const;
export function shortCategory(c: string) {
  return CATEGORIES.find((x) => x.value === c)?.short ?? c;
}
export function placeLabel(l: { city: string; coverage: string }) {
  if (l.coverage === 'Statewide') return 'Statewide, Georgia';
  if (l.coverage === 'Nationwide') return 'Nationwide';
  return `${l.city}, GA`;
}
