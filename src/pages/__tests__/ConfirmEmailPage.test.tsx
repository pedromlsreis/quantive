import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

type TestUser = { id: string; email: string; app_metadata?: Record<string, unknown> };

const state = vi.hoisted(() => ({ user: null as TestUser | null, loading: false }));
const signOut = vi.hoisted(() => vi.fn());
const openAuth = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, loading: state.loading, signOut }) }));
vi.mock('@/contexts/AuthModalContext', () => ({ useAuthModalActions: () => ({ openAuth }) }));
vi.mock('@/components/layout/Brand', () => ({ Wordmark: () => <span>Quantive</span> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const confirmEmailChange = vi.hoisted(() => vi.fn());
vi.mock('@/lib/emailChange', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/emailChange')>()),
  confirmEmailChange,
}));

import ConfirmEmailPage from '../ConfirmEmailPage';

const TOKEN = 'A'.repeat(43);
const SIGNED_IN: TestUser = {
  id: 'u1',
  email: 'sam@example.com',
  app_metadata: {
    pending_email_change: { email: 'new@example.com', expires_at: new Date(Date.now() + 3_600_000).toISOString() },
  },
};

function Where() {
  const { pathname, hash } = useLocation();
  return <output data-testid="where">{pathname + hash}</output>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/confirm-email" element={<><ConfirmEmailPage /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = null;
  state.loading = false;
});

describe('ConfirmEmailPage', () => {
  it('says the link is incomplete without its token', () => {
    renderAt('/confirm-email');
    expect(screen.getByRole('heading', { name: 'This link is incomplete' })).toBeInTheDocument();
  });

  it('takes the token out of the address bar', async () => {
    renderAt(`/confirm-email#t=${TOKEN}`);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/confirm-email$/));
  });

  it('asks a signed-out visitor to sign in to the account being changed', () => {
    renderAt(`/confirm-email#t=${TOKEN}`);
    expect(screen.getByRole('heading', { name: 'Confirm your new email' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(openAuth).toHaveBeenCalledWith('signin');
    expect(confirmEmailChange).not.toHaveBeenCalled();
  });

  it('confirms only on request, with the token, and then says what changed', async () => {
    state.user = SIGNED_IN;
    confirmEmailChange.mockResolvedValue({ email: 'new@example.com' });
    renderAt(`/confirm-email#t=${TOKEN}`);
    expect(screen.getByText('From sam@example.com to new@example.com.')).toBeInTheDocument();
    expect(confirmEmailChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    expect(await screen.findByRole('heading', { name: 'Your email is changed' })).toBeInTheDocument();
    expect(confirmEmailChange).toHaveBeenCalledWith(expect.anything(), TOKEN);
    expect(screen.getByText(/You sign in with new@example.com from now on/)).toBeInTheDocument();
  });

  it('offers to sign out when the link belongs to another account', async () => {
    state.user = SIGNED_IN;
    confirmEmailChange.mockResolvedValue({ code: 'no_request' });
    renderAt(`/confirm-email#t=${TOKEN}`);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    expect(await screen.findByRole('heading', { name: "This link isn't for this account" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalled();
  });

  it('treats an unknown refusal as a failure that can be retried', async () => {
    state.user = SIGNED_IN;
    confirmEmailChange.mockResolvedValue({ code: 'something_new' });
    renderAt(`/confirm-email#t=${TOKEN}`);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    expect(await screen.findByRole('heading', { name: "Couldn't confirm the change" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Confirm change' })).toBeInTheDocument();
  });
});
