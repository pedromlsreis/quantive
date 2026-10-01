// Shared marketing copy for the Free, Pro and Family plan cards — the single
// source of truth for the two surfaces that render them: the landing pricing
// section (static teaser) and PricingPage (live checkout). Phrasing changes happen
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

/** Short price line for in-app Pro gates. */
export const PRO_PRICE_LINE = '€9 a month or €90 a year';

/** Short price line for in-app Family prompts. */
export const FAMILY_PRICE_LINE = '€14 a month or €120 a year';

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
      // True on Free: sharing a portfolio needs Family, whose card says who
      // else can read a shared one.
      'End-to-end encrypted: only you can read your data',
      'Privacy mode to blur sensitive numbers',
      'CSV export of all your entries, at any time',
      'Delete your account and data at any time',
    ],
  },
];

export const PRO_SECTIONS: PlanCopySection[] = [
  {
    head: 'History and forecast',
    items: [
      'Every month since your first entry, as charts and a table',
      'Forecast 1, 3 or 5 years out, with a range from your own history',
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

export const FAMILY_SECTIONS: PlanCopySection[] = [
  {
    head: 'Pro for two',
    items: [
      'Everything in Pro, for you and one partner',
      'Separate accounts: each personal portfolio stays private',
    ],
  },
  {
    head: 'Shared portfolios',
    items: [
      'Up to five portfolios besides your personal one',
      'Share any of them with your partner; you both add entries and goals',
      'End-to-end encrypted: only the two of you can read a shared portfolio',
      'Restore any of the last 20 saved versions',
    ],
  },
];
