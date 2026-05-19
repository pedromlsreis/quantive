import { usePortfolio } from '@/contexts/PortfolioContext';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { FileUpload } from '@/components/dashboard/FileUpload';
import { MonthSummaryTable } from '@/components/performance/MonthSummaryTable';
import { PdfReportButton } from '@/components/export/PdfReportButton';

/**
 * /performance — the "looking back" page. Two stacked sections:
 *   1. Benchmark overlay (owned by Agent B — not in this branch yet; Agent D
 *      reconciles at integration time).
 *   2. Month-by-month history table (owned by Agent C — this branch).
 *
 * Agent B's branch contains the marker comment
 * `{/* AGENT_C_MONTH_SUMMARY_SECTION *\/}` immediately below the benchmark
 * overlay; when merging, drop this skeleton's first section and slot
 * `<MonthSummaryTable />` in at that marker.
 */
const PerformanceContent = () => {
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
            Look back at how your portfolio has moved month by month.
          </p>
        </div>
        <PdfReportButton />
      </div>

      {/* AGENT_B_BENCHMARK_SECTION — placeholder until benchmarks branch merges. */}

      {/* AGENT_C_MONTH_SUMMARY_SECTION */}
      <MonthSummaryTable />
    </div>
  );
};

const PerformancePage = () => <PerformanceContent />;

export default PerformancePage;
