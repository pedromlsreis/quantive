/**
 * Key session operations. Pure, no I/O of its own — the KeyStore and
 * SnapshotStore parameters abstract persistence so this module is testable
 * without Supabase.
 *
 * Spec: docs/security/encryption.md §8, §11.
 *
 * Every successful unlock returns 'encrypted-unlocked'. The legacy plaintext
 * path no longer exists at the session level: a user with v0 plaintext is
 * migrated in-place during the provisioning step.
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
  generateRecoveryCode,
  isValidRecoveryCode,
  recoveryCodeToKdfInput,
  unwrapDataKey,
  unwrapDataKeyFromRecovery,
  wrapDataKey,
  wrapDataKeyForRecovery,
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

/**
 * Provision (or rotate) a recovery code for an already-unlocked user.
 *
 * Spec: docs/security/encryption.md §10.
 *
 * Generates a fresh BIP-39 24-word mnemonic, derives a recovery KEK from
 * it under a fresh per-user salt, wraps the existing DK under that KEK,
 * and writes both columns atomically. Returns the mnemonic string for the
 * caller to display once.
 *
 * Caller is responsible for:
 *   - obtaining `dataKey` from the active session (must be the same DK
 *     the password wrap holds; otherwise recovery would unlock a *different*
 *     DK and the user's encrypted snapshots would be unreadable),
 *   - displaying the returned mnemonic exactly once with strong warnings
 *     and a confirm-by-typing-back step.
 */
export async function setupRecoveryCode(args: {
  userId: string;
  dataKey: Uint8Array;
  keyStore: KeyStore;
}): Promise<{ recoveryCode: string }> {
  const recoveryCode = generateRecoveryCode();
  const codeBytes = recoveryCodeToKdfInput(recoveryCode);
  const recoverySalt = await generateSalt();
  const recoveryKek = await deriveKey(codeBytes, recoverySalt);
  const wrapped = await wrapDataKeyForRecovery({
    dataKey: args.dataKey,
    recoveryKek,
    userId: args.userId,
  });
  await args.keyStore.updateRecoveryWrap({
    user_id: args.userId,
    recovery_kdf_salt: recoverySalt,
    wrapped_dk_recovery: wrapped,
  });
  return { recoveryCode };
}

/**
 * Recover a forgotten password using the BIP-39 recovery code.
 *
 * Spec: docs/security/encryption.md §8.4.
 *
 * Flow:
 *   1. Validate the recovery code's BIP-39 checksum (cheap; rejects typos).
 *   2. Read the user_keys row.
 *   3. Derive recovery KEK from the recovery code + stored recovery salt.
 *   4. Unwrap DK from wrapped_dk_recovery. (Throws if the code is wrong —
 *      checksum-valid but doesn't decrypt.)
 *   5. Generate a fresh password salt, derive a new password KEK from the
 *      *new* password, wrap the DK under the new KEK.
 *   6. UPDATE user_keys.kdf_salt + wrapped_dk_kek atomically.
 *
 * Returns the unwrapped DK and the new password KEK so the caller can
 * install them into the in-memory session immediately — no second login
 * required.
 *
 * Note: the user's account password is rotated by the *caller* via Supabase
 * auth (`updateUser`) — this function only rotates the at-rest wrap.
 */
export async function recoverAndRewrap(args: {
  userId: string;
  recoveryCode: string;
  newPassword: Uint8Array;
  keyStore: KeyStore;
}): Promise<{ kek: Uint8Array; dk: Uint8Array }> {
  if (!isValidRecoveryCode(args.recoveryCode)) {
    throw new Error('invalid recovery code (failed BIP-39 checksum)');
  }
  const row = await args.keyStore.getUserKeys(args.userId);
  if (!row) {
    throw new Error('no encryption keys exist for this user');
  }
  if (!row.wrapped_dk_recovery || !row.recovery_kdf_salt) {
    throw new Error('recovery is not configured for this user');
  }

  const codeBytes = recoveryCodeToKdfInput(args.recoveryCode);
  const recoveryKek = await deriveKey(codeBytes, row.recovery_kdf_salt);
  const dk = await unwrapDataKeyFromRecovery({
    wrappedDk: row.wrapped_dk_recovery,
    recoveryKek,
    userId: args.userId,
  });

  // Spec §8.4 step 4a: fresh password salt. Rotating the salt makes any
  // old wrap residue cryptographically distinct from the new one.
  const newSalt = await generateSalt();
  const newKek = await deriveKey(args.newPassword, newSalt);
  const newWrap = await wrapDataKey({
    dataKey: dk,
    kek: newKek,
    userId: args.userId,
  });

  await args.keyStore.updatePasswordWrap({
    user_id: args.userId,
    kdf_salt: newSalt,
    wrapped_dk_kek: newWrap,
  });

  return { kek: newKek, dk };
}

/**
 * Re-wrap the active session's DK under a new password's KEK. Used by the
 * "change password" flow in settings: the user is already unlocked, so we
 * have the DK in memory; we just need to rotate the salt + wrap so the new
 * password unlocks the same DK on next sign-in.
 *
 * Spec: derived from §8.4 (recovery flow), without the recovery-unwrap step.
 *
 * The caller is responsible for rotating the Supabase auth password
 * separately. Order recommendation: rotate the auth password first; if it
 * succeeds, rotate the wrap. If the wrap rotation then fails, the user can
 * retry from the same session — auth doesn't need to be touched again.
 */
export async function rewrapDataKey(args: {
  userId: string;
  dataKey: Uint8Array;
  newPassword: Uint8Array;
  keyStore: KeyStore;
}): Promise<{ kek: Uint8Array }> {
  const newSalt = await generateSalt();
  const newKek = await deriveKey(args.newPassword, newSalt);
  const newWrap = await wrapDataKey({
    dataKey: args.dataKey,
    kek: newKek,
    userId: args.userId,
  });
  await args.keyStore.updatePasswordWrap({
    user_id: args.userId,
    kdf_salt: newSalt,
    wrapped_dk_kek: newWrap,
  });
  return { kek: newKek };
}
