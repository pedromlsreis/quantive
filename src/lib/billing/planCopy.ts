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
  /** Short group heading rendered above the ticked items. */
  head: string;
  items: string[];
}

export const PRICING_HEADLINE = '€0 forever, or €90 a year';
export const PRICING_SUB = 'The free plan has no time limit.';

export const VAT_NOTE =
  'All prices final. No VAT charged under German legislation (§ 19 UStG).';

export const FREE_SECTIONS: PlanCopySection[] = [
  {
    head: 'Tracking',
    items: [
      'Net worth tracking with unlimited sources',
      'Allocation by volatility and liquidity',
      `Multi-currency display (${CURRENCY_CODES.length} currencies)`,
      'Spreadsheet import',
      'Manual balance entry',
      'Rolling 12-month history view',
    ],
  },
  {
    head: 'Privacy and control',
    items: [
      'End-to-end encrypted: only you can read your data',
      'Privacy mode to blur sensitive numbers',
      'CSV export of every measurement, at any time',
      'Delete your account and data at any time',
    ],
  },
];

export const PRO_SECTIONS: PlanCopySection[] = [
  {
    head: 'History and forecast',
    items: [
      'Every month since your first entry, as charts and a table',
      'Forecast with a 95% confidence band',
      'Milestones and goals',
      'Benchmark comparison (S&P 500 and inflation)',
      'Month-by-month summary table',
    ],
  },
  {
    head: 'Export and support',
    items: [
      'Excel workbook export',
      'One-page PDF report for you or your adviser',
      'Priority support (24h response)',
    ],
  },
];
