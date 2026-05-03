/**
 * Holds the user's KEK + DK in memory for the duration of a session.
 *
 * Spec: docs/security/encryption.md §5.1, §12.
 *
 * Keys are stored in refs (not state) — they don't drive rendering, and we
 * want to mutate them without provoking re-renders. The public `status` is
 * the single piece of state consumers react to.
 *
 * On logout, lock(), or when the auth user changes, both keys are zeroed
 * (best-effort; JS GC limits true zeroing).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ready, sodium } from '@/lib/crypto/sodium';
import { detectAndUnlock, supabaseKeyStore } from '@/lib/keySession';
import { useAuth } from './AuthContext';

export type KeySessionStatus =
  | 'locked'              // No DK in memory. Either signed out, or session restored without re-unlock.
  | 'unlocked-encrypted'  // DK loaded; encrypted save/load is active.
  | 'unlocked-legacy';    // No user_keys row; user has plaintext snapshots (Phase 5 will migrate).

interface KeySessionContextType {
  status: KeySessionStatus;
  /** Derive KEK and unwrap DK (or set up keys for a new user). */
  unlock: (userId: string, password: string) => Promise<{ error: string | null }>;
  /** Zero KEK + DK and reset status to 'locked'. */
  lock: () => void;
  /** DK while unlocked-encrypted, null otherwise. Phase 4 uses this to encrypt snapshots. */
  getDataKey: () => Uint8Array | null;
}

const KeySessionContext = createContext<KeySessionContextType | null>(null);

export function useKeySession() {
  const ctx = useContext(KeySessionContext);
  if (!ctx) {
    throw new Error('useKeySession must be used within KeySessionProvider');
  }
  return ctx;
}

export function KeySessionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const kekRef = useRef<Uint8Array | null>(null);
  const dkRef = useRef<Uint8Array | null>(null);
  const [status, setStatus] = useState<KeySessionStatus>('locked');

  const lock = useCallback(() => {
    if (kekRef.current) sodium.memzero(kekRef.current);
    if (dkRef.current) sodium.memzero(dkRef.current);
    kekRef.current = null;
    dkRef.current = null;
    setStatus('locked');
  }, []);

  const unlock = useCallback(
    async (userId: string, password: string) => {
      try {
        await ready();
        // Encode password into a Uint8Array we own, so we can zero it.
        // (The original string parameter is JS-immutable and uncollectable on demand.)
        const passwordBytes = new TextEncoder().encode(password);
        try {
          const result = await detectAndUnlock(
            userId,
            passwordBytes,
            supabaseKeyStore,
          );
          if (result.kind === 'encrypted-unlocked') {
            // Replace any prior keys defensively before installing new ones.
            if (kekRef.current) sodium.memzero(kekRef.current);
            if (dkRef.current) sodium.memzero(dkRef.current);
            kekRef.current = result.kek;
            dkRef.current = result.dk;
            setStatus('unlocked-encrypted');
          } else {
            // Legacy user: no keys to hold. Mark as unlocked-legacy.
            kekRef.current = null;
            dkRef.current = null;
            setStatus('unlocked-legacy');
          }
          return { error: null };
        } finally {
          sodium.memzero(passwordBytes);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unlock failed';
        // Don't leak which case failed (wrong password vs network) at the
        // boundary; callers map this to a generic "incorrect password" toast.
        return { error: msg };
      }
    },
    [],
  );

  // Lock immediately when the auth user changes (sign-out, account switch).
  // Do NOT lock on first mount or on identity-stable updates.
  const previousUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    const previousUserId = previousUserIdRef.current;
    if (
      previousUserId !== null &&
      previousUserId !== currentUserId
    ) {
      lock();
    }
    previousUserIdRef.current = currentUserId;
  }, [user?.id, lock]);

  // Passive legacy detection: when a user is authenticated but locked, peek
  // at server state to determine whether they actually need to unlock.
  //
  //   user_keys row exists      -> stay 'locked' (RequireUnlock will prompt for password)
  //   no keys + has snapshots   -> 'unlocked-legacy' (Phase 5 will migrate later)
  //   no keys + no snapshots    -> stay 'locked' (provisioning needs password)
  //
  // This avoids prompting legacy users for a password they never set up.
  useEffect(() => {
    if (!user || status !== 'locked') return;
    let cancelled = false;
    (async () => {
      try {
        const keys = await supabaseKeyStore.getUserKeys(user.id);
        if (cancelled) return;
        if (keys) return; // encrypted user; needs password
        const hasSnap = await supabaseKeyStore.hasPortfolioSnapshot(user.id);
        if (cancelled) return;
        if (hasSnap) {
          setStatus('unlocked-legacy');
        }
        // else: brand-new user — stays 'locked' until they enter a password.
      } catch (e) {
        // Swallow — the RequireUnlock modal still works as a fallback.
        console.error('[KeySession] passive detection failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, status]);

  // Best-effort lock on tab close. JS provides no guarantee here, but it
  // raises the bar against trivial memory inspection.
  useEffect(() => {
    const handler = () => lock();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [lock]);

  const getDataKey = useCallback(() => dkRef.current, []);

  return (
    <KeySessionContext.Provider value={{ status, unlock, lock, getDataKey }}>
      {children}
    </KeySessionContext.Provider>
  );
}
