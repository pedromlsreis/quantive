/**
 * Consistency tests for the canonical currency catalog.
 *
 * These are the guardrails that make the "single source of truth" claim
 * actually hold: every code declared in CURRENCY_CODES must have a full
 * CURRENCIES entry, the SUPPORTED_CURRENCIES set must mirror it exactly, and
 * BASE_CURRENCY must be inside the supported set. They run for free on every
 * addition so a half-defined currency can't ship.
 */

import { describe, it, expect } from 'vitest';
import {
  BASE_CURRENCY,
  CURRENCIES,
  CURRENCY_CODES,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
} from '@/lib/currencies';

describe('currency catalog consistency', () => {
  it('every CURRENCY_CODES entry has a CURRENCIES record', () => {
    for (const code of CURRENCY_CODES) {
      expect(CURRENCIES[code], `Missing CURRENCIES[${code}]`).toBeDefined();
    }
  });

  it('every CURRENCIES key matches its entry.code', () => {
    for (const [key, entry] of Object.entries(CURRENCIES)) {
      expect(entry.code, `${key} entry.code mismatch`).toBe(key);
    }
  });

  it('SUPPORTED_CURRENCIES exactly mirrors CURRENCY_CODES (no drift)', () => {
    expect(SUPPORTED_CURRENCIES.size).toBe(CURRENCY_CODES.length);
    for (const code of CURRENCY_CODES) {
      expect(SUPPORTED_CURRENCIES.has(code)).toBe(true);
    }
  });

  it('BASE_CURRENCY is present in the supported set', () => {
    expect(SUPPORTED_CURRENCIES.has(BASE_CURRENCY)).toBe(true);
  });

  it.each(CURRENCY_CODES)('%s has non-empty name, symbol, and locale', (code: CurrencyCode) => {
    const c = CURRENCIES[code];
    expect(c.name.trim()).not.toBe('');
    expect(c.symbol.trim()).not.toBe('');
    // Locale must be a BCP-47 tag — minimal sanity check: contains a hyphen.
    expect(c.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
  });

  it('every CURRENCY_CODES entry is uppercase and 3 chars (ISO 4217 shape)', () => {
    for (const code of CURRENCY_CODES) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('CURRENCY_CODES has no duplicates', () => {
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
  });

  it('INR is in the catalog and properly configured', () => {
    expect(CURRENCY_CODES).toContain('INR');
    expect(CURRENCIES.INR).toEqual({
      code: 'INR',
      name: 'Indian Rupee',
      symbol: '₹',
      locale: 'en-IN',
    });
  });
});
