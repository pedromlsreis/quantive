import { describe, it, expect } from 'vitest';
import { planDescription } from '@/lib/billing/planStatus';
import type { SubscriptionStatus } from '@/lib/billing/plans';

const FREE: SubscriptionStatus = {
  subscribed: false,
  productId: null,
  subscriptionEnd: null,
  cancelAtPeriodEnd: false,
  paymentPastDue: false,
  hasStripeHistory: false,
  familyBeta: false,
  familyMember: false,
  familyOwnerEmail: null,
};
const END = '2026-12-31T12:00:00.000Z';

describe('planDescription', () => {
  it('pitches Pro to a free user', () => {
    expect(planDescription(FREE, null)).toMatch(/^Pro adds your full history/);
  });

  it('names the plan that is paid for when it cancels', () => {
    const cancelling = { ...FREE, subscribed: true, subscriptionEnd: END, cancelAtPeriodEnd: true };
    expect(planDescription(cancelling, 'Family')).toMatch(/Family stays on until then\.$/);
    expect(planDescription(cancelling, 'Pro')).toMatch(/Pro stays on until then\.$/);
  });

  it('says what Family covers when it renews', () => {
    const renewing = { ...FREE, subscribed: true, subscriptionEnd: END };
    expect(planDescription(renewing, 'Family')).toMatch(/^Pro for you and one partner/);
    expect(planDescription(renewing, 'Pro')).toMatch(/^Renews on /);
  });

  it("names whose Family plan covers a partner", () => {
    expect(planDescription({ ...FREE, familyMember: true, familyOwnerEmail: 'alex@example.com' }, null))
      .toBe("Covered by alex@example.com's Family plan.");
    expect(planDescription({ ...FREE, familyMember: true }, null)).toBe('Covered by the Family plan you share.');
  });

  it('asks nothing of the Family beta', () => {
    expect(planDescription({ ...FREE, familyBeta: true }, null)).toMatch(/nothing to pay/);
  });
});
