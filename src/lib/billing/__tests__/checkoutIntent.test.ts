import { describe, it, expect } from 'vitest';
import { parsePlanParam, parseSuccessPlan, planParam } from '@/lib/billing/checkoutIntent';

describe('parsePlanParam', () => {
  it('reads the plan and interval', () => {
    expect(parsePlanParam('family-monthly')).toEqual({ plan: 'family', interval: 'monthly' });
    expect(parsePlanParam('family-yearly')).toEqual({ plan: 'family', interval: 'yearly' });
  });

  it('reads a bare interval as Pro, as links from before Family did', () => {
    expect(parsePlanParam('monthly')).toEqual({ plan: 'pro', interval: 'monthly' });
    expect(parsePlanParam('yearly')).toEqual({ plan: 'pro', interval: 'yearly' });
  });

  it('falls back to Pro yearly for anything else', () => {
    expect(parsePlanParam(null)).toEqual({ plan: 'pro', interval: 'yearly' });
    expect(parsePlanParam('family')).toEqual({ plan: 'pro', interval: 'yearly' });
    expect(parsePlanParam('team-monthly')).toEqual({ plan: 'pro', interval: 'yearly' });
  });

  it('round-trips through planParam', () => {
    for (const choice of [
      { plan: 'pro', interval: 'monthly' },
      { plan: 'pro', interval: 'yearly' },
      { plan: 'family', interval: 'monthly' },
      { plan: 'family', interval: 'yearly' },
    ] as const) {
      expect(parsePlanParam(planParam(choice))).toEqual(choice);
    }
  });
});

describe('parseSuccessPlan', () => {
  it('names Family only when the redirect says so', () => {
    expect(parseSuccessPlan('family')).toBe('family');
    expect(parseSuccessPlan('pro')).toBe('pro');
    expect(parseSuccessPlan(null)).toBe('pro');
  });
});
