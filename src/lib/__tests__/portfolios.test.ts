import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { generateDataKey } from '@/lib/crypto';
import {
  PortfolioLimitError,
  createPortfolio,
  deletePortfolio,
  fetchPortfolio,
  listPortfolios,
  listRevisions,
  openRevision,
  portfolioNameTaken,
  rotatePortfolioKey,
  sanitizePortfolioName,
  savePortfolio,
} from '../portfolios';

const USER_A = '550e8400-e29b-41d4-a716-446655440000';
const USER_B = '550e8400-e29b-41d4-a716-446655440001';

interface Row {
  id: string; owner_id: string; encrypted_data: string; nonce: string;
  enc_version: number; revision: number; key_epoch: number; rotation_due: boolean; created_at: string;
}
interface Member { portfolio_id: string; user_id: string; wrapped_pk: string; key_epoch: number }
interface Revision {
  portfolio_id: string; revision: number; key_epoch: number; encrypted_data: string; nonce: string;
  enc_version: number; saved_by: string | null; saved_at: string;
}
interface RetiredKey { portfolio_id: string; key_epoch: number; user_id: string; wrapped_pk: string }

/**
 * In-memory stand-in for the tables and functions in migrations
 * 20260930120000 and 20261001120000, as seen by `currentUser`.
 */
function fakeServer() {
  const portfolios = new Map<string, Row>();
  const members: Member[] = [];
  const revisions: Revision[] = [];
  const retiredKeys: RetiredKey[] = [];
  const state = { currentUser: USER_A, clock: 0 };

  const keepRevision = (row: Row) => revisions.push({
    portfolio_id: row.id, revision: row.revision, key_epoch: row.key_epoch, encrypted_data: row.encrypted_data,
    nonce: row.nonce, enc_version: row.enc_version, saved_by: state.currentUser, saved_at: new Date().toISOString(),
  });

  const filtered = <T,>(rows: T[], filters: Record<string, unknown>) =>
    rows.filter((r) => Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v));

  const tableBuilder = <T,>(rows: () => T[]) => {
    const filters: Record<string, unknown> = {};
    let descending = false;
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { filters[col] = val; return builder; },
      order: (_col: string, opts: { ascending: boolean }) => { descending = !opts.ascending; return builder; },
      single: async () => {
        const match = filtered(rows(), filters)[0];
        return match ? { data: match, error: null } : { data: null, error: { message: 'no rows' } };
      },
      then: (resolve: (v: unknown) => void) => {
        const out = filtered(rows(), filters);
        resolve({ data: descending ? [...out].reverse() : out, error: null });
      },
    };
    return builder;
  };

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
          enc_version: args.p_enc_version as number, revision: 1, key_epoch: 1, rotation_due: false,
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
        keepRevision(row);
        Object.assign(row, { encrypted_data: args.p_encrypted_data, nonce: args.p_nonce, revision: row.revision + 1 });
        return { data: [{ status: 'ok', current_revision: row.revision }], error: null };
      }
      if (fn === 'rotate_portfolio_key') {
        const row = portfolios.get(args.p_id as string);
        if (!row || row.owner_id !== state.currentUser) {
          return { data: [{ status: 'forbidden', current_revision: null, current_epoch: null }], error: null };
        }
        if (row.revision !== args.p_expected_revision || row.key_epoch !== args.p_expected_epoch) {
          return { data: [{ status: 'conflict', current_revision: row.revision, current_epoch: row.key_epoch }], error: null };
        }
        if (members.some((m) => m.portfolio_id === row.id && m.user_id !== state.currentUser)) {
          return { data: [{ status: 'members_remain', current_revision: row.revision, current_epoch: row.key_epoch }], error: null };
        }
        const own = members.find((m) => m.portfolio_id === row.id && m.user_id === state.currentUser)!;
        retiredKeys.push({ portfolio_id: row.id, key_epoch: own.key_epoch, user_id: own.user_id, wrapped_pk: own.wrapped_pk });
        keepRevision(row);
        Object.assign(row, {
          encrypted_data: args.p_encrypted_data, nonce: args.p_nonce,
          revision: row.revision + 1, key_epoch: row.key_epoch + 1, rotation_due: false,
        });
        Object.assign(own, { wrapped_pk: args.p_owner_wrapped_pk, key_epoch: row.key_epoch });
        return { data: [{ status: 'ok', current_revision: row.revision, current_epoch: row.key_epoch }], error: null };
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
      if (table === 'portfolio_revisions') return tableBuilder(() => revisions);
      if (table === 'portfolio_key_history') return tableBuilder(() => retiredKeys);
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
  return { client: client as unknown as SupabaseClient<Database>, portfolios, members, revisions, state };
}

const sampleData = () => ({
  facts: [{ date: new Date(2026, 0, 31), idSource: 'Joint account', sourceVl: 1200, currency: 'EUR' as const }],
  refSources: [{ idSource: 'Joint account', volatType: 'Non-volatile', transferableInDays: true }],
  goals: [],
});

describe('create, list and save', () => {
  it('round-trips a new portfolio through the server', async () => {
    const { client } = fakeServer();
    const dk = await generateDataKey();
    const created = await createPortfolio(client, USER_A, dk, 'Joint');
    expect(created.meta).toMatchObject({ name: 'Joint', ownerId: USER_A, revision: 1, keyEpoch: 1, rotationDue: false });

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

  it('stores fact dates as calendar days, so every time zone reads the same day', async () => {
    const { client } = fakeServer();
    const dk = await generateDataKey();
    const created = await createPortfolio(client, USER_A, dk, 'Joint');
    await savePortfolio(client, { meta: created.meta, portfolioKey: created.portfolioKey, data: sampleData() });
    const reread = await fetchPortfolio(client, USER_A, dk, created.meta.id);
    expect((reread?.content.facts as Array<{ date: unknown }>)[0].date).toBe('2026-01-31');
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
    const existing = [{ id: 'p1', name: 'Joint', ownerId: USER_A, revision: 1, keyEpoch: 1, rotationDue: false }];
    expect(portfolioNameTaken('personal', existing)).toBe(true);
    expect(portfolioNameTaken('JOINT', existing)).toBe(true);
    expect(portfolioNameTaken('Joint', existing, 'p1')).toBe(false);
    expect(portfolioNameTaken('Company', existing)).toBe(false);
  });
});

describe('rotatePortfolioKey', () => {
  it('re-encrypts under a new key at the next epoch; the old key opens nothing new', async () => {
    const { client } = fakeServer();
    const dk = await generateDataKey();
    const created = await createPortfolio(client, USER_A, dk, 'Joint');
    const oldKey = new Uint8Array(created.portfolioKey);

    const { outcome, portfolioKey } = await rotatePortfolioKey(client, { meta: created.meta, userId: USER_A, dataKey: dk, data: sampleData() });
    expect(outcome).toEqual({ status: 'ok', revision: 2, keyEpoch: 2 });
    expect(portfolioKey).not.toBeNull();
    expect(Array.from(portfolioKey!)).not.toEqual(Array.from(oldKey));

    const reread = await fetchPortfolio(client, USER_A, dk, created.meta.id);
    expect(reread?.meta).toMatchObject({ revision: 2, keyEpoch: 2 });
    expect(Array.from(reread!.portfolioKey)).toEqual(Array.from(portfolioKey!));
    expect((reread?.content.facts as unknown[]).length).toBe(1);

    const withOldKey = await savePortfolio(client, { meta: { ...created.meta, revision: 2 }, portfolioKey: oldKey, data: null });
    expect(withOldKey.status).toBe('conflict');
  });

  it('returns no key on a conflict or while someone else is a member', async () => {
    const { client, members } = fakeServer();
    const dk = await generateDataKey();
    const created = await createPortfolio(client, USER_A, dk, 'Joint');

    const stale = await rotatePortfolioKey(client, { meta: { ...created.meta, revision: 7 }, userId: USER_A, dataKey: dk, data: null });
    expect(stale).toEqual({ outcome: { status: 'conflict' }, portfolioKey: null });

    members.push({ portfolio_id: created.meta.id, user_id: USER_B, wrapped_pk: 'x', key_epoch: 1 });
    const busy = await rotatePortfolioKey(client, { meta: created.meta, userId: USER_A, dataKey: dk, data: null });
    expect(busy).toEqual({ outcome: { status: 'members_remain' }, portfolioKey: null });
  });
});

describe('earlier versions', () => {
  it('lists replaced versions newest first and opens one', async () => {
    const { client } = fakeServer();
    const dk = await generateDataKey();
    const created = await createPortfolio(client, USER_A, dk, 'Joint');
    const first = await savePortfolio(client, { meta: created.meta, portfolioKey: created.portfolioKey, data: sampleData() });
    await savePortfolio(client, {
      meta: { ...created.meta, revision: first.status === 'ok' ? first.revision : 0 },
      portfolioKey: created.portfolioKey,
      data: null,
    });

    const versions = await listRevisions(client, created.meta.id);
    expect(versions.map((v) => v.revision)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({ keyEpoch: 1, savedBy: USER_A });

    const content = await openRevision(client, {
      userId: USER_A, dataKey: dk, meta: { ...created.meta, revision: 3 }, currentKey: created.portfolioKey, revision: 2,
    });
    expect((content.facts as unknown[]).length).toBe(1);
  });

  it('opens a version from before a rotation with the retired key', async () => {
    const { client } = fakeServer();
    const dk = await generateDataKey();
    const created = await createPortfolio(client, USER_A, dk, 'Joint');
    await savePortfolio(client, { meta: created.meta, portfolioKey: created.portfolioKey, data: sampleData() });
    const { outcome, portfolioKey } = await rotatePortfolioKey(client, {
      meta: { ...created.meta, revision: 2 }, userId: USER_A, dataKey: dk, data: null,
    });
    expect(outcome.status).toBe('ok');

    const content = await openRevision(client, {
      userId: USER_A, dataKey: dk, meta: { ...created.meta, revision: 3, keyEpoch: 2 }, currentKey: portfolioKey!, revision: 2,
    });
    expect((content.facts as unknown[]).length).toBe(1);
  });
});
