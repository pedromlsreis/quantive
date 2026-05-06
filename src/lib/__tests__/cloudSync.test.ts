import { describe, it, expect } from 'vitest';
import { isTransientError } from '@/lib/cloudSync';

describe('isTransientError', () => {
  it('returns false for null/undefined', () => {
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });

  it('returns true for fetch network failures (TypeError)', () => {
    expect(isTransientError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('returns true for HTTP 500/502/503', () => {
    expect(isTransientError({ status: 500 })).toBe(true);
    expect(isTransientError({ status: 502 })).toBe(true);
    expect(isTransientError({ status: 503 })).toBe(true);
  });

  it('returns false for HTTP 4xx', () => {
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 401 })).toBe(false);
    expect(isTransientError({ status: 403 })).toBe(false);
    expect(isTransientError({ status: 404 })).toBe(false);
    expect(isTransientError({ status: 429 })).toBe(false);
  });

  it('falls back to numeric `code` when `status` is missing', () => {
    expect(isTransientError({ code: '503' })).toBe(true);
    expect(isTransientError({ code: '404' })).toBe(false);
  });

  it('returns false for plain Error or non-HTTP objects', () => {
    expect(isTransientError(new Error('boom'))).toBe(false);
    expect(isTransientError({ message: 'boom' })).toBe(false);
    expect(isTransientError('string error')).toBe(false);
  });
});

