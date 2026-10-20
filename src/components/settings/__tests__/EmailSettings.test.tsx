import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

type TestUser = { id: string; email?: string; app_metadata?: Record<string, unknown> };

const state = vi.hoisted(() => ({
  user: null as TestUser | null,
  captchaPending: false,
}));
const check = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/usePasswordCheck', () => ({
  usePasswordCheck: () => ({ check, captchaPending: state.captchaPending, captcha: null }),
}));

const refreshSession = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { refreshSession } } }));

const requestEmailChange = vi.hoisted(() => vi.fn());
vi.mock('@/lib/emailChange', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/emailChange')>()),
  requestEmailChange,
}));

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('sonner', () => ({ toast }));

import { EmailRow } from '../EmailSettings';
import { requestErrorMessage } from '@/lib/emailChange';

const HOUR = 60 * 60 * 1000;
const pendingFor = (email: string, expiresInHours: number) => ({
  pending_email_change: { email, expires_at: new Date(Date.now() + expiresInHours * HOUR).toISOString() },
});

function fillForm(email: string, password: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
  fireEvent.change(screen.getByLabelText('New email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: password } });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 'u1', email: 'sam@example.com', app_metadata: { provider: 'email' } };
  state.captchaPending = false;
  check.mockResolvedValue(null);
  requestEmailChange.mockResolvedValue(null);
  refreshSession.mockResolvedValue({ data: {}, error: null });
});

describe('EmailRow', () => {
  it('shows the current address with a way to change it', () => {
    render(<EmailRow />);
    expect(screen.getByText('sam@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for you/)).not.toBeInTheDocument();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('checks the password, then asks for the link', async () => {
    render(<EmailRow />);
    fillForm('  New@Example.com ', 'pw');
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Check new@example.com for a link to confirm the change.'));
    expect(check).toHaveBeenCalledWith('pw');
    expect(requestEmailChange).toHaveBeenCalledWith(expect.anything(), 'new@example.com');
    expect(check.mock.invocationCallOrder[0]).toBeLessThan(requestEmailChange.mock.invocationCallOrder[0]);
    expect(screen.queryByLabelText('New email')).not.toBeInTheDocument();
  });

  it('stops at a wrong password, keeping the form', async () => {
    check.mockResolvedValue("That password isn't right.");
    render(<EmailRow />);
    fillForm('new@example.com', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That password isn't right."));
    expect(requestEmailChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('New email')).toHaveValue('new@example.com');
  });

  it("explains the function's refusal", async () => {
    requestEmailChange.mockResolvedValue('send_failed');
    render(<EmailRow />);
    fillForm('new@example.com', 'pw');
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(requestErrorMessage('send_failed')));
  });

  it('refuses the address the account already has, before asking for the password', () => {
    render(<EmailRow />);
    fillForm('Sam@Example.com', 'pw');
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));
    expect(toast.error).toHaveBeenCalledWith("That's already your email.");
    expect(check).not.toHaveBeenCalled();
  });

  it('waits for the browser check before it can send', () => {
    state.captchaPending = true;
    render(<EmailRow />);
    fillForm('new@example.com', 'pw');
    expect(screen.getByRole('button', { name: 'Checking your browser…' })).toBeDisabled();
  });

  it('shows a pending change, refreshes to catch a confirmation made elsewhere, and resends with the password', () => {
    state.user = { id: 'u1', email: 'sam@example.com', app_metadata: pendingFor('new@example.com', 12) };
    render(<EmailRow />);
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for you to open the link/)).toBeInTheDocument();
    expect(refreshSession).toHaveBeenCalledOnce();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refreshSession).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    expect(screen.getByLabelText('New email')).toHaveValue('new@example.com');
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it('treats an expired request as gone', () => {
    state.user = { id: 'u1', email: 'sam@example.com', app_metadata: pendingFor('new@example.com', -1) };
    render(<EmailRow />);
    expect(screen.queryByText(/Waiting for you/)).not.toBeInTheDocument();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
