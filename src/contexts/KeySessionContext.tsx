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
import {
  detectAndUnlock,
  recoverAndRewrap,
  rewrapDataKey,
  setupRecoveryCode,
  supabaseKeyStore,
} from '@/lib/keySession';
import { useAuth } from './AuthContext';

export type KeySessionStatus =
  | 'locked'              // No DK in memory. Either signed out, or session restored without re-unlock.
  | 'unlocked-encrypted'; // DK loaded; encrypted save/load is active.

interface KeySessionContextType {
  status: KeySessionStatus;
  /**
   * True iff the active user has set up a recovery code (i.e. their
   * user_keys row has a populated wrapped_dk_recovery). Null while we
   * don't yet know.
   */
  hasRecovery: boolean | null;
  /** Derive KEK and unwrap DK (or set up keys for a new user). */
  unlock: (userId: string, password: string) => Promise<{ error: string | null }>;
  /** Zero KEK + DK and reset status to 'locked'. */
  lock: () => void;
  /** DK while unlocked-encrypted, null otherwise. */
  getDataKey: () => Uint8Array | null;
  /**
   * Provision a recovery code for the active session. Returns the 24-word
   * mnemonic — display once, then drop. Throws if the session is locked.
   */
  setupRecovery: (userId: string) => Promise<{ recoveryCode: string }>;
  /**
   * Recover a forgotten password. Caller has already called
   * supabase.auth.updateUser({password: newPassword}) — this just rotates
   * the at-rest wrap and installs the recovered DK in memory.
   */
  recoverWithCode: (
    userId: string,
    recoveryCode: string,
    newPassword: string,
  ) => Promise<{ error: string | null }>;
  /**
   * Re-wrap the in-memory DK under a new password's KEK. The caller is
   * responsible for rotating the Supabase auth password (this method only
   * touches the at-rest wrap). Throws if the session is locked.
   */
  rewrapForNewPassword: (
    userId: string,
    newPassword: string,
  ) => Promise<{ error: string | null }>;
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
  const [hasRecovery, setHasRecovery] = useState<boolean | null>(null);

  const lock = useCallback(() => {
    if (kekRef.current) sodium.memzero(kekRef.current);
    if (dkRef.current) sodium.memzero(dkRef.current);
    kekRef.current = null;
    dkRef.current = null;
    setStatus('locked');
    setHasRecovery(null);
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
          // Replace any prior keys defensively before installing new ones.
          if (kekRef.current) sodium.memzero(kekRef.current);
          if (dkRef.current) sodium.memzero(dkRef.current);
          kekRef.current = result.kek;
          dkRef.current = result.dk;
          setStatus('unlocked-encrypted');

          // Read the row again to learn whether recovery is configured.
          // detectAndUnlock doesn't return this — and shoehorning it in
          // would couple the pure logic to a UI concern. One small read
          // post-unlock is the cleaner trade.
          try {
            const row = await supabaseKeyStore.getUserKeys(userId);
            setHasRecovery(row?.wrapped_dk_recovery != null);
          } catch {
            setHasRecovery(null); // unknown; UI defaults to "may offer"
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

  // Best-effort lock on tab close. JS provides no guarantee here, but it
  // raises the bar against trivial memory inspection.
  useEffect(() => {
    const handler = () => lock();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [lock]);

  const getDataKey = useCallback(() => dkRef.current, []);

  const setupRecovery = useCallback(async (userId: string) => {
    await ready();
    const dk = dkRef.current;
    if (!dk) {
      throw new Error('Cannot set up recovery while session is locked.');
    }
    const result = await setupRecoveryCode({
      userId,
      dataKey: dk,
      keyStore: supabaseKeyStore,
    });
    setHasRecovery(true);
    return result;
  }, []);

  const recoverWithCode = useCallback(
    async (userId: string, recoveryCode: string, newPassword: string) => {
      try {
        await ready();
        const passwordBytes = new TextEncoder().encode(newPassword);
        try {
          const { kek, dk } = await recoverAndRewrap({
            userId,
            recoveryCode,
            newPassword: passwordBytes,
            keyStore: supabaseKeyStore,
          });
          if (kekRef.current) sodium.memzero(kekRef.current);
          if (dkRef.current) sodium.memzero(dkRef.current);
          kekRef.current = kek;
          dkRef.current = dk;
          setStatus('unlocked-encrypted');
          // Recovery flow consumed the existing wrapped_dk_recovery, but
          // the wrap is still valid (we only rotated the password salt,
          // not the recovery one). Mark as still-recoverable.
          setHasRecovery(true);
          return { error: null };
        } finally {
          sodium.memzero(passwordBytes);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'recovery failed';
        return { error: msg };
      }
    },
    [],
  );

  const rewrapForNewPassword = useCallback(
    async (userId: string, newPassword: string) => {
      try {
        await ready();
        const dk = dkRef.current;
        if (!dk) {
          return { error: 'Session is locked. Please unlock and try again.' };
        }
        const passwordBytes = new TextEncoder().encode(newPassword);
        try {
          const { kek } = await rewrapDataKey({
            userId,
            dataKey: dk,
            newPassword: passwordBytes,
            keyStore: supabaseKeyStore,
          });
          if (kekRef.current) sodium.memzero(kekRef.current);
          kekRef.current = kek;
          // DK is unchanged — it stays in memory under the new KEK.
          return { error: null };
        } finally {
          sodium.memzero(passwordBytes);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'rewrap failed';
        return { error: msg };
      }
    },
    [],
  );

  return (
    <KeySessionContext.Provider
      value={{
        status,
        hasRecovery,
        unlock,
        lock,
        getDataKey,
        setupRecovery,
        recoverWithCode,
        rewrapForNewPassword,
      }}
    >
      {children}
    </KeySessionContext.Provider>
  );
}
