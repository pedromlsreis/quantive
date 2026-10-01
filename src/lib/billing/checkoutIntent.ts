// The `plan` query parameter that carries a subscribe intent through sign-up
// (/pricing → /dashboard → /pricing) and names the plan on the checkout
// success redirect.

export type CheckoutPlan = 'pro' | 'family';
export type CheckoutInterval = 'monthly' | 'yearly';
export type CheckoutChoice = { plan: CheckoutPlan; interval: CheckoutInterval };

/** `monthly` or `yearly` alone mean Pro: the format from before Family. */
export function parsePlanParam(raw: string | null): CheckoutChoice {
  const match = /^(?:(family)-)?(monthly|yearly)$/.exec(raw ?? '');
  return {
    plan: match?.[1] === 'family' ? 'family' : 'pro',
    interval: match?.[2] === 'monthly' ? 'monthly' : 'yearly',
  };
}

export function planParam({ plan, interval }: CheckoutChoice): string {
  return plan === 'family' ? `family-${interval}` : interval;
}

/** The plan in `?checkout=success&plan=…`; anything else was Pro. */
export function parseSuccessPlan(raw: string | null): CheckoutPlan {
  return raw === 'family' ? 'family' : 'pro';
}
