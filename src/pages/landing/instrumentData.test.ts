import { describe, expect, it } from 'vitest';
import { generateMockData, toSnapshots } from '@/lib/mockData';
import {
  DEMO_SOURCES,
  DISPLAY_CURRENCIES,
  LAST_MONTH,
  RESTING_MONTH,
  buildInstrument,
  eurValue,
  money,
  relativeMonth,
  yOf,
} from './instrumentData';

describe('hero instrument data', () => {
  it('matches the demo portfolio month by month in EUR', () => {
    const snaps = toSnapshots(generateMockData());
    expect(snaps).toHaveLength(LAST_MONTH + 1);
    snaps.forEach((snap, m) => {
      for (const src of DEMO_SOURCES) {
        const demo = snap.sources.find((s) => s.name === src.id)!;
        expect(eurValue(src, m)).toBe(demo.value);
      }
    });
  });

  it('shows the demo total in EUR for the latest month', () => {
    expect(money(buildInstrument(LAST_MONTH, 'EUR').total, 'EUR')).toBe('€132,955');
  });

  it.each(DISPLAY_CURRENCIES)('adds up exactly in %s', (ccy) => {
    for (const m of [RESTING_MONTH, LAST_MONTH]) {
      const inst = buildInstrument(m, ccy);
      expect(inst.total).toBe(inst.rows.reduce((s, r) => s + r.value, 0));
      expect(Number.isInteger(inst.total)).toBe(true);
    }
  });

  it('keeps the latest point still when the display currency changes', () => {
    const eur = buildInstrument(LAST_MONTH, 'EUR');
    const usd = buildInstrument(LAST_MONTH, 'USD');
    const last = (i: typeof eur) => i.history[i.history.length - 1].value;
    // Within a thousandth of a pixel: the held-in rows are rounded to cents.
    expect(yOf(last(usd), 'USD')).toBeCloseTo(yOf(last(eur), 'EUR'), 3);
    // ...while earlier months move, because each is valued at its own rate.
    expect(Math.abs(yOf(usd.history[0].value, 'USD') - yOf(eur.history[0].value, 'EUR'))).toBeGreaterThan(0.5);
  });

  it('holds the non-EUR rows at their native amount in their own currency', () => {
    const usd = buildInstrument(LAST_MONTH, 'USD');
    const etf = usd.rows.find((r) => r.id === 'ETF World')!;
    expect(etf.heldIn).toBe('USD');
    expect(etf.value).toBeGreaterThan(buildInstrument(LAST_MONTH, 'EUR').rows.find((r) => r.id === 'ETF World')!.value);
  });

  it('builds a 12-month forecast from the latest month', () => {
    const inst = buildInstrument(RESTING_MONTH, 'EUR');
    expect(inst.forecast).toHaveLength(12);
    expect(inst.forecast[0].month).toBe(RESTING_MONTH + 1);
    inst.forecast.forEach((f) => expect(f.lower).toBeLessThanOrEqual(f.upper));
  });

  it('labels months relative to the latest one', () => {
    expect(relativeMonth(42, 42)).toBe('Latest');
    expect(relativeMonth(41, 42)).toBe('1 month ago');
    expect(relativeMonth(30, 42)).toBe('1 year ago');
    expect(relativeMonth(18, 42)).toBe('2 years ago');
    expect(relativeMonth(45, 42)).toBe('In 3 months');
  });
});
