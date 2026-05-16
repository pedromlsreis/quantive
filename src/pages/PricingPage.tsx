import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';
import { usePageMeta } from '@/hooks/usePageMeta';
import { CURRENCY_CODES } from '@/lib/currencies';
import { analytics } from '@/lib/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { PLANS } from '@/lib/billing/plans';
import { supabase } from '@/integrations/supabase/client';
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
  const [interval, setInterval] = useState<Interval>('yearly');
  const [submitting, setSubmitting] = useState(false);

  const proPlan = PLANS.find((p) => p.id === 'pro')!;
  const price = interval === 'yearly' ? proPlan.prices!.yearly! : proPlan.prices!.monthly!;
  const priceLabel = interval === 'yearly' ? '€90' : '€9';
  const periodLabel = interval === 'yearly' ? '/year' : '/month';
  const caption = interval === 'yearly'
    ? '~€7.50/mo · save €18 vs monthly'
    : 'Or €90/year — save €18';

  const handleSubscribe = async () => {
    analytics.landingCtaClicked({ cta: 'pro_signup', location: 'pricing_card' });
    if (!user) {
      navigate('/dashboard');
      return;
    }
    if (subscription.subscribed) {
      navigate('/settings');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId: price.priceId },
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
  };

  const proCtaLabel = !user
    ? 'Sign up to subscribe'
    : subscription.subscribed
    ? 'Manage subscription'
    : submitting
    ? 'Redirecting…'
    : `Subscribe — ${priceLabel}${periodLabel}`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 pb-20 pt-32">
        <h1 className="mb-4 text-center text-4xl font-extrabold text-foreground">Simple, transparent pricing</h1>
        <p className="mx-auto mb-3 max-w-lg text-center text-muted-foreground">
          Start free, upgrade when you're ready. End-to-end encryption is included on every tier.
        </p>
        <p className="mx-auto mb-14 max-w-xl text-center text-sm font-medium text-primary">
          Sign up free now → get your first month of Pro on us when it launches.
        </p>

        <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
          {/* Free */}
          <div className="flex flex-col rounded-xl border border-border/40 bg-card/50 p-8">
            <h2 className="text-lg font-bold text-foreground">Free</h2>
            <p className="mt-1 text-3xl font-extrabold text-foreground">€0<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Forever. No credit card required.</p>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-foreground">See your full picture, today</p>
            <ul className="mt-2 space-y-3 text-sm text-muted-foreground">
              {[
                'Net worth tracking with unlimited sources',
                'Allocation charts (volatility & liquidity)',
                `Multi-currency display (${CURRENCY_CODES.length} currencies)`,
                'Spreadsheet import',
                'Manual balance entry',
                'End-to-end encrypted cloud sync',
                'Rolling 12-month history view',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-accent">✓</span> {f}
                </li>
              ))}
            </ul>
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
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>Milestone &amp; goal tracking</span>
                      <span className="whitespace-nowrap rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        In development
                      </span>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>Benchmark comparison (vs. inflation, S&amp;P 500, MSCI World)</span>
                      <span className="whitespace-nowrap rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        In development
                      </span>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>Month-by-month summary table</span>
                      <span className="whitespace-nowrap rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        In development
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
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>PDF wealth report (one-page summary for advisors or annual review)</span>
                      <span className="whitespace-nowrap rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        In development
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
              disabled={submitting}
              className="lp-price-cta lp-price-cta--pro mt-6 w-full"
              style={{ opacity: submitting ? 0.7 : 1 }}
            >
              {proCtaLabel}
            </button>
            {!user && (
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Sign up first; you'll be able to subscribe from your dashboard.
              </p>
            )}
            {user && !subscription.subscribed && (
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
