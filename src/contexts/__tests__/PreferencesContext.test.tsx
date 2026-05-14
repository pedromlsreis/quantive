import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { PreferencesProvider, usePreferences } from '@/contexts/PreferencesContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

beforeEach(() => {
  localStorage.clear();
  // Reset privacy-mode class that may have been set by a previous test.
  document.documentElement.classList.remove('privacy-mode');
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
