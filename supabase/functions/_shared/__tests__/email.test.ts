import { describe, it, expect, vi } from 'vitest';

// The email module reads Deno.env at request time. Stub the global before
// import so the module loads cleanly under vitest.
vi.stubGlobal('Deno', {
  env: {
    get: () => undefined,
  },
});

import { sanitizeSubject, escapeHtml } from '../email';

describe('sanitizeSubject', () => {
  it('passes plain ASCII subjects through unchanged', () => {
    expect(sanitizeSubject('[Feedback · bug] short message')).toBe('[Feedback · bug] short message');
  });

  it('replaces LF with a space (the original Resend 422 trigger)', () => {
    expect(sanitizeSubject('Hello\nworld')).toBe('Hello world');
  });

  it('replaces CRLF with a single space', () => {
    expect(sanitizeSubject('Hello\r\nworld')).toBe('Hello world');
  });

  it('replaces tabs with a space', () => {
    expect(sanitizeSubject('A\tB')).toBe('A B');
  });

  it('collapses runs of whitespace from consecutive separators', () => {
    expect(sanitizeSubject('Hello\n\n\nworld')).toBe('Hello world');
    expect(sanitizeSubject('A\r\n\tB')).toBe('A B');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeSubject('  hello  ')).toBe('hello');
    expect(sanitizeSubject('\nhello\n')).toBe('hello');
  });

  it('caps subjects at 200 characters with an ellipsis', () => {
    const long = 'x'.repeat(500);
    const result = sanitizeSubject(long);
    expect(result.length).toBe(200);
    expect(result.endsWith('...')).toBe(true);
  });

  it('leaves subjects of exactly 200 characters untouched', () => {
    const exact = 'x'.repeat(200);
    expect(sanitizeSubject(exact)).toBe(exact);
  });

  it('returns an empty string when given only whitespace', () => {
    expect(sanitizeSubject('   \n\t  ')).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes the three HTML-significant characters', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert("x")&lt;/script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('leaves plain text alone', () => {
    expect(escapeHtml('Pedro reis 2024')).toBe('Pedro reis 2024');
  });

  it('handles ampersand-first to avoid double-encoding', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});
