import { useEffect } from 'react';
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
import { FreshStartNudge } from '@/components/dashboard/FreshStartNudge';

const Index = () => {
  const { data, isLoading, isMockData, snapshots } = usePortfolio();
  const { user, checkSubscription } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('checkout') !== 'success') return;
    toast.success('Welcome to Pro! Your subscription is active.', { duration: 6000 });
    checkSubscription();
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, checkSubscription]);

  // Logged-out users sent here from /pricing carry an intent param.
  // The moment they finish signing up, bounce them back so checkout fires.
  useEffect(() => {
    if (!user) return;
    if (searchParams.get('intent') !== 'subscribe') return;
    const plan = searchParams.get('plan') === 'monthly' ? 'monthly' : 'yearly';
    navigate(`/pricing?intent=subscribe&plan=${plan}`, { replace: true });
  }, [user, searchParams, navigate]);

  if (isLoading) return <DashboardSkeleton />;
  if (!data) return <FileUpload />;

  return (
    <div className="flex flex-col gap-8">
      {isMockData && <DemoBanner />}
      {!isMockData && snapshots.length === 1 && <FreshStartNudge />}

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
