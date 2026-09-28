// Pure data for the landing hero instrument: the demo portfolio's values, an
// illustrative exchange-rate path, and everything the table, chart and
// readouts render. No clock, media query or DOM reads: the prerendered HTML,
// the first client render and every no-motion state must be byte-identical.

import { generateForecast } from '@/lib/forecast';

export type DisplayCurrency = 'EUR' | 'GBP' | 'USD' | 'CHF';
export const DISPLAY_CURRENCIES: DisplayCurrency[] = ['EUR', 'GBP', 'USD', 'CHF'];

const SYMBOL: Record<DisplayCurrency, string> = { EUR: '€', GBP: '£', USD: '$', CHF: 'CHF ' };

/** Months 0..LAST_MONTH, mirroring generateMockData() (42 months back to now). */
export const LAST_MONTH = 42;
/** The resting state shows the month before the latest; the latest "arrives" once. */
export const RESTING_MONTH = LAST_MONTH - 1;
export const FORECAST_MONTHS = 12;

interface DemoSource {
  /** Name in src/lib/mockData.ts; the per-source maths below must match it. */
  id: string;
  label: string;
  type: string;
  heldIn: DisplayCurrency;
  base: number;
  monthlyGrowth: number;
}

// Same bases and growth rates as generateMockData(); instrumentData.test.ts
// pins the EUR values to it so the hero and the demo agree on €132,955.
export const DEMO_SOURCES: DemoSource[] = [
  { id: 'Savings Account', label: 'Savings account', type: 'Savings', heldIn: 'EUR', base: 15000, monthlyGrowth: 0.002 },
  { id: 'ETF World', label: 'ETF World', type: 'Brokerage', heldIn: 'USD', base: 25000, monthlyGrowth: 0.008 },
  { id: 'ETF Bonds', label: 'ETF bonds', type: 'Brokerage', heldIn: 'EUR', base: 10000, monthlyGrowth: 0.003 },
  { id: 'Crypto BTC', label: 'Crypto (BTC)', type: 'Crypto', heldIn: 'EUR', base: 5000, monthlyGrowth: 0.02 },
  { id: 'Real Estate Fund', label: 'Real estate fund', type: 'Real estate', heldIn: 'EUR', base: 20000, monthlyGrowth: 0.005 },
  { id: 'Pension Plan', label: 'Pension plan', type: 'Pension', heldIn: 'GBP', base: 30000, monthlyGrowth: 0.004 },
];

/** EUR value of a source in a given month, exactly as generateMockData() computes it. */
export function eurValue(src: DemoSource, month: number): number {
  const noise = 1 + Math.sin(month * 1.7 + src.id.length) * 0.03;
  return Math.round(src.base * Math.pow(1 + src.monthlyGrowth, month) * noise * 100) / 100;
}

/**
 * Illustrative EUR→X rate for a month: a smooth, plausible path, not ECB data.
 * The caption says so; the app itself uses the reference rate of each date.
 */
export function fxRate(ccy: DisplayCurrency, month: number): number {
  switch (ccy) {
    case 'EUR': return 1;
    case 'USD': return round4(1.075 + 0.035 * Math.sin(month * 0.21 + 0.4) + 0.0004 * month);
    case 'GBP': return round4(0.853 + 0.017 * Math.sin(month * 0.17 + 1.1));
    case 'CHF': return round4(0.972 - 0.0011 * month + 0.011 * Math.sin(month * 0.29));
  }
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

/** Value of a source in the display currency: its native amount if it is held in that currency. */
function displayValue(src: DemoSource, month: number, ccy: DisplayCurrency): number {
  const eur = eurValue(src, month);
  if (src.heldIn === ccy) return Math.round(eur * fxRate(ccy, month) * 100) / 100;
  return eur * fxRate(ccy, month);
}

export interface InstrumentRow {
  id: string;
  label: string;
  type: string;
  heldIn: DisplayCurrency;
  value: number;
}

export interface ChartPoint {
  month: number;
  value: number;
}

export interface Instrument {
  currency: DisplayCurrency;
  latest: number;
  rows: InstrumentRow[];
  /** Sum of the displayed (rounded) rows, so the column always adds up. */
  total: number;
  delta: number;
  history: ChartPoint[];
  forecast: { month: number; forecast: number; upper: number; lower: number }[];
}

/**
 * Whole-unit row values that add up to the rounded exact total (largest
 * remainder), so the column sums on screen and the total matches the demo.
 */
function wholeRows(month: number, currency: DisplayCurrency): number[] {
  const exact = DEMO_SOURCES.map((s) => displayValue(s, month, currency));
  const floors = exact.map(Math.floor);
  let spare = Math.round(exact.reduce((a, b) => a + b, 0)) - floors.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((v, i) => [v - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of byRemainder) {
    if (spare <= 0) break;
    floors[i] += 1;
    spare -= 1;
  }
  return floors;
}

/** Everything the hero renders for one month and display currency. */
export function buildInstrument(latest: number, currency: DisplayCurrency): Instrument {
  const values = wholeRows(latest, currency);
  const rows = DEMO_SOURCES.map((s, i) => ({
    id: s.id,
    label: s.label,
    type: s.type,
    heldIn: s.heldIn,
    value: values[i],
  }));
  const total = values.reduce((sum, v) => sum + v, 0);

  const totalAt = (m: number) => DEMO_SOURCES.reduce((sum, s) => sum + displayValue(s, m, currency), 0);
  const history: ChartPoint[] = [];
  for (let m = 0; m <= latest; m++) history.push({ month: m, value: totalAt(m) });
  const prevTotal = wholeRows(latest - 1, currency).reduce((sum, v) => sum + v, 0);

  // generateForecast only reads month differences, so any fixed anchor date works.
  const anchor = (m: number) => new Date(Date.UTC(2020, m, 1));
  const forecast = generateForecast(
    history.map((p) => ({ date: anchor(p.month), total: p.value })),
    FORECAST_MONTHS,
  ).map((f, i) => ({ month: latest + i + 1, forecast: f.forecast, upper: f.upper, lower: f.lower }));

  return { currency, latest, rows, total, delta: total - prevTotal, history, forecast };
}

// ── Chart geometry ─────────────────────────────────────────────────────────

export const CHART_W = 640;
export const CHART_H = 150;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;
/** Fixed x-domain covering both states, so the arrival never rescales the axis. */
export const X_MAX = LAST_MONTH + FORECAST_MONTHS;

// The y-domain is fixed in EUR and scaled by the display currency's LATEST rate:
// the latest point holds still when you switch, and past months move by
// rate(then) / rate(latest). That is the rate-of-day mechanism made visible.
const EUR_DOMAIN = (() => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of [RESTING_MONTH, LAST_MONTH]) {
    const inst = buildInstrument(m, 'EUR');
    for (const p of inst.history) { lo = Math.min(lo, p.value); hi = Math.max(hi, p.value); }
    for (const f of inst.forecast) { lo = Math.min(lo, f.lower); hi = Math.max(hi, f.upper); }
  }
  return { lo: Math.floor(lo / 5000) * 5000, hi: Math.ceil(hi / 5000) * 5000 };
})();

export function xOf(month: number): number {
  return (month / X_MAX) * CHART_W;
}

export function yOf(value: number, currency: DisplayCurrency): number {
  const eur = value / fxRate(currency, LAST_MONTH);
  const t = (eur - EUR_DOMAIN.lo) / (EUR_DOMAIN.hi - EUR_DOMAIN.lo);
  return PAD_TOP + (1 - t) * (CHART_H - PAD_TOP - PAD_BOTTOM);
}

/** Round-number y ticks in the display currency, positioned on the anchored scale. */
export function yTicks(currency: DisplayCurrency): { value: number; y: number }[] {
  const rate = fxRate(currency, LAST_MONTH);
  const lo = EUR_DOMAIN.lo * rate;
  const hi = EUR_DOMAIN.hi * rate;
  const step = 20000;
  const out: { value: number; y: number }[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push({ value: v, y: yOf(v, currency) });
  return out;
}

// ── Formatting (fixed locale so server and client agree) ──────────────────

const GROUPED = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export function money(value: number, currency: DisplayCurrency): string {
  const sign = value < 0 ? '−' : '';
  return `${sign}${SYMBOL[currency]}${GROUPED.format(Math.abs(Math.round(value)))}`;
}

export function signedMoney(value: number, currency: DisplayCurrency): string {
  return `${value >= 0 ? '+' : '−'}${SYMBOL[currency]}${GROUPED.format(Math.abs(Math.round(value)))}`;
}

export function compactMoney(value: number, currency: DisplayCurrency): string {
  return `${SYMBOL[currency]}${Math.round(value / 1000)}k`;
}

/** "Latest", "1 month ago", "3 years ago", "In 5 months": relative, so it never goes stale. */
export function relativeMonth(month: number, latest: number): string {
  const d = month - latest;
  if (d === 0) return 'Latest';
  const n = Math.abs(d);
  const unit = n % 12 === 0 && n >= 12 ? `${n / 12} year${n === 12 ? '' : 's'}` : `${n} month${n === 1 ? '' : 's'}`;
  return d < 0 ? `${unit} ago` : `In ${unit}`;
}
