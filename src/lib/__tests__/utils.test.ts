import { describe, it, expect } from 'vitest';
import { cn, sanitizeSourceName } from '@/lib/utils';

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
