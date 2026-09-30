import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { analytics } from '@/lib/analytics';
import { PRO_PRICE_LINE } from '@/lib/billing/planCopy';
import type { Entitlement } from '@/lib/billing/plans';

/** Entitlements Pro sells. The Family-only ones get their own prompt. */
export type ProFeature = Exclude<Entitlement, 'portfolios.multiple' | 'portfolios.share'>;

const COPY: Record<ProFeature, { title: string; body: string }> = {
  'history.full': {
    title: 'Your full history',
    body: 'The free plan shows your last 12 months. Pro shows your earlier entries too. Your CSV export includes all entries on both plans.',
  },
  'forecasting': {
    title: 'Scenarios and the likely range',
    body: 'Pro projects your net worth 1, 3 or 5 years out from your own growth rate, with slower and faster scenarios and a range around each.',
  },
  'export.excel': {
    title: 'Excel workbook',
    body: 'Your sources and entries in one .xlsx file.',
  },
  'export.csv': {
    title: 'CSV export',
    body: 'All your entries, on both plans.',
  },
  'export.pdf': {
    title: 'PDF report',
    body: 'A one-page summary for your records or an adviser.',
  },
  'milestones': {
    title: 'Progress for your goals',
    body: 'Pro shows how far along each goal is and the month your current pace reaches it.',
  },
  'benchmarks': {
    title: 'Your full history',
    body: 'Pro adds your earlier months to this table, the drawdown figures and the benchmark chart. Your CSV export includes all entries on both plans.',
  },
  'support.priority': {
    title: 'Priority support',
    body: 'Email us and hear back within a working day.',
  },
};

/**
 * The one Pro prompt a page may carry. A quiet block where a whole feature
 * would be (`block`), or a ruled row that extends a visible feature (`row`).
 * No icon, tint or accent border, and the action is secondary: green in the
 * app means recording data.
 */
export function ProGate({
  feature,
  variant = 'block',
  title,
  body,
}: {
  feature: ProFeature;
  variant?: 'block' | 'row';
  title?: string;
  body?: string;
}) {
  const copy = COPY[feature];

  useEffect(() => {
    analytics.proGateHit({ feature });
  }, [feature]);

  return (
    <div className={variant === 'row' ? 'q-gate q-gate--row' : 'q-gate'}>
      <div className="q-gate-text">
        <h3 className="q-gate-title">{title ?? copy.title}</h3>
        <p className="q-gate-body">{body ?? copy.body}</p>
        <p className="q-gate-price">
          <span className="q-tag">Pro</span>
          {PRO_PRICE_LINE}
        </p>
      </div>
      <Link
        to="/pricing"
        className="q-btn q-btn--secondary q-btn--md"
        onClick={() => analytics.proUpgradeClicked({ feature })}
      >
        Upgrade to Pro
      </Link>
    </div>
  );
}

/** Default FeatureGate fallback: the block form of the gate. */
export function UpsellCard({ feature }: { feature: ProFeature }) {
  return <ProGate feature={feature} />;
}
