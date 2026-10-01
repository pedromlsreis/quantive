import { describe, it, expect, vi } from 'vitest';
import {
  deleteAccountData,
  deleteUserData,
  ENCRYPTED_DATA_TABLES,
  releaseOwnedPortfolios,
  USER_DATA_TABLES,
} from '../userDataDelete';

interface Call {
  table: string;
  column: string;
  value: string;
}

function fakeClient(opts: { failOn?: Record<string, string>; releaseError?: string } = {}) {
  const calls: Call[] = [];
  const failOn = opts.failOn ?? {};
  const client = {
    async rpc(fn: 'release_owned_portfolios', args: { p_user_id: string }) {
      calls.push({ table: `rpc:${fn}`, column: 'p_user_id', value: args.p_user_id });
      return { error: opts.releaseError ? { message: opts.releaseError } : null };
    },
    from(table: string) {
      return {
        delete() {
          return {
            async eq(column: string, value: string) {
              calls.push({ table, column, value });
              const failure = failOn[table];
              return { error: failure ? { message: failure } : null };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe('USER_DATA_TABLES', () => {
  it('lists every user-scoped table the self-delete flow must clear', () => {
    // Snapshot the contract so anyone adding a user-scoped table sees this
    // test fail and remembers to wire it into the deletion path. Consumed
    // by both self-delete (delete-account) and admin-delete (admin-users).
    // Owned portfolios aren't listed: releaseOwnedPortfolios handles them first.
    expect([...USER_DATA_TABLES]).toEqual([
      'portfolio_members',
      'portfolio_key_history',
      'family_beta',
      'portfolio_snapshots',
      'feedback',
      'user_keys',
      'user_roles',
      'profiles',
    ]);
  });
});

describe('ENCRYPTED_DATA_TABLES', () => {
  it('lists the encrypted data before the key row, and nothing else', () => {
    // reset-encrypted-data deletes in this order and stops at the first
    // failure, so data is never left behind without its key row.
    expect([...ENCRYPTED_DATA_TABLES]).toEqual([
      'portfolio_members',
      'portfolio_key_history',
      'portfolio_snapshots',
      'user_keys',
    ]);
  });
});

describe('deleteUserData', () => {
  it('deletes each table in the configured order, filtered by user_id', async () => {
    const { client, calls } = fakeClient();
    const result = await deleteUserData(client, 'user-123');

    expect(calls).toEqual([
      { table: 'portfolio_members', column: 'user_id', value: 'user-123' },
      { table: 'portfolio_key_history', column: 'user_id', value: 'user-123' },
      { table: 'family_beta', column: 'user_id', value: 'user-123' },
      { table: 'portfolio_snapshots', column: 'user_id', value: 'user-123' },
      { table: 'feedback', column: 'user_id', value: 'user-123' },
      { table: 'user_keys', column: 'user_id', value: 'user-123' },
      { table: 'user_roles', column: 'user_id', value: 'user-123' },
      { table: 'profiles', column: 'user_id', value: 'user-123' },
    ]);
    expect(result.deletedTables).toEqual([
      'portfolio_members',
      'portfolio_key_history',
      'family_beta',
      'portfolio_snapshots',
      'feedback',
      'user_keys',
      'user_roles',
      'profiles',
    ]);
    expect(result.errors).toEqual([]);
  });

  it('continues to later tables when an earlier one fails', async () => {
    // If `feedback` delete fails (transient DB error, RLS misconfig), we
    // still want the rest cleared — partial cleanup is better than none,
    // and auth.users deletion in the caller is the final irreversible step.
    const { client, calls } = fakeClient({ failOn: { feedback: 'lock timeout' } });
    const result = await deleteUserData(client, 'user-123');

    expect(calls.map((c) => c.table)).toEqual([
      'portfolio_members',
      'portfolio_key_history',
      'family_beta',
      'portfolio_snapshots',
      'feedback',
      'user_keys',
      'user_roles',
      'profiles',
    ]);
    expect(result.deletedTables).toEqual([
      'portfolio_members',
      'portfolio_key_history',
      'family_beta',
      'portfolio_snapshots',
      'user_keys',
      'user_roles',
      'profiles',
    ]);
    expect(result.errors).toEqual([{ table: 'feedback', message: 'lock timeout' }]);
  });

  it('reports every failure with its table name', async () => {
    const { client } = fakeClient({
      failOn: {
        portfolio_snapshots: 'connection refused',
        profiles: 'permission denied',
      },
    });
    const result = await deleteUserData(client, 'user-xyz');

    expect(result.deletedTables).toEqual(['portfolio_members', 'portfolio_key_history', 'family_beta', 'feedback', 'user_keys', 'user_roles']);
    expect(result.errors).toEqual([
      { table: 'portfolio_snapshots', message: 'connection refused' },
      { table: 'profiles', message: 'permission denied' },
    ]);
  });

  it('is idempotent — a second call on an already-cleared user is a no-op shape-wise', async () => {
    // The real client returns { error: null } for delete-by-eq when no rows
    // match. We model that here. The self-delete flow's natural idempotency
    // also relies on the caller's auth check returning 401 on the second
    // call (the auth.users row is gone), but this helper itself must not
    // throw or report errors when there's nothing to delete.
    const { client } = fakeClient();
    const first = await deleteUserData(client, 'user-once');
    const second = await deleteUserData(client, 'user-once');
    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(second.deletedTables).toEqual(first.deletedTables);
  });

  it('honours a caller-supplied table list (used to share with admin path)', async () => {
    const { client, calls } = fakeClient();
    await deleteUserData(client, 'user-abc', ['profiles', 'user_keys']);
    expect(calls.map((c) => c.table)).toEqual(['profiles', 'user_keys']);
  });

  it('passes the userId through verbatim — no implicit trimming or casing', async () => {
    // Auth user ids are UUIDs but we don't validate format — we just match
    // exactly what auth.getUser() returned. A test pins this so a future
    // "helpful" lowercase/trim never lands silently.
    const { client, calls } = fakeClient();
    await deleteUserData(client, '  User-WITH-Spaces  ');
    expect(calls[0].value).toBe('  User-WITH-Spaces  ');
  });
});

describe('deleteUserData — call shape', () => {
  it('only invokes from().delete().eq() — never a bare from(table).delete()', async () => {
    // Without the .eq() filter, supabase-js sends an unbounded DELETE that
    // RLS may or may not stop. The helper must always pass user_id.
    const fromSpy = vi.fn();
    const eqSpy = vi.fn(async () => ({ error: null }));
    const client = {
      from(table: string) {
        fromSpy(table);
        return {
          delete() {
            return { eq: eqSpy };
          },
        };
      },
    };
    await deleteUserData(client, 'u1', ['profiles']);
    expect(fromSpy).toHaveBeenCalledWith('profiles');
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'u1');
  });
});

describe('releaseOwnedPortfolios / deleteAccountData', () => {
  it('releases owned portfolios before any table is cleared', async () => {
    const { client, calls } = fakeClient();
    const result = await deleteAccountData(client, 'user-123');
    expect(calls[0]).toEqual({ table: 'rpc:release_owned_portfolios', column: 'p_user_id', value: 'user-123' });
    expect(calls.slice(1).map((c) => c.table)).toEqual([...USER_DATA_TABLES]);
    expect(result.errors).toEqual([]);
  });

  it('touches no table when the release fails', async () => {
    // A shared portfolio that failed to pass to the partner must stop the
    // deletion; clearing member rows first would lock the partner out.
    const { client, calls } = fakeClient({ releaseError: 'deadlock detected' });
    const result = await deleteAccountData(client, 'user-123');
    expect(calls.map((c) => c.table)).toEqual(['rpc:release_owned_portfolios']);
    expect(result).toEqual({ deletedTables: [], errors: [{ table: 'portfolios', message: 'deadlock detected' }] });
  });

  it('reports the release error on its own', async () => {
    const { client } = fakeClient({ releaseError: 'permission denied' });
    expect(await releaseOwnedPortfolios(client, 'u1')).toEqual({ error: 'permission denied' });
    const ok = fakeClient();
    expect(await releaseOwnedPortfolios(ok.client, 'u1')).toEqual({ error: null });
  });
});
