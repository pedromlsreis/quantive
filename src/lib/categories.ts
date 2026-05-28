/**
 * @module categories
 * Canonical source categories. Describe the *kind of account/platform* a
 * source is, not the asset class held inside it — a brokerage holds equities,
 * ETFs and bonds at once, so asset-class labels can't honestly apply at source
 * level. Surfaced as a dropdown in the UI; stored as a loose `string` on
 * RefSource so legacy blobs with retired labels still load.
 */

export const SOURCE_CATEGORIES = [
  'Bank',
  'Savings',
  'Brokerage',
  'Crypto',
  'Pension',
  'Real estate',
  'P2P & crowdfunding',
  'Insurance & capitalisation',
  'Alternative',
  'Liability',
  'Other',
] as const;

export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];
