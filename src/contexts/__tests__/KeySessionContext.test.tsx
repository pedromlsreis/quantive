import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// Mutable auth state — flipped by tests to drive the lock-on-user-change effect.
const authState: { user: { id: string } | null } = { user: null };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));

// Stable memzero spy so we can assert key/password zeroing across calls.
const sodium = vi.hoisted(() => ({ memzero: vi.fn() }));
vi.mock('@/lib/crypto/sodium', () => ({
  ready: () => Promise.resolve(),
  getSodium: () => ({ memzero: sodium.memzero }),
}));

// The pure crypto ops are tested in keySession/__tests__; here we mock them to
// drive the provider's state machine in isolation.
vi.mock('@/lib/keySession', () => ({
  detectAndUnlock: vi.fn(),
  recoverAndRewrap: vi.fn(),
  rewrapDataKey: vi.fn(),
  setupRecoveryCode: vi.fn(),
  supabaseKeyStore: { getUserKeys: vi.fn() },
}));

import {
  detectAndUnlock,
  recoverAndRewrap,
  rewrapDataKey,
  setupRecoveryCode,
  supabaseKeyStore,
  type UserKeysRow,
} from '@/lib/keySession';
import { KeySessionProvider, useKeySession } from '@/contexts/KeySessionContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <KeySessionProvider>{children}</KeySessionProvider>
);

const KEK = () => new Uint8Array([10, 11, 12]);
const DK = () => new Uint8Array([20, 21, 22]);

function userKeysRow(recovery: Uint8Array | null): UserKeysRow {
  return {
    user_id: 'u1',
    kdf_salt: new Uint8Array([1]),
    wrapped_dk_kek: new Uint8Array([2]),
    wrapped_dk_recovery: recovery,
    recovery_kdf_salt: recovery ? new Uint8Array([3]) : null,
    enc_version: 1,
  };
}

/** Render the hook and unlock it, returning the hook handle. */
async function renderUnlocked() {
  vi.mocked(detectAndUnlock).mockResolvedValue({ kind: 'encrypted-unlocked', kek: KEK(), dk: DK() });
  vi.mocked(supabaseKeyStore.getUserKeys).mockResolvedValue(userKeysRow(new Uint8Array([9])));
  const handle = renderHook(() => useKeySession(), { wrapper });
  await act(async () => {
    await handle.result.current.unlock('u1', 'password');
  });
  return handle;
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
  vi.mocked(supabaseKeyStore.getUserKeys).mockResolvedValue(null);
});

describe('KeySessionProvider — initial state', () => {
  it('starts locked with no data key and unknown recovery', () => {
    const { result } = renderHook(() => useKeySession(), { wrapper });
    expect(result.current.status).toBe('locked');
    expect(result.current.getDataKey()).toBeNull();
    expect(result.current.hasRecovery).toBeNull();
  });
});

describe('KeySessionProvider — unlock', () => {
  it('installs the data key and reports unlocked on success', async () => {
    vi.mocked(detectAndUnlock).mockResolvedValue({ kind: 'encrypted-unlocked', kek: KEK(), dk: DK() });
    vi.mocked(supabaseKeyStore.getUserKeys).mockResolvedValue(userKeysRow(new Uint8Array([9])));
    const { result } = renderHook(() => useKeySession(), { wrapper });

    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.unlock('u1', 'password'); });

    expect(res).toEqual({ error: null });
    expect(result.current.status).toBe('unlocked-encrypted');
    expect(result.current.getDataKey()).toEqual(DK());
    expect(result.current.hasRecovery).toBe(true);
  });

  it('reports hasRecovery=false when the row has no recovery wrap', async () => {
    vi.mocked(detectAndUnlock).mockResolvedValue({ kind: 'encrypted-unlocked', kek: KEK(), dk: DK() });
    vi.mocked(supabaseKeyStore.getUserKeys).mockResolvedValue(userKeysRow(null));
    const { result } = renderHook(() => useKeySession(), { wrapper });
    await act(async () => { await result.current.unlock('u1', 'password'); });
    expect(result.current.hasRecovery).toBe(false);
  });

  it('reports hasRecovery=null when the post-unlock row read fails', async () => {
    vi.mocked(detectAndUnlock).mockResolvedValue({ kind: 'encrypted-unlocked', kek: KEK(), dk: DK() });
    vi.mocked(supabaseKeyStore.getUserKeys).mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useKeySession(), { wrapper });
    await act(async () => { await result.current.unlock('u1', 'password'); });
    expect(result.current.status).toBe('unlocked-encrypted'); // unlock still succeeded
    expect(result.current.hasRecovery).toBeNull();
  });

  it('returns an error and stays locked when unlock fails', async () => {
    vi.mocked(detectAndUnlock).mockRejectedValue(new Error('wrong password'));
    const { result } = renderHook(() => useKeySession(), { wrapper });

    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.unlock('u1', 'nope'); });

    expect(res?.error).toBeTruthy();
    expect(result.current.status).toBe('locked');
    expect(result.current.getDataKey()).toBeNull();
  });

  it('zeroes the password bytes after unlocking', async () => {
    await renderUnlocked();
    expect(sodium.memzero).toHaveBeenCalled();
  });
});

describe('KeySessionProvider — lock', () => {
  it('zeroes keys and resets state on lock()', async () => {
    const { result } = await renderUnlocked();
    sodium.memzero.mockClear();

    act(() => { result.current.lock(); });

    expect(result.current.status).toBe('locked');
    expect(result.current.getDataKey()).toBeNull();
    expect(result.current.hasRecovery).toBeNull();
    // KEK + DK both zeroed.
    expect(sodium.memzero).toHaveBeenCalledTimes(2);
  });

  it('locks when the authenticated user changes', async () => {
    authState.user = { id: 'u1' };
    vi.mocked(detectAndUnlock).mockResolvedValue({ kind: 'encrypted-unlocked', kek: KEK(), dk: DK() });
    vi.mocked(supabaseKeyStore.getUserKeys).mockResolvedValue(userKeysRow(new Uint8Array([9])));
    const { result, rerender } = renderHook(() => useKeySession(), { wrapper });
    await act(async () => { await result.current.unlock('u1', 'password'); });
    expect(result.current.status).toBe('unlocked-encrypted');

    authState.user = { id: 'u2' };
    act(() => { rerender(); });

    expect(result.current.status).toBe('locked');
    expect(result.current.getDataKey()).toBeNull();
  });

  it('does NOT lock on a re-render with the same user', async () => {
    authState.user = { id: 'u1' };
    vi.mocked(detectAndUnlock).mockResolvedValue({ kind: 'encrypted-unlocked', kek: KEK(), dk: DK() });
    vi.mocked(supabaseKeyStore.getUserKeys).mockResolvedValue(userKeysRow(null));
    const { result, rerender } = renderHook(() => useKeySession(), { wrapper });
    await act(async () => { await result.current.unlock('u1', 'password'); });

    act(() => { rerender(); });

    expect(result.current.status).toBe('unlocked-encrypted');
  });

  it('locks on a beforeunload event (best-effort tab-close zeroing)', async () => {
    const { result } = await renderUnlocked();
    act(() => { window.dispatchEvent(new Event('beforeunload')); });
    expect(result.current.status).toBe('locked');
    expect(result.current.getDataKey()).toBeNull();
  });
});

describe('KeySessionProvider — recovery setup', () => {
  it('throws when setting up recovery while locked', async () => {
    const { result } = renderHook(() => useKeySession(), { wrapper });
    await act(async () => {
      await expect(result.current.setupRecovery('u1')).rejects.toThrow(/locked/i);
    });
    expect(setupRecoveryCode).not.toHaveBeenCalled();
  });

  it('returns the recovery code and marks hasRecovery=true when unlocked', async () => {
    const { result } = await renderUnlocked();
    vi.mocked(setupRecoveryCode).mockResolvedValue({ recoveryCode: 'word '.repeat(24).trim() });

    let res: { recoveryCode: string } | undefined;
    await act(async () => { res = await result.current.setupRecovery('u1'); });

    expect(res?.recoveryCode.split(' ')).toHaveLength(24);
    expect(result.current.hasRecovery).toBe(true);
  });
});

describe('KeySessionProvider — recoverWithCode', () => {
  it('installs the recovered key and unlocks on success', async () => {
    vi.mocked(recoverAndRewrap).mockResolvedValue({ kek: KEK(), dk: DK() });
    const { result } = renderHook(() => useKeySession(), { wrapper });

    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.recoverWithCode('u1', 'code', 'newpw'); });

    expect(res).toEqual({ error: null });
    expect(result.current.status).toBe('unlocked-encrypted');
    expect(result.current.getDataKey()).toEqual(DK());
    expect(result.current.hasRecovery).toBe(true);
  });

  it('returns an error and stays locked when recovery fails', async () => {
    vi.mocked(recoverAndRewrap).mockRejectedValue(new Error('bad code'));
    const { result } = renderHook(() => useKeySession(), { wrapper });

    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.recoverWithCode('u1', 'bad', 'newpw'); });

    expect(res?.error).toBeTruthy();
    expect(result.current.status).toBe('locked');
  });
});

describe('KeySessionProvider — rewrapForNewPassword', () => {
  it('returns an error (not a throw) when the session is locked', async () => {
    const { result } = renderHook(() => useKeySession(), { wrapper });
    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.rewrapForNewPassword('u1', 'newpw'); });
    expect(res?.error).toMatch(/locked/i);
    expect(rewrapDataKey).not.toHaveBeenCalled();
  });

  it('keeps the same data key in memory after a successful rewrap', async () => {
    const { result } = await renderUnlocked();
    vi.mocked(rewrapDataKey).mockResolvedValue({ kek: new Uint8Array([99]) });

    let res: { error: string | null } | undefined;
    await act(async () => { res = await result.current.rewrapForNewPassword('u1', 'newpw'); });

    expect(res).toEqual({ error: null });
    expect(result.current.status).toBe('unlocked-encrypted');
    expect(result.current.getDataKey()).toEqual(DK()); // DK unchanged; only KEK rotated
  });
});

describe('useKeySession guard', () => {
  it('throws when used outside the provider', () => {
    const { result } = renderHook(() => {
      try { return useKeySession(); }
      catch (e) { return e as Error; }
    });
    expect(result.current).toBeInstanceOf(Error);
    expect((result.current as Error).message).toMatch(/KeySessionProvider/);
  });
});
