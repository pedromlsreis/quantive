/**
 * A short getting-started checklist on the dashboard for new authed accounts.
 * Each step's done-state is derived from real portfolio/session state rather
 * than stored, so the list can't drift out of sync. It hides once every step
 * is done, in demo mode, or when the user dismisses it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { analytics } from '@/lib/analytics';

// Per-user flag, wiped on sign-out / account switch by the PortfolioContext
// watcher (encryption.md §8.6).
const DISMISSED_PREFIX = 'onboarding-dismissed:';
const dismissedKey = (userId: string) => `${DISMISSED_PREFIX}${userId}`;

interface Step {
  id: string;
  label: string;
  done: boolean;
  cta?: { label: string; run: () => void };
}

export function OnboardingChecklist() {
  const { user } = useAuth();
  const { data, isMockData } = usePortfolio();
  const { hasRecovery } = useKeySession();
  const navigate = useNavigate();

  const [dismissed, setDismissed] = useState(() => {
    if (!user) return false;
    try {
      return localStorage.getItem(dismissedKey(user.id)) !== null;
    } catch {
      return false;
    }
  });

  const steps = useMemo<Step[]>(() => {
    const sources = data?.refSources.length ?? 0;
    const goals = data?.goals.length ?? 0;
    const hasBalances = !isMockData && (data?.facts.length ?? 0) > 0;
    return [
      { id: 'balances', label: 'Log your first balances', done: hasBalances },
      {
        id: 'accounts',
        label: 'Add your other accounts',
        done: sources >= 2,
        cta: {
          label: 'Add',
          run: () => {
            analytics.onboardingCtaClicked({ step: 'accounts' });
            window.dispatchEvent(new Event('quantive:add-measurement'));
          },
        },
      },
      {
        id: 'recovery',
        label: 'Save your recovery code',
        done: hasRecovery === true,
        cta: {
          label: 'Set up',
          run: () => {
            analytics.onboardingCtaClicked({ step: 'recovery' });
            navigate('/settings');
          },
        },
      },
      {
        id: 'goal',
        label: 'Set your first goal',
        done: goals >= 1,
        cta: {
          label: 'Create',
          run: () => {
            analytics.onboardingCtaClicked({ step: 'goal' });
            navigate('/goals');
          },
        },
      },
    ];
  }, [data, isMockData, hasRecovery, navigate]);

  const completed = steps.filter((s) => s.done).length;
  const visible = !!user && !isMockData && !dismissed && completed < steps.length;

  const shownRef = useRef(false);
  useEffect(() => {
    if (visible && !shownRef.current) {
      shownRef.current = true;
      analytics.onboardingChecklistShown({ completed });
    }
  }, [visible, completed]);

  if (!visible || !user) return null;

  const dismiss = () => {
    analytics.onboardingChecklistDismissed({ completed });
    setDismissed(true);
    try {
      localStorage.setItem(dismissedKey(user.id), '1');
    } catch {
      // Storage unavailable; the list reappears next session, which is fine.
    }
  };

  return (
    <section
      className="q-card q-card--p-md"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--s-3)' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Getting started</h2>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginTop: 2 }}>
            {completed} of {steps.length} done
          </div>
        </div>
        <button type="button" onClick={dismiss} className="q-icon-btn" aria-label="Dismiss getting started">
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', margin: 0, padding: 0, listStyle: 'none' }}>
        {steps.map((step) => (
          <li key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
            <span
              aria-hidden
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: step.done ? 'var(--accent-faint-raw)' : 'transparent',
                border: step.done ? 'none' : '1.5px solid var(--border)',
                color: 'var(--primary)',
              }}
            >
              {step.done && <Check className="h-3 w-3" />}
            </span>
            <span
              style={{
                flex: 1, minWidth: 0, fontSize: 'var(--text-sm)',
                color: step.done ? 'var(--fg-muted)' : 'var(--fg)',
                textDecoration: step.done ? 'line-through' : 'none',
              }}
            >
              {step.label}
            </span>
            {!step.done && step.cta && (
              <button type="button" onClick={step.cta.run} className="q-btn q-btn--ghost q-btn--sm" style={{ flexShrink: 0 }}>
                {step.cta.label}
              </button>
            )}
          </li>
        ))}
      </ul>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', margin: 0 }}>
        Tip: log your balances again next month to unlock trends and forecasts.
      </p>
    </section>
  );
}
