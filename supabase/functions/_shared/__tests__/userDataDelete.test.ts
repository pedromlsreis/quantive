import { describe, it, expect, vi } from 'vitest';
import { deleteUserData, USER_DATA_TABLES } from '../userDataDelete';

interface Call {
  table: string;
  column: string;
  value: string;
}

function fakeClient(opts: { failOn?: Record<string, string> } = {}) {
  const calls: Call[] = [];
  const failOn = opts.failOn ?? {};
  const client = {
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
    expect([...USER_DATA_TABLES]).toEqual([
      'portfolio_snapshots',
      'feedback',
      'user_keys',
      'user_roles',
      'profiles',
    ]);
  });
});

describe('deleteUserData', () => {
  it('deletes each table in the configured order, filtered by user_id', async () => {
    const { client, calls } = fakeClient();
    const result = await deleteUserData(client, 'user-123');

    expect(calls).toEqual([
      { table: 'portfolio_snapshots', column: 'user_id', value: 'user-123' },
      { table: 'feedback', column: 'user_id', value: 'user-123' },
      { table: 'user_keys', column: 'user_id', value: 'user-123' },
      { table: 'user_roles', column: 'user_id', value: 'user-123' },
      { table: 'profiles', column: 'user_id', value: 'user-123' },
    ]);
    expect(result.deletedTables).toEqual([
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
      'portfolio_snapshots',
      'feedback',
      'user_keys',
      'user_roles',
      'profiles',
    ]);
    expect(result.deletedTables).toEqual([
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

    expect(result.deletedTables).toEqual(['feedback', 'user_keys', 'user_roles']);
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
