import { describe, it, expect, vi } from 'vitest';
import {
  PENDING_EMAIL_CHANGE_KEY,
  confirmEmailChange,
  pendingEmailChange,
  requestEmailChange,
  requestErrorMessage,
} from '../emailChange';

const NOW = Date.parse('2026-10-20T12:00:00Z');

function errorWith(code: string) {
  return { context: new Response(JSON.stringify({ error: code }), { status: 400 }) };
}

function fakeClient(result: { data?: unknown; error?: unknown }) {
  return {
    functions: { invoke: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }) },
    auth: { refreshSession: vi.fn().mockResolvedValue({ data: {}, error: null }) },
  };
}

describe('pendingEmailChange', () => {
  it('reads the request from app_metadata while it is live', () => {
    const user = { app_metadata: { [PENDING_EMAIL_CHANGE_KEY]: { email: 'new@example.com', expires_at: '2026-10-21T12:00:00Z' } } };
    expect(pendingEmailChange(user, NOW)).toEqual({ email: 'new@example.com', expiresAt: Date.parse('2026-10-21T12:00:00Z') });
  });

  it('ignores an expired, missing or malformed request', () => {
    expect(pendingEmailChange({ app_metadata: { [PENDING_EMAIL_CHANGE_KEY]: { email: 'n@e.com', expires_at: '2026-10-20T11:59:59Z' } } }, NOW)).toBeNull();
    expect(pendingEmailChange({ app_metadata: { provider: 'email' } }, NOW)).toBeNull();
    expect(pendingEmailChange({ app_metadata: { [PENDING_EMAIL_CHANGE_KEY]: { email: 42 } } }, NOW)).toBeNull();
  });
});

describe('requestEmailChange', () => {
  it('asks the function, then refreshes so the user carries the request', async () => {
    const client = fakeClient({ data: { email: 'new@example.com' } });
    expect(await requestEmailChange(client as never, 'new@example.com')).toBeNull();
    expect(client.functions.invoke).toHaveBeenCalledWith('request-email-change', { body: { email: 'new@example.com' } });
    expect(client.auth.refreshSession).toHaveBeenCalledOnce();
  });

  it("returns the function's error code, or a generic one", async () => {
    expect(await requestEmailChange(fakeClient({ error: errorWith('password_required') }) as never, 'n@e.com')).toBe('password_required');
    expect(await requestEmailChange(fakeClient({ error: new Error('offline') }) as never, 'n@e.com')).toBe('request_failed');
  });
});

describe('confirmEmailChange', () => {
  it('finishes with the token and refreshes the session', async () => {
    const client = fakeClient({ data: { email: 'new@example.com' } });
    expect(await confirmEmailChange(client as never, 'tok')).toEqual({ email: 'new@example.com' });
    expect(client.functions.invoke).toHaveBeenCalledWith('confirm-email-change', { body: { token: 'tok' } });
    expect(client.auth.refreshSession).toHaveBeenCalledOnce();
  });

  it('returns the refusal without refreshing', async () => {
    const client = fakeClient({ error: errorWith('expired') });
    expect(await confirmEmailChange(client as never, 'tok')).toEqual({ code: 'expired' });
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe('requestErrorMessage', () => {
  it('has copy for each refusal and a fallback', () => {
    for (const code of ['invalid_email', 'same_email', 'password_required', 'rate_limited', 'send_failed', 'unauthenticated']) {
      expect(requestErrorMessage(code)).not.toBe(requestErrorMessage('anything_else'));
    }
  });
});
