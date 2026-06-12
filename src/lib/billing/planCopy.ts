// Shared marketing copy for the Free and Pro plan cards — the single source
// of truth for the two surfaces that render them: the landing pricing section
// (static teaser) and PricingPage (live checkout). Phrasing changes happen
// here so the two surfaces cannot drift; layout and checkout chrome stay in
// the components. Billing data (Stripe IDs, prices, entitlements) lives in
// plans.ts, not here.
//
// The JSON-LD "offers" descriptions in index.html summarise these lists and
// are a manual mirror (static HTML cannot import TypeScript) — update them
// when a bullet changes materially.

import { CURRENCY_CODES } from '@/lib/currencies';

export interface PlanCopySection {
  /** Small uppercase group label rendered above the ticked items. */
  head: string;
  items: string[];
}

export const PRICING_HEADLINE = '€0 forever, or €90 a year';
export const PRICING_SUB = 'The free tier is permanent, not a trial.';

export const VAT_NOTE =
  'All prices final. No VAT charged under German legislation (§ 19 UStG).';

export const FREE_SECTIONS: PlanCopySection[] = [
  {
    head: 'Everyday tracking',
    items: [
      'Net worth tracking with unlimited sources',
      'Allocation charts (volatility & liquidity)',
      `Multi-currency display (${CURRENCY_CODES.length} currencies)`,
      'Spreadsheet import',
      'Manual balance entry',
      'Rolling 12-month history view',
    ],
  },
  {
    head: 'Privacy & control',
    items: [
      'End-to-end encrypted: only you can read your data',
      'Privacy mode to blur sensitive numbers',
      'Delete your account and data at any time',
    ],
  },
];

export const PRO_SECTIONS: PlanCopySection[] = [
  {
    head: "Know if you're on track",
    items: [
      'Full historical view: every snapshot since you started, charted and tabular',
      'Forecasting engine: CAGR projection with 95% confidence intervals',
      'Milestone & goal tracking',
      'Benchmark comparison (S&P 500 and inflation)',
      'Month-by-month summary table',
    ],
  },
  {
    head: 'Get your data out',
    items: [
      'Excel/CSV export',
      'PDF wealth report: one-page summary for advisors or annual review',
    ],
  },
  {
    head: 'Support',
    items: ['Priority support (24h response)'],
  },
];
