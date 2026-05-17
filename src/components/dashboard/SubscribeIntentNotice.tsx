import { Sparkles, X } from 'lucide-react';
import { useAuthModal } from '@/contexts/AuthModalContext';
import { analytics } from '@/lib/analytics';

type Interval = 'monthly' | 'yearly';

interface Props {
  plan: Interval;
  /** Strip `intent`/`plan` from the URL — returns the user to a normal dashboard. */
  onCancel: () => void;
}

/**
 * Shown on `/dashboard` for logged-out users who arrived via the Pro Subscribe
 * CTA on /pricing. Bridges the logged-out → signup gap so the round-trip to
 * checkout actually completes. UI follows the q-insight pattern (familiar from
 * FreshStartNudge) with an action area on the right.
 *
 * Per the UX rule `modal-vs-navigation` (HIG), this is an inline notice rather
 * than an auto-pop modal: the user clicks the primary button to open AuthModal,
 * preserving spatial context for the modal's entrance.
 */
export function SubscribeIntentNotice({ plan, onCancel }: Props) {
  const { openAuth } = useAuthModal();
  const priceLabel = plan === 'yearly' ? '€90/year' : '€9/month';

  const handleSignUp = () => {
    analytics.landingCtaClicked({ cta: 'pro_signup', location: 'pricing_card' });
    openAuth('signup');
  };

  return (
    <section
      role="region"
      aria-label="Pro subscription pending — sign up to continue"
      className="q-insight"
      style={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 'var(--s-3)' }}
    >
      <div className="q-insight-icon" aria-hidden="true">
        <Sparkles size={16} />
      </div>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <p className="q-insight-title">Continue your Pro subscription</p>
        <p className="q-insight-body">
          Sign up with your email to start secure checkout for Pro {priceLabel}. We'll pick up where you left off.
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleSignUp}
          className="q-btn q-btn--primary q-btn--sm"
        >
          Sign up to continue
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel Pro subscription setup"
          className="q-icon-btn"
          title="Cancel"
        >
          <X size={14} />
        </button>
      </div>
    </section>
  );
}
