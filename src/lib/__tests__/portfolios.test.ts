import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { generateDataKey } from '@/lib/crypto';
import {
  PortfolioLimitError,
  createPortfolio,
  createSerialSaver,
  deletePortfolio,
  fetchPortfolio,
  listPortfolios,
  portfolioNameTaken,
  sanitizePortfolioName,
  savePortfolio,
} from '../portfolios';

const USER_A = '550e8400-e29b-41d4-a716-446655440000';
const USER_B = '550e8400-e29b-41d4-a716-446655440001';

interface Row {
  id: string; owner_id: string; encrypted_data: string; nonce: string;
  enc_version: number; revision: number; key_epoch: number; created_at: string;
}
interface Member { portfolio_id: string; user_id: string; wrapped_pk: string; key_epoch: number }

/**
 * In-memory stand-in for the tables and the create_portfolio / save_portfolio
 * functions in migration 20260930120000, as seen by `currentUser`.
 */
function fakeServer() {
  const portfolios = new Map<string, Row>();
  const members: Member[] = [];
  const state = { currentUser: USER_A, clock: 0 };

  const memberRows = (filters: Record<string, string>) =>
    members
      .filter((m) => Object.entries(filters).every(([k, v]) => (m as unknown as Record<string, string>)[k] === v))
      .map((m) => ({ wrapped_pk: m.wrapped_pk, key_epoch: m.key_epoch, portfolios: portfolios.get(m.portfolio_id) ?? null }));

  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === 'create_portfolio') {
        const owned = [...portfolios.values()].filter((p) => p.owner_id === state.currentUser).length;
        if (owned >= 5) return { data: null, error: { message: 'portfolio_limit' } };
        const id = args.p_id as string;
        portfolios.set(id, {
          id, owner_id: state.currentUser, encrypted_data: args.p_encrypted_data as string, nonce: args.p_nonce as string,
          enc_version: args.p_enc_version as number, revision: 1, key_epoch: 1,
          created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, state.clock++)).toISOString(),
        });
        members.push({ portfolio_id: id, user_id: state.currentUser, wrapped_pk: args.p_wrapped_pk as string, key_epoch: 1 });
        return { data: null, error: null };
      }
      if (fn === 'save_portfolio') {
        const row = portfolios.get(args.p_id as string);
        const isMember = members.some((m) => m.portfolio_id === args.p_id && m.user_id === state.currentUser);
        if (!row || !isMember) return { data: [{ status: 'forbidden', current_revision: null }], error: null };
        if (row.revision !== args.p_expected_revision || row.key_epoch !== args.p_key_epoch) {
          return { data: [{ status: 'conflict', current_revision: row.revision }], error: null };
        }
        Object.assign(row, { encrypted_data: args.p_encrypted_data, nonce: args.p_nonce, revision: row.revision + 1 });
        return { data: [{ status: 'ok', current_revision: row.revision }], error: null };
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
    from(table: string) {
      if (table === 'portfolio_members') {
        const filters: Record<string, string> = {};
        const builder = {
          select: () => builder,
          eq: (col: string, val: string) => { filters[col] = val; return builder; },
          maybeSingle: async () => ({ data: memberRows(filters)[0] ?? null, error: null }),
          then: (resolve: (v: unknown) => void) => resolve({ data: memberRows(filters), error: null }),
        };
        return builder;
      }
      if (table === 'portfolios') {
        return {
          delete: () => ({
            eq: (_col: string, id: string) => ({
              select: async () => {
                const row = portfolios.get(id);
                if (!row || row.owner_id !== state.currentUser) return { data: [], error: null };
                portfolios.delete(id);
                return { data: [{ id }], error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, portfolios, members, state };
}

const sampleData = () => ({
  facts: [{ date: new Date('2026-01-31T00:00:00Z'), idSource: 'Joint account', sourceVl: 1200, currency: 'EUR' as const }],
  refSources: [{ idSource: 'Joint account', volatType: 'Non-volatile', transferableInDays: true }],
  goals: [],
});

describe('create, list and save', () => {
  it('round-trips a new portfolio through the server', async () => {
    const { client } = fakeServer();
    const dk = await generateDataKey();
    const created = await createPortfolio(client, USER_A, dk, 'Joint');
    expect(created.meta).toMatchObject({ name: 'Joint', ownerId: USER_A, revision: 1, keyEpoch: 1 });

    const { loaded, failed } = await listPortfolios(client, USER_A, dk);
    expect(failed).toBe(0);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].meta.name).toBe('Joint');
    expect(Array.from(loaded[0].portfolioKey)).toEqual(Array.from(created.portfolioKey));
    expect(loaded[0].content).toEqual({ facts: [], refSources: [], goals: [] });
  });

  it('saves against the current revision and returns the next one', async () => {
    const { client } = fakeServer();
    const dk = await generateDataKey();
    const created = await createPortfolio(client, USER_A, dk, 'Joint');

    const outcome = await savePortfolio(client, { meta: created.meta, portfolioKey: created.portfolioKey, data: sampleData() });
    expect(outcome).toEqual({ status: 'ok', revision: 2 });

    const reread = await fetchPortfolio(client, USER_A, dk, created.meta.id);
    expect(reread?.meta.revision).toBe(2);
    expect((reread?.content.facts as unknown[]).length).toBe(1);
  });

  it('reports a conflict when the stored revision has moved on', async () => {
    const { client } = fakeServer();
    const dk = await generateDataKey();
    const created = await createPortfolio(client, USER_A, dk, 'Joint');
    await savePortfolio(client, { meta: created.meta, portfolioKey: created.portfolioKey, data: sampleData() });

    const stale = await savePortfolio(client, { meta: created.meta, portfolioKey: created.portfolioKey, data: null });
    expect(stale).toEqual({ status: 'conflict', revision: 2 });
  });

  it('reports forbidden for someone who is not a member', async () => {
    const { client, state } = fakeServer();
    const dk = await generateDataKey();
    const created = await createPortfolio(client, USER_A, dk, 'Joint');
    state.currentUser = USER_B;
    expect(await savePortfolio(client, { meta: created.meta, portfolioKey: created.portfolioKey, data: null })).toEqual({ status: 'forbidden' });
    expect(await fetchPortfolio(client, USER_B, dk, created.meta.id)).toBeNull();
  });

  it('lists oldest first and skips a portfolio that fails to decrypt', async () => {
    const { client, portfolios } = fakeServer();
    const dk = await generateDataKey();
    const first = await createPortfolio(client, USER_A, dk, 'First');
    const second = await createPortfolio(client, USER_A, dk, 'Second');
    await createPortfolio(client, USER_A, dk, 'Third');
    // Swap in another portfolio's ciphertext: the AAD binds it to its own id.
    portfolios.get(second.meta.id)!.encrypted_data = portfolios.get(first.meta.id)!.encrypted_data;
    portfolios.get(second.meta.id)!.nonce = portfolios.get(first.meta.id)!.nonce;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { loaded, failed } = await listPortfolios(client, USER_A, dk);
    expect(failed).toBe(1);
    expect(loaded.map((p) => p.meta.name)).toEqual(['First', 'Third']);
  });

  it('cannot be opened with another user\'s data key', async () => {
    const { client } = fakeServer();
    const created = await createPortfolio(client, USER_A, await generateDataKey(), 'Joint');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(fetchPortfolio(client, USER_A, await generateDataKey(), created.meta.id)).rejects.toThrow();
  });

  it('throws PortfolioLimitError past the cap', async () => {
    const { client } = fakeServer();
    const dk = await generateDataKey();
    for (let i = 0; i < 5; i++) await createPortfolio(client, USER_A, dk, `P${i}`);
    await expect(createPortfolio(client, USER_A, dk, 'Sixth')).rejects.toBeInstanceOf(PortfolioLimitError);
  });
});

describe('deletePortfolio', () => {
  it('deletes for the owner and throws when nothing was deleted', async () => {
    const { client, state } = fakeServer();
    const created = await createPortfolio(client, USER_A, await generateDataKey(), 'Joint');
    state.currentUser = USER_B;
    await expect(deletePortfolio(client, created.meta.id)).rejects.toThrow(/not deleted/);
    state.currentUser = USER_A;
    await expect(deletePortfolio(client, created.meta.id)).resolves.toBeUndefined();
  });
});

describe('portfolio names', () => {
  it('trims, collapses whitespace and enforces the limits', () => {
    expect(sanitizePortfolioName('  Joint   account ')).toEqual({ value: 'Joint account', error: null });
    expect(sanitizePortfolioName('   ').error).toMatch(/name/);
    expect(sanitizePortfolioName('x'.repeat(61)).error).toMatch(/60/);
    expect(sanitizePortfolioName('bad\u0007name').error).toMatch(/characters/);
  });

  it('treats Personal and existing names as taken, ignoring case', () => {
    const existing = [{ id: 'p1', name: 'Joint', ownerId: USER_A, revision: 1, keyEpoch: 1 }];
    expect(portfolioNameTaken('personal', existing)).toBe(true);
    expect(portfolioNameTaken('JOINT', existing)).toBe(true);
    expect(portfolioNameTaken('Joint', existing, 'p1')).toBe(false);
    expect(portfolioNameTaken('Company', existing)).toBe(false);
  });
});

describe('createSerialSaver', () => {
  it('runs one save at a time and keeps only the newest waiting payload', async () => {
    const runs: number[] = [];
    let release: () => void = () => {};
    const run = vi.fn(async (n: number) => {
      runs.push(n);
      if (n === 1) await new Promise<void>((r) => { release = r; });
    });
    const save = createSerialSaver(run);

    const done = save(1);
    void save(2);
    void save(3);
    expect(runs).toEqual([1]);
    release();
    await done;
    expect(runs).toEqual([1, 3]);
  });

  it('keeps going after a failed save', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const runs: number[] = [];
    let release: () => void = () => {};
    const save = createSerialSaver(async (n: number) => {
      runs.push(n);
      if (n === 1) {
        await new Promise<void>((r) => { release = r; });
        throw new Error('network');
      }
    });
    const done = save(1);
    void save(2);
    release();
    await done;
    expect(runs).toEqual([1, 2]);
  });
});
