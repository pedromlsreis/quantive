/**
 * Key session operations. Pure, no I/O of its own — the KeyStore parameter
 * abstracts persistence so this module is testable without Supabase.
 *
 * Spec: docs/security/encryption.md §8.
 *
 * Three terminal states for a unlock attempt:
 *   - encrypted-unlocked  -> user has user_keys; DK is in memory
 *   - legacy              -> user has plaintext snapshots; no keys yet (Phase 5 will migrate)
 *   - (throws)            -> wrong password / corrupted wrap / store error
 */

import {
  deriveKey,
  generateDataKey,
  generateSalt,
  unwrapDataKey,
  wrapDataKey,
} from '@/lib/crypto';
import type { KeyStore } from './types';

export type SessionState =
  | { kind: 'encrypted-unlocked'; kek: Uint8Array; dk: Uint8Array }
  | { kind: 'legacy' };

/**
 * Resolve the user's key state. Three paths:
 *
 *   1. user_keys row exists -> derive KEK, unwrap DK. Throws on wrong password.
 *   2. No user_keys, no portfolio_snapshots -> NEW user. Generate keys, persist user_keys.
 *   3. No user_keys, has portfolio_snapshots -> LEGACY user. Return 'legacy'; do not write.
 *
 * @param userId   auth.uid() of the logged-in user.
 * @param password UTF-8-encoded password bytes. Caller is responsible for zeroing
 *                 the buffer after this call returns.
 * @param store    Backing storage (Supabase in production, in-memory in tests).
 */
export async function detectAndUnlock(
  userId: string,
  password: Uint8Array,
  store: KeyStore,
): Promise<SessionState> {
  const existing = await store.getUserKeys(userId);
  if (existing) {
    const kek = await deriveKey(password, existing.kdf_salt);
    const dk = await unwrapDataKey({
      wrappedDk: existing.wrapped_dk_kek,
      kek,
      userId,
    });
    return { kind: 'encrypted-unlocked', kek, dk };
  }

  const hasLegacyData = await store.hasPortfolioSnapshot(userId);
  if (hasLegacyData) {
    // Legacy plaintext user. Phase 5 (#33) will re-encrypt on next login;
    // until then we leave the row alone.
    return { kind: 'legacy' };
  }

  // Brand-new user. Set up keys.
  const salt = await generateSalt();
  const kek = await deriveKey(password, salt);
  const dk = await generateDataKey();
  const wrappedDk = await wrapDataKey({ dataKey: dk, kek, userId });

  await store.insertUserKeys({
    user_id: userId,
    kdf_salt: salt,
    wrapped_dk_kek: wrappedDk,
    wrapped_dk_recovery: null,
    recovery_kdf_salt: null,
    enc_version: 1,
  });

  return { kind: 'encrypted-unlocked', kek, dk };
}
