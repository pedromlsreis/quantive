import { describe, it, expect } from 'vitest';
import { urlLooksLikeRecovery } from '@/lib/recoveryUrl';

const loc = (search: string, hash: string) => ({ search, hash });

describe('urlLooksLikeRecovery', () => {
  describe('positive matches', () => {
    it('detects implicit-flow hash (type=recovery)', () => {
      expect(
        urlLooksLikeRecovery(loc('', '#access_token=abc&type=recovery&expires_in=3600')),
      ).toBe(true);
    });

    it('detects bare query type=recovery', () => {
      expect(urlLooksLikeRecovery(loc('?type=recovery', ''))).toBe(true);
    });

    it('detects PKCE code in query', () => {
      expect(urlLooksLikeRecovery(loc('?code=abcd1234', ''))).toBe(true);
    });

    it('detects verify-redirect: token_hash + type=recovery', () => {
      expect(
        urlLooksLikeRecovery(loc('?token_hash=xyz&type=recovery', '')),
      ).toBe(true);
    });

    it('still detects when query and hash are both populated', () => {
      expect(
        urlLooksLikeRecovery(loc('?code=abc', '#extra=1')),
      ).toBe(true);
    });
  });

  describe('negative matches', () => {
    it('returns false for empty location', () => {
      expect(urlLooksLikeRecovery(loc('', ''))).toBe(false);
    });

    it('returns false for unrelated query parameters', () => {
      expect(urlLooksLikeRecovery(loc('?ref=email&utm_source=x', ''))).toBe(false);
    });

    it('returns false when type is something other than recovery', () => {
      expect(urlLooksLikeRecovery(loc('?type=signup', ''))).toBe(false);
    });

    it('returns false for token_hash without type=recovery', () => {
      // token_hash alone could be magic-link or signup; only count it
      // when paired with the recovery type marker.
      expect(urlLooksLikeRecovery(loc('?token_hash=xyz', ''))).toBe(false);
    });

    it('returns false for token_hash with non-recovery type', () => {
      expect(
        urlLooksLikeRecovery(loc('?token_hash=xyz&type=email_change', '')),
      ).toBe(false);
    });

    it('returns false for hash without type=recovery marker', () => {
      expect(
        urlLooksLikeRecovery(loc('', '#access_token=abc&type=signup')),
      ).toBe(false);
    });
  });
});
