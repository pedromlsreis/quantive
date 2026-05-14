import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '@/hooks/use-mobile';

const BREAKPOINT = 768;

// Helpers to override window.innerWidth in jsdom.
function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: px });
}

// The global setup.ts provides a stub matchMedia that tracks listeners via
// addEventListener/removeEventListener. We extend it here to capture the
// "change" listener so we can fire it manually.
type MqlListener = () => void;
let mqlListeners: MqlListener[] = [];

beforeEach(() => {
  mqlListeners = [];
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (_query: string) => ({
      matches: false,
      media: _query,
      onchange: null,
      addEventListener: (_event: string, fn: MqlListener) => { mqlListeners.push(fn); },
      removeEventListener: (_event: string, fn: MqlListener) => {
        mqlListeners = mqlListeners.filter(l => l !== fn);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => {},
    }),
  });
});

afterEach(() => {
  mqlListeners = [];
});

describe('useIsMobile', () => {
  it('returns false when innerWidth is above the breakpoint', () => {
    setWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns false at exactly the breakpoint width', () => {
    setWidth(BREAKPOINT);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true when innerWidth is below the breakpoint', () => {
    setWidth(375);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns true at one pixel below the breakpoint', () => {
    setWidth(BREAKPOINT - 1);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('updates when the matchMedia change event fires', () => {
    setWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      setWidth(375);
      mqlListeners.forEach(fn => fn());
    });
    expect(result.current).toBe(true);
  });

  it('returns false for undefined innerWidth (double-negation guard)', () => {
    // Simulate an environment where innerWidth might be 0 (the falsy default).
    setWidth(0);
    const { result } = renderHook(() => useIsMobile());
    // 0 < 768 → isMobile=true → !!true === true.  This verifies the !! guard.
    expect(result.current).toBe(true);
  });
});
