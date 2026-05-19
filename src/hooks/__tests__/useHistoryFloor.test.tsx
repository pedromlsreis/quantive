import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Control the entitlements gate from tests.
let historyFullGranted = false;

vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: () => ({
    has: (e: string) => e === 'history.full' && historyFullGranted,
    plan: { id: historyFullGranted ? 'pro' : 'free' },
  }),
}));

import { useHistoryFloor } from '@/hooks/useHistoryFloor';

describe('useHistoryFloor', () => {
  it('returns null for users with the history.full entitlement', () => {
    historyFullGranted = true;
    const { result } = renderHook(() => useHistoryFloor());
    expect(result.current).toBeNull();
  });

  it('returns a Date for users without history.full (free tier)', () => {
    historyFullGranted = false;
    const { result } = renderHook(() => useHistoryFloor());
    expect(result.current).toBeInstanceOf(Date);
  });

  it('returned floor is approximately 12 months in the past', () => {
    historyFullGranted = false;
    const before = new Date();
    const { result } = renderHook(() => useHistoryFloor());
    const floor = result.current!;
    // setMonth(month - 12) gives the same calendar day one year ago.
    // Allow ±5 days of slack for month-length variance and DST.
    const msDiff = before.getTime() - floor.getTime();
    const daysDiff = msDiff / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThanOrEqual(360);
    expect(daysDiff).toBeLessThanOrEqual(370);
  });

  it('returned floor has a zeroed time component (start of day)', () => {
    historyFullGranted = false;
    const { result } = renderHook(() => useHistoryFloor());
    const floor = result.current!;
    expect(floor.getHours()).toBe(0);
    expect(floor.getMinutes()).toBe(0);
    expect(floor.getSeconds()).toBe(0);
    expect(floor.getMilliseconds()).toBe(0);
  });
});
