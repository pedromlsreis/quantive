import { useMemo, useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useFormat } from '@/hooks/useFormat';
import { ForecastChart } from '@/components/dashboard/ForecastChart';
import { generateScenarioForecast, historicalPace, PACE_MIN_MONTHS, projectionHistory } from '@/lib/scenarioForecast';
import { PageSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { RouteEmpty } from '@/components/dashboard/EmptyState';
import { ProGate } from '@/components/billing/UpsellCard';
import { QTabs } from '@/components/ui/q-tabs';
import { formatDate, monthYear, roundSig3 } from '@/lib/formatters';

type Rate = 'pace' | '5' | '7.2' | '10';
type Horizon = '1' | '3' | '5';

const FIXED: Record<Exclude<Rate, 'pace'>, number> = { '5': 0.05, '7.2': 0.072, '10': 0.1 };
const HORIZONS: { value: Horizon; label: string }[] = [
  { value: '1', label: '1 year' },
  { value: '3', label: '3 years' },
  { value: '5', label: '5 years' },
];

const ForecastPage = () => {
  const { data, isLoading, allSnapshots } = usePortfolio();
  const { has } = useEntitlements();
  const f = useFormat();
  const history = useMemo(() => projectionHistory(allSnapshots), [allSnapshots]);
  // The same function feeds the overview's "in 5 years at your pace".
  const pace = useMemo(() => historicalPace(history), [history]);
  // Null until the user picks one, so "Your pace" becomes the default as soon
  // as a year of entries has decrypted.
  const [rate, setRate] = useState<Rate | null>(null);
  const [horizon, setHorizon] = useState<Horizon>('5');
  const [showTable, setShowTable] = useState(false);

  const chosen: Rate = rate ?? (pace ? 'pace' : '5');
  const effectiveRate: Rate = chosen === 'pace' && !pace ? '5' : chosen;
  const annual = effectiveRate === 'pace' ? pace!.rate : FIXED[effectiveRate];
  const points = useMemo(
    () => generateScenarioForecast(history, Number(horizon) * 12, annual),
    [history, horizon, annual],
  );

  if (isLoading) return <PageSkeleton />;
  if (!data) return <RouteEmpty title="Forecast" sentence="A projection from your own growth rate. It needs two months of entries." />;

  const head = (
    <header className="q-page-head">
      <h1 className="q-h1" tabIndex={-1}>Forecast</h1>
      <p className="q-page-lede">
        {effectiveRate === 'pace' && pace
          ? `Continues your average growth since ${monthYear(pace.since)}, new savings included.`
          : `Compounds today's total at ${effectiveRate}% a year, with no new savings.`}
      </p>
    </header>
  );

  if (!has('forecasting')) {
    const fiveYears = pace ? generateScenarioForecast(history, 60, pace.rate).at(-1)?.forecast : undefined;
    return (
      <div>
        <header className="q-page-head">
          <h1 className="q-h1" tabIndex={-1}>Forecast</h1>
          {pace && fiveYears != null && (
            <p className="q-page-lede">
              {`At your pace so far (${f.pct(pace.rate * 100)} a year), net worth reaches about ${f.money(roundSig3(fiveYears))} in 5 years.`}
            </p>
          )}
        </header>
        <ProGate feature="forecasting" />
      </div>
    );
  }

  if (history.length < 2 || !points.length) {
    return (
      <div>
        {head}
        <p className="q-body">A forecast needs two entries. Next month, your values will be pre-filled.</p>
      </div>
    );
  }

  const end = points[points.length - 1];
  const rateOptions: { value: Rate; label: string; disabled?: boolean; hint?: string }[] = [
    {
      value: 'pace',
      label: pace ? `Your pace ${f.pct(pace.rate * 100)}` : 'Your pace',
      disabled: !pace,
      hint: `Needs ${PACE_MIN_MONTHS} months of entries`,
    },
    { value: '5', label: '5%' },
    { value: '7.2', label: '7.2%' },
    { value: '10', label: '10%' },
  ];
  const yearEnds = points.filter((p, i) => (i + 1) % 12 === 0);

  return (
    <div>
      {head}
      <section className="q-sec" aria-labelledby="fc-title">
        <div className="q-chart-head">
          <h2 className="q-h2" id="fc-title">Projection</h2>
          <div className="q-tab-groups">
            <QTabs<Rate> value={effectiveRate} onChange={setRate} options={rateOptions} size="sm" ariaLabel="Growth rate" />
            <QTabs<Horizon> value={horizon} onChange={setHorizon} options={HORIZONS} size="sm" ariaLabel="Horizon" />
          </div>
        </div>
        <p className="q-chart-readout">
          {`In ${horizon === '1' ? '1 year' : `${horizon} years`}: central `}
          <span className="q-chart-readout-val num">{f.money(roundSig3(end.forecast))}</span>
          {', range '}
          <span className="num">{f.money(roundSig3(end.lower))}</span>
          {' to '}
          <span className="num">{f.money(roundSig3(end.upper))}</span>.
        </p>

        {showTable ? (
          <table className="q-table">
            <caption className="sr-only">Projected net worth at each year end</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="num">Lower</th>
                <th scope="col" className="num">Central</th>
                <th scope="col" className="num">Upper</th>
              </tr>
            </thead>
            <tbody>
              {yearEnds.map((p) => (
                <tr key={p.date.getTime()}>
                  <td>{formatDate(p.date)}</td>
                  <td className="num" style={{ color: 'var(--fg-muted)' }}>{f.money(roundSig3(p.lower))}</td>
                  <td className="num">{f.money(roundSig3(p.forecast))}</td>
                  <td className="num" style={{ color: 'var(--fg-muted)' }}>{f.money(roundSig3(p.upper))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ForecastChart history={history} points={points} />
        )}

        <div className="q-chart-foot">
          <span>Shaded range: how far your entries have strayed from your trend, widening with time.</span>
          <button type="button" className="q-link-btn" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)} style={{ fontSize: 12 }}>
            {showTable ? 'Show chart' : 'Show table'}
          </button>
        </div>
      </section>
    </div>
  );
};

export default ForecastPage;
