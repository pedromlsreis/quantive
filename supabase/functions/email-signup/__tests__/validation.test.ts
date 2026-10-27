import { describe, it, expect } from 'vitest';
import { parseEmailSignupBody } from '../validation';

const REJECTED = { ok: false, status: 400, error: 'A valid email is required' };

describe('parseEmailSignupBody', () => {
  it('accepts ordinary addresses, lowercased and trimmed', () => {
    for (const email of ['v@example.com', 'first.last+news@mail.example.org', "o'brien@xn--bcher-kva.example"]) {
      expect(parseEmailSignupBody({ email: ` ${email.toUpperCase()} ` }), email).toMatchObject({ ok: true, email });
    }
  });

  // Value: protects=the per-address send cap and the To header see one plain address per row;
  // fails_when=the shape check accepts quoted, display-name, list or trailing-dot forms again;
  // why_new=nothing tested the signup validator; seam=none; no_claim=does not fold +tags or Gmail dots
  it('rejects forms that would give one mailbox several rows or a display name', () => {
    for (const email of [
      '"v"@example.com',
      '"n"<v@example.com>',
      'v@example.com,b',
      'v@example.com;w',
      'v@example.com.',
      'v@example..com',
      'v@.example.com',
      'v@example',
      'v w@example.com',
    ]) {
      expect(parseEmailSignupBody({ email }), email).toEqual(REJECTED);
    }
  });
});
