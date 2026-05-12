import { useMemo, useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import {
  ForecastChart,
  generateScenarioForecast,
  type ForecastScenario,
  type ForecastHorizon,
} from '@/components/dashboard/ForecastChart';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { FileUpload } from '@/components/dashboard/FileUpload';

const SCENARIO_CAGR: Record<ForecastScenario, number> = {
  conservative: 0.05,
  base:         0.072,
  optimistic:   0.10,
};

function StatCard({
  eyebrow,
  value,
  caption,
  color,
}: {
  eyebrow: string;
  value: string;
  caption: string;
  color?: string;
}) {
  return (
    <div className="q-card q-card--p-lg">
      <div className="q-metric">
        <div className="q-metric-eyebrow">{eyebrow}</div>
        <div
          className="q-metric-value q-metric-value--lg num"
          style={color ? { color } : undefined}
        >
          {value}
        </div>
        <div className="q-metric-sub">{caption}</div>
      </div>
    </div>
  );
}

const ForecastPage = () => {
  const { data, isLoading, snapshots } = usePortfolio();
  const { fmt } = useCurrencyFormatter();

  const [scenario, setScenario] = useState<ForecastScenario>('base');
  const [horizon, setHorizon] = useState<ForecastHorizon>('3');

  const fc = useMemo(
    () =>
      generateScenarioForecast(
        snapshots,
        Number(horizon) * 12,
        SCENARIO_CAGR[scenario],
      ),
    [snapshots, horizon, scenario],
  );

  if (isLoading) return <DashboardSkeleton />;
  if (!data) return <FileUpload />;

  const last = fc[fc.length - 1];
  const ready = fc.length > 0 && snapshots.length >= 3;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
          Forecast
        </h1>
        <p style={{ color: 'var(--fg-subtle)', fontSize: 14, margin: '6px 0 0' }}>
          Projected net worth based on the chosen annualised CAGR. Confidence cone widens with time.
        </p>
      </div>

      <ForecastChart
        scenario={scenario}
        horizon={horizon}
        onScenarioChange={setScenario}
        onHorizonChange={setHorizon}
      />

      {ready && (
        <div className="q-grid q-grid--3">
          <StatCard
            eyebrow={`Median in ${horizon}y`}
            value={fmt(last.forecast)}
            caption="Most likely outcome"
          />
          <StatCard
            eyebrow="90th percentile"
            value={fmt(last.upper)}
            caption="Optimistic case"
            color="var(--positive)"
          />
          <StatCard
            eyebrow="10th percentile"
            value={fmt(last.lower)}
            caption="Cautious case"
            color="var(--fg-muted)"
          />
        </div>
      )}
    </div>
  );
};

export default ForecastPage;
