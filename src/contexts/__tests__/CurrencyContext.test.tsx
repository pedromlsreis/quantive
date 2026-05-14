import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mutable state objects captured by the mock factories below.
const authState: { user: { id: string } | null } = { user: null };
const profileResult: {
  data: { preferred_currency?: string } | null;
  error: { message: string } | null;
} = { data: null, error: null };
// Shared update result (for setCurrency persisting to the profile).
const updateResult: { error: { message: string } | null } = { error: null };

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/integrations/supabase/client', () => {
  const getProfile = () => profileResult;
  const getUpdate = () => updateResult;

  type ProfileChain = {
    select: () => ProfileChain;
    eq: () => { maybeSingle: () => Promise<typeof profileResult> };
  };
  type UpdateChain = {
    update: () => { eq: () => Promise<typeof updateResult> };
  };

  // Profile fetch: .from('profiles').select(...).eq(...).maybeSingle()
  const profileChain: ProfileChain = {
    select: () => profileChain,
    eq: () => ({ maybeSingle: () => Promise.resolve(getProfile()) }),
  };

  // Profile update: .from('profiles').update(...).eq(...).then(...)
  const updateChain: UpdateChain = {
    update: () => ({
      eq: () => Promise.resolve(getUpdate()),
    }),
  };

  return {
    supabase: {
      from: (table: string) =>
        table === 'profiles' ? { ...profileChain, ...updateChain } : profileChain,
    },
  };
});

import { CurrencyProvider, useCurrency } from '@/contexts/CurrencyContext';
import { CURRENCY_CODES, CURRENCIES } from '@/lib/currencies';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CurrencyProvider>{children}</CurrencyProvider>
);

beforeEach(() => {
  localStorage.clear();
  authState.user = null;
  profileResult.data = null;
  profileResult.error = null;
  updateResult.error = null;
});

describe('CurrencyProvider defaults', () => {
  it('starts with EUR when localStorage is empty', () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    expect(result.current.currency.code).toBe('EUR');
  });

  it('reads a valid currency code from localStorage on mount', () => {
    localStorage.setItem('preferred-currency', 'USD');
    const { result } = renderHook(() => useCurrency(), { wrapper });
    expect(result.current.currency.code).toBe('USD');
  });

  it('falls back to EUR for an unsupported code in localStorage', () => {
    localStorage.setItem('preferred-currency', 'ZZZ');
    const { result } = renderHook(() => useCurrency(), { wrapper });
    expect(result.current.currency.code).toBe('EUR');
  });

  it('exposes all currencies via allCurrencies in CURRENCY_CODES order', () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    const codes = result.current.allCurrencies.map(c => c.code);
    expect(codes).toEqual(CURRENCY_CODES);
  });

  it('currency objects match the CURRENCIES catalogue', () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    result.current.allCurrencies.forEach(c => {
      expect(c).toEqual(CURRENCIES[c.code]);
    });
  });
});

describe('setCurrency', () => {
  it('updates the active currency in state', () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    act(() => { result.current.setCurrency('GBP'); });
    expect(result.current.currency.code).toBe('GBP');
  });

  it('persists the new currency to localStorage', () => {
    const { result } = renderHook(() => useCurrency(), { wrapper });
    act(() => { result.current.setCurrency('JPY'); });
    expect(localStorage.getItem('preferred-currency')).toBe('JPY');
  });

  it('does not throw when called without a logged-in user', () => {
    authState.user = null;
    const { result } = renderHook(() => useCurrency(), { wrapper });
    expect(() => { act(() => { result.current.setCurrency('CHF'); }); }).not.toThrow();
  });
});

describe('profile hydration when a user signs in', () => {
  it('adopts the profile currency when it is valid', async () => {
    authState.user = { id: 'user-1' };
    profileResult.data = { preferred_currency: 'NOK' };

    const { result } = renderHook(() => useCurrency(), { wrapper });
    await waitFor(() => expect(result.current.currency.code).toBe('NOK'));
  });

  it('keeps the current currency when the profile returns null', async () => {
    localStorage.setItem('preferred-currency', 'GBP');
    authState.user = { id: 'user-1' };
    profileResult.data = null;

    const { result } = renderHook(() => useCurrency(), { wrapper });
    // Give the effect time to settle.
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(result.current.currency.code).toBe('GBP');
  });

  it('ignores an unsupported profile currency and keeps the current one', async () => {
    localStorage.setItem('preferred-currency', 'USD');
    authState.user = { id: 'user-1' };
    profileResult.data = { preferred_currency: 'INVALID' };

    const { result } = renderHook(() => useCurrency(), { wrapper });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(result.current.currency.code).toBe('USD');
  });

  it('writes the profile currency to localStorage after hydration', async () => {
    authState.user = { id: 'user-2' };
    profileResult.data = { preferred_currency: 'SEK' };

    renderHook(() => useCurrency(), { wrapper });
    await waitFor(() => expect(localStorage.getItem('preferred-currency')).toBe('SEK'));
  });
});

describe('useCurrency guard', () => {
  it('throws when used outside the provider', () => {
    const { result } = renderHook(() => {
      try { return useCurrency(); }
      catch (e) { return e as Error; }
    });
    expect(result.current).toBeInstanceOf(Error);
    expect((result.current as Error).message).toMatch(/CurrencyProvider/);
  });
});
