import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// --- Mocks ---------------------------------------------------------------
// The modal pulls in auth/session contexts, the supabase client, focus-trap,
// react-router, the checkbox primitive, and sonner toasts. Each of these is
// non-essential to the behaviour we're verifying (close paths, password
// toggle, post-signup confirm panel), so we replace them with the smallest
// possible stand-ins.

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/KeySessionContext', () => ({
  useKeySession: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) =>
    <a {...props}>{children}</a>,
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      data-testid="terms-checkbox"
    />
  ),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { supabase } from '@/integrations/supabase/client';
import { AuthModal } from '../AuthModal';

function setup(props: Partial<{ open: boolean; defaultMode: 'signin' | 'signup' }> = {}) {
  const signUp = vi.fn().mockResolvedValue({ error: null });
  const signIn = vi.fn().mockResolvedValue({ error: null });
  const resetPassword = vi.fn().mockResolvedValue({ error: null });
  const resendConfirmation = vi.fn().mockResolvedValue({ error: null });
  vi.mocked(useAuth).mockReturnValue({
    signUp, signIn, resetPassword, resendConfirmation,
  } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useKeySession).mockReturnValue({
    unlock: vi.fn().mockResolvedValue({ error: null }),
  } as unknown as ReturnType<typeof useKeySession>);

  const onClose = vi.fn();
  const utils = render(
    <AuthModal open={props.open ?? true} onClose={onClose} defaultMode={props.defaultMode ?? 'signup'} />,
  );
  return { signUp, signIn, resetPassword, resendConfirmation, onClose, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  toastError.mockClear();
  toastSuccess.mockClear();
});

describe('AuthModal — backdrop close behaviour (#3)', () => {
  it('closes on backdrop click when the form is empty', () => {
    const { onClose } = setup();
    const backdrop = document.querySelector('.q-modal-backdrop') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT close on backdrop click after the user has typed an email', () => {
    const { onClose } = setup();
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'pedro@example.com' } });
    const backdrop = document.querySelector('.q-modal-backdrop') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT close on backdrop click after the user has typed a password', () => {
    const { onClose } = setup();
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'hunter2!' } });
    const backdrop = document.querySelector('.q-modal-backdrop') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes when the × button is clicked, regardless of typed input', () => {
    const { onClose } = setup();
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'pedro@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AuthModal — password toggle (#1.1)', () => {
  it('renders the password input as type=password by default', () => {
    setup();
    const pwInput = screen.getByPlaceholderText('Password') as HTMLInputElement;
    expect(pwInput.type).toBe('password');
  });

  it('flips to type=text when the eye toggle is clicked, and back again', () => {
    setup();
    const pwInput = screen.getByPlaceholderText('Password') as HTMLInputElement;
    const toggle = screen.getByRole('button', { name: /show password/i });
    fireEvent.click(toggle);
    expect(pwInput.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(pwInput.type).toBe('password');
  });

  it('exposes aria-pressed so screen readers know the toggle state', () => {
    setup();
    const toggle = screen.getByRole('button', { name: /show password/i });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('AuthModal — post-signup confirm panel (#2)', () => {
  it('switches to "Check your inbox" panel when signup succeeds with no session', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
    } as unknown as Awaited<ReturnType<typeof supabase.auth.getSession>>);

    const { signUp } = setup({ defaultMode: 'signup' });

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'pedro@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'hunter2!' } });
    fireEvent.click(screen.getByTestId('terms-checkbox'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    });

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith('pedro@example.com', 'hunter2!');
      // Confirm panel shows: title + email surfaced + resend affordance.
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
      expect(screen.getByText('pedro@example.com')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /resend confirmation email/i })).toBeInTheDocument();
    });
  });

  it('does NOT close on backdrop click while in confirm mode', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
    } as unknown as Awaited<ReturnType<typeof supabase.auth.getSession>>);

    const { onClose } = setup({ defaultMode: 'signup' });

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'pedro@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'hunter2!' } });
    fireEvent.click(screen.getByTestId('terms-checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    });
    await waitFor(() => screen.getByText(/check your inbox/i));

    const backdrop = document.querySelector('.q-modal-backdrop') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('AuthModal — error visibility (#3 follow-on)', () => {
  it('shows auth errors via toast with extended duration so the message can be read', async () => {
    const { signIn } = setup({ defaultMode: 'signin' });
    signIn.mockResolvedValueOnce({ error: 'Invalid login credentials' });

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'pedro@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    });

    await waitFor(() => {
      // Raw GoTrue string is mapped via lib/authError for a friendlier message.
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining("email or password didn't match"),
        expect.objectContaining({ duration: 8000 }),
      );
    });
  });
});
