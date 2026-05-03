/**
 * Key session operations. Pure, no I/O of its own — the KeyStore and
 * SnapshotStore parameters abstract persistence so this module is testable
 * without Supabase.
 *
 * Spec: docs/security/encryption.md §8, §11.
 *
 * After Phase 5, every successful unlock returns 'encrypted-unlocked'. The
 * legacy plaintext path no longer exists at the session level: a user with
 * v0 plaintext is migrated in-place during the provisioning step.
 *
 *   user_keys exists           -> derive KEK, unwrap DK
 *   no user_keys, no plaintext -> NEW user. Provision keys.
 *   no user_keys, has plaintext-> LEGACY user. Provision keys AND re-encrypt
 *                                  the existing snapshot. `migrated: true`.
 *
 * Rationale on ordering during provisioning + migration:
 *   1. INSERT user_keys first.
 *   2. THEN re-encrypt snapshot (only if legacy).
 *   If step 2 fails, the user is in a recoverable state: they have a key,
 *   their snapshot is still v0 plaintext, and `loadFromCloud` reads it
 *   correctly. The next save naturally re-encrypts.
 *   The reverse order would either lose data (snapshot encrypted with no
 *   key persisted) or leave a CHECK-violating row.
 */

import {
  deriveKey,
  generateDataKey,
  generateSalt,
  unwrapDataKey,
  wrapDataKey,
} from '@/lib/crypto';
import type { KeyStore, SnapshotStore } from './types';

export type SessionState = {
  kind: 'encrypted-unlocked';
  kek: Uint8Array;
  dk: Uint8Array;
  /** True iff a v0 plaintext row was re-encrypted as part of this unlock. */
  migrated: boolean;
};

export async function detectAndUnlock(
  userId: string,
  password: Uint8Array,
  keyStore: KeyStore,
  snapshotStore: SnapshotStore,
): Promise<SessionState> {
  const existing = await keyStore.getUserKeys(userId);
  if (existing) {
    const kek = await deriveKey(password, existing.kdf_salt);
    const dk = await unwrapDataKey({
      wrappedDk: existing.wrapped_dk_kek,
      kek,
      userId,
    });
    return { kind: 'encrypted-unlocked', kek, dk, migrated: false };
  }

  // No user_keys yet. Could be a new user OR a pre-encryption legacy user.
  // Either way we provision a fresh DK; the difference is whether we also
  // re-encrypt an existing plaintext snapshot.
  const salt = await generateSalt();
  const kek = await deriveKey(password, salt);
  const dk = await generateDataKey();
  const wrappedDk = await wrapDataKey({ dataKey: dk, kek, userId });

  // Step 1: insert user_keys. If this throws, nothing is changed server-side.
  await keyStore.insertUserKeys({
    user_id: userId,
    kdf_salt: salt,
    wrapped_dk_kek: wrappedDk,
    wrapped_dk_recovery: null,
    recovery_kdf_salt: null,
    enc_version: 1,
  });

  // Step 2: if legacy data exists, re-encrypt it now. If this throws, the
  // user_keys row is still committed — next save will naturally encrypt.
  const legacyPlaintext = await snapshotStore.getLegacyPlaintext(userId);
  if (legacyPlaintext !== null && legacyPlaintext !== undefined) {
    await snapshotStore.upsertEncrypted(userId, legacyPlaintext, dk);
    return { kind: 'encrypted-unlocked', kek, dk, migrated: true };
  }

  return { kind: 'encrypted-unlocked', kek, dk, migrated: false };
}
