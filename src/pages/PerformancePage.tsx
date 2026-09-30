import { usePortfolio } from '@/contexts/PortfolioContext';
import { BenchmarkOverlay } from '@/components/performance/BenchmarkOverlay';
import { PageSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { RouteEmpty } from '@/components/dashboard/EmptyState';
import { MonthSummaryTable } from '@/components/performance/MonthSummaryTable';
import { DownsideStats } from '@/components/performance/DownsideStats';
import { PdfReportButton } from '@/components/export/PdfReportButton';

/**
 * Looking back: net worth against inflation and the market, its downside,
 * and the month-by-month record. Forecast stays about the future.
 */
const PerformancePage = () => {
  const { data, isLoading } = usePortfolio();

  if (isLoading) return <PageSkeleton />;
  if (!data) return <RouteEmpty title="Performance" sentence="Monthly change, drawdowns and a comparison with EU inflation and the S&P 500. It needs two months of entries." />;

  return (
    <div>
      <header className="q-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
        <div>
          <h1 className="q-h1" tabIndex={-1}>Performance</h1>
          <p className="q-page-lede">How your net worth has moved against inflation and the market, month by month.</p>
        </div>
        <PdfReportButton />
      </header>
      <BenchmarkOverlay />
      <DownsideStats />
      <MonthSummaryTable />
    </div>
  );
};

export default PerformancePage;
