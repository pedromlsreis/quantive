import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { NetWorthHero } from '@/components/dashboard/NetWorthHero';
import { NetWorthChart } from '@/components/dashboard/NetWorthChart';
import { WhatMoved, AllocationSummary, YearByYear } from '@/components/dashboard/OverviewSections';
import { DemoBanner } from '@/components/dashboard/DemoBanner';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { DashboardEmpty } from '@/components/dashboard/EmptyState';
import { openComposer } from '@/lib/appEvents';
import { SubscribeIntentNotice } from '@/components/dashboard/SubscribeIntentNotice';
import { parsePlanParam, parseSuccessPlan, planParam } from '@/lib/billing/checkoutIntent';
import { ago, daysBetween, formatDate } from '@/lib/formatters';
import { analytics } from '@/lib/analytics';

// Same prefix PortfolioContext wipes on sign-out and account switch.
const recoveryDismissedKey = (userId: string) => `onboarding-dismissed:${userId}`;

/** A monthly habit: after this many days the overview offers this month's entry. */
const MONTHLY_PROMPT_DAYS = 28;

function MetaLine() {
  const { allSnapshots, isMockData } = usePortfolio();
  const { user } = useAuth();
  const keySession = useKeySession();
  const navigate = useNavigate();
  const [recoveryDismissed, setRecoveryDismissed] = useState(() => {
    if (!user) return true;
    try { return localStorage.getItem(recoveryDismissedKey(user.id)) !== null; } catch { return false; }
  });

  const latest = allSnapshots[allSnapshots.length - 1];
  if (!latest) return null;
  const days = daysBetween(latest.date, new Date());
  const when =
    days <= 0 ? 'Last entry today'
    : days === 1 ? 'Last entry yesterday'
    : `Last entry ${formatDate(latest.date)}, ${ago(latest.date)}`;
  const oneSource = latest.sources.length === 1;
  const needsRecovery = !!user && keySession.hasRecovery === false && !recoveryDismissed;

  return (
    <>
      <div className="q-page-meta">
        <span>{when}.</span>
        {!isMockData && days >= MONTHLY_PROMPT_DAYS && (
          <button type="button" className="q-link-btn" onClick={openComposer}>{"Add this month's balances"}</button>
        )}
        {!isMockData && oneSource && days < MONTHLY_PROMPT_DAYS && (
          <button
            type="button"
            className="q-link-btn"
            onClick={() => {
              analytics.onboardingCtaClicked({ step: 'accounts' });
              openComposer();
            }}
          >
            Add your other accounts to see how your net worth splits
          </button>
        )}
      </div>
      {!user && !isMockData && (
        <div className="q-page-meta">Saved in this browser. Sign in to keep it on other devices.</div>
      )}
      {needsRecovery && (
        <div className="q-page-meta">
          <span>Save a recovery code. Without it, a forgotten password leaves your saved data encrypted for good.</span>
          <button
            type="button"
            className="q-link-btn"
            onClick={() => {
              analytics.onboardingCtaClicked({ step: 'recovery' });
              navigate('/settings#recovery');
            }}
          >
            Save your recovery code
          </button>
          <button
            type="button"
            className="q-link-btn"
            style={{ color: 'var(--fg-subtle)' }}
            onClick={() => {
              try { localStorage.setItem(recoveryDismissedKey(user!.id), '1'); } catch { /* ignore */ }
              setRecoveryDismissed(true);
            }}
          >
            Not now
          </button>
        </div>
      )}
    </>
  );
}

const Index = () => {
  const { data, isLoading, isMockData } = usePortfolio();
  const { user, checkSubscription } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Guards against re-entering the poll loop if the effect re-fires (e.g.
  // because another searchParam changed). Without this, stripping the
  // ?checkout=success param would tear down and restart the polling.
  const checkoutPolledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get('checkout') !== 'success') return;
    if (checkoutPolledRef.current) return;
    checkoutPolledRef.current = true;

    const plan = parseSuccessPlan(searchParams.get('plan'));
    analytics.subscriptionStarted({ plan });
    toast.success(`Payment received. ${plan === 'family' ? 'Family' : 'Pro'} turns on within a few seconds.`, { duration: 6000 });

    // Strip the params immediately so a refresh doesn't re-trigger.
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    next.delete('plan');
    setSearchParams(next, { replace: true });

    // Poll with backoff. The webhook usually lands in <1s, but Stripe's
    // customers.search has a few seconds of eventual consistency, and the
    // edge function may briefly serve a cached "Free" view if it raced the
    // webhook. Five attempts over ~22s reliably converges to the active
    // subscription without leaning on the 60s background poll.
    const delays = [0, 1500, 3000, 6000, 12000];
    (async () => {
      for (const delay of delays) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        await checkSubscription();
      }
    })();
  }, [searchParams, setSearchParams, checkSubscription]);

  // Logged-out users sent here from /pricing carry an intent param.
  // The moment they finish signing up, bounce them back so checkout fires.
  useEffect(() => {
    if (!user) return;
    if (searchParams.get('intent') !== 'subscribe') return;
    const plan = planParam(parsePlanParam(searchParams.get('plan')));
    navigate(`/pricing?intent=subscribe&plan=${plan}`, { replace: true });
  }, [user, searchParams, navigate]);

  // Logged-out users with the intent param see the SubscribeIntentNotice.
  // Cancel strips the params and returns them to a normal dashboard.
  const showSubscribeIntent = !user && searchParams.get('intent') === 'subscribe';
  const subscribeIntentPlan = parsePlanParam(searchParams.get('plan'));
  const handleCancelSubscribeIntent = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('intent');
    next.delete('plan');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const subscribeIntentNotice = showSubscribeIntent ? (
    <SubscribeIntentNotice plan={subscribeIntentPlan} onCancel={handleCancelSubscribeIntent} />
  ) : null;

  // A reload over data already on screen (a spreadsheet import) keeps the
  // previous overview, dimmed, instead of swapping it for the skeleton.
  if (isLoading && !data) {
    return (
      <>
        {subscribeIntentNotice}
        <DashboardSkeleton />
      </>
    );
  }
  if (!data) {
    return (
      <>
        {subscribeIntentNotice}
        <DashboardEmpty />
      </>
    );
  }

  return (
    <div className={isLoading ? 'q-refreshing' : undefined} aria-busy={isLoading || undefined}>
      {subscribeIntentNotice}
      {isMockData && <DemoBanner />}
      <header className="q-page-head">
        <h1 className="q-h1" tabIndex={-1}>Overview</h1>
        <MetaLine />
      </header>

      {/* #performance is the demo-ready sentinel the E2E suite waits on. */}
      <section id="performance" aria-label="Net worth">
        <NetWorthHero />
        <NetWorthChart />
      </section>

      <div className="q-sec-pair">
        <WhatMoved />
        <AllocationSummary />
      </div>

      <YearByYear />
    </div>
  );
};

export default Index;
