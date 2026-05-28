import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import type { Entitlement } from '@/lib/billing/plans';

const COPY: Record<Entitlement, { title: string; body: string }> = {
  'history.full': {
    title: 'Unlock your full history',
    body: 'The free plan shows the rolling last 12 months. Upgrade to see every snapshot since you started — charted and tabular.',
  },
  'forecasting': {
    title: 'Forecast where you\'re headed',
    body: 'Project your net worth forward with CAGR scenarios and a 95% confidence cone.',
  },
  'export.excel': {
    title: 'Export to Excel',
    body: 'Download your full portfolio as an .xlsx lossless workbook, ready for spreadsheets.',
  },
  'export.csv': {
    title: 'Export to CSV',
    body: 'Download your facts as a .csv file, ready for scripts, notebooks, or any spreadsheet.',
  },
  'export.pdf': {
    title: 'Wealth report PDF',
    body: 'One-page summary report for advisors or your annual review.',
  },
  'milestones': {
    title: 'Track milestones & goals',
    body: 'Set net-worth targets and see how close you are.',
  },
  'benchmarks': {
    title: 'See your full benchmark history',
    body: 'The free plan only charts the last 12 months. Upgrade to compare every snapshot you\'ve recorded against the S&P 500 and EU inflation.',
  },
  'support.priority': {
    title: 'Priority support',
    body: 'Email us and hear back within 24h.',
  },
};

export function UpsellCard({
  feature,
  compact = false,
}: {
  feature: Entitlement;
  compact?: boolean;
}) {
  const { title, body } = COPY[feature];

  return (
    <div
      className={`q-card ${compact ? 'q-card--p-md' : 'q-card--p-lg'}`}
      style={{
        borderColor: 'var(--accent)',
        background: 'var(--accent-bg, var(--surface-soft))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-3)' }}>
        <div
          style={{
            flex: '0 0 auto',
            width: 36,
            height: 36,
            borderRadius: 'var(--r-3)',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-foreground, white)',
          }}
        >
          <Sparkles className="h-4 w-4" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: 0 }}>{title}</h3>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-subtle)', margin: '4px 0 var(--s-3)' }}>
            {body}
          </p>
          <Link
            to="/pricing"
            className="q-btn q-btn--primary q-btn--sm"
            onClick={() => analytics.proGateHit({ feature })}
          >
            Upgrade to Pro
          </Link>
        </div>
      </div>
    </div>
  );
}
