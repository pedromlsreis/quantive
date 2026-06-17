import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';
import { FileUpload } from '@/components/dashboard/FileUpload';
import { KPICards } from '@/components/dashboard/KPICards';
import { NetWorthChart } from '@/components/dashboard/NetWorthChart';
import { AllocationCharts } from '@/components/dashboard/AllocationCharts';
import { YearlyEarnings } from '@/components/dashboard/YearlyEarnings';
import { MotivationalKPIs } from '@/components/dashboard/MotivationalKPIs';
import { DashboardSection } from '@/components/dashboard/DashboardSection';
import { DemoBanner } from '@/components/dashboard/DemoBanner';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { SubscribeIntentNotice } from '@/components/dashboard/SubscribeIntentNotice';
import { OnboardingChecklist } from '@/components/dashboard/OnboardingChecklist';
import { analytics } from '@/lib/analytics';

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

    analytics.subscriptionStarted();
    toast.success('Welcome to Pro! Your subscription is active.', { duration: 6000 });

    // Strip the param immediately so a refresh doesn't re-trigger.
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
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
    const plan = searchParams.get('plan') === 'monthly' ? 'monthly' : 'yearly';
    navigate(`/pricing?intent=subscribe&plan=${plan}`, { replace: true });
  }, [user, searchParams, navigate]);

  // Logged-out users with the intent param see the SubscribeIntentNotice.
  // Cancel strips the params and returns them to a normal dashboard.
  const showSubscribeIntent = !user && searchParams.get('intent') === 'subscribe';
  const subscribeIntentPlan = searchParams.get('plan') === 'monthly' ? 'monthly' : 'yearly';
  const handleCancelSubscribeIntent = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('intent');
    next.delete('plan');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const subscribeIntentNotice = showSubscribeIntent ? (
    <SubscribeIntentNotice plan={subscribeIntentPlan} onCancel={handleCancelSubscribeIntent} />
  ) : null;

  if (isLoading) {
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
        <FileUpload />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {subscribeIntentNotice}
      {isMockData && <DemoBanner />}
      {/* Use allSnapshots (not the filtered list) so a user with many
          measurements doesn't get the "just starting out" nudge after
          narrowing the date filter. */}
      <OnboardingChecklist />

      <DashboardSection id="performance" title="Performance">
        <KPICards />
        <NetWorthChart />
        <YearlyEarnings />
      </DashboardSection>

      <DashboardSection id="allocation" title="Allocation">
        <AllocationCharts />
      </DashboardSection>

      <DashboardSection id="milestones" title="Milestones">
        <MotivationalKPIs />
      </DashboardSection>

    </div>
  );
};

export default Index;
