import { describe, it, expect, vi } from 'vitest';
import { requireAdmin } from '../requireAdmin';

function authClient(behaviour: {
  user?: { id: string } | null;
  error?: { message: string } | null;
  throws?: boolean;
}) {
  return {
    auth: {
      getUser: vi.fn(async () => {
        if (behaviour.throws) throw new Error('network');
        return {
          data: { user: behaviour.user ?? null },
          error: behaviour.error ?? null,
        };
      }),
    },
  };
}

function rpcClient(behaviour: { data?: unknown; error?: { message: string } | null }) {
  return {
    rpc: vi.fn(async () => ({
      data: behaviour.data ?? null,
      error: behaviour.error ?? null,
    })),
  };
}

describe('requireAdmin', () => {
  it('rejects with 401 when the Authorization header is missing', async () => {
    const user = authClient({ user: { id: 'u1' } });
    const service = rpcClient({ data: true });
    const result = await requireAdmin(null, user, service);

    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
    // Critical: we must short-circuit before calling getUser — no token, no
    // reason to round-trip to supabase auth.
    expect(user.auth.getUser).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the Authorization header is the empty string', async () => {
    // Some clients send `Authorization: ` literally — the spec says treat as
    // absent. We do.
    const user = authClient({ user: { id: 'u1' } });
    const service = rpcClient({ data: true });
    const result = await requireAdmin('', user, service);
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('rejects with 401 when the token does not resolve to a user', async () => {
    // Expired JWT, malformed token, anon key, etc — supabase-js returns
    // user=null. Must NOT leak to a 403 here, because 403 implies "you're
    // logged in, just not allowed" — which would tell a prober that the
    // endpoint exists and accepts auth.
    const user = authClient({ user: null });
    const service = rpcClient({ data: true });
    const result = await requireAdmin('Bearer expired', user, service);
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it('rejects with 401 when getUser returns an error', async () => {
    const user = authClient({
      user: null,
      error: { message: 'JWT expired' },
    });
    const service = rpcClient({ data: true });
    const result = await requireAdmin('Bearer x', user, service);
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('rejects with 403 when the user exists but is_admin returns false', async () => {
    // Logged-in non-admin probing an admin endpoint. 403 is correct here —
    // they've already proven auth, hiding the endpoint isn't the goal.
    const user = authClient({ user: { id: 'normal-user' } });
    const service = rpcClient({ data: false });
    const result = await requireAdmin('Bearer ok', user, service);
    expect(result).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('rejects with 403 when is_admin returns null (no row in user_roles)', async () => {
    // Stricter than `!== true`: we must reject null, undefined, 0, "true"
    // (string), and any other truthy-but-not-boolean-true value. The RPC
    // contract is "boolean true means admin, anything else means deny".
    const user = authClient({ user: { id: 'u' } });
    const result = await requireAdmin('Bearer ok', user, rpcClient({ data: null }));
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.status).toBe(403);
  });

  it('rejects with 403 when the is_admin RPC errored', async () => {
    // Fail-closed on admin checks: a DB hiccup must not grant access.
    // (Contrast with checkRateLimit, which fails open — different priorities.)
    const user = authClient({ user: { id: 'u' } });
    const service = rpcClient({ error: { message: 'connection refused' } });
    const result = await requireAdmin('Bearer ok', user, service);
    expect(result).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('rejects with 403 when is_admin returns a truthy non-true value', async () => {
    // The string "true", number 1, object {} are all truthy but the RPC
    // contract is strict boolean. Anything else is a deny.
    const user = authClient({ user: { id: 'u' } });
    for (const data of ['true', 1, {}, 'admin']) {
      const result = await requireAdmin('Bearer ok', user, rpcClient({ data }));
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.status).toBe(403);
    }
  });

  it('allows when getUser returns a user and is_admin returns true', async () => {
    const user = authClient({ user: { id: 'admin-uuid' } });
    const service = rpcClient({ data: true });
    const result = await requireAdmin('Bearer ok', user, service);
    expect(result).toEqual({ ok: true, userId: 'admin-uuid' });
  });

  it('passes the resolved user id to is_admin (never trusts the caller)', async () => {
    // Defence-in-depth: the RPC receives the id supabase resolved from the
    // JWT, not a value pulled from the request body or a header.
    const user = authClient({ user: { id: 'real-id-from-jwt' } });
    const service = rpcClient({ data: true });
    await requireAdmin('Bearer ok', user, service);
    expect(service.rpc).toHaveBeenCalledWith('is_admin', {
      _user_id: 'real-id-from-jwt',
    });
  });

  it('does not consult is_admin when the user lookup short-circuits', async () => {
    const user = authClient({ user: null });
    const service = rpcClient({ data: true });
    await requireAdmin('Bearer x', user, service);
    expect(service.rpc).not.toHaveBeenCalled();
  });
});
