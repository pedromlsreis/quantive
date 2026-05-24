import { describe, it, expect } from 'vitest';
import { mapAuthError } from '../authError';

// `mapAuthError` is the user-facing translation layer for raw GoTrue messages.
// We pin the canonical input -> output mapping per branch so a copy edit in
// one spot can't accidentally change another. Substring matching (not exact
// equality) lets these tests survive minor wording drift upstream.

describe('mapAuthError', () => {
  const GENERIC = 'Something went wrong. Please try again.';

  describe('falsy / empty input', () => {
    it.each<[unknown, string]>([
      [null, GENERIC],
      [undefined, GENERIC],
      ['', GENERIC],
    ])('returns the generic message for %p', (input, expected) => {
      expect(mapAuthError(input as string | null | undefined)).toBe(expected);
    });
  });

  describe('credential errors', () => {
    it('matches "Invalid login credentials" (case-insensitive)', () => {
      expect(mapAuthError('Invalid login credentials')).toMatch(/didn.?t match/i);
      expect(mapAuthError('invalid login credentials')).toMatch(/didn.?t match/i);
      expect(mapAuthError('INVALID LOGIN CREDENTIALS')).toMatch(/didn.?t match/i);
    });

    it('also matches when GoTrue embeds the phrase in a longer string', () => {
      expect(mapAuthError('AuthApiError: Invalid login credentials.')).toMatch(/didn.?t match/i);
    });

    it('user not found maps to its own copy', () => {
      expect(mapAuthError('user not found')).toMatch(/couldn.?t find an account/i);
    });
  });

  describe('email confirmation + duplicates', () => {
    it('"Email not confirmed" -> ask the user to confirm', () => {
      expect(mapAuthError('Email not confirmed')).toMatch(/confirm your email/i);
    });

    it('"User already registered" -> ask the user to sign in', () => {
      expect(mapAuthError('User already registered')).toMatch(/already exists/i);
    });

    it('"already been registered" variant maps to the same copy', () => {
      expect(mapAuthError('User has already been registered')).toMatch(/already exists/i);
    });
  });

  describe('rate limits + cooldowns', () => {
    it('plain "email rate limit exceeded" matches', () => {
      expect(mapAuthError('Email rate limit exceeded')).toMatch(/too many emails/i);
    });

    it('Supabase error code "over_email_send_rate_limit" matches', () => {
      expect(mapAuthError('over_email_send_rate_limit')).toMatch(/too many emails/i);
    });

    it('"For security purposes" rate-limit hint maps to a generic wait', () => {
      expect(mapAuthError('For security purposes, you can only request this after 23 seconds')).toMatch(/wait a moment/i);
    });

    it('"only request this" alone is enough to trigger the wait copy', () => {
      expect(mapAuthError('please only request this every minute')).toMatch(/wait a moment/i);
    });
  });

  describe('password validation', () => {
    it('"Password should be at least N characters" maps to the length hint', () => {
      expect(mapAuthError('Password should be at least 6 characters')).toMatch(/at least 10/i);
    });

    it('Supabase v2 "weak_password" maps to the same copy', () => {
      expect(mapAuthError('weak_password')).toMatch(/at least 10/i);
    });

    it('"New password should be different" -> dedicated copy', () => {
      expect(mapAuthError('New password should be different from the old password')).toMatch(/different/i);
    });
  });

  describe('email format', () => {
    it.each([
      'Unable to validate email address: invalid format',
      'Invalid email',
      'invalid format',
    ])('treats %p as a malformed email', (raw) => {
      expect(mapAuthError(raw)).toMatch(/doesn.?t look like a valid email/i);
    });
  });

  describe('expired or invalid tokens', () => {
    it.each([
      'Token has expired',
      'Invalid token',
      'Email link is expired or is invalid',
    ])('treats %p as an expired link', (raw) => {
      expect(mapAuthError(raw)).toMatch(/link has expired/i);
    });
  });

  describe('signup disabled', () => {
    it.each(['Signup is disabled', 'Signups not allowed for this instance'])('detects %p', (raw) => {
      expect(mapAuthError(raw)).toMatch(/temporarily disabled/i);
    });
  });

  describe('network failures', () => {
    it.each(['Network error', 'fetch failed', 'TypeError: Failed to fetch'])('treats %p as a connectivity issue', (raw) => {
      expect(mapAuthError(raw)).toMatch(/couldn.?t reach the server/i);
    });
  });

  it('returns the generic fallback for an unknown raw error', () => {
    expect(mapAuthError('something exotic that GoTrue never says')).toBe(GENERIC);
  });

  it('matches the FIRST branch when input could match multiple — credentials win over rate-limit', () => {
    // Defensive check: a single error string could in theory contain multiple
    // matched substrings. The implementation falls through the branches in
    // order, so the FIRST branch wins. Lock that order so future reshuffles
    // don't silently change user-facing copy.
    const credFirst = 'Invalid login credentials — email rate limit exceeded';
    expect(mapAuthError(credFirst)).toMatch(/didn.?t match/i);
  });
});
