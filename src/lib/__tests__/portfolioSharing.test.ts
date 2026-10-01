import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { generateDataKey, generatePortfolioKey, unwrapPortfolioKey } from '@/lib/crypto';
import { base64UrlDecode } from '@/lib/base64url';
import { byteaToBytes } from '@/lib/keySession/bytea';
import {
  InviteError,
  InviteLinkMismatchError,
  acceptInvite,
  createInvite,
  getInvite,
  inviteLink,
  listPendingInvites,
  listPortfolioPeople,
  removeMember,
} from '../portfolioSharing';

const PORTFOLIO = '6f1c2b8e-7a4d-4c1e-9f55-0b6a2d1c8e40';
const PARTNER = '550e8400-e29b-41d4-a716-446655440001';

type Rpc = (fn: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null };

function client(rpc: Rpc, from?: (table: string) => unknown) {
  return {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => rpc(fn, args)),
    from: vi.fn((table: string) => from?.(table)),
  } as unknown as SupabaseClient<Database> & { rpc: ReturnType<typeof vi.fn> };
}

/** Invite created by the owner, stored as the server would, then looked up by the partner. */
async function stored() {
  const portfolioKey = await generatePortfolioKey();
  const rows = new Map<string, Record<string, unknown>>();
  const owner = client((fn, args) => {
    if (fn !== 'create_portfolio_invite') throw new Error(fn);
    rows.set(args.p_invite_id as string, args);
    return { data: null, error: null };
  });
  const { inviteId, link } = await createInvite(owner, {
    portfolioId: PORTFOLIO,
    keyEpoch: 3,
    portfolioKey,
    email: 'sam@example.com',
    origin: 'https://usequantive.app',
  });
  const row = rows.get(inviteId)!;
  const partnerLookup = client((fn) => {
    if (fn !== 'get_portfolio_invite') throw new Error(fn);
    return {
      data: [{
        status: 'ok', portfolio_id: PORTFOLIO, key_epoch: 3, wrapped_pk: row.p_wrapped_pk,
        invited_by: 'me@example.com', expires_at: '2030-01-01T00:00:00Z',
      }],
      error: null,
    };
  });
  const invite = await getInvite(partnerLookup, inviteId);
  const secret = base64UrlDecode(link.split('#k=')[1]);
  return { portfolioKey, inviteId, link, row, invite, secret };
}

describe('createInvite', () => {
  it('builds /join/<id>#k=<secret>, and the secret never reaches the server', async () => {
    const { inviteId, link, row, secret } = await stored();
    expect(link).toMatch(new RegExp(`^https://usequantive\\.app/join/${inviteId}#k=[A-Za-z0-9_-]{43}$`));
    expect(secret).toHaveLength(32);
    expect(row).toMatchObject({ p_portfolio_id: PORTFOLIO, p_invitee_email: 'sam@example.com', p_key_epoch: 3 });
    const sent = JSON.stringify(row);
    expect(sent).not.toContain(link.split('#k=')[1]);
    expect(byteaToBytes(row.p_wrapped_pk as string)).toHaveLength(72);
  });

  it('maps a refusal to its code', async () => {
    const c = client(() => ({ data: null, error: { message: 'seat_taken' } }));
    await expect(createInvite(c, { portfolioId: PORTFOLIO, keyEpoch: 1, portfolioKey: await generatePortfolioKey(), email: 'x@y.z', origin: 'o' }))
      .rejects.toEqual(new InviteError('seat_taken'));
    const other = client(() => ({ data: null, error: { message: 'boom' } }));
    await expect(createInvite(other, { portfolioId: PORTFOLIO, keyEpoch: 1, portfolioKey: await generatePortfolioKey(), email: 'x@y.z', origin: 'o' }))
      .rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('acceptInvite', () => {
  it("re-wraps the portfolio key under the partner's own data key", async () => {
    const { portfolioKey, inviteId, invite, secret } = await stored();
    if (invite.status !== 'ok') throw new Error('lookup failed');
    const dataKey = await generateDataKey();
    let sentWrap = '';
    const c = client((fn, args) => {
      expect(fn).toBe('accept_portfolio_invite');
      sentWrap = args.p_wrapped_pk as string;
      return { data: 'ok', error: null };
    });

    expect(await acceptInvite(c, { inviteId, invite, inviteSecret: secret, dataKey, userId: PARTNER })).toBe('ok');
    const unwrapped = await unwrapPortfolioKey({ wrappedPk: byteaToBytes(sentWrap), dataKey, userId: PARTNER, portfolioId: PORTFOLIO, keyEpoch: 3 });
    expect(Array.from(unwrapped)).toEqual(Array.from(portfolioKey));
  });

  it('refuses a secret that does not match the invite, before calling the server', async () => {
    const { inviteId, invite } = await stored();
    if (invite.status !== 'ok') throw new Error('lookup failed');
    const c = client(() => ({ data: 'ok', error: null }));
    const wrongSecret = new Uint8Array(32).fill(1);
    await expect(acceptInvite(c, { inviteId, invite, inviteSecret: wrongSecret, dataKey: await generateDataKey(), userId: PARTNER }))
      .rejects.toBeInstanceOf(InviteLinkMismatchError);
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("refuses an invite presented under another invite's id", async () => {
    const { invite, secret } = await stored();
    if (invite.status !== 'ok') throw new Error('lookup failed');
    const c = client(() => ({ data: 'ok', error: null }));
    await expect(acceptInvite(c, { inviteId: '11111111-1111-4111-8111-111111111111', invite, inviteSecret: secret, dataKey: await generateDataKey(), userId: PARTNER }))
      .rejects.toBeInstanceOf(InviteLinkMismatchError);
  });

  it("passes on the server's reason", async () => {
    const { inviteId, invite, secret } = await stored();
    if (invite.status !== 'ok') throw new Error('lookup failed');
    const c = client(() => ({ data: 'used', error: null }));
    expect(await acceptInvite(c, { inviteId, invite, inviteSecret: secret, dataKey: await generateDataKey(), userId: PARTNER })).toBe('used');
  });
});

describe('getInvite', () => {
  it('returns the problem for anything but ok, and treats unknown statuses as not found', async () => {
    expect(await getInvite(client(() => ({ data: [{ status: 'wrong_account' }], error: null })), 'i')).toEqual({ status: 'wrong_account' });
    expect(await getInvite(client(() => ({ data: [{ status: 'surprise' }], error: null })), 'i')).toEqual({ status: 'not_found' });
    expect(await getInvite(client(() => ({ data: [], error: null })), 'i')).toEqual({ status: 'not_found' });
  });
});

describe('listing and removal', () => {
  it('maps people and pending invites', async () => {
    const people = client(() => ({
      data: [{ portfolio_id: PORTFOLIO, user_id: PARTNER, email: 'sam@example.com', is_owner: false, joined_at: 'x' }],
      error: null,
    }));
    expect(await listPortfolioPeople(people)).toEqual([{ portfolioId: PORTFOLIO, userId: PARTNER, email: 'sam@example.com', isOwner: false }]);

    const filters: string[] = [];
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = (c: string, v: string) => { filters.push(`${c}=${v}`); return builder; };
    builder.is = (c: string, v: unknown) => { filters.push(`${c} is ${v}`); return builder; };
    builder.gt = (c: string) => { filters.push(`${c}>now`); return Promise.resolve({
      data: [{ id: 'i1', portfolio_id: PORTFOLIO, invitee_email: 'sam@example.com', expires_at: '2030-01-01' }],
      error: null,
    }); };
    const invites = client(() => ({ data: null, error: null }), () => builder);
    expect(await listPendingInvites(invites, 'u1')).toEqual([{ id: 'i1', portfolioId: PORTFOLIO, inviteeEmail: 'sam@example.com', expiresAt: '2030-01-01' }]);
    expect(filters).toEqual(['created_by=u1', 'consumed_at is null', 'expires_at>now']);
  });

  it('throws when RLS let nothing be removed', async () => {
    const builder: Record<string, unknown> = {};
    builder.delete = () => builder;
    builder.eq = () => builder;
    builder.select = async () => ({ data: [], error: null });
    const c = client(() => ({ data: null, error: null }), () => builder);
    await expect(removeMember(c, PORTFOLIO, PARTNER)).rejects.toThrow(/not removed/);
  });
});

describe('inviteLink', () => {
  it('encodes the secret as unpadded base64url', () => {
    const secret = new Uint8Array(32).fill(255);
    expect(inviteLink('https://a.b', 'id', secret)).toBe(`https://a.b/join/id#k=${'_'.repeat(42)}8`);
  });
});
