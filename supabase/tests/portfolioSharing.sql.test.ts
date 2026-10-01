/**
 * The extra-portfolio migrations on an in-memory Postgres (PGlite): RLS,
 * triggers and the SECURITY DEFINER functions, as the roles PostgREST uses.
 * Spec: docs/security/encryption.md §7.3, §8.7–§8.10.
 *
 * Supabase's own pieces are stubbed: the anon/authenticated/service_role
 * roles, auth.users, auth.uid() (read from the request.jwt.claim.sub
 * setting, as Supabase does), pg_cron, and update_updated_at_column from an
 * earlier migration. Key material is fake bytes: only the client checks it.
 * e2e/rls-portfolios.spec.ts runs the same kind of checks against the live
 * project.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = join(__dirname, '..', 'migrations');

const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create schema cron;
create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
create function public.update_updated_at_column() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
`;

const migration = (name: string) =>
  readFileSync(join(MIGRATIONS, name), 'utf8').replace(/create extension if not exists pg_cron[^;]*;/g, '');

const OWNER = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const OTHER_OWNER = '44444444-4444-4444-8444-444444444444';

const P = 'aaaaaaaa-0000-4000-8000-000000000001';
const P2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const P3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const P4 = 'aaaaaaaa-0000-4000-8000-000000000004';
const Q = 'aaaaaaaa-0000-4000-8000-0000000000ff';

let db: PGlite;
let inviteCount = 0;
const nextInviteId = () => `bbbbbbbb-0000-4000-8000-${String(++inviteCount).padStart(12, '0')}`;
const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill);

type Row = Record<string, unknown>;

/** Runs a query as `uid` through the authenticated role, or as service_role when uid is null. */
async function as(uid: string | null, sql: string, params: unknown[] = []): Promise<Row[]> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  await db.exec(uid ? 'set role authenticated' : 'set role service_role');
  try {
    return (await db.query<Row>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
const one = async (uid: string | null, sql: string, params: unknown[] = []) => (await as(uid, sql, params))[0];

const createPortfolio = (uid: string, id: string) =>
  as(uid, 'select public.create_portfolio($1, $2, $3, $4, 1)', [id, bytes(72), bytes(40), bytes(24)]);
const save = (uid: string, id: string, revision: unknown, epoch = 1, fill = 2) =>
  one(uid, 'select * from public.save_portfolio($1, $2, $3, $4, $5, 1)', [id, revision, epoch, bytes(40, fill), bytes(24)]);
const rotate = (uid: string, id: string, revision: unknown, epoch: number) =>
  one(uid, 'select * from public.rotate_portfolio_key($1, $2, $3, $4, $5, 1, $6)', [id, revision, epoch, bytes(40, 6), bytes(24), bytes(72, 8)]);
async function invite(uid: string, id: string, email: string, epoch = 1): Promise<string> {
  const inviteId = nextInviteId();
  await as(uid, 'select public.create_portfolio_invite($1, $2, $3, $4, $5)', [inviteId, id, email, bytes(72, 7), epoch]);
  return inviteId;
}
const lookup = (uid: string, inviteId: string) => one(uid, 'select * from public.get_portfolio_invite($1)', [inviteId]);
const accept = async (uid: string, inviteId: string) =>
  (await one(uid, 'select public.accept_portfolio_invite($1, $2) as status', [inviteId, bytes(72, 9)])).status;
const stored = (id: string) => one(null, 'select owner_id, revision, key_epoch, rotation_due, saved_by from public.portfolios where id = $1', [id]);
const seats = () => as(null, 'select owner_id, partner_id from public.family_partners');

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(migration('20260930120000_portfolios.sql'));
  await db.exec(migration('20261001120000_portfolio_sharing.sql'));
  await db.exec(`
    insert into auth.users values
      ('${OWNER}', 'owner@example.com', now()),
      ('${PARTNER}', 'partner@example.com', now()),
      ('${STRANGER}', 'stranger@example.com', now()),
      ('${OTHER_OWNER}', 'other@example.com', now());
    insert into public.family_beta (user_id) values ('${OWNER}'), ('${OTHER_OWNER}');
  `);
}, 60_000);

// The scenarios build on each other, in order.
describe.sequential('portfolio sharing migration', () => {
  it('keeps the version a save replaced and records who saved', async () => {
    await createPortfolio(OWNER, P);
    const r = await save(OWNER, P, 1);
    expect(r).toMatchObject({ status: 'ok' });
    expect(Number(r.current_revision)).toBe(2);
    expect((await stored(P)).saved_by).toBe(OWNER);
    const revisions = await as(null, 'select revision from public.portfolio_revisions where portfolio_id = $1', [P]);
    expect(revisions.map((x) => Number(x.revision))).toEqual([1]);
  });

  it('shows a stranger nothing', async () => {
    for (const table of ['portfolios', 'portfolio_members', 'portfolio_revisions', 'portfolio_invites', 'family_partners']) {
      expect(await as(STRANGER, `select * from public.${table}`), table).toEqual([]);
    }
    expect(await as(STRANGER, 'select * from public.list_portfolio_people()')).toEqual([]);
    expect((await save(STRANGER, P, 2)).status).toBe('forbidden');
  });

  it('lets only an owner with Family invite, and checks the email and epoch', async () => {
    await expect(invite(STRANGER, P, 'partner@example.com')).rejects.toThrow(/forbidden/);
    await as(null, 'delete from public.family_beta where user_id = $1', [OWNER]);
    await expect(invite(OWNER, P, 'partner@example.com')).rejects.toThrow(/family_required/);
    await as(null, 'insert into public.family_beta (user_id) values ($1)', [OWNER]);
    await expect(invite(OWNER, P, 'Owner@Example.com')).rejects.toThrow(/self_invite/);
    await expect(invite(OWNER, P, 'partner@example.com', 2)).rejects.toThrow(/stale_epoch/);
    await expect(invite(OWNER, P, 'not-an-email')).rejects.toThrow(/invalid_email/);
  });

  let inviteId = '';
  it('keeps one pending invite per portfolio, readable as a row only by its creator', async () => {
    const first = await invite(OWNER, P, 'partner@example.com');
    inviteId = await invite(OWNER, P, ' Partner@Example.COM ');
    expect(await as(OWNER, 'select id, invitee_email from public.portfolio_invites')).toEqual([
      { id: inviteId, invitee_email: 'partner@example.com' },
    ]);
    expect((await lookup(PARTNER, first)).status).toBe('not_found');
    expect(await as(PARTNER, 'select * from public.portfolio_invites')).toEqual([]);
  });

  it('describes an invite only to the invited, confirmed account', async () => {
    const stranger = await lookup(STRANGER, inviteId);
    expect(stranger).toMatchObject({ status: 'wrong_account', wrapped_pk: null, portfolio_id: null });
    expect((await lookup(OWNER, inviteId)).status).toBe('own_invite');
    await db.exec(`update auth.users set email_confirmed_at = null where id = '${PARTNER}'`);
    expect((await lookup(PARTNER, inviteId)).status).toBe('unconfirmed');
    expect(await accept(PARTNER, inviteId)).toBe('unconfirmed');
    await db.exec(`update auth.users set email_confirmed_at = now() where id = '${PARTNER}'`);
    expect(await lookup(PARTNER, inviteId)).toMatchObject({
      status: 'ok', portfolio_id: P, key_epoch: 1, invited_by: 'owner@example.com',
    });
    expect(await accept(STRANGER, inviteId)).toBe('wrong_account');
  });

  it('accepts an invite once, clearing its wrap and taking the seat', async () => {
    expect(await accept(PARTNER, inviteId)).toBe('ok');
    expect(await one(null, 'select consumed_by, wrapped_pk_invite from public.portfolio_invites where id = $1', [inviteId]))
      .toEqual({ consumed_by: PARTNER, wrapped_pk_invite: null });
    expect(await as(PARTNER, 'select owner_id, partner_id from public.family_partners')).toEqual([{ owner_id: OWNER, partner_id: PARTNER }]);
    expect(await accept(PARTNER, inviteId)).toBe('already_member');
    const people = await as(PARTNER, 'select email, is_owner from public.list_portfolio_people()');
    expect(people.map((p) => [p.email, p.is_owner]).sort()).toEqual([['owner@example.com', true], ['partner@example.com', false]]);
  });

  it('lets the partner save, recording them as the author', async () => {
    const { revision } = await stored(P);
    expect((await save(PARTNER, P, revision, 1, 3)).status).toBe('ok');
    expect((await stored(P)).saved_by).toBe(PARTNER);
    expect(await as(PARTNER, 'select revision from public.portfolio_revisions where portfolio_id = $1', [P])).toHaveLength(2);
  });

  it("doesn't let the partner remove the owner, delete, rewrite wraps or revisions, rotate or invite", async () => {
    expect(await as(PARTNER, 'delete from public.portfolio_members where user_id = $1 returning user_id', [OWNER])).toEqual([]);
    expect(await as(PARTNER, 'delete from public.portfolios where id = $1 returning id', [P])).toEqual([]);
    await expect(as(PARTNER, 'update public.portfolio_members set wrapped_pk = $1', [bytes(72, 5)])).rejects.toThrow(/permission denied/);
    await expect(as(PARTNER, 'update public.portfolios set revision = 99')).rejects.toThrow(/permission denied/);
    await expect(as(PARTNER, 'insert into public.portfolio_invites (id, portfolio_id, created_by, invitee_email, wrapped_pk_invite, key_epoch) values ($1, $2, $3, $4, $5, 1)', [nextInviteId(), P, PARTNER, 'x@y.z', bytes(72)]))
      .rejects.toThrow(/permission denied/);
    const { revision } = await stored(P);
    expect((await rotate(PARTNER, P, revision, 1)).status).toBe('forbidden');
    await expect(invite(PARTNER, P, 'stranger@example.com')).rejects.toThrow(/forbidden/);
    await expect(as(PARTNER, 'select public.release_owned_portfolios($1)', [OWNER])).rejects.toThrow(/permission denied/);
    await expect(as(PARTNER, 'select public.has_family($1)', [OWNER])).rejects.toThrow(/permission denied/);
  });

  it('holds one partner seat per owner', async () => {
    await createPortfolio(OWNER, P2);
    await expect(invite(OWNER, P2, 'stranger@example.com')).rejects.toThrow(/seat_taken/);
    await expect(invite(OWNER, P, 'partner@example.com')).rejects.toThrow(/already_member/);
    expect(await accept(PARTNER, await invite(OWNER, P2, 'partner@example.com'))).toBe('ok');
  });

  it('refuses someone who is already the partner on another Family plan', async () => {
    await createPortfolio(OTHER_OWNER, Q);
    const other = await invite(OTHER_OWNER, Q, 'partner@example.com');
    expect((await lookup(PARTNER, other)).status).toBe('already_partnered');
    expect(await accept(PARTNER, other)).toBe('already_partnered');
    await as(OTHER_OWNER, 'delete from public.portfolio_invites where id = $1', [other]);
  });

  it("won't rotate while the partner is still a member", async () => {
    const { revision } = await stored(P);
    expect((await rotate(OWNER, P, revision, 1)).status).toBe('members_remain');
  });

  it('flags a rotation when the partner is removed, keeping the seat while they are in another portfolio', async () => {
    expect(await as(OWNER, 'delete from public.portfolio_members where portfolio_id = $1 and user_id = $2 returning user_id', [P, PARTNER])).toHaveLength(1);
    expect((await stored(P)).rotation_due).toBe(true);
    expect(await seats()).toHaveLength(1);
    expect(await as(PARTNER, 'select id from public.portfolios where id = $1', [P])).toEqual([]);
    expect(await as(PARTNER, 'select * from public.portfolio_revisions where portfolio_id = $1', [P])).toEqual([]);
    const { revision } = await stored(P);
    expect((await save(PARTNER, P, revision, 1, 4)).status).toBe('forbidden');
    await expect(invite(OWNER, P, 'partner@example.com')).rejects.toThrow(/rotation_due/);
  });

  it('frees the seat when the partner leaves their last shared portfolio', async () => {
    expect(await as(PARTNER, 'delete from public.portfolio_members where portfolio_id = $1 and user_id = $2 returning user_id', [P2, PARTNER])).toHaveLength(1);
    expect((await stored(P2)).rotation_due).toBe(true);
    expect(await seats()).toEqual([]);
  });

  it('rotates on the current revision, keeps the retired wrap and makes old-key saves conflict', async () => {
    const before = await stored(P);
    expect((await rotate(OWNER, P, Number(before.revision) - 1, 1)).status).toBe('conflict');
    expect(await rotate(OWNER, P, before.revision, 1)).toMatchObject({ status: 'ok', current_epoch: 2 });
    expect(await stored(P)).toMatchObject({ key_epoch: 2, rotation_due: false });
    expect(await one(OWNER, 'select key_epoch from public.portfolio_members where portfolio_id = $1', [P])).toEqual({ key_epoch: 2 });
    expect(await as(OWNER, 'select key_epoch from public.portfolio_key_history where portfolio_id = $1', [P])).toEqual([{ key_epoch: 1 }]);
    expect(await as(STRANGER, 'select * from public.portfolio_key_history')).toEqual([]);
    const { revision } = await stored(P);
    expect((await save(OWNER, P, revision, 1)).status).toBe('conflict');
  });

  it('refuses expired invites, and drops pending ones on rotation', async () => {
    const expiring = await invite(OWNER, P, 'partner@example.com', 2);
    await db.exec(`update public.portfolio_invites set expires_at = now() - interval '1 minute' where id = '${expiring}'`);
    expect((await lookup(PARTNER, expiring)).status).toBe('expired');
    expect(await accept(PARTNER, expiring)).toBe('expired');
    const pending = await invite(OWNER, P, 'partner@example.com', 2);
    const { revision } = await stored(P);
    expect((await rotate(OWNER, P, revision, 2)).status).toBe('ok');
    expect((await lookup(PARTNER, pending)).status).toBe('not_found');
  });

  it('keeps the newest 20 versions and drops retired keys none of them needs', async () => {
    let { revision } = await stored(P);
    const epoch = Number((await stored(P)).key_epoch);
    for (let i = 0; i < 25; i++) {
      const r = await save(OWNER, P, revision, epoch, 10 + i);
      expect(r.status).toBe('ok');
      revision = r.current_revision;
    }
    const revisions = await as(null, 'select key_epoch from public.portfolio_revisions where portfolio_id = $1', [P]);
    expect(revisions).toHaveLength(20);
    expect(revisions.every((r) => r.key_epoch === epoch)).toBe(true);
    expect(await as(null, 'select * from public.portfolio_key_history where portfolio_id = $1', [P])).toEqual([]);
  });

  it('lets the owner, and only the owner, revoke a pending invite', async () => {
    const pending = await invite(OWNER, P, 'partner@example.com', 3);
    expect(await as(PARTNER, 'delete from public.portfolio_invites where id = $1 returning id', [pending])).toEqual([]);
    expect(await as(OWNER, 'delete from public.portfolio_invites where id = $1 returning id', [pending])).toHaveLength(1);
  });

  it('frees the seat when the owner deletes the shared portfolio', async () => {
    await createPortfolio(OWNER, P3);
    expect(await accept(PARTNER, await invite(OWNER, P3, 'partner@example.com'))).toBe('ok');
    expect(await seats()).toHaveLength(1);
    expect(await as(OWNER, 'delete from public.portfolios where id = $1 returning id', [P3])).toHaveLength(1);
    expect(await seats()).toEqual([]);
  });

  it('passes a shared portfolio to the partner on account deletion and deletes the rest', async () => {
    await createPortfolio(OWNER, P3);
    await createPortfolio(OWNER, P4);
    expect(await accept(PARTNER, await invite(OWNER, P3, 'partner@example.com'))).toBe('ok');
    const released = await one(null, 'select * from public.release_owned_portfolios($1)', [OWNER]);
    expect(released).toEqual({ transferred: 1, deleted: 3 });
    expect((await stored(P3)).owner_id).toBe(PARTNER);
    expect(await seats()).toEqual([]);
    await as(null, 'delete from public.portfolio_members where user_id = $1', [OWNER]);
    expect((await stored(P3)).rotation_due).toBe(true);
    await db.query('delete from auth.users where id = $1', [OWNER]);
    expect(await as(PARTNER, 'select id, owner_id from public.portfolios')).toEqual([{ id: P3, owner_id: PARTNER }]);
    const { revision, key_epoch } = await stored(P3);
    expect((await rotate(PARTNER, P3, revision, Number(key_epoch))).status).toBe('ok');
  });

  it('gives anon nothing', async () => {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;");
    try {
      await expect(db.query('select * from public.get_portfolio_invite($1)', [inviteId])).rejects.toThrow(/permission denied/);
      await expect(db.query('select * from public.portfolios')).rejects.toThrow(/permission denied/);
      await expect(db.query('select * from public.family_partners')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });
});
