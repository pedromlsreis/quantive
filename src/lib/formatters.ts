/**
 * @module formatters
 * Formatting utilities for currencies, percentages, numbers and dates.
 *
 * `money`, `pct`, `tone` and the date helpers below are the single path every
 * in-app figure goes through, so separators, signs and suffixes agree across
 * a screen. The older `formatCurrency`/`formatFullCurrency`/... exports remain
 * for callers not yet migrated (PDF report, tests).
 */

import type { CurrencyCode } from '@/contexts/CurrencyContext';

/** Configuration for a supported currency. */
export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  locale: string;
}

// Non-finite (NaN/Infinity) means upstream couldn't resolve a value — typically
// a missing FX rate. Render an em-dash so the gap is visible rather than
// silently showing "NaN" or a misleading zero.
const MISSING = '—';

/**
 * Format a number as abbreviated currency (e.g. €12.3k, $1.2M).
 * The symbol is whatever the CurrencyContext entry says — Nordic codes
 * (NOK/SEK/DKK) render as their ISO code so "kr" doesn't become ambiguous,
 * and CAD/AUD use country-prefixed dollar signs (CA$/A$).
 */
export function formatCurrency(value: number, symbol: string): string {
  if (!Number.isFinite(value)) return MISSING;
  if (Math.abs(value) >= 1_000_000) {
    return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${symbol}${(value / 1_000).toFixed(1)}k`;
  }
  return `${symbol}${value.toFixed(0)}`;
}

/**
 * Format a number as full Intl-formatted currency (e.g. €12,345.67, ¥1,234).
 * Uses the browser's Intl.NumberFormat for locale-correct output. We do NOT
 * pin min/max fraction digits — Intl picks currency-appropriate defaults
 * (2 for EUR/USD/etc., 0 for JPY, 3 for KWD/BHD if we ever add them).
 */
export function formatFullCurrency(value: number, code: CurrencyCode, locale: string): string {
  if (!Number.isFinite(value)) return MISSING;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
  }).format(value);
}

/**
 * Format a number as a percentage with sign (e.g. "+5.2%", "-3.1%").
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return MISSING;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Format a number with abbreviated suffixes (e.g. 1.2M, 45.3k).
 * No currency symbol — use for axis labels and raw numeric display.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return MISSING;
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return value.toFixed(0);
}

/** Compact a scaled value for a badge: at most one decimal, trailing ".0" dropped. */
function compact(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/**
 * Format a milestone badge label (e.g. €100k, $1.2M). Round values stay clean
 * (€1M, not €1.0M); non-round user-entered milestones are shortened to one
 * decimal rather than rendering a long tail (€1.234567M).
 */
export function formatMilestone(value: number, symbol: string): string {
  if (!Number.isFinite(value)) return MISSING;
  if (value >= 1_000_000) return `${symbol}${compact(value / 1_000_000)}M`;
  if (value >= 1_000) return `${symbol}${compact(value / 1_000)}k`;
  return `${symbol}${value}`;
}

// ── Unified API ─────────────────────────────────────────────

/** Locale + currency every figure on screen is formatted with. */
export interface FmtCtx {
  currency: CurrencyCode;
  locale: string;
}

const MINUS = '\u2212';

// Intl emits a hyphen-minus; the typographic minus lines up with "+" in
// tabular columns and is in the loaded JetBrains Mono subset.
function join(parts: Intl.NumberFormatPart[]): string {
  return parts.map((p) => (p.type === 'minusSign' ? MINUS : p.value)).join('');
}

/** Normalises -0 so a value that rounds to zero never renders as "−0". */
function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f || 0;
}

const COMPACT_TIERS = [
  { size: 1e9, suffix: 'bn' },
  { size: 1e6, suffix: 'm' },
  { size: 1e3, suffix: 'k' },
] as const;

// ≤3 significant figures: 132k, 72.2k, 1.23m. Returns the scaled value and
// suffix, promoting to the next tier when rounding reaches 1000 (999.6k → 1m).
function compactParts(v: number): { scaled: number; decimals: number; suffix: string } {
  let tier = COMPACT_TIERS.findIndex((t) => Math.abs(v) >= t.size);
  if (tier === -1) return { scaled: roundTo(v, 0), decimals: 0, suffix: '' };
  for (;;) {
    const { size, suffix } = COMPACT_TIERS[tier];
    const s = v / size;
    const decimals = Math.abs(s) >= 100 ? 0 : Math.abs(s) >= 10 ? 1 : 2;
    const scaled = roundTo(s, decimals);
    if (Math.abs(scaled) >= 1000 && tier > 0) {
      tier -= 1;
      continue;
    }
    return { scaled, decimals, suffix };
  }
}

export interface MoneyOptions {
  /** Prefix "+" on gains; losses always carry "−". Zero stays unsigned. */
  signed?: boolean;
  /** 72.2k / 1.23m. For axis ticks, tiles, end labels and projections only. */
  compact?: boolean;
  /** Keep the currency's minor units (composer rows, measurement history). */
  cents?: boolean;
}

/**
 * Money in the effective locale: `€132,955`, `−€1,690`, `€72.2k` (en-GB);
 * `132.955 €`, `72,2k €` (de-DE). Whole units unless `cents`.
 */
export function money(v: number, ctx: FmtCtx, opts: MoneyOptions = {}): string {
  if (!Number.isFinite(v)) return MISSING;
  const { signed = false, compact = false, cents = false } = opts;
  const signDisplay = signed ? 'exceptZero' : 'auto';

  if (compact) {
    const { scaled, decimals, suffix } = compactParts(v);
    const parts = new Intl.NumberFormat(ctx.locale, {
      style: 'currency',
      currency: ctx.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
      signDisplay,
    }).formatToParts(scaled);
    if (!suffix) return join(parts);
    // The suffix follows the digits, wherever the locale puts the symbol.
    let last = -1;
    parts.forEach((p, i) => { if (p.type === 'integer' || p.type === 'fraction') last = i; });
    parts.splice(last + 1, 0, { type: 'literal', value: suffix });
    return join(parts);
  }

  const nf = new Intl.NumberFormat(ctx.locale, {
    style: 'currency',
    currency: ctx.currency,
    signDisplay,
    ...(cents ? {} : { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  });
  const digits = nf.resolvedOptions().maximumFractionDigits ?? 0;
  return join(nf.formatToParts(roundTo(v, digits)));
}

/** Percent from percent units (4.2 → "4.2%"), one decimal: `+0.4%`, `−1.3%`, `0.0%`. */
export function pct(v: number, ctx: Pick<FmtCtx, 'locale'>, opts: { signed?: boolean } = {}): string {
  if (!Number.isFinite(v)) return MISSING;
  return join(new Intl.NumberFormat(ctx.locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: opts.signed ? 'exceptZero' : 'auto',
  }).formatToParts(roundTo(v, 1) / 100));
}

/** Axis tick money: always compact. */
export function axisMoney(v: number, ctx: FmtCtx): string {
  return money(v, ctx, { compact: true });
}

export type Tone = 'pos' | 'neg' | 'zero';

/** Direction of a change as displayed: a value that rounds to zero is neutral. */
export function tone(v: number, decimals = 0): Tone {
  if (!Number.isFinite(v)) return 'zero';
  const r = roundTo(v, decimals);
  return r > 0 ? 'pos' : r < 0 ? 'neg' : 'zero';
}

// Dates are UI text, so they follow the product's English (en-GB) copy rather
// than the number locale. Our own table avoids ICU's en-GB "Sept".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `28 Sep 2026` */
export function formatDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `28 Sep` — same year as `now`, otherwise the full date. */
export function formatDateShort(d: Date, now: Date = new Date()): string {
  return d.getFullYear() === now.getFullYear() ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : formatDate(d);
}

/** `Sep 2026` */
export function monthYear(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Axis month: `Sep`, or `Jan 2027` where the year should be shown. */
export function axisMonth(d: Date, withYear: boolean): string {
  return withYear ? monthYear(d) : MONTHS[d.getMonth()];
}

function calendarDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** `today`, `yesterday`, `27 days ago`, `3 months ago`, `2 years ago`. */
export function ago(d: Date, now: Date = new Date()): string {
  const days = calendarDays(d, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months ago`;
  return `${Math.floor(months / 12)} years ago`;
}

/** Whole calendar days between two dates (0 for the same day). */
export function daysBetween(from: Date, to: Date): number {
  return calendarDays(from, to);
}

/** `12 days`, `3 months`, `1 year, 2 months` */
export function duration(days: number): string {
  if (!Number.isFinite(days) || days < 0) return MISSING;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const months = Math.round(days / 30.44);
  if (months < 1) return plural(Math.round(days), 'day');
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return plural(rest, 'month');
  return rest === 0 ? plural(years, 'year') : `${plural(years, 'year')}, ${plural(rest, 'month')}`;
}

/**
 * Whole-unit money split around the digits, so a display figure can set the
 * currency symbol smaller wherever the locale puts it: `€` + `132,955`, or
 * `132.955` + ` €`. The sign is separate so it stays full size.
 */
export function moneyParts(v: number, ctx: FmtCtx): { sign: string; before: string; number: string; after: string } {
  if (!Number.isFinite(v)) return { sign: '', before: '', number: MISSING, after: '' };
  const parts = new Intl.NumberFormat(ctx.locale, {
    style: 'currency', currency: ctx.currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).formatToParts(roundTo(v, 0));
  const sign = parts.some((p) => p.type === 'minusSign') ? MINUS : '';
  const rest = parts.filter((p) => p.type !== 'minusSign');
  const isDigit = (p: Intl.NumberFormatPart) =>
    p.type === 'integer' || p.type === 'group' || p.type === 'decimal' || p.type === 'fraction';
  const first = rest.findIndex(isDigit);
  let last = first;
  rest.forEach((p, i) => { if (isDigit(p)) last = i; });
  return {
    sign,
    before: join(rest.slice(0, first)),
    number: join(rest.slice(first, last + 1)),
    after: join(rest.slice(last + 1)),
  };
}

/** Rounds to three significant figures: a projection is an estimate. */
export function roundSig3(v: number): number {
  if (!Number.isFinite(v) || v === 0) return v;
  const mag = 10 ** (Math.floor(Math.log10(Math.abs(v))) - 2);
  return Math.round(v / mag) * mag;
}
