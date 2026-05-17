import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import React from 'react';

// Stub the AuthModal with a deterministic test-double. This keeps the
// context test focused on its own contract — we don't want Supabase, router,
// or key-session plumbing in scope here.
vi.mock('@/components/auth/AuthModal', () => ({
  AuthModal: ({ open, defaultMode }: { open: boolean; defaultMode: 'signin' | 'signup' }) =>
    open ? <div data-testid="auth-modal" data-mode={defaultMode} /> : null,
}));

import { AuthModalProvider, useAuthModal } from '@/contexts/AuthModalContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthModalProvider>{children}</AuthModalProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAuthModal guard', () => {
  it('throws when used outside the provider', () => {
    const { result } = renderHook(() => {
      try { return useAuthModal(); }
      catch (e) { return e as Error; }
    });
    expect(result.current).toBeInstanceOf(Error);
    expect((result.current as Error).message).toMatch(/AuthModalProvider/);
  });
});

describe('AuthModalProvider — open/close contract', () => {
  it('does not render the modal initially', () => {
    render(
      <AuthModalProvider>
        <div />
      </AuthModalProvider>,
    );
    expect(screen.queryByTestId('auth-modal')).toBeNull();
  });

  it('openAuth() with no argument opens the modal in signin mode', () => {
    const { result } = renderHook(() => useAuthModal(), { wrapper });
    expect(result.current.isOpen).toBe(false);

    act(() => { result.current.openAuth(); });

    expect(result.current.isOpen).toBe(true);
    const modal = screen.getByTestId('auth-modal');
    expect(modal).toHaveAttribute('data-mode', 'signin');
  });

  it('openAuth("signup") opens the modal in signup mode', () => {
    const { result } = renderHook(() => useAuthModal(), { wrapper });
    act(() => { result.current.openAuth('signup'); });
    expect(screen.getByTestId('auth-modal')).toHaveAttribute('data-mode', 'signup');
  });

  it('closeAuth() unmounts the modal', () => {
    const { result } = renderHook(() => useAuthModal(), { wrapper });
    act(() => { result.current.openAuth('signin'); });
    expect(screen.getByTestId('auth-modal')).toBeInTheDocument();

    act(() => { result.current.closeAuth(); });

    expect(screen.queryByTestId('auth-modal')).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });
});

describe('AuthModalProvider — mode-per-trigger semantics', () => {
  it('honours the latest mode when re-opened after close', () => {
    // Regression: a previously-open signup session should not bleed into a
    // later signin trigger.
    const { result } = renderHook(() => useAuthModal(), { wrapper });

    act(() => { result.current.openAuth('signup'); });
    expect(screen.getByTestId('auth-modal')).toHaveAttribute('data-mode', 'signup');

    act(() => { result.current.closeAuth(); });
    act(() => { result.current.openAuth('signin'); });

    expect(screen.getByTestId('auth-modal')).toHaveAttribute('data-mode', 'signin');
  });

  it('switches mode when openAuth is called again while already open', () => {
    const { result } = renderHook(() => useAuthModal(), { wrapper });
    act(() => { result.current.openAuth('signin'); });
    act(() => { result.current.openAuth('signup'); });
    expect(screen.getByTestId('auth-modal')).toHaveAttribute('data-mode', 'signup');
  });
});
