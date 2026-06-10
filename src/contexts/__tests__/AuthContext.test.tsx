import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Supabase client mock. Every auth method is a spy configured per-test.
const sb = vi.hoisted(() => ({
  auth: {
    onAuthStateChange: vi.fn(),
    getSession: vi.fn(),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    resend: vi.fn(),
  },
  functions: { invoke: vi.fn() },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: sb }));

const analyticsMock = vi.hoisted(() => ({
  signedUp: vi.fn(),
  signedIn: vi.fn(),
  signedOut: vi.fn(),
}));
vi.mock('@/lib/analytics', () => ({ analytics: analyticsMock }));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

// Captured so tests can simulate Supabase firing an auth-state change.
let authCb: ((event: string, session: unknown) => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  authCb = null;

  sb.auth.onAuthStateChange.mockImplementation((cb: (e: string, s: unknown) => void) => {
    authCb = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  sb.auth.getSession.mockResolvedValue({ data: { session: null } });
  sb.auth.signUp.mockResolvedValue({ error: null });
  sb.auth.signInWithPassword.mockResolvedValue({ error: null });
  sb.auth.signOut.mockResolvedValue({ error: null });
  sb.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  sb.auth.updateUser.mockResolvedValue({ error: null });
  sb.auth.resend.mockResolvedValue({ error: null });
  sb.functions.invoke.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Render the provider and wait for the initial getSession to settle. */
async function renderSettled() {
  const handle = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(handle.result.current.loading).toBe(false));
  return handle;
}

describe('useAuth guard', () => {
  it('throws when used outside the provider', () => {
    const { result } = renderHook(() => {
      try { return useAuth(); }
      catch (e) { return e as Error; }
    });
    expect(result.current).toBeInstanceOf(Error);
    expect((result.current as Error).message).toMatch(/AuthProvider/);
  });
});

describe('AuthProvider — initial state', () => {
  it('resolves to signed-out defaults when there is no session', async () => {
    const { result } = await renderSettled();
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.subscription.subscribed).toBe(false);
  });
});

describe('signUp', () => {
  it('records the analytics event and returns no error on success', async () => {
    const { result } = await renderSettled();
    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.signUp('a@b.com', 'pw'); });
    expect(res).toEqual({ error: null });
    expect(analyticsMock.signedUp).toHaveBeenCalledTimes(1);
  });

  it('surfaces the error message and skips analytics on failure', async () => {
    sb.auth.signUp.mockResolvedValue({ error: { message: 'Email already registered' } });
    const { result } = await renderSettled();
    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.signUp('a@b.com', 'pw'); });
    expect(res).toEqual({ error: 'Email already registered' });
    expect(analyticsMock.signedUp).not.toHaveBeenCalled();
  });
});

describe('signIn', () => {
  it('records the analytics event on success', async () => {
    const { result } = await renderSettled();
    await act(async () => { await result.current.signIn('a@b.com', 'pw'); });
    expect(analyticsMock.signedIn).toHaveBeenCalledTimes(1);
  });

  it('returns the error message and skips analytics on bad credentials', async () => {
    sb.auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const { result } = await renderSettled();
    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.signIn('a@b.com', 'wrong'); });
    expect(res).toEqual({ error: 'Invalid login credentials' });
    expect(analyticsMock.signedIn).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('records analytics and calls supabase signOut', async () => {
    const { result } = await renderSettled();
    await act(async () => { await result.current.signOut(); });
    expect(analyticsMock.signedOut).toHaveBeenCalledTimes(1);
    expect(sb.auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('resetPassword', () => {
  it('passes a reset-password redirect and maps success to null', async () => {
    const { result } = await renderSettled();
    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.resetPassword('a@b.com'); });
    expect(res).toEqual({ error: null });
    const [, opts] = sb.auth.resetPasswordForEmail.mock.calls[0];
    expect(opts.redirectTo).toMatch(/\/reset-password$/);
  });

  it('maps an error to its message', async () => {
    sb.auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'rate limited' } });
    const { result } = await renderSettled();
    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.resetPassword('a@b.com'); });
    expect(res).toEqual({ error: 'rate limited' });
  });
});

describe('updatePassword', () => {
  it('maps a failure to its message', async () => {
    sb.auth.updateUser.mockResolvedValue({ error: { message: 'weak password' } });
    const { result } = await renderSettled();
    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.updatePassword('short'); });
    expect(res).toEqual({ error: 'weak password' });
  });
});

describe('resendConfirmation', () => {
  it('refuses when no email is known (no user, no override)', async () => {
    const { result } = await renderSettled();
    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.resendConfirmation(); });
    expect(res?.error).toMatch(/no email/i);
    expect(sb.auth.resend).not.toHaveBeenCalled();
  });

  it('resends to an explicit override email even without a session', async () => {
    const { result } = await renderSettled();
    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.resendConfirmation('new@b.com'); });
    expect(res).toEqual({ error: null });
    expect(sb.auth.resend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'signup', email: 'new@b.com' }),
    );
  });
});

describe('checkSubscription', () => {
  it('maps the edge-function payload into subscription state', async () => {
    sb.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok', user: { id: 'u1', email: 'a@b.com' } } },
    });
    sb.functions.invoke.mockResolvedValue({
      data: {
        subscribed: true,
        product_id: 'prod_x',
        subscription_end: '2026-12-31',
        cancel_at_period_end: true,
        payment_past_due: false,
        has_stripe_history: true,
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.subscription.subscribed).toBe(true));
    expect(result.current.subscription.productId).toBe('prod_x');
    expect(result.current.subscription.cancelAtPeriodEnd).toBe(true);
  });

  it('leaves subscription at defaults when the edge function errors', async () => {
    sb.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok', user: { id: 'u1' } } },
    });
    sb.functions.invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const { result } = await renderSettled();
    expect(result.current.subscription.subscribed).toBe(false);
  });

  it('does not call the edge function when there is no access token', async () => {
    const { result } = await renderSettled(); // default getSession → null
    sb.functions.invoke.mockClear();
    await act(async () => { await result.current.checkSubscription(); });
    expect(sb.functions.invoke).not.toHaveBeenCalled();
  });
});

describe('onAuthStateChange', () => {
  it('adopts the user on sign-in and clears it (with default subscription) on sign-out', async () => {
    const { result } = await renderSettled();

    act(() => { authCb?.('SIGNED_IN', { access_token: 't', user: { id: 'u1' } }); });
    expect(result.current.user).toEqual({ id: 'u1' });

    act(() => { authCb?.('SIGNED_OUT', null); });
    expect(result.current.user).toBeNull();
    expect(result.current.subscription.subscribed).toBe(false);

    // Flush the setTimeout(checkSubscription) scheduled by the sign-in event.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  });
});
