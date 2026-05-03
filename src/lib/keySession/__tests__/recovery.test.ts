/**
 * Phase 6 — recovery code generation and use.
 *
 * Tests cover:
 *   - setupRecoveryCode: provisions a wrap, idempotent re-runs OK.
 *   - recoverAndRewrap: full forgot-password flow, including the cross-
 *     check that the recovered DK is byte-identical to the original (so
 *     all snapshots remain decryptable).
 *   - Negative paths: invalid mnemonic, no recovery configured, no keys.
 *
 * Uses an in-memory KeyStore so we don't hit Supabase. Note: these tests
 * run real Argon2id; setupRecoveryCode + recoverAndRewrap each do two
 * Argon2id derivations, so each ~600ms.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { detectAndUnlock, recoverAndRewrap, setupRecoveryCode } from '../ops';
import type { KeyStore, SnapshotStore, UserKeysRow } from '../types';

const USER = '550e8400-e29b-41d4-a716-446655440000';

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

class InMemoryKeyStore implements KeyStore {
  rows = new Map<string, UserKeysRow>();
  snapshotUsers = new Set<string>();

  async getUserKeys(userId: string) {
    return this.rows.get(userId) ?? null;
  }
  async insertUserKeys(row: UserKeysRow) {
    if (this.rows.has(row.user_id)) throw new Error('row already exists');
    this.rows.set(row.user_id, row);
  }
  async hasPortfolioSnapshot(userId: string) {
    return this.snapshotUsers.has(userId);
  }
  async updatePasswordWrap(args: {
    user_id: string;
    kdf_salt: Uint8Array;
    wrapped_dk_kek: Uint8Array;
  }) {
    const row = this.rows.get(args.user_id);
    if (!row) throw new Error('no row to update');
    this.rows.set(args.user_id, {
      ...row,
      kdf_salt: args.kdf_salt,
      wrapped_dk_kek: args.wrapped_dk_kek,
    });
  }
  async updateRecoveryWrap(args: {
    user_id: string;
    recovery_kdf_salt: Uint8Array;
    wrapped_dk_recovery: Uint8Array;
  }) {
    const row = this.rows.get(args.user_id);
    if (!row) throw new Error('no row to update');
    this.rows.set(args.user_id, {
      ...row,
      recovery_kdf_salt: args.recovery_kdf_salt,
      wrapped_dk_recovery: args.wrapped_dk_recovery,
    });
  }
}

class NullSnapshotStore implements SnapshotStore {
  async getLegacyPlaintext() {
    return null;
  }
  async upsertEncrypted() {
    /* no-op */
  }
}

async function provisionUser(
  keyStore: InMemoryKeyStore,
  password = utf8('p@ss'),
) {
  return await detectAndUnlock(USER, password, keyStore, new NullSnapshotStore());
}

describe('setupRecoveryCode', () => {
  let keyStore: InMemoryKeyStore;

  beforeEach(() => {
    keyStore = new InMemoryKeyStore();
  });

  it('provisions a recovery wrap on the existing user_keys row', async () => {
    const session = await provisionUser(keyStore);
    const { recoveryCode } = await setupRecoveryCode({
      userId: USER,
      dataKey: session.dk,
      keyStore,
    });

    expect(recoveryCode.split(' ')).toHaveLength(24);
    const row = await keyStore.getUserKeys(USER);
    expect(row!.wrapped_dk_recovery).not.toBeNull();
    expect(row!.wrapped_dk_recovery!.length).toBe(72);
    expect(row!.recovery_kdf_salt).not.toBeNull();
    expect(row!.recovery_kdf_salt!.length).toBe(16);
  }, 30_000);

  it('rotates recovery on each call (different code, different wrap)', async () => {
    const session = await provisionUser(keyStore);
    const first = await setupRecoveryCode({
      userId: USER,
      dataKey: session.dk,
      keyStore,
    });
    const firstWrap = (await keyStore.getUserKeys(USER))!.wrapped_dk_recovery;

    const second = await setupRecoveryCode({
      userId: USER,
      dataKey: session.dk,
      keyStore,
    });
    const secondWrap = (await keyStore.getUserKeys(USER))!.wrapped_dk_recovery;

    expect(first.recoveryCode).not.toBe(second.recoveryCode);
    expect(Array.from(firstWrap!)).not.toEqual(Array.from(secondWrap!));
  }, 60_000);
});

describe('recoverAndRewrap', () => {
  let keyStore: InMemoryKeyStore;

  beforeEach(() => {
    keyStore = new InMemoryKeyStore();
  });

  it('happy path: recovery code unwraps the same DK and rotates the password wrap', async () => {
    const oldPassword = utf8('original-pw');
    const session = await provisionUser(keyStore, oldPassword);
    const { recoveryCode } = await setupRecoveryCode({
      userId: USER,
      dataKey: session.dk,
      keyStore,
    });

    const oldRow = await keyStore.getUserKeys(USER);
    const oldSalt = oldRow!.kdf_salt;
    const oldWrap = oldRow!.wrapped_dk_kek;

    const newPassword = utf8('brand-new-pw');
    const recovered = await recoverAndRewrap({
      userId: USER,
      recoveryCode,
      newPassword,
      keyStore,
    });

    // Critical invariant: the recovered DK is byte-identical to the
    // original. Any difference would mean snapshots encrypted under the
    // original DK would become permanently undecryptable.
    expect(Array.from(recovered.dk)).toEqual(Array.from(session.dk));

    // Password salt + wrap are rotated, recovery wrap is untouched.
    const newRow = await keyStore.getUserKeys(USER);
    expect(Array.from(newRow!.kdf_salt)).not.toEqual(Array.from(oldSalt));
    expect(Array.from(newRow!.wrapped_dk_kek)).not.toEqual(Array.from(oldWrap));
    expect(Array.from(newRow!.wrapped_dk_recovery!)).toEqual(
      Array.from(oldRow!.wrapped_dk_recovery!),
    );
    expect(Array.from(newRow!.recovery_kdf_salt!)).toEqual(
      Array.from(oldRow!.recovery_kdf_salt!),
    );

    // After rotation, signing in with the NEW password unwraps the same DK
    // (proves the rewrap succeeded end-to-end).
    const reUnlocked = await detectAndUnlock(
      USER,
      newPassword,
      keyStore,
      new NullSnapshotStore(),
    );
    expect(Array.from(reUnlocked.dk)).toEqual(Array.from(session.dk));
  }, 60_000);

  it('rejects an invalid mnemonic (BIP-39 checksum failure) before any KDF work', async () => {
    const session = await provisionUser(keyStore);
    await setupRecoveryCode({
      userId: USER,
      dataKey: session.dk,
      keyStore,
    });

    await expect(
      recoverAndRewrap({
        userId: USER,
        recoveryCode: 'these are not even close to twenty-four valid bip39 words at all',
        newPassword: utf8('new'),
        keyStore,
      }),
    ).rejects.toThrow(/invalid recovery code/);
  });

  it('rejects a checksum-valid recovery code that is not the right one', async () => {
    const session = await provisionUser(keyStore);
    const { recoveryCode } = await setupRecoveryCode({
      userId: USER,
      dataKey: session.dk,
      keyStore,
    });

    // Generate a *different* valid mnemonic.
    const { generateRecoveryCode } = await import('@/lib/crypto');
    let other = generateRecoveryCode();
    while (other === recoveryCode) other = generateRecoveryCode();

    await expect(
      recoverAndRewrap({
        userId: USER,
        recoveryCode: other,
        newPassword: utf8('new'),
        keyStore,
      }),
    ).rejects.toThrow();
  }, 60_000);

  it('refuses if the user has no keys at all', async () => {
    const { generateRecoveryCode } = await import('@/lib/crypto');
    await expect(
      recoverAndRewrap({
        userId: USER,
        recoveryCode: generateRecoveryCode(),
        newPassword: utf8('new'),
        keyStore,
      }),
    ).rejects.toThrow(/no encryption keys/);
  });

  it('refuses if the user has keys but no recovery configured', async () => {
    await provisionUser(keyStore);
    const { generateRecoveryCode } = await import('@/lib/crypto');

    await expect(
      recoverAndRewrap({
        userId: USER,
        recoveryCode: generateRecoveryCode(),
        newPassword: utf8('new'),
        keyStore,
      }),
    ).rejects.toThrow(/recovery is not configured/);
  }, 30_000);
});
