import { usePortfolio } from '@/contexts/PortfolioContext';
import { BenchmarkOverlay } from '@/components/performance/BenchmarkOverlay';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { FileUpload } from '@/components/dashboard/FileUpload';
import { MonthSummaryTable } from '@/components/performance/MonthSummaryTable';
import { PdfReportButton } from '@/components/export/PdfReportButton';

/**
 * Performance — looking-back view that combines benchmark comparison (Agent B)
 * and the month-by-month summary table (Agent C). Two stacked sections:
 *   1. BenchmarkOverlay — inflation / S&P 500 comparison.
 *   2. MonthSummaryTable — month-by-month history with CSV export.
 *
 * Forecast lives at /forecast and stays about the future; Performance is the
 * single place to "see how I'm doing relative to the past and the market".
 */
const PerformancePage = () => {
  const { data, isLoading } = usePortfolio();

  if (isLoading) return <DashboardSkeleton />;
  if (!data) return <FileUpload />;

  return (
    <div className="flex flex-col gap-8">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s-3)' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
            Performance
          </h1>
          <p style={{ color: 'var(--fg-subtle)', fontSize: 14, margin: '6px 0 0' }}>
            How your portfolio compares to inflation and the wider market, plus a month-by-month history.
          </p>
        </div>
        <PdfReportButton />
      </div>

      <BenchmarkOverlay />

      <MonthSummaryTable />
    </div>
  );
};

export default PerformancePage;
