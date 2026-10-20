import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updatePassword = vi.hoisted(() => vi.fn());
const rewrapForNewPassword = vi.hoisted(() => vi.fn());
const check = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'sam@example.com' }, updatePassword }) }));
vi.mock('@/contexts/KeySessionContext', () => ({
  useKeySession: () => ({ status: 'unlocked-encrypted', rewrapForNewPassword }),
}));
vi.mock('@/hooks/usePasswordCheck', () => ({ usePasswordCheck: () => ({ check, captchaPending: false, captcha: null }) }));

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('sonner', () => ({ toast }));

import { PasswordSettings } from '../PasswordSettings';

function fill(current: string, next: string, confirm = next) {
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  check.mockResolvedValue(null);
  updatePassword.mockResolvedValue({ error: null });
  rewrapForNewPassword.mockResolvedValue({ error: null });
});

describe('PasswordSettings', () => {
  it('checks the current password, then changes it and re-wraps the data key', async () => {
    render(<PasswordSettings />);
    fill('old-password', 'a-new-long-password');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Password changed.'));
    expect(check).toHaveBeenCalledWith('old-password');
    // The current password goes along for "Require current password when updating".
    expect(updatePassword).toHaveBeenCalledWith('a-new-long-password', 'old-password');
    expect(rewrapForNewPassword).toHaveBeenCalledWith('u1', 'a-new-long-password');
    expect(check.mock.invocationCallOrder[0]).toBeLessThan(updatePassword.mock.invocationCallOrder[0]);
  });

  it('changes nothing when the current password is wrong', async () => {
    check.mockResolvedValue("That password isn't right.");
    render(<PasswordSettings />);
    fill('wrong', 'a-new-long-password');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That password isn't right."));
    expect(updatePassword).not.toHaveBeenCalled();
    expect(rewrapForNewPassword).not.toHaveBeenCalled();
  });

  it('catches mismatched new passwords before asking anything', () => {
    render(<PasswordSettings />);
    fill('old-password', 'a-new-long-password', 'something-else-entirely');
    expect(toast.error).toHaveBeenCalledWith("The two passwords don't match.");
    expect(check).not.toHaveBeenCalled();
  });
});
