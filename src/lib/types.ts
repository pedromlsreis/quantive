/**
 * @module types
 * Core domain types for the Finance Cockpit application.
 * These types model the portfolio data structure from Excel ingestion
 * through enrichment and display.
 */

/** A single fact row representing a source's value on a given date. */
export interface FactRow {
  /** The date of the measurement (normalised to start of day). */
  date: Date;
  /** Identifier for the financial source (e.g. "Savings Account"). */
  idSource: string;
  /** The monetary value of the source on this date. */
  sourceVl: number;
}

/** Reference metadata for a financial source. */
export interface RefSource {
  /** Identifier matching `FactRow.idSource`. */
  idSource: string;
  /** Volatility classification (e.g. "Volatile", "Non-Volatile", "Highly Volatile"). */
  volatType: string;
  /** Whether this source can be liquidated within days. */
  transferableInDays: boolean;
}

/** The raw portfolio data structure as parsed from Excel or entered manually. */
export interface PortfolioData {
  /** All historical fact rows across all sources and dates. */
  facts: FactRow[];
  /** Reference source metadata (volatility, liquidity). */
  refSources: RefSource[];
}

/** A fact row enriched with joined reference data for display/filtering. */
export interface EnrichedFact extends FactRow {
  /** Volatility type from the matching `RefSource`. */
  volatType: string;
  /** Whether this source is liquid, derived from `RefSource.transferableInDays`. */
  isLiquid: boolean;
}

/** A single source within a date snapshot, used in charts and tables. */
export interface SourceDetail {
  /** Display name of the source. */
  name: string;
  /** Monetary value at the snapshot date. */
  value: number;
  /** Volatility classification. */
  volatType: string;
  /** Liquidity flag. */
  isLiquid: boolean;
}

/** An aggregated snapshot for a single date, grouping all sources. */
export interface Snapshot {
  /** The date of this snapshot. */
  date: Date;
  /** Sum of all source values on this date. */
  total: number;
  /** Individual source breakdowns. */
  sources: SourceDetail[];
}

/** Active filter state for the dashboard views. */
export interface FilterState {
  /** Optional date range bounds [start, end]. Null means unbounded. */
  dateRange: [Date | null, Date | null];
  /** Selected source identifiers (empty = all). */
  sources: string[];
  /** Selected volatility types (empty = all). */
  volatTypes: string[];
  /** Liquidity filter: show all, only liquid, or only non-liquid sources. */
  liquidFilter: 'all' | 'liquid' | 'non-liquid';
}

/** Key Performance Indicators computed from the latest snapshot. */
export interface KPIData {
  /** Total net worth from the most recent snapshot. */
  currentNetWorth: number;
  /** Month-over-month percentage change. */
  momChange: number;
  /** Year-over-year percentage change. */
  yoyChange: number;
  /** Net worth from one year ago (for comparison). */
  yoyNetWorth: number;
  /** Number of distinct sources in the latest snapshot. */
  sourceCount: number;
  /** Percentage of net worth in volatile assets. */
  volatilePercent: number;
  /** Percentage of net worth in liquid assets. */
  liquidPercent: number;
}
