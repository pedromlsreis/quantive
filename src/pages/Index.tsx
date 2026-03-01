import { usePortfolio } from '@/contexts/PortfolioContext';
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

const Index = () => {
  const { data } = usePortfolio();

  if (!data) return <FileUpload />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DashboardHeader />
      <FilterBar />
      <main className="mx-auto w-full max-w-[1400px] flex-1 animate-fade-in space-y-8 p-6">
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
      </main>
    </div>
  );
};

export default Index;
