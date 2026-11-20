/**
 * admin_last_seen on an in-memory Postgres: it takes the later of the last
 * sign-in and the newest session refresh, reads GoTrue's zone-less
 * refreshed_at as UTC whatever the session time zone, and only service_role
 * can call it, even with Supabase's default grants to the API roles in place.
 *
 * auth.users and auth.sessions are stubbed with the columns the function
 * reads, typed as GoTrue creates them.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION = readFileSync(join(__dirname, '..', 'migrations', '20261120120000_admin_last_seen.sql'), 'utf8');

const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
alter default privileges in schema public grant all on functions to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
create table auth.users (id uuid primary key, last_sign_in_at timestamptz);
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz,
  refreshed_at timestamp without time zone
);
`;

const RETURNING = '00000000-0000-0000-0000-000000000001';
const FRESH_SIGN_IN = '00000000-0000-0000-0000-000000000002';
const SIGNED_OUT = '00000000-0000-0000-0000-000000000003';
const NEVER_SIGNED_IN = '00000000-0000-0000-0000-000000000004';

let db: PGlite;

async function lastSeen(): Promise<Record<string, string>> {
  await db.exec('set role service_role');
  try {
    const { rows } = await db.query<{ seen: Record<string, string> }>('select public.admin_last_seen() as seen');
    return rows[0].seen;
  } finally {
    await db.exec('reset role');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(MIGRATION);
  // GoTrue writes refreshed_at as UTC wall time into a zone-less column.
  await db.exec(`
    insert into auth.users values
      ('${RETURNING}', '2026-10-01T09:00:00Z'),
      ('${FRESH_SIGN_IN}', '2026-11-19T08:00:00Z'),
      ('${SIGNED_OUT}', '2026-11-02T12:00:00Z'),
      ('${NEVER_SIGNED_IN}', null);
    insert into auth.sessions (user_id, created_at, refreshed_at) values
      ('${RETURNING}', '2026-10-01T09:00:00Z', '2026-11-17 18:30:00'),
      ('${RETURNING}', '2026-09-01T09:00:00Z', '2026-09-20 10:00:00'),
      ('${FRESH_SIGN_IN}', '2026-11-19T08:00:00Z', null),
      ('${FRESH_SIGN_IN}', '2026-08-01T08:00:00Z', '2026-08-02 08:00:00');
  `);
});

describe('admin_last_seen', () => {
  it('uses the newest session refresh when it is later than the last sign-in', async () => {
    const seen = await lastSeen();
    expect(new Date(seen[RETURNING]).toISOString()).toBe('2026-11-17T18:30:00.000Z');
  });

  it('uses the last sign-in when no session refreshed after it, or none is left', async () => {
    const seen = await lastSeen();
    expect(new Date(seen[FRESH_SIGN_IN]).toISOString()).toBe('2026-11-19T08:00:00.000Z');
    expect(new Date(seen[SIGNED_OUT]).toISOString()).toBe('2026-11-02T12:00:00.000Z');
  });

  it('leaves out users who never signed in', async () => {
    expect(await lastSeen()).not.toHaveProperty(NEVER_SIGNED_IN);
  });

  it('reads refreshed_at as UTC whatever the session time zone', async () => {
    await db.exec("set timezone = 'Pacific/Auckland'");
    try {
      const seen = await lastSeen();
      expect(new Date(seen[RETURNING]).toISOString()).toBe('2026-11-17T18:30:00.000Z');
    } finally {
      await db.exec('reset timezone');
    }
  });

  it.each(['anon', 'authenticated'])('refuses %s', async (role) => {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query('select public.admin_last_seen()')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });
});
