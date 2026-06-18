import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// PreferencesProvider now reads useAuth + the profile (auto-lock is an
// account-synced setting), so both are mocked. Default user null keeps the
// device-local pref tests unaffected; hydration tests set authState.user.
const authState: { user: { id: string } | null } = { user: null };
const profileResult: { data: { auto_lock_minutes?: number; blur_on_unfocus?: boolean } | null; error: { message: string } | null } = { data: null, error: null };
const updateResult: { error: { message: string } | null } = { error: null };

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));

vi.mock('@/integrations/supabase/client', () => {
  const profileChain = {
    select: () => profileChain,
    eq: () => ({ maybeSingle: () => Promise.resolve(profileResult) }),
  };
  const updateChain = { update: () => ({ eq: () => Promise.resolve(updateResult) }) };
  return {
    supabase: {
      from: (table: string) => (table === 'profiles' ? { ...profileChain, ...updateChain } : profileChain),
    },
  };
});

import { PreferencesProvider, usePreferences } from '@/contexts/PreferencesContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

beforeEach(() => {
  localStorage.clear();
  // Reset privacy-mode class that may have been set by a previous test.
  document.documentElement.classList.remove('privacy-mode');
  authState.user = null;
  profileResult.data = null;
  profileResult.error = null;
  updateResult.error = null;
});

describe('PreferencesContext defaults', () => {
  it('numberFormat defaults to "auto"', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.numberFormat).toBe('auto');
  });

  it('privacyMode defaults to false', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.privacyMode).toBe(false);
  });

  it('numberLocale is undefined when numberFormat is "auto"', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.numberLocale).toBeUndefined();
  });
});

describe('PreferencesContext localStorage hydration', () => {
  it('reads numberFormat from localStorage on mount', () => {
    localStorage.setItem('pref-number-format', 'us');
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.numberFormat).toBe('us');
  });

  it('reads privacyMode=true from localStorage on mount', () => {
    localStorage.setItem('pref-privacy-mode', 'true');
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.privacyMode).toBe(true);
  });

  it('falls back to defaults for invalid localStorage values', () => {
    localStorage.setItem('pref-number-format', 'invalid-value');
    localStorage.setItem('pref-privacy-mode', 'maybe');
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.numberFormat).toBe('auto');
    expect(result.current.privacyMode).toBe(false);
  });
});

describe('setNumberFormat', () => {
  it('updates numberFormat in state', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setNumberFormat('eu'); });
    expect(result.current.numberFormat).toBe('eu');
  });

  it('persists the new format to localStorage', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setNumberFormat('in'); });
    expect(localStorage.getItem('pref-number-format')).toBe('in');
  });

  it.each([
    ['us', 'en-US'],
    ['eu', 'de-DE'],
    ['in', 'en-IN'],
  ] as const)('numberLocale maps "%s" → "%s"', (format, locale) => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setNumberFormat(format); });
    expect(result.current.numberLocale).toBe(locale);
  });

  it('numberLocale is undefined when format is "auto"', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setNumberFormat('us'); });
    act(() => { result.current.setNumberFormat('auto'); });
    expect(result.current.numberLocale).toBeUndefined();
  });
});

describe('setPrivacyMode', () => {
  it('updates privacyMode in state', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setPrivacyMode(true); });
    expect(result.current.privacyMode).toBe(true);
  });

  it('persists the new value to localStorage', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setPrivacyMode(true); });
    expect(localStorage.getItem('pref-privacy-mode')).toBe('true');
  });

  it('adds privacy-mode class to documentElement when enabled', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setPrivacyMode(true); });
    expect(document.documentElement.classList.contains('privacy-mode')).toBe(true);
  });

  it('removes privacy-mode class from documentElement when disabled', () => {
    localStorage.setItem('pref-privacy-mode', 'true');
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setPrivacyMode(false); });
    expect(document.documentElement.classList.contains('privacy-mode')).toBe(false);
  });
});

describe('blurOnUnfocus (auto-blur on window focus loss)', () => {
  it('defaults to true', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.blurOnUnfocus).toBe(true);
  });

  it('reads blurOnUnfocus=false from localStorage on mount', () => {
    localStorage.setItem('pref-privacy-auto-blur', 'false');
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.blurOnUnfocus).toBe(false);
  });

  it('persists the new value to localStorage', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setBlurOnUnfocus(true); });
    expect(localStorage.getItem('pref-privacy-auto-blur')).toBe('true');
  });

  it('blurs on window blur and reveals on focus when enabled', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setBlurOnUnfocus(true); });

    // Visible + focused → no blur yet.
    expect(document.documentElement.classList.contains('privacy-mode')).toBe(false);

    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(document.documentElement.classList.contains('privacy-mode')).toBe(true);

    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(document.documentElement.classList.contains('privacy-mode')).toBe(false);
  });

  it('does nothing on window blur when disabled', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setBlurOnUnfocus(false); });
    expect(result.current.blurOnUnfocus).toBe(false);
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(document.documentElement.classList.contains('privacy-mode')).toBe(false);
  });

  it('persistent privacy mode keeps values hidden even after focus returns', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setPrivacyMode(true); result.current.setBlurOnUnfocus(true); });
    act(() => { window.dispatchEvent(new Event('blur')); });
    act(() => { window.dispatchEvent(new Event('focus')); });
    // privacyMode still wins, so the class stays applied.
    expect(document.documentElement.classList.contains('privacy-mode')).toBe(true);
  });

  it('adopts the profile value when a user signs in', async () => {
    authState.user = { id: 'u1' };
    profileResult.data = { blur_on_unfocus: true };
    const { result } = renderHook(() => usePreferences(), { wrapper });
    await waitFor(() => expect(result.current.blurOnUnfocus).toBe(true));
  });
});

describe('autoLockMinutes (idle auto-lock timeout)', () => {
  it('defaults to 15 (on) when nothing is stored', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.autoLockMinutes).toBe(15);
  });

  it('reads a stored value on mount', () => {
    localStorage.setItem('pref-auto-lock-minutes', '15');
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.autoLockMinutes).toBe(15);
  });

  it('falls back to 15 for a value outside the offered set', () => {
    localStorage.setItem('pref-auto-lock-minutes', '7');
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.autoLockMinutes).toBe(15);
  });

  it('persists a valid value', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setAutoLockMinutes(30); });
    expect(result.current.autoLockMinutes).toBe(30);
    expect(localStorage.getItem('pref-auto-lock-minutes')).toBe('30');
  });

  it('ignores a value outside the offered set', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setAutoLockMinutes(15); });
    act(() => { result.current.setAutoLockMinutes(99); });
    expect(result.current.autoLockMinutes).toBe(15);
  });

  it('adopts the profile value when a user signs in', async () => {
    authState.user = { id: 'u1' };
    profileResult.data = { auto_lock_minutes: 30 };
    const { result } = renderHook(() => usePreferences(), { wrapper });
    await waitFor(() => expect(result.current.autoLockMinutes).toBe(30));
  });
});

describe('press-and-hold peek (touch reveal)', () => {
  /** Dispatch a pointerdown that bubbles to the document-level listener. */
  function pointerDown(el: Element, pointerType: string) {
    const ev = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(ev, 'pointerType', { value: pointerType });
    el.dispatchEvent(ev);
  }

  it('reveals a blurred value on touch pointerdown and hides it on release', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setPrivacyMode(true); });

    const el = document.createElement('span');
    el.className = 'num';
    document.body.appendChild(el);

    act(() => { pointerDown(el, 'touch'); });
    expect(el.classList.contains('is-peeking')).toBe(true);

    act(() => { document.dispatchEvent(new Event('pointerup')); });
    expect(el.classList.contains('is-peeking')).toBe(false);

    document.body.removeChild(el);
  });

  it('ignores mouse pointerdown (desktop already peeks via :hover)', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => { result.current.setPrivacyMode(true); });

    const el = document.createElement('span');
    el.className = 'num';
    document.body.appendChild(el);

    act(() => { pointerDown(el, 'mouse'); });
    expect(el.classList.contains('is-peeking')).toBe(false);

    document.body.removeChild(el);
  });

  it('does not attach the peek handler when blur is inactive', () => {
    renderHook(() => usePreferences(), { wrapper });

    const el = document.createElement('span');
    el.className = 'num';
    document.body.appendChild(el);

    act(() => { pointerDown(el, 'touch'); });
    expect(el.classList.contains('is-peeking')).toBe(false);

    document.body.removeChild(el);
  });
});

describe('usePreferences guard', () => {
  it('throws when used outside the provider', () => {
    // Suppress React's error boundary noise in the test output.
    const { result } = renderHook(() => {
      try { return usePreferences(); }
      catch (e) { return e as Error; }
    });
    expect(result.current).toBeInstanceOf(Error);
    expect((result.current as Error).message).toMatch(/PreferencesProvider/);
  });
});
