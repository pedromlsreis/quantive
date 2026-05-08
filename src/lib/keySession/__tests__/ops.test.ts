/**
 * Tests for the pure unlock + migration logic. Uses in-memory KeyStore and
 * KeyStore so we exercise every branch without hitting Supabase.
 *
 * Note: these tests run real Argon2id under production parameters. Each
 * `detectAndUnlock` call takes ~300ms.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { detectAndUnlock } from '../ops';
import type { KeyStore, UserKeysRow } from '../types';

const USER_A = '550e8400-e29b-41d4-a716-446655440000';
const USER_B = '550e8400-e29b-41d4-a716-446655440001';

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
    if (this.rows.has(row.user_id)) {
      throw new Error('row already exists');
    }
    this.rows.set(row.user_id, row);
  }
  async hasPortfolioSnapshot(userId: string) {
    return this.snapshotUsers.has(userId);
  }
  async updatePasswordWrap(args: { user_id: string; kdf_salt: Uint8Array; wrapped_dk_kek: Uint8Array }) {
    const existing = this.rows.get(args.user_id);
    if (!existing) throw new Error('row does not exist');
    this.rows.set(args.user_id, {
      ...existing,
      kdf_salt: args.kdf_salt,
      wrapped_dk_kek: args.wrapped_dk_kek,
    });
  }
  async updateRecoveryWrap(args: { user_id: string; recovery_kdf_salt: Uint8Array; wrapped_dk_recovery: Uint8Array }) {
    const existing = this.rows.get(args.user_id);
    if (!existing) throw new Error('row does not exist');
    this.rows.set(args.user_id, {
      ...existing,
      recovery_kdf_salt: args.recovery_kdf_salt,
      wrapped_dk_recovery: args.wrapped_dk_recovery,
    });
  }
}

describe('detectAndUnlock', () => {
  let keyStore: InMemoryKeyStore;

  beforeEach(() => {
    keyStore = new InMemoryKeyStore();
  });

  it('new user (no keys) -> provisions keys', async () => {
    const result = await detectAndUnlock(USER_A, utf8('password123'), keyStore);

    expect(result.kind).toBe('encrypted-unlocked');
    expect(result.kek.length).toBe(32);
    expect(result.dk.length).toBe(32);

    const persisted = await keyStore.getUserKeys(USER_A);
    expect(persisted).not.toBeNull();
    expect(persisted!.enc_version).toBe(1);
    expect(persisted!.kdf_salt.length).toBe(16);
    expect(persisted!.wrapped_dk_kek.length).toBe(72);
  }, 30_000);

  it('returning user with correct password -> unwraps the same DK', async () => {
    const password = utf8('correct horse battery staple');
    const first = await detectAndUnlock(USER_A, password, keyStore);
    const second = await detectAndUnlock(USER_A, password, keyStore);

    expect(Array.from(second.dk)).toEqual(Array.from(first.dk));
  }, 60_000);

  it('returning user with wrong password -> DecryptionError', async () => {
    await detectAndUnlock(USER_A, utf8('right'), keyStore);
    await expect(
      detectAndUnlock(USER_A, utf8('wrong'), keyStore),
    ).rejects.toThrow();
  }, 60_000);

  it('isolated users: A cannot unwrap B keys (AAD binding)', async () => {
    const password = utf8('shared');
    await detectAndUnlock(USER_A, password, keyStore);
    await detectAndUnlock(USER_B, password, keyStore);

    const rowA = await keyStore.getUserKeys(USER_A);
    expect(rowA).not.toBeNull();

    const stolenKeyStore = new InMemoryKeyStore();
    await stolenKeyStore.insertUserKeys({ ...rowA!, user_id: USER_B });

    await expect(
      detectAndUnlock(USER_B, password, stolenKeyStore),
    ).rejects.toThrow();
  }, 90_000);
});
