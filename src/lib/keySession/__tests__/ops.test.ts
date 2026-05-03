/**
 * Tests for the pure unlock + migration logic. Uses in-memory KeyStore and
 * SnapshotStore so we exercise every branch without hitting Supabase.
 *
 * Note: these tests run real Argon2id under production parameters. Each
 * `detectAndUnlock` call takes ~300ms.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { decryptSnapshot } from '@/lib/crypto';
import { detectAndUnlock } from '../ops';
import type { KeyStore, SnapshotStore, UserKeysRow } from '../types';

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
}

interface StoredEncryptedSnapshot {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  encVersion: number;
}

class InMemorySnapshotStore implements SnapshotStore {
  /** v0 plaintext payload, keyed by user id. */
  legacy = new Map<string, unknown>();
  /** v1 encrypted snapshot, keyed by user id. */
  encrypted = new Map<string, StoredEncryptedSnapshot>();

  async getLegacyPlaintext(userId: string) {
    return this.legacy.get(userId) ?? null;
  }
  async upsertEncrypted(
    userId: string,
    plaintextPayload: unknown,
    dataKey: Uint8Array,
  ) {
    const { encryptSnapshot } = await import('@/lib/crypto');
    const plaintext = new TextEncoder().encode(JSON.stringify(plaintextPayload));
    const enc = await encryptSnapshot({ plaintext, dataKey, userId });
    this.encrypted.set(userId, {
      ciphertext: enc.ciphertext,
      nonce: enc.nonce,
      encVersion: enc.encVersion,
    });
    // Migrating writes v1 + clears v0.
    this.legacy.delete(userId);
  }
}

describe('detectAndUnlock', () => {
  let keyStore: InMemoryKeyStore;
  let snapshotStore: InMemorySnapshotStore;

  beforeEach(() => {
    keyStore = new InMemoryKeyStore();
    snapshotStore = new InMemorySnapshotStore();
  });

  it('new user (no keys, no snapshots) -> provisions, migrated=false', async () => {
    const result = await detectAndUnlock(
      USER_A,
      utf8('password123'),
      keyStore,
      snapshotStore,
    );

    expect(result.kind).toBe('encrypted-unlocked');
    expect(result.migrated).toBe(false);
    expect(result.kek.length).toBe(32);
    expect(result.dk.length).toBe(32);

    const persisted = await keyStore.getUserKeys(USER_A);
    expect(persisted).not.toBeNull();
    expect(persisted!.enc_version).toBe(1);
    expect(persisted!.kdf_salt.length).toBe(16);
    expect(persisted!.wrapped_dk_kek.length).toBe(72);
    expect(snapshotStore.encrypted.has(USER_A)).toBe(false);
  }, 30_000);

  it('returning user with correct password -> unwraps the same DK, migrated=false', async () => {
    const password = utf8('correct horse battery staple');
    const first = await detectAndUnlock(USER_A, password, keyStore, snapshotStore);
    const second = await detectAndUnlock(USER_A, password, keyStore, snapshotStore);

    expect(second.migrated).toBe(false);
    expect(Array.from(second.dk)).toEqual(Array.from(first.dk));
  }, 60_000);

  it('returning user with wrong password -> DecryptionError', async () => {
    await detectAndUnlock(USER_A, utf8('right'), keyStore, snapshotStore);
    await expect(
      detectAndUnlock(USER_A, utf8('wrong'), keyStore, snapshotStore),
    ).rejects.toThrow();
  }, 60_000);

  it('legacy user -> provisions keys AND re-encrypts the v0 plaintext, migrated=true', async () => {
    const plaintextPayload = {
      facts: [{ idSource: 'CGD', sourceVl: 100 }],
      refSources: [{ idSource: 'CGD', volatType: 'Non-Volatile', transferableInDays: true }],
    };
    snapshotStore.legacy.set(USER_A, plaintextPayload);

    const result = await detectAndUnlock(
      USER_A,
      utf8('legacy-user-pw'),
      keyStore,
      snapshotStore,
    );

    expect(result.kind).toBe('encrypted-unlocked');
    expect(result.migrated).toBe(true);

    // Keys persisted.
    const keys = await keyStore.getUserKeys(USER_A);
    expect(keys).not.toBeNull();

    // v0 plaintext gone, v1 ciphertext written.
    expect(snapshotStore.legacy.has(USER_A)).toBe(false);
    const stored = snapshotStore.encrypted.get(USER_A);
    expect(stored).toBeDefined();

    // Round-trip: decrypt the stored ciphertext under the returned DK,
    // confirm we recover the original plaintext payload.
    const decryptedBytes = await decryptSnapshot({
      encrypted: {
        ciphertext: stored!.ciphertext,
        nonce: stored!.nonce,
        encVersion: stored!.encVersion,
      },
      dataKey: result.dk,
      userId: USER_A,
    });
    const recovered = JSON.parse(new TextDecoder().decode(decryptedBytes));
    expect(recovered).toEqual(plaintextPayload);
  }, 30_000);

  it('legacy migration is single-shot: re-running detectAndUnlock takes the keys-exist path', async () => {
    snapshotStore.legacy.set(USER_A, { facts: [], refSources: [] });
    const password = utf8('pw');

    const first = await detectAndUnlock(USER_A, password, keyStore, snapshotStore);
    expect(first.migrated).toBe(true);

    const second = await detectAndUnlock(USER_A, password, keyStore, snapshotStore);
    expect(second.migrated).toBe(false);
    expect(Array.from(second.dk)).toEqual(Array.from(first.dk));
  }, 60_000);

  it('isolated users: A cannot unwrap B keys (AAD binding)', async () => {
    const password = utf8('shared');
    await detectAndUnlock(USER_A, password, keyStore, snapshotStore);
    await detectAndUnlock(USER_B, password, keyStore, snapshotStore);

    const rowA = await keyStore.getUserKeys(USER_A);
    expect(rowA).not.toBeNull();

    const stolenKeyStore = new InMemoryKeyStore();
    await stolenKeyStore.insertUserKeys({ ...rowA!, user_id: USER_B });

    await expect(
      detectAndUnlock(USER_B, password, stolenKeyStore, snapshotStore),
    ).rejects.toThrow();
  }, 90_000);
});
