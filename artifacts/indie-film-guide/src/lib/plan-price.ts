import type { PlanDefinition } from '@workspace/api-client-react';
export function planPrice(plan?: PlanDefinition) {
  if (!plan) return 'Loading price…';
  if (plan.billing === 'free') return 'Free';
  return `$${(plan.amount / 100).toLocaleString('en-US')}${plan.billing === 'yearly' ? '/yr' : ' once'}`;
}
