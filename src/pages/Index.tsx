import { usePortfolio } from '@/contexts/PortfolioContext';
import { FileUpload } from '@/components/dashboard/FileUpload';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { KPICards } from '@/components/dashboard/KPICards';
import { NetWorthChart } from '@/components/dashboard/NetWorthChart';
import { AllocationCharts } from '@/components/dashboard/AllocationCharts';
import { ForecastChart } from '@/components/dashboard/ForecastChart';

const Index = () => {
  const { data } = usePortfolio();

  if (!data) return <FileUpload />;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <FilterBar />
      <main className="mx-auto max-w-[1400px] animate-fade-in space-y-6 p-6">
        <KPICards />
        <NetWorthChart />
        <AllocationCharts />
        <ForecastChart />
      </main>
    </div>
  );
};

export default Index;
