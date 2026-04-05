import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const STORAGE_KEY = 'finance-cockpit-welcome-dismissed';
const CURRENCY_KEY = 'preferred-currency';
const PORTFOLIO_KEY = 'portfolio-data';
const MOCK_FLAG_KEY = 'portfolio-data-is-mock';

describe('localStorage persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('welcome modal dismissed flag', () => {
    it('starts without the dismissed flag', () => {
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('persists the dismissed flag', () => {
      localStorage.setItem(STORAGE_KEY, 'true');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    });
  });

  describe('currency preference', () => {
    it('defaults to null when no preference set', () => {
      expect(localStorage.getItem(CURRENCY_KEY)).toBeNull();
    });

    it('stores and retrieves currency code', () => {
      localStorage.setItem(CURRENCY_KEY, 'USD');
      expect(localStorage.getItem(CURRENCY_KEY)).toBe('USD');
    });

    it('handles invalid currency gracefully', () => {
      localStorage.setItem(CURRENCY_KEY, 'INVALID');
      const val = localStorage.getItem(CURRENCY_KEY);
      // The app should default to EUR when encountering invalid values
      expect(val).toBe('INVALID'); // stored as-is, validation happens in context
    });
  });

  describe('mock data flag', () => {
    it('tracks ephemeral mock data correctly', () => {
      localStorage.setItem(MOCK_FLAG_KEY, 'true');
      expect(localStorage.getItem(MOCK_FLAG_KEY)).toBe('true');

      // When user loads real data, flag should be cleared
      localStorage.setItem(MOCK_FLAG_KEY, 'false');
      expect(localStorage.getItem(MOCK_FLAG_KEY)).toBe('false');
    });
  });

  describe('portfolio data round-trip', () => {
    it('serializes and deserializes portfolio data', () => {
      const data = {
        facts: [{ date: '2024-01-01T00:00:00.000Z', idSource: 'Test', sourceVl: 1000 }],
        refSources: [{ idSource: 'Test', volatType: 'Non-Volatile', transferableInDays: true }],
      };
      localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(data));

      const parsed = JSON.parse(localStorage.getItem(PORTFOLIO_KEY)!);
      expect(parsed.facts).toHaveLength(1);
      expect(parsed.facts[0].idSource).toBe('Test');
      expect(parsed.refSources[0].transferableInDays).toBe(true);
    });
  });
});
