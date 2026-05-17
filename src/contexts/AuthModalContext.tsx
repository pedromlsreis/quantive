import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AuthModal } from '@/components/auth/AuthModal';

export type AuthMode = 'signin' | 'signup';

interface AuthModalContextValue {
  isOpen: boolean;
  /** Open the auth modal. Defaults to 'signin' to match the existing convention for unspecified triggers. */
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within AuthModalProvider');
  return ctx;
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signin');

  const openAuth = useCallback((nextMode: AuthMode = 'signin') => {
    setMode(nextMode);
    setIsOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo<AuthModalContextValue>(
    () => ({ isOpen, openAuth, closeAuth }),
    [isOpen, openAuth, closeAuth],
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <AuthModal open={isOpen} onClose={closeAuth} defaultMode={mode} />
    </AuthModalContext.Provider>
  );
}
