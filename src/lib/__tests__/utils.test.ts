import { describe, it, expect } from 'vitest';
import { cn, sanitizeSourceName, parseLocalizedNumber } from '@/lib/utils';

describe('cn (class name merge)', () => {
  it('merges simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    const isHidden = false;
    expect(cn('base', isHidden && 'hidden', 'end')).toBe('base end');
  });

  it('deduplicates conflicting tailwind classes', () => {
    const result = cn('p-4', 'p-2');
    expect(result).toBe('p-2');
  });

  it('handles undefined and null inputs', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
  });

  it('handles empty call', () => {
    expect(cn()).toBe('');
  });

  it('handles array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });
});

describe('sanitizeSourceName', () => {
  it('trims leading and trailing whitespace', () => {
    expect(sanitizeSourceName('  My Bank  ').value).toBe('My Bank');
  });

  it('collapses internal whitespace', () => {
    expect(sanitizeSourceName('My  Bank   Account').value).toBe('My Bank Account');
  });

  it('accepts valid names', () => {
    expect(sanitizeSourceName('Savings 401k').error).toBeUndefined();
  });

  it('rejects empty name', () => {
    expect(sanitizeSourceName('   ').error).toBeDefined();
  });

  it('rejects names exceeding 100 characters', () => {
    expect(sanitizeSourceName('a'.repeat(101)).error).toBeDefined();
  });

  it('accepts exactly 100 characters', () => {
    expect(sanitizeSourceName('a'.repeat(100)).error).toBeUndefined();
  });

  it('rejects names with control characters', () => {
    expect(sanitizeSourceName('Bank\x00Account').error).toBeDefined();
    expect(sanitizeSourceName('Bank\nAccount').error).toBeDefined();
    expect(sanitizeSourceName('Bank\tAccount').error).toBeDefined();
  });

  it('accepts names with common punctuation', () => {
    expect(sanitizeSourceName("Pedro's 401(k) - Main").error).toBeUndefined();
  });
});

describe('parseLocalizedNumber', () => {
  const ok = (s: string) => {
    const r = parseLocalizedNumber(s);
    if (typeof r !== 'number') throw new Error(`expected ok, got error: ${r}`);
    return r;
  };
  const err = (s: string) => {
    const r = parseLocalizedNumber(s);
    if (typeof r === 'number') throw new Error(`expected error, got value: ${r}`);
    return r;
  };

  it('parses plain integers and decimals', () => {
    expect(ok('1234')).toBe(1234);
    expect(ok('1234.56')).toBe(1234.56);
    expect(ok('0')).toBe(0);
    expect(ok('')).toBe(0);
    expect(ok('   ')).toBe(0);
  });

  it('parses comma as decimal (European)', () => {
    expect(ok('1,5')).toBe(1.5);
    expect(ok('1234,56')).toBe(1234.56);
  });

  it('strips spaces as thousand separators — the original bug from feedback', () => {
    // "1 234,00" was being read as "1" before the parser rewrite.
    expect(ok('1 234,00')).toBe(1234);
    expect(ok('1 234,56')).toBe(1234.56);
    expect(ok('1 000 000')).toBe(1000000);
    // Non-breaking space too — clipboard pastes from web often include it.
    expect(ok('1 234,56')).toBe(1234.56);
  });

  it('treats a single separator with 3 trailing digits as thousand grouping', () => {
    expect(ok('1,234')).toBe(1234);
    expect(ok('1.234')).toBe(1234);
  });

  it('treats a single separator with 1-2 trailing digits as decimal', () => {
    expect(ok('1.5')).toBe(1.5);
    expect(ok('12.99')).toBe(12.99);
    expect(ok('1,5')).toBe(1.5);
  });

  it('handles mixed dot+comma separators (last one is decimal)', () => {
    expect(ok('1,234.56')).toBe(1234.56);
    expect(ok('1.234,56')).toBe(1234.56);
    expect(ok('1,000,000.50')).toBe(1000000.5);
    expect(ok('1.000.000,50')).toBe(1000000.5);
  });

  it('handles multiple same-type separators as thousand grouping', () => {
    expect(ok('1,000,000')).toBe(1000000);
    expect(ok('1.000.000')).toBe(1000000);
  });

  it('handles negative numbers', () => {
    expect(ok('-1234,56')).toBe(-1234.56);
    expect(ok('-1 234,00')).toBe(-1234);
  });

  it('rejects letters and currency symbols — currency belongs in the picker', () => {
    expect(err('1234abc')).toMatch(/numbers only/i);
    expect(err('€100')).toMatch(/numbers only/i);
    expect(err('100€')).toMatch(/numbers only/i);
    expect(err('$1,234')).toMatch(/numbers only/i);
    expect(err('abc')).toMatch(/numbers only/i);
  });

  it('rejects ambiguous malformed separator patterns', () => {
    expect(err('1.23.4')).toMatch(/separator/i);
    expect(err('1,23,4')).toMatch(/separator/i);
  });
});
