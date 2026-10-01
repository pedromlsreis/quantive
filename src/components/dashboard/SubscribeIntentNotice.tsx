import { X } from 'lucide-react';
import { useAuthModalActions } from '@/contexts/AuthModalContext';
import { analytics } from '@/lib/analytics';
import type { CheckoutChoice } from '@/lib/billing/checkoutIntent';
import { FAMILY_PLAN, PLANS } from '@/lib/billing/plans';

interface Props {
  plan: CheckoutChoice;
  /** Strip `intent`/`plan` from the URL — returns the user to a normal dashboard. */
  onCancel: () => void;
}

/**
 * Shown on `/dashboard` for logged-out users who arrived via a Subscribe CTA
 * (Pro or Family) on /pricing. Bridges the logged-out → signup gap so the round-trip to
 * checkout actually completes. UI follows the q-insight card pattern with an
 * action area on the right.
 *
 * Per the UX rule `modal-vs-navigation` (HIG), this is an inline notice rather
 * than an auto-pop modal: the user clicks the primary button to open AuthModal,
 * preserving spatial context for the modal's entrance.
 */
export function SubscribeIntentNotice({ plan, onCancel }: Props) {
  const { openAuth } = useAuthModalActions();
  const target = plan.plan === 'family' ? FAMILY_PLAN : PLANS.find((p) => p.id === 'pro')!;
  const price = target.prices![plan.interval]!.amount;
  const priceLabel = `€${price} ${plan.interval === 'yearly' ? 'a year' : 'a month'}`;

  const handleSignUp = () => {
    analytics.landingCtaClicked({ cta: plan.plan === 'family' ? 'family_signup' : 'pro_signup', location: 'pricing_card' });
    openAuth('signup');
  };

  return (
    <section
      role="region"
      aria-label={`${target.name} subscription pending. Sign up to continue.`}
      className="q-insight"
      style={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 'var(--s-3)' }}
    >
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <p className="q-insight-title">{`Sign up to subscribe to ${target.name}`}</p>
        <p className="q-insight-body">{`Create your account, then checkout opens for ${target.name} at ${priceLabel}.`}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleSignUp}
          className="q-btn q-btn--primary q-btn--md"
          style={{ minHeight: 44 }}
        >
          Sign up to continue
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label={`Cancel ${target.name} subscription setup`}
          className="q-icon-btn"
          title="Cancel"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <X size={14} />
        </button>
      </div>
    </section>
  );
}
