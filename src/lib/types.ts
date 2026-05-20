/**
 * @module types
 * Core domain types for the Quantive application.
 * These types model the portfolio data structure from Excel ingestion
 * through enrichment and display.
 */

import type { CurrencyCode } from '@/contexts/CurrencyContext';

/** A single fact row representing a source's value on a given date. */
export interface FactRow {
  /** The date of the measurement (normalised to start of day). */
  date: Date;
  /** Identifier for the financial source (e.g. "Savings Account"). */
  idSource: string;
  /** The monetary value of the source on this date. */
  sourceVl: number;
  /**
   * The currency in which `sourceVl` was recorded. Each fact is denominated
   * independently — a single source can hold facts in different currencies
   * over time (e.g. an account that switched currencies). Conversion happens
   * at display time via the historical fx_rates table.
   */
  currency: CurrencyCode;
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
  /**
   * Per-user goals, persisted inside the encrypted portfolio blob. Absent in
   * legacy snapshots — read as `[]` when missing.
   */
  goals?: Goal[];
}

/**
 * A net-worth milestone the user is tracking. Stored client-side inside the
 * encrypted portfolio blob — never visible to the server.
 *
 * Amounts are stored in `targetCurrency`, not the user's base currency, so a
 * base-currency switch does not require rewriting goals. Display-time
 * conversion goes through `fxConvert.ts` at the rate of the day.
 */
export interface Goal {
  /** UUID v4, generated client-side. Stable across edits. */
  id: string;
  /** Human-readable name, e.g. "Reach €100k by 2027". */
  name: string;
  /** Target amount, denominated in `targetCurrency`. */
  targetAmount: number;
  /** ISO 4217 code the target is denominated in. Defaults to the user's base at creation. */
  targetCurrency: CurrencyCode;
  /** ISO date "YYYY-MM-DD" — when the user wants to hit the target. */
  targetDate: string;
  /** ISO timestamp the goal was created. Drives the 30-day staged free-tier gate. */
  createdAt: string;
  /** Optional soft-delete timestamp. Archived goals are hidden from the active list. */
  archivedAt?: string;
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
  /** False when all sources have an unknown volatility type, making volatilePercent unreliable. */
  volatilityDataAvailable: boolean;
  /** Percentage of net worth in liquid assets. */
  liquidPercent: number;
}
