/**
 * Tests for encrypted save/load.
 *
 * Round-trip strategy: encrypt with upsertEncryptedSnapshot's logic, capture
 * what would be sent to Supabase, then feed that "row" into decodeSnapshot
 * and confirm we recover the original portfolio.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  decodeSnapshot,
  upsertEncryptedSnapshot,
  type SnapshotRow,
} from '@/lib/cloudSync';
import { generateDataKey } from '@/lib/crypto';
import type { PortfolioData } from '@/lib/types';

const USER = '550e8400-e29b-41d4-a716-446655440000';

const SAMPLE: PortfolioData = {
  facts: [
    { date: new Date('2024-01-15'), idSource: 'CGD', sourceVl: 1234.56, currency: 'EUR' },
    { date: new Date('2024-02-15'), idSource: 'Revolut', sourceVl: 789.0, currency: 'EUR' },
  ],
  refSources: [
    { idSource: 'CGD', volatType: 'Non-Volatile', transferableInDays: true },
    { idSource: 'Revolut', volatType: 'Non-Volatile', transferableInDays: true },
  ],
};

type UpsertPayload = {
  user_id: string;
  data: unknown;
  encrypted_data: string;
  nonce: string;
  enc_version: number;
};

function makeMockClient() {
  let lastUpsertPayload: UpsertPayload | null = null;
  const upsert = vi.fn().mockImplementation((payload: UpsertPayload) => {
    lastUpsertPayload = payload;
    return Promise.resolve({ error: null });
  });
  const from = vi.fn().mockReturnValue({ upsert });
  return {
    client: { from } as never,
    from,
    upsert,
    getLastPayload: () => lastUpsertPayload,
  };
}

describe('upsertEncryptedSnapshot', () => {
  it('writes ciphertext + nonce + enc_version=1 + null data', async () => {
    const dk = await generateDataKey();
    const mock = makeMockClient();

    await upsertEncryptedSnapshot(mock.client, USER, SAMPLE, dk);

    expect(mock.from).toHaveBeenCalledWith('portfolio_snapshots');
    const payload = mock.getLastPayload();
    expect(payload.user_id).toBe(USER);
    expect(payload.data).toBeNull();
    expect(payload.enc_version).toBe(1);
    expect(typeof payload.encrypted_data).toBe('string');
    expect(payload.encrypted_data.startsWith('\\x')).toBe(true);
    expect(typeof payload.nonce).toBe('string');
    expect(payload.nonce.startsWith('\\x')).toBe(true);
    // Nonce is 24 bytes -> 48 hex chars + 2-char "\x" prefix.
    expect(payload.nonce.length).toBe(50);
  });

  it('produces a fresh nonce on every call (no determinism leak)', async () => {
    const dk = await generateDataKey();
    const mock1 = makeMockClient();
    const mock2 = makeMockClient();

    await upsertEncryptedSnapshot(mock1.client, USER, SAMPLE, dk);
    await upsertEncryptedSnapshot(mock2.client, USER, SAMPLE, dk);

    expect(mock1.getLastPayload().nonce).not.toBe(mock2.getLastPayload().nonce);
    expect(mock1.getLastPayload().encrypted_data).not.toBe(
      mock2.getLastPayload().encrypted_data,
    );
  });

  it('round-trips through decodeSnapshot', async () => {
    const dk = await generateDataKey();
    const mock = makeMockClient();
    await upsertEncryptedSnapshot(mock.client, USER, SAMPLE, dk);
    const payload = mock.getLastPayload();

    const row: SnapshotRow = {
      data: null,
      encrypted_data: payload.encrypted_data,
      nonce: payload.nonce,
      enc_version: payload.enc_version,
    };
    const result = await decodeSnapshot(row, { userId: USER, dataKey: dk });

    expect(result.kind).toBe('encrypted');
    const decoded = result.data as { facts: Array<{ idSource: string; sourceVl: number; date: string }> };
    expect(decoded.facts).toHaveLength(2);
    // Dates round-trip as ISO strings (JSON.parse won't revive them; the
    // PortfolioContext re-parses them with safeDate).
    expect(decoded.facts[0].idSource).toBe('CGD');
    expect(decoded.facts[0].sourceVl).toBe(1234.56);
    expect(decoded.facts[0].date).toBe('2024-01-15T00:00:00.000Z');
  });

  it('throws when supabase returns an error', async () => {
    const dk = await generateDataKey();
    const supabaseErr = { message: 'permission denied', status: 403 };
    const upsert = vi.fn().mockResolvedValue({ error: supabaseErr });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from } as never;
    await expect(
      upsertEncryptedSnapshot(client, USER, SAMPLE, dk),
    ).rejects.toBe(supabaseErr);
  });
});

describe('decodeSnapshot', () => {
  it('throws if v1 row missing encrypted_data or nonce', async () => {
    const row: SnapshotRow = {
      data: null,
      encrypted_data: null,
      nonce: null,
      enc_version: 1,
    };
    await expect(
      decodeSnapshot(row, { userId: USER, dataKey: new Uint8Array(32) }),
    ).rejects.toThrow(/encrypted_data or nonce is null/);
  });

  it('throws if v1 row provided without a data key', async () => {
    const row: SnapshotRow = {
      data: null,
      encrypted_data: '\\xdeadbeef',
      nonce: '\\x' + '00'.repeat(24),
      enc_version: 1,
    };
    await expect(
      decodeSnapshot(row, { userId: USER, dataKey: null }),
    ).rejects.toThrow(/no data key is loaded/);
  });

  it('throws on unknown enc_version', async () => {
    const row: SnapshotRow = {
      data: null,
      encrypted_data: null,
      nonce: null,
      enc_version: 99,
    };
    await expect(
      decodeSnapshot(row, { userId: USER, dataKey: null }),
    ).rejects.toThrow(/unsupported snapshot enc_version: 99/);
  });

  it('rejects ciphertext under the wrong data key', async () => {
    const dkA = await generateDataKey();
    const dkB = await generateDataKey();
    const mock = makeMockClient();
    await upsertEncryptedSnapshot(mock.client, USER, SAMPLE, dkA);
    const payload = mock.getLastPayload();

    const row: SnapshotRow = {
      data: null,
      encrypted_data: payload.encrypted_data,
      nonce: payload.nonce,
      enc_version: payload.enc_version,
    };
    await expect(
      decodeSnapshot(row, { userId: USER, dataKey: dkB }),
    ).rejects.toThrow();
  });

  it('rejects ciphertext when the userId does not match (AAD binding)', async () => {
    const dk = await generateDataKey();
    const mock = makeMockClient();
    await upsertEncryptedSnapshot(mock.client, USER, SAMPLE, dk);
    const payload = mock.getLastPayload();

    const row: SnapshotRow = {
      data: null,
      encrypted_data: payload.encrypted_data,
      nonce: payload.nonce,
      enc_version: payload.enc_version,
    };
    const otherUser = '550e8400-e29b-41d4-a716-446655440001';
    await expect(
      decodeSnapshot(row, { userId: otherUser, dataKey: dk }),
    ).rejects.toThrow();
  });
});

