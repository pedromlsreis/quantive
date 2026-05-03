/**
 * Tests for the pure unlock logic. Uses an in-memory KeyStore so we exercise
 * every branch without hitting Supabase.
 *
 * Note: these tests run real Argon2id under production parameters. Each
 * `detectAndUnlock` call takes ~300ms. Suite is bounded by the small number
 * of paths we need to cover.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { detectAndUnlock } from '../ops';
import type { KeyStore, UserKeysRow } from '../types';

const USER_A = '550e8400-e29b-41d4-a716-446655440000';
const USER_B = '550e8400-e29b-41d4-a716-446655440001';

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

class InMemoryStore implements KeyStore {
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
}

describe('detectAndUnlock', () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('new user (no keys, no snapshots) -> generates and persists keys', async () => {
    const result = await detectAndUnlock(USER_A, utf8('password123'), store);

    expect(result.kind).toBe('encrypted-unlocked');
    if (result.kind !== 'encrypted-unlocked') return;
    expect(result.kek.length).toBe(32);
    expect(result.dk.length).toBe(32);

    const persisted = await store.getUserKeys(USER_A);
    expect(persisted).not.toBeNull();
    expect(persisted!.enc_version).toBe(1);
    expect(persisted!.kdf_salt.length).toBe(16);
    expect(persisted!.wrapped_dk_kek.length).toBe(72); // 24 nonce + 32 DK + 16 tag
    expect(persisted!.wrapped_dk_recovery).toBeNull();
    expect(persisted!.recovery_kdf_salt).toBeNull();
  }, 30_000);

  it('returning user with correct password -> unwraps the same DK', async () => {
    const password = utf8('correct horse battery staple');
    // First call: provisions keys.
    const first = await detectAndUnlock(USER_A, password, store);
    if (first.kind !== 'encrypted-unlocked') throw new Error('first call should provision');

    // Second call (same password): unwraps the existing DK.
    const second = await detectAndUnlock(USER_A, password, store);
    expect(second.kind).toBe('encrypted-unlocked');
    if (second.kind !== 'encrypted-unlocked') return;
    expect(Array.from(second.dk)).toEqual(Array.from(first.dk));
  }, 60_000);

  it('returning user with wrong password -> DecryptionError', async () => {
    await detectAndUnlock(USER_A, utf8('right'), store);

    await expect(
      detectAndUnlock(USER_A, utf8('wrong'), store),
    ).rejects.toThrow();
  }, 60_000);

  it('legacy user (no keys, has snapshot) -> returns "legacy", does not insert', async () => {
    store.snapshotUsers.add(USER_A);

    const result = await detectAndUnlock(USER_A, utf8('any password'), store);
    expect(result.kind).toBe('legacy');

    // Critically, no user_keys row was created — Phase 5 owns migration.
    const keys = await store.getUserKeys(USER_A);
    expect(keys).toBeNull();
  });

  it('isolated users: A cannot unwrap B keys (AAD binding)', async () => {
    const password = utf8('shared');
    await detectAndUnlock(USER_A, password, store);
    await detectAndUnlock(USER_B, password, store);

    // Pull A's row and try to decrypt it under B's user_id.
    const rowA = await store.getUserKeys(USER_A);
    expect(rowA).not.toBeNull();

    const stolenStore = new InMemoryStore();
    // Inject A's wrapped_dk_kek/kdf_salt under B's user_id.
    await stolenStore.insertUserKeys({ ...rowA!, user_id: USER_B });

    await expect(
      detectAndUnlock(USER_B, password, stolenStore),
    ).rejects.toThrow();
  }, 90_000);
});
