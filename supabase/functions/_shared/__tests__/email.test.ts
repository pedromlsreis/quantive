import { describe, it, expect, vi } from 'vitest';

// The email module reads Deno.env at request time. Stub the global before
// import so the module loads cleanly under vitest.
vi.stubGlobal('Deno', {
  env: {
    get: () => undefined,
  },
});

import { sanitizeSubject, escapeHtml, brandedEmailHtml } from '../email';

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

describe('brandedEmailHtml', () => {
  it('escapes the heading to defeat HTML injection', () => {
    const html = brandedEmailHtml({ heading: '<script>x</script>', bodyHtml: '<p>hi</p>' });
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>x</script>');
  });

  it('embeds the bodyHtml verbatim (caller is trusted)', () => {
    const html = brandedEmailHtml({ heading: 'Welcome', bodyHtml: '<p>Hello <strong>world</strong></p>' });
    expect(html).toContain('<p>Hello <strong>world</strong></p>');
  });

  it('includes the brand mark and wordmark by default', () => {
    const html = brandedEmailHtml({ heading: 'Welcome', bodyHtml: '<p>x</p>' });
    expect(html).toContain('https://usequantive.app/logo.png');
    expect(html).toContain('alt="Quantive"');
    expect(html).toContain('>Quantive<');
  });

  it('uses a default footer with the usequantive.app link', () => {
    const html = brandedEmailHtml({ heading: 'Welcome', bodyHtml: '<p>x</p>' });
    expect(html).toContain('usequantive.app');
    expect(html).toContain('hello@usequantive.app');
  });

  it('allows the footer to be overridden', () => {
    const html = brandedEmailHtml({ heading: 'Welcome', bodyHtml: '<p>x</p>', footerHtml: 'custom footer' });
    expect(html).toContain('custom footer');
    expect(html).not.toContain('hello@usequantive.app');
  });

  it('is wrapped in a DOCTYPE so email clients render in standards mode', () => {
    const html = brandedEmailHtml({ heading: 'x', bodyHtml: 'y' });
    expect(html.trimStart().toLowerCase().startsWith('<!doctype html>')).toBe(true);
  });
});
