import { usePortfolio } from '@/contexts/PortfolioContext';
import { Footer } from '@/components/Footer';
import { FileUpload } from '@/components/dashboard/FileUpload';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { KPICards } from '@/components/dashboard/KPICards';
import { NetWorthChart } from '@/components/dashboard/NetWorthChart';
import { StackedAreaChart } from '@/components/dashboard/StackedAreaChart';
import { AllocationCharts } from '@/components/dashboard/AllocationCharts';
import { ForecastChart } from '@/components/dashboard/ForecastChart';
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
    <div className={`flex flex-col flex-col bg-background${isMockData ? ' pt-9' : ''}`}>
      {isMockData && <DemoBanner />}
      <DashboardHeader />
      <FilterBar />
      <main className="mx-auto w-full max-w-[1400px] flex-1 animate-fade-in space-y-8 p-6">
        {!isMockData && snapshots.length === 1 && <FreshStartNudge />}
        <DashboardSection id="performance" title="Performance">
          <KPICards />
          <NetWorthChart />
          <StackedAreaChart />
          <YearlyEarnings />
        </DashboardSection>

        <DashboardSection id="allocation" title="Risk & Allocation">
          <AllocationCharts />
        </DashboardSection>

        <DashboardSection id="forecast" title="Forecast">
          <ForecastChart />
        </DashboardSection>

        <DashboardSection id="milestones" title="Milestones">
          <MotivationalKPIs />
        </DashboardSection>

        <div className="flex justify-center pb-2">
          <FeedbackButton />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
