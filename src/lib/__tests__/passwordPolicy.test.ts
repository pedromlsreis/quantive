import { describe, it, expect } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_LENGTH_HINT,
  passwordTooShort,
} from '@/lib/passwordPolicy';

// Client-side security floor. The boundary must be exact: exactly
// PASSWORD_MIN_LENGTH passes, one char short fails.
describe('passwordTooShort', () => {
  it('rejects a password one character below the minimum', () => {
    expect(passwordTooShort('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(true);
  });

  it('accepts a password of exactly the minimum length (boundary)', () => {
    expect(passwordTooShort('a'.repeat(PASSWORD_MIN_LENGTH))).toBe(false);
  });

  it('accepts a password longer than the minimum', () => {
    expect(passwordTooShort('a'.repeat(PASSWORD_MIN_LENGTH + 20))).toBe(false);
  });

  it('rejects an empty password', () => {
    expect(passwordTooShort('')).toBe(true);
  });

  it('counts every character including whitespace (no trimming)', () => {
    // Spaces are valid passphrase characters; the gate must not strip them.
    const padded = ' '.repeat(PASSWORD_MIN_LENGTH);
    expect(padded.length).toBe(PASSWORD_MIN_LENGTH);
    expect(passwordTooShort(padded)).toBe(false);
  });

  it('counts by code unit, matching String.length (not graphemes)', () => {
    const emoji = '😀'.repeat(PASSWORD_MIN_LENGTH);
    expect(passwordTooShort(emoji)).toBe(false);
  });
});

describe('PASSWORD_LENGTH_HINT', () => {
  it('embeds the canonical minimum so UI copy can never drift from the gate', () => {
    expect(PASSWORD_LENGTH_HINT).toContain(String(PASSWORD_MIN_LENGTH));
  });
});
