/**
 * @module categories
 * Canonical source categories. Mirrors the design prototype's category set
 * (`.design-reference/quantive/project/src/data.js`). User-facing free text —
 * never persisted as an enum — so adding a new entry is safe.
 */

export const SOURCE_CATEGORIES = [
  'Equity ETF',
  'Single Equity',
  'Crypto',
  'Bond ETF',
  'Cash & Savings',
  'Pension',
  'Real Estate',
  'Liability',
  'Alternative',
  'Other',
] as const;

export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];
