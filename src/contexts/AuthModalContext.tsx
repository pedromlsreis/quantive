import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AuthModal } from '@/components/auth/AuthModal';

export type AuthMode = 'signin' | 'signup' | 'forgot';

interface AuthModalActions {
  /**
   * Open the auth modal. Defaults to 'signin' to match the existing convention
   * for unspecified triggers; `email` pre-fills the form (the unlock dialog's
   * reset path knows it).
   */
  openAuth: (mode?: AuthMode, opts?: { email?: string }) => void;
  closeAuth: () => void;
}

interface AuthModalState {
  isOpen: boolean;
}

// Two separate contexts so consumers that only need actions (the common case)
// don't re-render when `isOpen` flips. The actions value is stable across the
// provider's lifetime; the state value changes with `isOpen`.
const AuthModalActionsContext = createContext<AuthModalActions | null>(null);
const AuthModalStateContext = createContext<AuthModalState | null>(null);

/**
 * Backwards-compatible aggregate hook. Returns both actions and state, so
 * consumers will re-render on isOpen changes. Prefer `useAuthModalActions()`
 * when you only need openAuth/closeAuth.
 */
export function useAuthModal(): AuthModalActions & AuthModalState {
  const actions = useContext(AuthModalActionsContext);
  const state = useContext(AuthModalStateContext);
  if (!actions || !state) throw new Error('useAuthModal must be used within AuthModalProvider');
  return { ...actions, ...state };
}

/** Action-only hook — no re-render on isOpen changes. Preferred for triggers. */
export function useAuthModalActions(): AuthModalActions {
  const ctx = useContext(AuthModalActionsContext);
  if (!ctx) throw new Error('useAuthModalActions must be used within AuthModalProvider');
  return ctx;
}

/** State-only hook — re-renders on isOpen changes. Use when reactivity matters. */
export function useAuthModalState(): AuthModalState {
  const ctx = useContext(AuthModalStateContext);
  if (!ctx) throw new Error('useAuthModalState must be used within AuthModalProvider');
  return ctx;
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState<string | undefined>(undefined);

  const openAuth = useCallback((nextMode: AuthMode = 'signin', opts?: { email?: string }) => {
    setMode(nextMode);
    setEmail(opts?.email);
    setIsOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Actions value is referentially stable across renders (useCallback with []).
  const actions = useMemo<AuthModalActions>(() => ({ openAuth, closeAuth }), [openAuth, closeAuth]);
  const state = useMemo<AuthModalState>(() => ({ isOpen }), [isOpen]);

  return (
    <AuthModalActionsContext.Provider value={actions}>
      <AuthModalStateContext.Provider value={state}>
        {children}
        <AuthModal open={isOpen} onClose={closeAuth} defaultMode={mode} defaultEmail={email} />
      </AuthModalStateContext.Provider>
    </AuthModalActionsContext.Provider>
  );
}
