import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PublicPage } from '@/components/landing/PublicPage';
import { RollingFigure } from '@/components/landing/RollingFigure';
import { usePageMeta } from '@/hooks/usePageMeta';
import { getRouteMeta } from '@/lib/seo/routeMeta';
import {
  FAMILY_SECTIONS,
  FREE_SECTIONS,
  PRO_SECTIONS,
  PRICING_HEADLINE,
  PRICING_SUB,
  VAT_NOTE,
} from '@/lib/billing/planCopy';
import { analytics } from '@/lib/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { FAMILY_PLAN, PLANS, resolvePlan } from '@/lib/billing/plans';
import {
  parsePlanParam,
  planParam,
  type CheckoutChoice,
  type CheckoutInterval as Interval,
  type CheckoutPlan,
} from '@/lib/billing/checkoutIntent';
import { extractCheckoutErrorCode, messageForCheckoutError, messageForPortalError } from '@/lib/billing/checkoutError';
import { supabase } from '@/integrations/supabase/client';
import { Notice } from '@/components/ui/Notice';
import './pricing.css';

const PRO_PLAN = PLANS.find((p) => p.id === 'pro')!;
const PLAN_FOR: Record<CheckoutPlan, typeof PRO_PLAN> = { pro: PRO_PLAN, family: FAMILY_PLAN };

const CAPTIONS: Record<CheckoutPlan, Record<Interval, string>> = {
  pro: {
    yearly: 'About €7.50 a month. You save €18 against monthly.',
    monthly: 'Or €90 a year, and save €18.',
  },
  family: {
    yearly: 'About €10 a month for both of you. You save €48 against monthly.',
    monthly: 'Or €120 a year, and save €48.',
  },
};

export default function PricingPage() {
  usePageMeta(getRouteMeta('/pricing'));

  const { user, subscription } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [interval, setInterval] = useState<Interval>('yearly');
  const [submitting, setSubmitting] = useState<CheckoutPlan | null>(null);

  // Stripe checkout is gated on email confirmation: paying €90/year against
  // an unverified email creates support pain (receipts undeliverable, recovery
  // blocked). When the user confirms, the bounce-back effect below fires
  // checkout automatically — no need for the user to come back here.
  const needsEmailConfirmation = !!user && !user.email_confirmed_at;
  const paidPlanId = subscription.subscribed ? resolvePlan(subscription.productId).id : null;

  const subscribeWithPlan = useCallback(async ({ plan, interval: chosenInterval }: CheckoutChoice) => {
    const prices = PLAN_FOR[plan].prices!;
    const chosenPrice = chosenInterval === 'yearly' ? prices.yearly! : prices.monthly!;
    setSubmitting(plan);
    analytics.checkoutStarted({ plan, interval: chosenInterval });
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId: chosenPrice.priceId },
      });
      if (error || !data?.url) {
        const code = await extractCheckoutErrorCode(error);
        analytics.checkoutFailed({ reason: code ?? 'unknown' });
        toast.error(messageForCheckoutError(code));
        return;
      }
      window.location.href = data.url;
    } catch {
      analytics.checkoutFailed({ reason: 'network' });
      toast.error(messageForCheckoutError(undefined));
    } finally {
      setSubmitting(null);
    }
  }, []);

  // A Pro subscriber moves to Family on Stripe's confirmation page, which
  // keeps one subscription and prorates, rather than through a second checkout.
  const switchToFamily = async () => {
    setSubmitting('family');
    analytics.planSwitchStarted({ to: 'family' });
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal', { body: { flow: 'switch_to_family' } });
      if (error || !data?.url) {
        toast.error(messageForPortalError(await extractCheckoutErrorCode(error)));
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error(messageForPortalError(undefined));
    } finally {
      setSubmitting(null);
    }
  };

  const handleSubscribe = (plan: CheckoutPlan) => {
    analytics.landingCtaClicked({ cta: plan === 'family' ? 'family_signup' : 'pro_signup', location: 'pricing_card' });
    const choice = { plan, interval };
    if (!user) {
      // Carry the intent through sign-up. Index.tsx bounces back here once
      // the user authenticates, and the effect below resumes checkout.
      navigate(`/dashboard?intent=subscribe&plan=${planParam(choice)}`);
      return;
    }
    if (paidPlanId === 'pro' && plan === 'family') {
      void switchToFamily();
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
      next.set('plan', planParam(choice));
      setSearchParams(next, { replace: true });
      return;
    }
    subscribeWithPlan(choice);
  };

  useEffect(() => {
    if (!user || subscription.subscribed) return;
    if (searchParams.get('intent') !== 'subscribe') return;
    const choice = parsePlanParam(searchParams.get('plan'));
    setInterval(choice.interval);
    // Wait for email confirmation before firing checkout. Once Supabase
    // surfaces email_confirmed_at, this effect re-runs and the gate clears.
    if (!user.email_confirmed_at) return;
    // Clear params so this effect doesn't refire on the next render or if the
    // user navigates back from a cancelled checkout.
    const next = new URLSearchParams(searchParams);
    next.delete('intent');
    next.delete('plan');
    setSearchParams(next, { replace: true });
    subscribeWithPlan(choice);
    // user?.email_confirmed_at is included explicitly so the effect re-fires
    // when Supabase flips the confirmation flag, even if it ever mutates the
    // user object in place instead of returning a fresh reference.
  }, [user, user?.email_confirmed_at, subscription.subscribed, searchParams, setSearchParams, subscribeWithPlan]);

  const ctaLabel = (plan: CheckoutPlan) => {
    const price = PLAN_FOR[plan].prices![interval]!.amount;
    if (!user) return 'Sign up to subscribe';
    if (paidPlanId === 'pro' && plan === 'family') return submitting === 'family' ? 'Opening…' : 'Switch to Family';
    if (subscription.subscribed) return 'Manage subscription';
    if (needsEmailConfirmation) return 'Confirm your email to subscribe';
    if (submitting === plan) return 'Redirecting…';
    return `Subscribe for €${price} ${interval === 'yearly' ? 'a year' : 'a month'}`;
  };

  const intervals: { id: Interval; label: string }[] = [
    { id: 'yearly', label: 'Yearly' },
    { id: 'monthly', label: 'Monthly' },
  ];
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const onIntervalKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = intervals[(i + dir + intervals.length) % intervals.length];
    setInterval(next.id);
    radios.current[intervals.indexOf(next)]?.focus();
  };

  const paidCard = (plan: CheckoutPlan) => {
    const name = PLAN_FOR[plan].name;
    const price = `€${PLAN_FOR[plan].prices![interval]!.amount}`;
    return (
      <section
        id={plan === 'family' ? 'family' : undefined}
        className={`pp-card pp-card--${plan}`}
        aria-labelledby={`pp-${plan}`}
      >
        <h2 id={`pp-${plan}`} className="pub-h3">{name}</h2>
        <p className="pp-price">
          <RollingFigure value={price} className="pub-fig" rollMs={240} />
          <span className="pp-period">{interval === 'yearly' ? 'a year' : 'a month'}</span>
        </p>
        <div className="pub-double-rule pp-rule" aria-hidden="true" />
        <p className="pp-caption">{CAPTIONS[plan][interval]}</p>
        <p className="pp-vat">{VAT_NOTE}</p>
        <PlanSections sections={plan === 'family' ? FAMILY_SECTIONS : PRO_SECTIONS} />

        <div className="pp-cta">
          <button
            type="button"
            onClick={() => handleSubscribe(plan)}
            disabled={submitting !== null || needsEmailConfirmation}
            aria-disabled={submitting !== null || needsEmailConfirmation}
            className={`pub-btn ${plan === 'pro' ? 'pub-btn--primary' : 'pub-btn--secondary'} pp-cta-btn`}
          >
            {ctaLabel(plan)}
          </button>
          {!user && (
            <p className="pp-helper">Sign up first. Once you confirm your email, checkout opens by itself.</p>
          )}
          {user && needsEmailConfirmation && (
            <Notice
              variant="warning"
              role="status"
              className="mt-3"
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2, fontSize: '12px' }}
            >
              <p style={{ fontWeight: 600, margin: 0 }}>Confirm your email first</p>
              <p style={{ margin: 0, opacity: 0.9 }}>
                Click the link we sent to{' '}
                <span style={{ fontWeight: 500, wordBreak: 'break-all' }} title={user.email}>
                  {user.email}
                </span>
                . We'll open checkout automatically, no need to come back here.
              </p>
            </Notice>
          )}
          {user && !subscription.subscribed && !needsEmailConfirmation && (
            <p className="pp-helper">
              {plan === 'pro' && subscription.familyMember
                ? 'A Family plan you share already gives you Pro.'
                : 'Secure checkout by Stripe. Cancel anytime.'}
            </p>
          )}
          {user && paidPlanId === 'pro' && plan === 'family' && (
            <p className="pp-helper">Your Pro subscription becomes Family. Stripe credits the unused part of Pro.</p>
          )}
          {user && paidPlanId === plan && (
            <p className="pp-helper">{`You're on ${name}. Manage your subscription from Settings.`}</p>
          )}
          <p className="pp-helper">Payment runs on Stripe's hosted checkout. Your card details never reach Quantive.</p>
        </div>
      </section>
    );
  };

  return (
    <PublicPage>
      <div className="pub-wrap pp">
        <header className="pp-head">
          <h1 className="pub-display">{PRICING_HEADLINE}</h1>
          <p className="pub-lede">
            {PRICING_SUB} Pro is also available monthly, at €9. Family covers two people for €120 a year.
          </p>
        </header>

        <div role="radiogroup" aria-label="Billing interval" className="pp-interval" data-active={interval}>
          <span className="pp-interval-thumb" aria-hidden="true" />
          {intervals.map((opt, i) => (
            <button
              key={opt.id}
              ref={(el) => (radios.current[i] = el)}
              type="button"
              role="radio"
              aria-checked={interval === opt.id}
              tabIndex={interval === opt.id ? 0 : -1}
              onClick={() => setInterval(opt.id)}
              onKeyDown={(e) => onIntervalKey(e, i)}
              className="pp-interval-opt"
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="pp-cards">
          <section className="pp-card" aria-labelledby="pp-free">
            <h2 id="pp-free" className="pub-h3">Free</h2>
            <p className="pp-price">
              <span className="pub-fig">€0</span>
              <span className="pp-period">forever</span>
            </p>
            <div className="pub-double-rule pp-rule" aria-hidden="true" />
            <p className="pp-caption">No credit card required.</p>
            <PlanSections sections={FREE_SECTIONS} />
            <div className="pp-cta">
              <Link
                to="/dashboard"
                className="pub-btn pub-btn--secondary pp-cta-btn"
                onClick={() => analytics.landingCtaClicked({ cta: 'get_started', location: 'pricing_card' })}
              >
                Get started free
              </Link>
            </div>
          </section>

          {paidCard('pro')}
          {paidCard('family')}
        </div>

        <p className="pp-demo">
          <Link
            to="/demo"
            className="pub-link"
            onClick={() => analytics.landingCtaClicked({ cta: 'try_demo', location: 'pricing_page' })}
          >
            See every Pro feature in the demo
          </Link>
          <span className="pub-fine"> It opens with illustrative data and every Pro view unlocked.</span>
        </p>

        <section className="pp-faq" aria-labelledby="pp-faq-h">
          <h2 id="pp-faq-h" className="pub-h2">Before you subscribe</h2>
          <dl className="pp-faq-list">
            <div>
              <dt>Can I cancel?</dt>
              <dd>
                Yes, at any time from Settings. Billing runs through Stripe's customer portal, and refunds and the
                withdrawal right are set out in the <Link to="/terms" className="pub-link">Terms of Service</Link>.
              </dd>
            </div>
            <div>
              <dt>What happens to my data if I cancel?</dt>
              <dd>
                Nothing is deleted. Your view returns to the last 12 months, and older entries stay stored. If Family
                ends, shared portfolios stay readable and exportable for both of you, but take no new entries.
              </dd>
            </div>
            <div>
              <dt>How does sharing work on Family?</dt>
              <dd>
                You and your partner each keep your own account, and each personal portfolio stays private. You create
                a portfolio to share and send your partner an invite link. The link carries the portfolio's key, so it
                never reaches Quantive. Your partner gets Pro for as long as your Family plan runs.
              </dd>
            </div>
            <div>
              <dt>I already pay for Pro. Can I switch?</dt>
              <dd>
                Yes. Switch to Family from Settings or from this page; Stripe credits the unused part of Pro. If your
                partner pays for Pro too, they can cancel it once they join.
              </dd>
            </div>
            <div>
              <dt>Why is no VAT charged?</dt>
              <dd>Quantive is a small business under § 19 UStG (the German Kleinunternehmer rule), so prices are final and include no VAT.</dd>
            </div>
          </dl>
        </section>

        <p className="pp-cross">
          Questions about your data? <Link to="/#faq" className="pub-link">Read the FAQ</Link> or see{' '}
          <Link to="/security" className="pub-link">how encryption works</Link>.
        </p>
      </div>
    </PublicPage>
  );
}

function PlanSections({ sections }: { sections: typeof FREE_SECTIONS }) {
  return (
    <div className="pp-sections">
      {sections.map((sec) => (
        <div key={sec.head}>
          <p className="pp-sec-head">{sec.head}</p>
          <ul className="pp-list" role="list">
            {sec.items.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
