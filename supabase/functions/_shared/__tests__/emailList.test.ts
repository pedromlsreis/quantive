import { describe, it, expect, vi } from 'vitest';
import {
  CONFIRMATION_EMAIL_VERSION,
  CONFIRM_TTL_DAYS,
  MAX_CONFIRMATIONS_PER_ADDRESS,
  RESEND_AFTER_MS,
  confirmVerdict,
  confirmationEmail,
  emailHmac,
  isConfirmExpired,
  isConfirmToken,
  isUnsubscribeToken,
  newConfirmToken,
  sha256Hex,
  shouldSendConfirmation,
} from '../emailList';
import config from '../../../config.toml?raw';
import migration from '../../../migrations/20261025120000_email_signups_double_opt_in.sql?raw';
import emailListHandler from '../../email-list/index.ts?raw';

// emailList.ts imports the client, which throws without VITE_SUPABASE_* env.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { EMAIL_LIST_ERRORS, parseEmailListFragment } from '@/lib/emailList';

describe('newConfirmToken', () => {
  it('returns a link-shaped token and the hash that is stored instead of it', async () => {
    const { token, hash } = await newConfirmToken();
    expect(isConfirmToken(token)).toBe(true);
    expect(hash).toBe(await sha256Hex(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never repeats a token', async () => {
    const [a, b] = await Promise.all([newConfirmToken(), newConfirmToken()]);
    expect(a.token).not.toBe(b.token);
  });
});

describe('token shapes', () => {
  it('accepts only the shapes the links carry', () => {
    expect(isConfirmToken('a'.repeat(43))).toBe(true);
    expect(isConfirmToken('a'.repeat(42))).toBe(false);
    expect(isConfirmToken(`${'a'.repeat(42)}=`)).toBe(false);
    expect(isUnsubscribeToken('0b0c8e3e-4c6f-4e8f-9a51-6f2d1c3b4a59')).toBe(true);
    expect(isUnsubscribeToken('0B0C8E3E-4C6F-4E8F-9A51-6F2D1C3B4A59')).toBe(false);
    expect(isUnsubscribeToken('not-a-token')).toBe(false);
    expect(isUnsubscribeToken(undefined)).toBe(false);
  });
});

describe('isConfirmExpired', () => {
  it(`expires a link ${CONFIRM_TTL_DAYS} days after it was sent`, () => {
    const sent = '2026-10-25T12:00:00Z';
    expect(isConfirmExpired(sent, new Date('2026-11-01T11:59:59Z'))).toBe(false);
    expect(isConfirmExpired(sent, new Date('2026-11-01T12:00:00Z'))).toBe(true);
  });
});

// Value: protects=/email-updates (parseEmailListFragment) accepts exactly the token shapes email-list accepts, including every token email-signup mints;
// fails_when=token encoding or one side's token regex changes alone, so emailed links read "This link is incomplete" or reach the server malformed;
// why_new=emailList and emailSignup tests each check one side against hand-written tokens; nothing compares the two;
// seam=none; no_claim=does not prove email-signup builds the link with this path, or that update emails carry #unsubscribe=
describe('the client reads the token shapes email-list accepts', () => {
  const CONFIRM_NEAR_MISSES = ['', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}=`, `${'a'.repeat(42)}+`, `${'a'.repeat(42)}/`, `${'a'.repeat(42)}.`];
  const UUIDS = ['0b0c8e3e-4c6f-4e8f-9a51-6f2d1c3b4a59', 'ffffffff-ffff-4fff-bfff-ffffffffffff', '00000000-0000-0000-0000-000000000000'];
  const UUID_NEAR_MISSES = [
    '0B0C8E3E-4C6F-4E8F-9A51-6F2D1C3B4A59',
    '0b0c8e3e4c6f4e8f9a516f2d1c3b4a59',
    '{0b0c8e3e-4c6f-4e8f-9a51-6f2d1c3b4a59}',
    '0b0c8e3e-4c6f-4e8f-9a51-6f2d1c3b4a5',
    '0b0c8e3e-4c6f-4e8f-9a51-6f2d1c3b4a59a',
    'g0000000-0000-0000-0000-000000000000',
  ];

  it('parses every minted confirm token and stored unsubscribe token, and rejects what the server rejects', async () => {
    // Fifty tokens, so the base64url-only characters '-' and '_' all but certainly appear.
    const minted = await Promise.all(Array.from({ length: 50 }, async () => (await newConfirmToken()).token));
    for (const token of minted) {
      expect(parseEmailListFragment(`#confirm=${token}`)).toEqual({ action: 'confirm', token });
    }
    for (const raw of [...minted, ...CONFIRM_NEAR_MISSES]) {
      expect(parseEmailListFragment(`#confirm=${raw}`) !== null).toBe(isConfirmToken(raw));
    }
    // gen_random_uuid() values, as Postgres prints them (lowercase, hyphenated).
    for (const raw of [...UUIDS, ...UUID_NEAR_MISSES]) {
      expect(parseEmailListFragment(`#unsubscribe=${raw}`) !== null).toBe(isUnsubscribeToken(raw));
    }
    for (const token of UUIDS) {
      expect(parseEmailListFragment(`#unsubscribe=${token}`)).toEqual({ action: 'unsubscribe', token });
    }
  });
});

describe('confirmationEmail', () => {
  it('carries the link in both parts and escapes it in the HTML', () => {
    const link = 'https://usequantive.app/email-updates#confirm=abc&x=<y>';
    const mail = confirmationEmail(link);
    expect(mail.text).toContain(link);
    expect(mail.html).toContain('#confirm=abc&amp;x=&lt;y&gt;');
    expect(mail.html).not.toContain('<y>');
  });

  // Value: protects=each consent record names the confirmation email the address actually received;
  // fails_when=the email's copy or layout changes without a CONFIRMATION_EMAIL_VERSION bump;
  // why_new=nothing tied the version string to the email; seam=none; no_claim=does not check that a bumped version is a new date
  it('changes only together with CONFIRMATION_EMAIL_VERSION', async () => {
    // After changing the email: bump the version, then paste the new hash here.
    const mail = confirmationEmail('https://usequantive.app/email-updates#confirm=x');
    expect({ version: CONFIRMATION_EMAIL_VERSION, hash: await sha256Hex(JSON.stringify(mail)) }).toEqual({
      version: '2026-10-26',
      hash: '3472d0e255c6dbdd4d4354ab73c7f538c13a272c7bb023042b20e15efd7e5d3c',
    });
  });
});

// Value: protects=email-signup and email-list deploy with verify_jwt = false, so signed-out visitors, whose publishable key is not a JWT, can call them;
// fails_when=a config.toml edit drops or flips either block: `supabase functions deploy` turns JWT checks on and signup, confirm or unsubscribe is refused;
// why_new=no test reads supabase/config.toml; the tests here cover token logic, and neither handler has a test;
// seam=none; no_claim=does not prove the hosted project matches: only `supabase functions deploy` applies this file
describe('supabase/config.toml', () => {
  it('lets signed-out visitors call email-signup and email-list', () => {
    for (const name of ['email-signup', 'email-list']) {
      const section = config.match(new RegExp(`^\\[functions\\.${name}\\]\\r?\\n([^[]*)`, 'm'))?.[1];
      expect(section, name).toMatch(/^verify_jwt\s*=\s*false\s*$/m);
    }
  });
});

describe('shouldSendConfirmation', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const waiting = { confirmed_at: null, confirm_sent_at: ago(RESEND_AFTER_MS), confirm_send_count: 1 };

  it('sends to a new address, and to a waiting one once the resend gap has passed', () => {
    expect(shouldSendConfirmation(null, now)).toBe(true);
    expect(shouldSendConfirmation(waiting, now)).toBe(true);
    expect(shouldSendConfirmation({ ...waiting, confirm_sent_at: null, confirm_send_count: 0 }, now)).toBe(true);
  });

  it('sends nothing to a confirmed address, within the resend gap, or past the per-address cap', () => {
    expect(shouldSendConfirmation({ ...waiting, confirmed_at: ago(1000) }, now)).toBe(false);
    expect(shouldSendConfirmation({ ...waiting, confirm_sent_at: ago(RESEND_AFTER_MS - 1) }, now)).toBe(false);
    expect(shouldSendConfirmation({ ...waiting, confirm_send_count: MAX_CONFIRMATIONS_PER_ADDRESS }, now)).toBe(false);
  });
});

describe('confirmVerdict', () => {
  const now = new Date('2026-10-26T12:00:00Z');

  it('confirms a fresh link, keeps a used one working, and rejects expired or unknown links', () => {
    expect(confirmVerdict({ confirmed_at: null, confirm_sent_at: '2026-10-25T12:00:00Z' }, now)).toBe('confirm');
    expect(confirmVerdict({ confirmed_at: '2026-10-25T13:00:00Z', confirm_sent_at: '2026-10-01T12:00:00Z' }, now)).toBe('already');
    expect(confirmVerdict({ confirmed_at: null, confirm_sent_at: '2026-10-19T12:00:00Z' }, now)).toBe('expired');
    expect(confirmVerdict(null, now)).toBe('invalid');
    expect(confirmVerdict({ confirmed_at: null, confirm_sent_at: null }, now)).toBe('invalid');
  });
});

describe('emailHmac', () => {
  it('gives one address one key the same hash however it is cased or spaced, and never the address itself', async () => {
    const hash = await emailHmac('sam@example.com', 'key-one');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await emailHmac('  Sam@Example.COM ', 'key-one')).toBe(hash);
    expect(await emailHmac('sam@example.com', 'key-two')).not.toBe(hash);
    expect(hash).not.toContain('sam');
  });
});

// The confirm window is stated in the email, the purge and the policy; they must agree.
describe('one confirm window everywhere', () => {
  it('matches the migration purge and every duration the email states', () => {
    expect(Number(migration.match(/interval '(\d+) days'/)?.[1])).toBe(CONFIRM_TTL_DAYS);
    const { text, html } = confirmationEmail('https://usequantive.app/email-updates#confirm=x');
    for (const m of `${text} ${html}`.matchAll(/(\d+) days/g)) expect(Number(m[1])).toBe(CONFIRM_TTL_DAYS);
  });
});

describe('email-list error codes', () => {
  it('are all answered by the handler, so each keeps its own copy on /email-updates', () => {
    for (const code of EMAIL_LIST_ERRORS) expect(emailListHandler, code).toContain(`{ error: "${code}" }`);
  });
});
