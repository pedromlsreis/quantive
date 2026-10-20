import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const signOut = vi.hoisted(() => vi.fn());
const check = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signOut }) }));
vi.mock('@/hooks/usePasswordCheck', () => ({ usePasswordCheck: () => ({ check, captchaPending: false, captcha: null }) }));

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('sonner', () => ({ toast }));

import { DeleteAccountSection } from '../DeleteAccount';

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<DeleteAccountSection sharesPortfolios={false} />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function openAndType(password: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
  fireEvent.change(screen.getByLabelText('Your password'), { target: { value: password } });
}

const functionError = (code: string) => ({ context: new Response(JSON.stringify({ error: code }), { status: 403 }) });

beforeEach(() => {
  vi.clearAllMocks();
  check.mockResolvedValue(null);
  invoke.mockResolvedValue({ data: { success: true }, error: null });
  signOut.mockResolvedValue(undefined);
});

describe('DeleteAccountSection', () => {
  it('needs the password before it can delete', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByRole('button', { name: 'Delete everything' })).toBeDisabled();
  });

  it('checks the password, deletes, signs out and leaves', async () => {
    renderSection();
    openAndType('pw');
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(await screen.findByText('Home')).toBeInTheDocument();
    expect(check).toHaveBeenCalledWith('pw');
    expect(invoke).toHaveBeenCalledWith('delete-account');
    expect(check.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]);
    expect(signOut).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Your account and entries are deleted');
  });

  it('stays open with the reason when the password is wrong, and deletes nothing', async () => {
    check.mockResolvedValue("That password isn't right.");
    renderSection();
    openAndType('wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That password isn't right.");
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('explains a refusal from the function without leaving the dialog', async () => {
    invoke.mockResolvedValue({ data: null, error: functionError('password_required') });
    renderSection();
    openAndType('pw');
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your password again, then delete.');
    expect(signOut).not.toHaveBeenCalled();
  });
});
