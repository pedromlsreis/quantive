import { usePortfolio } from '@/contexts/PortfolioContext';
import { FileUpload } from '@/components/dashboard/FileUpload';
import { KPICards } from '@/components/dashboard/KPICards';
import { NetWorthChart } from '@/components/dashboard/NetWorthChart';
import { AllocationCharts } from '@/components/dashboard/AllocationCharts';
import { YearlyEarnings } from '@/components/dashboard/YearlyEarnings';
import { MotivationalKPIs } from '@/components/dashboard/MotivationalKPIs';
import { DashboardSection } from '@/components/dashboard/DashboardSection';
import { FeedbackButton } from '@/components/dashboard/FeedbackButton';
import { DemoBanner } from '@/components/dashboard/DemoBanner';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { FreshStartNudge } from '@/components/dashboard/FreshStartNudge';

const Index = () => {
  const { data, isLoading, isMockData, snapshots } = usePortfolio();

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

      <div className="flex justify-center pb-2">
        <FeedbackButton />
      </div>
    </div>
  );
};

export default Index;
