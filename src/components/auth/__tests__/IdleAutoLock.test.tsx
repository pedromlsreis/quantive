import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { IdleAutoLock } from '@/components/auth/IdleAutoLock';

// Mutable state the mocked hooks read from, so each test can set the session
// shape before rendering. `vi.hoisted` makes these available to the hoisted
// vi.mock factories below.
const { lock, state } = vi.hoisted(() => ({
  lock: vi.fn(),
  state: {
    user: { id: 'u1' } as { id: string } | null,
    status: 'unlocked-encrypted' as 'locked' | 'unlocked-encrypted',
    autoLockMinutes: 5,
  },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/contexts/KeySessionContext', () => ({ useKeySession: () => ({ status: state.status, lock }) }));
vi.mock('@/contexts/PreferencesContext', () => ({ usePreferences: () => ({ autoLockMinutes: state.autoLockMinutes }) }));

beforeEach(() => {
  vi.useFakeTimers();
  lock.mockClear();
  state.user = { id: 'u1' };
  state.status = 'unlocked-encrypted';
  state.autoLockMinutes = 5;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('IdleAutoLock', () => {
  it('locks after the configured idle window', () => {
    render(<IdleAutoLock />);
    expect(lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5 * 60_000);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('resets the countdown on user activity', () => {
    render(<IdleAutoLock />);
    vi.advanceTimersByTime(4 * 60_000);
    window.dispatchEvent(new Event('pointerdown'));
    // The countdown restarted, so four more minutes is not yet enough.
    vi.advanceTimersByTime(4 * 60_000);
    expect(lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1 * 60_000);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no timeout is configured', () => {
    state.autoLockMinutes = 0;
    render(<IdleAutoLock />);
    vi.advanceTimersByTime(60 * 60_000);
    expect(lock).not.toHaveBeenCalled();
  });

  it('does nothing while the session is locked', () => {
    state.status = 'locked';
    render(<IdleAutoLock />);
    vi.advanceTimersByTime(60 * 60_000);
    expect(lock).not.toHaveBeenCalled();
  });

  it('does nothing when signed out', () => {
    state.user = null;
    render(<IdleAutoLock />);
    vi.advanceTimersByTime(60 * 60_000);
    expect(lock).not.toHaveBeenCalled();
  });

  it('locks on a visibility change after the window elapsed', () => {
    // jsdom reports visibilityState as 'visible' by default, so this exercises
    // the return-to-tab path that catches a throttled background timer.
    render(<IdleAutoLock />);
    vi.advanceTimersByTime(6 * 60_000);
    lock.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(lock).toHaveBeenCalled();
  });
});
