/**
 * The email_signups migrations on an in-memory Postgres: double opt-in lands on
 * rows that existed before it, the nightly purges remove only what the privacy
 * policy says they remove, the public API roles can't reach either table even
 * with Supabase's default grants in place, and service_role reaches both, and
 * unsubscribes through email_list_unsubscribe, without them.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = join(__dirname, '..', 'migrations');
const read = (name: string) => readFileSync(join(MIGRATIONS, name), 'utf8');
const DOUBLE_OPT_IN = read('20261025120000_email_signups_double_opt_in.sql');
const [SIGNUPS_PURGE, CONSENT_PURGE] = [...DOUBLE_OPT_IN.matchAll(/cron\.schedule\([\s\S]*?\$\$([\s\S]*?)\$\$/g)].map((m) => m[1]);

// Supabase grants the API roles everything on new public tables and functions;
// the migrations' REVOKEs and deny-all policies exist because of that, so the
// access checks below only mean something with the same defaults in place.
// service_role gets no default grant, as after Supabase's 2026-10-30 cutoff:
// its access comes only from the migration's explicit GRANTs.
const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
create schema cron;
create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
`;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(read('20260619120000_email_signups.sql'));
  // Signups from before double opt-in existed: one old, one recent.
  await db.exec(`
    insert into public.email_signups (email, created_at) values
      ('early-old@example.com', now() - interval '30 days'),
      ('early-new@example.com', now() - interval '1 day');
  `);
  await db.exec(DOUBLE_OPT_IN);
});

describe('email_signups double opt-in', () => {
  it('leaves an earlier signup unconfirmed, with no link sent, no sends counted and its own unsubscribe token', async () => {
    const { rows } = await db.query<{ confirmed_at: string | null; confirm_sent_at: string | null; confirm_send_count: number; unsubscribe_token: string }>(
      `select confirmed_at, confirm_sent_at, confirm_send_count, unsubscribe_token from public.email_signups where email = 'early-new@example.com'`,
    );
    expect(rows[0]).toMatchObject({ confirmed_at: null, confirm_sent_at: null, confirm_send_count: 0 });
    expect(rows[0].unsubscribe_token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('allows one row per confirm link, and any number without one', async () => {
    await db.exec(`insert into public.email_signups (email) values ('a@example.com'), ('b@example.com')`);
    await db.exec(`insert into public.email_signups (email, confirm_token_hash) values ('c@example.com', 'h1')`);
    await expect(
      db.exec(`insert into public.email_signups (email, confirm_token_hash) values ('d@example.com', 'h1')`),
    ).rejects.toThrow();
  });

  it('purges unconfirmed signups 7 days after their last email, or after signup when none was sent', async () => {
    await db.exec(`
      insert into public.email_signups (email, confirm_sent_at, confirmed_at) values
        ('stale@example.com', now() - interval '8 days', null),
        ('waiting@example.com', now() - interval '1 day', null),
        ('confirmed@example.com', now() - interval '30 days', now() - interval '29 days');
    `);
    expect(SIGNUPS_PURGE).toMatch(/delete from public\.email_signups/);
    await db.exec(SIGNUPS_PURGE);

    const { rows } = await db.query<{ email: string }>(`select email from public.email_signups`);
    const left = rows.map((r) => r.email);
    expect(left).not.toContain('stale@example.com');
    expect(left).not.toContain('early-old@example.com');
    expect(left).toEqual(expect.arrayContaining(['waiting@example.com', 'confirmed@example.com', 'early-new@example.com']));
  });
});

describe('email_consent_events', () => {
  it('keeps a record while a confirmed row carries its hash, then to the end of the third year after its last event', async () => {
    // The two "closed" addresses unsubscribed an hour either side of the start
    // of the year three years back, so the result doesn't depend on today's date.
    await db.exec(`
      insert into public.email_signups (email, confirmed_at, email_hmac) values
        ('still@example.com', now() - interval '5 years', 'still-subscribed'),
        ('back@example.com', now() - interval '5 years', 'came-back');
      insert into public.email_consent_events (email_hmac, event, occurred_at) values
        ('closed-before-year-end', 'confirmed', now() - interval '6 years'),
        ('closed-before-year-end', 'unsubscribed', date_trunc('year', now()) - interval '3 years' - interval '1 hour'),
        ('closed-after-year-end', 'confirmed', now() - interval '6 years'),
        ('closed-after-year-end', 'unsubscribed', date_trunc('year', now()) - interval '3 years' + interval '1 hour'),
        ('closed-recently', 'confirmed', now() - interval '2 years'),
        ('closed-recently', 'unsubscribed', now() - interval '1 year'),
        ('orphaned', 'confirmed', now() - interval '5 years'),
        ('still-subscribed', 'confirmed', now() - interval '5 years'),
        ('came-back', 'unsubscribed', now() - interval '6 years'),
        ('came-back', 'confirmed', now() - interval '5 years');
    `);
    expect(CONSENT_PURGE).toMatch(/delete from public\.email_consent_events/);
    await db.exec(CONSENT_PURGE);

    const { rows } = await db.query<{ email_hmac: string }>(`select distinct email_hmac from public.email_consent_events`);
    expect(rows.map((r) => r.email_hmac).sort()).toEqual([
      'came-back',
      'closed-after-year-end',
      'closed-recently',
      'still-subscribed',
    ]);
  });

  it('accepts only the two events it records', async () => {
    await expect(
      db.exec(`insert into public.email_consent_events (email_hmac, event) values ('x', 'opened')`),
    ).rejects.toThrow();
  });
});

describe('public API roles', () => {
  it.each(['anon', 'authenticated'])('give %s no access to either table or the unsubscribe function', async (role) => {
    await db.exec(`set role ${role}`);
    try {
      for (const table of ['email_signups', 'email_consent_events']) {
        await expect(db.query(`select * from public.${table}`), `${role} on ${table}`).rejects.toThrow(/permission denied/);
      }
      await expect(
        db.query(`select public.email_list_unsubscribe(gen_random_uuid())`),
        `${role} on email_list_unsubscribe`,
      ).rejects.toThrow(/permission denied for function/);
    } finally {
      await db.exec('reset role');
    }
  });
});

describe('service_role', () => {
  const asServiceRole = async (sql: string) => {
    await db.exec('set role service_role');
    try {
      await db.exec(sql);
    } finally {
      await db.exec('reset role');
    }
  };
  const events = async (hmac: string) =>
    (await db.query<{ event: string }>(`select event from public.email_consent_events where email_hmac = '${hmac}' order by id`)).rows.map(
      (r) => r.event,
    );
  const rowCount = async (email: string) =>
    (await db.query(`select 1 from public.email_signups where email = '${email}'`)).rows.length;

  it('signs up, confirms, records consent and unsubscribes with only the explicit grants', async () => {
    await asServiceRole(`
      insert into public.email_signups (email, confirm_token_hash, confirm_sent_at, confirm_send_count, confirm_email_version, unsubscribe_token)
        values ('service@example.com', 'svc-hash', now(), 1, 'v1', '00000000-0000-4000-8000-000000000001');
      insert into public.email_consent_events (email_hmac, event, email_version) values ('svc', 'confirmed', 'v1');
      update public.email_signups set confirmed_at = now(), email_hmac = 'svc' where email = 'service@example.com';
      select public.email_list_unsubscribe('00000000-0000-4000-8000-000000000001');
    `);
    expect(await events('svc')).toEqual(['confirmed', 'unsubscribed']);
    expect(await rowCount('service@example.com')).toBe(0);
  });

  // Value: protects=unsubscribing an address that never confirmed deletes it without inventing a consent event, and an unknown link changes nothing;
  // fails_when=the function drops its hash filter (the insert then breaks on the NOT NULL hash) or deletes by anything but the token;
  // why_new=the case above only unsubscribes a confirmed address; seam=none; no_claim=does not cover a confirmed row whose hash is missing
  it('unsubscribes an unconfirmed address without a consent event, and ignores an unknown token', async () => {
    const before = (await db.query(`select 1 from public.email_consent_events`)).rows.length;
    await asServiceRole(`
      insert into public.email_signups (email, unsubscribe_token) values
        ('pending@example.com', '00000000-0000-4000-8000-000000000002'),
        ('bystander@example.com', '00000000-0000-4000-8000-000000000003');
      select public.email_list_unsubscribe('00000000-0000-4000-8000-000000000002');
      select public.email_list_unsubscribe('00000000-0000-4000-8000-000000000004');
    `);
    expect(await rowCount('pending@example.com')).toBe(0);
    expect(await rowCount('bystander@example.com')).toBe(1);
    expect((await db.query(`select 1 from public.email_consent_events`)).rows.length).toBe(before);
  });
});
