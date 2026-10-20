import { describe, it, expect } from 'vitest';
import {
  EMAIL_CHANGE_TTL_SECONDS,
  PENDING_EMAIL_CHANGE_KEY,
  changedNoticeEmail,
  checkEmailChangeToken,
  confirmationEmail,
  isLinkToken,
  maskEmail,
  newEmailChangeRequest,
  normaliseEmail,
  readPendingEmailChange,
} from '../emailChange';

const NOW = new Date('2026-10-20T12:00:00Z');

describe('normaliseEmail', () => {
  it('trims and lower-cases a plausible address', () => {
    expect(normaliseEmail('  Sam.New@Example.COM ')).toBe('sam.new@example.com');
  });

  it('rejects anything that is not an address', () => {
    for (const raw of ['', 'sam', 'sam@example', 'sam @example.com', 42, null, undefined, `${'a'.repeat(250)}@example.com`]) {
      expect(normaliseEmail(raw)).toBeNull();
    }
  });
});

describe('newEmailChangeRequest', () => {
  it('returns a link token and stores only its hash, expiring after 24 hours', async () => {
    const { token, pending } = await newEmailChangeRequest('Sam@Example.com', 'new@example.com', NOW);
    expect(isLinkToken(token)).toBe(true);
    expect(pending).toEqual({
      email: 'new@example.com',
      from: 'sam@example.com',
      sent_at: NOW.toISOString(),
      expires_at: new Date(NOW.getTime() + EMAIL_CHANGE_TTL_SECONDS * 1000).toISOString(),
      token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(pending)).not.toContain(token);
  });

  it('never repeats a token', async () => {
    const a = await newEmailChangeRequest('sam@example.com', 'new@example.com', NOW);
    const b = await newEmailChangeRequest('sam@example.com', 'new@example.com', NOW);
    expect(a.token).not.toBe(b.token);
    expect(a.pending.token_hash).not.toBe(b.pending.token_hash);
  });
});

describe('checkEmailChangeToken', () => {
  async function request() {
    return newEmailChangeRequest('sam@example.com', 'new@example.com', NOW);
  }

  it('accepts the token while the request is live and the email unchanged', async () => {
    const { token, pending } = await request();
    expect(await checkEmailChangeToken(pending, token, 'Sam@example.com', NOW)).toBe('ok');
  });

  it("refuses another request's token, or no request at all, the same way", async () => {
    const first = await request();
    const second = await request();
    expect(await checkEmailChangeToken(second.pending, first.token, 'sam@example.com', NOW)).toBe('no_request');
    expect(await checkEmailChangeToken(null, first.token, 'sam@example.com', NOW)).toBe('no_request');
  });

  it('says a wrong token is wrong even when the request has also expired', async () => {
    const { pending } = await request();
    const later = new Date(NOW.getTime() + 2 * EMAIL_CHANGE_TTL_SECONDS * 1000);
    const { token: stranger } = await request();
    expect(await checkEmailChangeToken(pending, stranger, 'sam@example.com', later)).toBe('no_request');
  });

  it('refuses an expired request', async () => {
    const { token, pending } = await request();
    const later = new Date(NOW.getTime() + EMAIL_CHANGE_TTL_SECONDS * 1000);
    expect(await checkEmailChangeToken(pending, token, 'sam@example.com', later)).toBe('expired');
  });

  it('refuses a request made before the sign-in email last changed', async () => {
    const { token, pending } = await request();
    expect(await checkEmailChangeToken(pending, token, 'other@example.com', NOW)).toBe('changed');
  });
});

describe('readPendingEmailChange', () => {
  it('reads a complete request from app_metadata and ignores anything else', async () => {
    const { pending } = await newEmailChangeRequest('sam@example.com', 'new@example.com', NOW);
    expect(readPendingEmailChange({ provider: 'email', [PENDING_EMAIL_CHANGE_KEY]: pending })).toEqual(pending);
    expect(readPendingEmailChange({ provider: 'email' })).toBeNull();
    expect(readPendingEmailChange({ [PENDING_EMAIL_CHANGE_KEY]: { ...pending, token_hash: 1 } })).toBeNull();
    expect(readPendingEmailChange(null)).toBeNull();
  });
});

describe('emails', () => {
  it("links the confirmation without naming the account's current address", () => {
    const link = 'https://usequantive.app/confirm-email#t=abc';
    const mail = confirmationEmail(link);
    expect(mail.html).toContain('href="https://usequantive.app/confirm-email#t=abc"');
    expect(mail.text).toContain(link);
    expect(mail.text).not.toMatch(/sam@example\.com/);
  });

  it('masks the new address in the notice to the old one', () => {
    expect(maskEmail('sam.new@example.com')).toBe('s•••@example.com');
    const mail = changedNoticeEmail('sam.new@example.com', NOW);
    expect(mail.text).toContain('s•••@example.com');
    expect(mail.text).toContain('2026-10-20 12:00 UTC');
    expect(mail.text).not.toContain('sam.new@example.com');
  });
});
