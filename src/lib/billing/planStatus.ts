import { formatDate } from '@/lib/formatters';
import { PRO_PRICE_LINE } from './planCopy';
import type { SubscriptionStatus } from './plans';

/** What the Plan row says under the plan's name. `paidPlanName` is the plan this account pays for. */
export function planDescription(subscription: SubscriptionStatus, paidPlanName: string | null): string | undefined {
  if (subscription.subscribed && subscription.subscriptionEnd) {
    const end = formatDate(new Date(subscription.subscriptionEnd));
    if (subscription.cancelAtPeriodEnd) return `Cancels on ${end}. ${paidPlanName ?? 'Your plan'} stays on until then.`;
    return paidPlanName === 'Family'
      ? `Pro for you and one partner, plus extra portfolios to share. Renews on ${end}.`
      : `Renews on ${end}.`;
  }
  if (subscription.subscribed) return undefined;
  if (subscription.familyMember) {
    return subscription.familyOwnerEmail
      ? `Covered by ${subscription.familyOwnerEmail}'s Family plan.`
      : 'Covered by the Family plan you share.';
  }
  if (subscription.familyBeta) return 'Through the Family beta. There is nothing to pay.';
  return `Pro adds your full history, forecasts, goals, and Excel and PDF export. ${PRO_PRICE_LINE}.`;
}
