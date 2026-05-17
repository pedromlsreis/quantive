import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';
import { usePageMeta } from '@/hooks/usePageMeta';
import { CURRENCY_CODES } from '@/lib/currencies';
import { analytics } from '@/lib/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { PLANS } from '@/lib/billing/plans';
import { supabase } from '@/integrations/supabase/client';
import { Notice } from '@/components/ui/Notice';
import './landing.css';

type Interval = 'monthly' | 'yearly';

export default function PricingPage() {
  usePageMeta({
    title: 'Pricing – Quantive',
    description: 'Quantive is free forever, with optional Pro for full history, forecasting, and exports — €9/month or €90/year.',
    path: '/pricing',
  });

  const { user, subscription } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [interval, setInterval] = useState<Interval>('yearly');
  const [submitting, setSubmitting] = useState(false);

  // Stripe checkout is gated on email confirmation: paying €90/year against
  // an unverified email creates support pain (receipts undeliverable, recovery
  // blocked). When the user confirms, the bounce-back effect below fires
  // checkout automatically — no need for the user to come back here.
  const needsEmailConfirmation = !!user && !user.email_confirmed_at;

  const proPlan = PLANS.find((p) => p.id === 'pro')!;
  const priceLabel = interval === 'yearly' ? '€90' : '€9';
  const periodLabel = interval === 'yearly' ? '/year' : '/month';
  const caption = interval === 'yearly'
    ? '~€7.50/mo · save €18 vs monthly'
    : 'Or €90/year — save €18';

  const subscribeWithPlan = useCallback(async (chosenInterval: Interval) => {
    const chosenPrice = chosenInterval === 'yearly' ? proPlan.prices!.yearly! : proPlan.prices!.monthly!;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId: chosenPrice.priceId },
      });
      if (error || !data?.url) {
        toast.error('Could not start checkout. Please try again.');
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error('Could not start checkout. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [proPlan]);

  const handleSubscribe = () => {
    analytics.landingCtaClicked({ cta: 'pro_signup', location: 'pricing_card' });
    if (!user) {
      // Carry the intent through sign-up. Index.tsx bounces back here once
      // the user authenticates, and the effect below resumes checkout.
      navigate(`/dashboard?intent=subscribe&plan=${interval}`);
      return;
    }
    if (subscription.subscribed) {
      navigate('/settings');
      return;
    }
    if (needsEmailConfirmation) {
      // Persist the intent so the bounce-back effect picks up the right plan
      // once email_confirmed_at flips. Inline notice (below) explains the wait.
      const next = new URLSearchParams(searchParams);
      next.set('intent', 'subscribe');
      next.set('plan', interval);
      setSearchParams(next, { replace: true });
      return;
    }
    subscribeWithPlan(interval);
  };

  useEffect(() => {
    if (!user || subscription.subscribed) return;
    if (searchParams.get('intent') !== 'subscribe') return;
    const plan: Interval = searchParams.get('plan') === 'monthly' ? 'monthly' : 'yearly';
    setInterval(plan);
    // Wait for email confirmation before firing checkout. Once Supabase
    // surfaces email_confirmed_at, this effect re-runs and the gate clears.
    if (!user.email_confirmed_at) return;
    // Clear params so this effect doesn't refire on the next render or if the
    // user navigates back from a cancelled checkout.
    const next = new URLSearchParams(searchParams);
    next.delete('intent');
    next.delete('plan');
    setSearchParams(next, { replace: true });
    subscribeWithPlan(plan);
    // user?.email_confirmed_at is included explicitly so the effect re-fires
    // when Supabase flips the confirmation flag, even if it ever mutates the
    // user object in place instead of returning a fresh reference.
  }, [user, user?.email_confirmed_at, subscription.subscribed, searchParams, setSearchParams, subscribeWithPlan]);

  const proCtaLabel = !user
    ? 'Sign up to subscribe'
    : subscription.subscribed
    ? 'Manage subscription'
    : needsEmailConfirmation
    ? 'Confirm your email to subscribe'
    : submitting
    ? 'Redirecting…'
    : `Subscribe — ${priceLabel}${periodLabel}`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 pb-20 pt-32">
        <h1 className="mb-4 text-center text-4xl font-extrabold text-foreground">Simple, transparent pricing</h1>
        <p className="mx-auto mb-14 max-w-lg text-center text-muted-foreground">
          Start free. Upgrade when you're ready. End-to-end encryption on every tier — always.
        </p>

        <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
          {/* Free */}
          <div className="flex flex-col rounded-xl border border-border/40 bg-card/50 p-8">
            <h2 className="text-lg font-bold text-foreground">Free</h2>
            <p className="mt-1 text-3xl font-extrabold text-foreground">€0<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Forever. No credit card required.</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">All prices final. No VAT charged under German legislation (§ 19 UStG).</p>
            <div className="mt-5 space-y-4 text-sm text-muted-foreground">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">See your full picture, today</p>
                <ul className="mt-2 space-y-2">
                  {[
                    'Net worth tracking with unlimited sources',
                    'Allocation charts (volatility & liquidity)',
                    `Multi-currency display (${CURRENCY_CODES.length} currencies)`,
                    'Spreadsheet import',
                    'Manual balance entry',
                    'Rolling 12-month history view',
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-0.5 text-accent">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Privacy &amp; control</p>
                <ul className="mt-2 space-y-2">
                  {[
                    'End-to-end encrypted — only you can read your data',
                    'Privacy mode to blur sensitive numbers',
                    'Delete your account and data at any time',
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-0.5 text-accent">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Link
              to="/dashboard"
              className="mt-auto block rounded-lg border border-border bg-secondary py-2.5 text-center text-sm font-medium text-secondary-foreground transition-transform hover:scale-105"
              onClick={() => analytics.landingCtaClicked({ cta: 'get_started', location: 'pricing_card' })}
            >
              Get Started
            </Link>
          </div>

          {/* Pro */}
          <div className="relative rounded-xl border-2 border-primary/50 bg-card p-8">
            <div
              role="radiogroup"
              aria-label="Billing interval"
              className="absolute -top-3 right-6 flex overflow-hidden rounded-full border border-primary/40 bg-background text-xs font-medium"
            >
              <button
                type="button"
                role="radio"
                aria-checked={interval === 'monthly'}
                onClick={() => setInterval('monthly')}
                className={`px-3 py-0.5 transition-colors ${interval === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Monthly
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={interval === 'yearly'}
                onClick={() => setInterval('yearly')}
                className={`px-3 py-0.5 transition-colors ${interval === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Yearly
              </button>
            </div>
            <h2 className="text-lg font-bold text-foreground">Pro</h2>
            <p className="mt-1 text-3xl font-extrabold text-foreground">
              {priceLabel}
              <span className="text-sm font-normal text-muted-foreground">{periodLabel}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">All prices final. No VAT charged under German legislation (§ 19 UStG).</p>

            <div className="mt-5 space-y-4 text-sm text-muted-foreground">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Know if you're on track</p>
                <ul className="mt-2 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>Full historical view — every snapshot since you started, charted and tabular</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>Forecasting engine — CAGR projection with 95% confidence intervals</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>
                      Milestone &amp; goal tracking{' '}
                      <span className="ml-1 inline-block whitespace-nowrap rounded-full border border-border/60 px-1.5 py-0.5 align-middle text-[10px] uppercase tracking-wide text-muted-foreground">
                        Coming soon
                      </span>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>
                      Benchmark comparison (vs. inflation, S&amp;P 500, MSCI World){' '}
                      <span className="ml-1 inline-block whitespace-nowrap rounded-full border border-border/60 px-1.5 py-0.5 align-middle text-[10px] uppercase tracking-wide text-muted-foreground">
                        Coming soon
                      </span>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>
                      Month-by-month summary table{' '}
                      <span className="ml-1 inline-block whitespace-nowrap rounded-full border border-border/60 px-1.5 py-0.5 align-middle text-[10px] uppercase tracking-wide text-muted-foreground">
                        Coming soon
                      </span>
                    </span>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Get your data out</p>
                <ul className="mt-2 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>Excel/CSV export</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>
                      PDF wealth report (one-page summary for advisors or annual review){' '}
                      <span className="ml-1 inline-block whitespace-nowrap rounded-full border border-border/60 px-1.5 py-0.5 align-middle text-[10px] uppercase tracking-wide text-muted-foreground">
                        Coming soon
                      </span>
                    </span>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Support</p>
                <ul className="mt-2 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>Priority support (24h response)</span>
                  </li>
                </ul>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubscribe}
              disabled={submitting || needsEmailConfirmation}
              aria-disabled={submitting || needsEmailConfirmation}
              className="lp-price-cta lp-price-cta--pro mt-6 w-full"
              style={{ opacity: submitting || needsEmailConfirmation ? 0.6 : 1, cursor: needsEmailConfirmation ? 'not-allowed' : undefined }}
            >
              {proCtaLabel}
            </button>
            {!user && (
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Sign up first; you'll be able to subscribe from your dashboard.
              </p>
            )}
            {user && needsEmailConfirmation && (
              <Notice
                variant="warning"
                role="status"
                className="mt-3"
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2, fontSize: '11px' }}
              >
                <p style={{ fontWeight: 600, margin: 0 }}>Confirm your email first</p>
                <p style={{ margin: 0, opacity: 0.9 }}>
                  Click the link we sent to{' '}
                  <span
                    style={{ fontWeight: 500, wordBreak: 'break-all' }}
                    title={user.email}
                  >
                    {user.email}
                  </span>
                  . We'll open checkout automatically — no need to come back here.
                </p>
              </Notice>
            )}
            {user && !subscription.subscribed && !needsEmailConfirmation && (
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Secure checkout by Stripe. Cancel anytime.
              </p>
            )}
            {user && subscription.subscribed && (
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                You're already on Pro. Manage your subscription from Settings.
              </p>
            )}
          </div>
        </div>

        {/* Family — planned */}
        <div className="mx-auto mt-10 max-w-3xl rounded-xl border border-dashed border-border/60 bg-card/30 p-6 text-center">
          <h3 className="text-sm font-semibold text-foreground">
            Family <span className="ml-2 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Planned</span>
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Shared portfolio access for 2 users, plus multiple portfolios per account. Not yet available — requires shared-key encryption work first.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
