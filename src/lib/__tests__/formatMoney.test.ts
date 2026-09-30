import { describe, it, expect } from 'vitest';
import {
  money, pct, axisMoney, tone, formatDate, formatDateShort, monthYear, axisMonth, ago, duration,
  type FmtCtx,
} from '@/lib/formatters';

const EN: FmtCtx = { currency: 'EUR', locale: 'en-GB' };
const DE: FmtCtx = { currency: 'EUR', locale: 'de-DE' };
const GBP: FmtCtx = { currency: 'GBP', locale: 'en-GB' };
const USD: FmtCtx = { currency: 'USD', locale: 'en-US' };
const JPY: FmtCtx = { currency: 'JPY', locale: 'en-GB' };
const MINUS = '−';
// Intl separates de-DE amounts with no-break spaces; compare with plain ones.
const nb = (s: string) => s.replace(/\s/g, ' ');

describe('money', () => {
  it('formats whole units in the effective locale', () => {
    expect(money(132954.73, EN)).toBe('€132,955');
    expect(money(132954.73, GBP)).toBe('£132,955');
    expect(money(132954.73, USD)).toBe('$132,955');
    expect(nb(money(132954.73, DE))).toBe('132.955 €');
  });

  it('keeps minor units only when asked', () => {
    expect(money(15823.68, EN, { cents: true })).toBe('€15,823.68');
    expect(nb(money(15823.68, DE, { cents: true }))).toBe('15.823,68 €');
    // en-GB disambiguates the yen as "JP¥"; JPY has no minor unit.
    expect(money(1234.5, JPY, { cents: true })).toBe('JP¥1,235');
  });

  it('uses the typographic minus and signs gains only when signed', () => {
    expect(money(-1689.97, EN)).toBe(`${MINUS}€1,690`);
    expect(money(-1689.97, EN, { signed: true })).toBe(`${MINUS}€1,690`);
    expect(money(590.2, EN, { signed: true })).toBe('+€590');
    expect(money(590.2, EN)).toBe('€590');
  });

  it('never renders a signed or negative zero', () => {
    expect(money(0, EN, { signed: true })).toBe('€0');
    expect(money(-0.4, EN, { signed: true })).toBe('€0');
    expect(money(-0.4, EN)).toBe('€0');
  });

  it('compacts to at most three significant figures with the suffix after the digits', () => {
    expect(money(72231, EN, { compact: true })).toBe('€72.2k');
    expect(money(132954, EN, { compact: true })).toBe('€133k');
    expect(money(1234567, EN, { compact: true })).toBe('€1.23m');
    expect(money(2_500_000_000, EN, { compact: true })).toBe('€2.5bn');
    expect(money(590, EN, { compact: true })).toBe('€590');
    expect(nb(money(72231, DE, { compact: true }))).toBe('72,2k €');
    expect(money(-1700, EN, { compact: true })).toBe(`${MINUS}€1.7k`);
  });

  it('promotes to the next tier when rounding reaches 1000', () => {
    expect(money(999_600, EN, { compact: true })).toBe('€1m');
    expect(money(120_000, EN, { compact: true })).toBe('€120k');
  });

  it('renders non-finite values as the missing glyph', () => {
    expect(money(NaN, EN)).toBe('—');
    expect(money(Infinity, EN, { compact: true })).toBe('—');
  });

  it('axisMoney is compact money', () => {
    expect(axisMoney(125000, EN)).toBe('€125k');
  });
});

describe('pct', () => {
  it('takes percent units and shows one decimal', () => {
    expect(pct(4.2, EN)).toBe('4.2%');
    expect(pct(0.44, EN, { signed: true })).toBe('+0.4%');
    expect(pct(-1.3, EN, { signed: true })).toBe(`${MINUS}1.3%`);
    expect(pct(0.03, EN, { signed: true })).toBe('0.0%');
    expect(nb(pct(0.44, DE, { signed: true }))).toBe('+0,4 %');
  });
});

describe('tone', () => {
  it('follows the rounded value', () => {
    expect(tone(590)).toBe('pos');
    expect(tone(-3)).toBe('neg');
    expect(tone(0.4)).toBe('zero');
    expect(tone(0.04, 1)).toBe('zero');
    expect(tone(0.06, 1)).toBe('pos');
    expect(tone(NaN)).toBe('zero');
  });
});

describe('dates', () => {
  const d = new Date(2026, 8, 28);
  it('formats in the product English', () => {
    expect(formatDate(d)).toBe('28 Sep 2026');
    expect(monthYear(d)).toBe('Sep 2026');
    expect(axisMonth(d, false)).toBe('Sep');
    expect(axisMonth(new Date(2027, 0, 1), true)).toBe('Jan 2027');
    expect(formatDateShort(d, new Date(2026, 11, 1))).toBe('28 Sep');
    expect(formatDateShort(d, new Date(2027, 0, 1))).toBe('28 Sep 2026');
  });

  it('ago counts calendar days, then months, then years', () => {
    const now = new Date(2026, 8, 28, 9);
    expect(ago(new Date(2026, 8, 28, 23), now)).toBe('today');
    expect(ago(new Date(2026, 8, 27), now)).toBe('yesterday');
    expect(ago(new Date(2026, 8, 1), now)).toBe('27 days ago');
    expect(ago(new Date(2026, 5, 1), now)).toBe('4 months ago');
    expect(ago(new Date(2023, 8, 1), now)).toBe('3 years ago');
  });

  it('duration reads in years and months', () => {
    expect(duration(12)).toBe('12 days');
    expect(duration(92)).toBe('3 months');
    expect(duration(365)).toBe('1 year');
    expect(duration(427)).toBe('1 year, 2 months');
  });
});

describe('moneyParts', () => {
  it('splits the currency symbol from the digits in either position', async () => {
    const { moneyParts } = await import('@/lib/formatters');
    expect(moneyParts(132954.73, EN)).toEqual({ sign: '', before: '€', number: '132,955', after: '' });
    const de = moneyParts(132954.73, DE);
    expect([de.before, de.number, nb(de.after)]).toEqual(['', '132.955', ' €']);
  });

  it('keeps the sign out of the unit', async () => {
    const { moneyParts } = await import('@/lib/formatters');
    expect(moneyParts(-1200, EN)).toEqual({ sign: MINUS, before: '€', number: '1,200', after: '' });
  });
});
