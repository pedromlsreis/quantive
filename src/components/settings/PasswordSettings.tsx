import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { usePasswordCheck } from '@/hooks/usePasswordCheck';
import { mapAuthError } from '@/lib/authError';
import { PASSWORD_LENGTH_HINT, PASSWORD_MIN_LENGTH, passwordTooShort } from '@/lib/passwordPolicy';
import { SettingsRow as Row } from './SettingsRows';

/**
 * Settings → Security → Password. Asks for the current password first, as a
 * fresh sign-in: Supabase's "Secure password change" refuses a new password
 * from a session older than a day, and the fresh sign-in keeps this form
 * working with that on. The new password then re-wraps the data key.
 */
export function PasswordSettings() {
  const { user, updatePassword } = useAuth();
  const keySession = useKeySession();
  const passwordCheck = usePasswordCheck();
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const unlocked = keySession.status === 'unlocked-encrypted';

  const close = () => {
    setChanging(false);
    setCurrentPassword('');
    setNewPassword('');
    setNewPasswordConfirm('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || passwordCheck.captchaPending) return;
    if (newPassword !== newPasswordConfirm) {
      toast.error("The two passwords don't match.");
      return;
    }
    if (passwordTooShort(newPassword)) {
      toast.error(PASSWORD_LENGTH_HINT);
      return;
    }
    if (!unlocked) {
      toast.error('Unlock your data first.');
      return;
    }
    setSubmitting(true);
    try {
      const passwordError = await passwordCheck.check(currentPassword);
      if (passwordError) {
        toast.error(passwordError);
        return;
      }
      const { error: authErr } = await updatePassword(newPassword);
      if (authErr) {
        toast.error(mapAuthError(authErr));
        return;
      }
      const { error: rewrapErr } = await keySession.rewrapForNewPassword(user.id, newPassword);
      if (rewrapErr) {
        toast.error(
          "Password changed, but your data key couldn't be re-wrapped. Try again, or use your recovery code at your next sign-in.",
        );
        return;
      }
      toast.success('Password changed.');
      close();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Row label="Password" description={changing ? PASSWORD_LENGTH_HINT : undefined}>
        {!changing && (
          <button type="button" onClick={() => setChanging(true)} disabled={!unlocked} className="q-btn q-btn--secondary q-btn--md">
            Change password
          </button>
        )}
      </Row>
      {changing && (
        <form onSubmit={handleSubmit} className="q-set-form">
          <div className="q-field">
            <label className="q-field-label" htmlFor="current-password">Current password</label>
            <span className="q-input">
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoFocus
              />
            </span>
          </div>
          <div className="q-field">
            <label className="q-field-label" htmlFor="new-password">New password</label>
            <span className="q-input">
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={PASSWORD_MIN_LENGTH}
                required
              />
            </span>
          </div>
          <div className="q-field">
            <label className="q-field-label" htmlFor="confirm-password">Confirm new password</label>
            <span className="q-input">
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                minLength={PASSWORD_MIN_LENGTH}
                required
              />
            </span>
          </div>
          {passwordCheck.captcha}
          <div className="q-set-inline">
            <button type="submit" disabled={submitting || passwordCheck.captchaPending} className="q-btn q-btn--secondary q-btn--md">
              {submitting ? 'Saving…' : passwordCheck.captchaPending ? 'Checking your browser…' : 'Save password'}
            </button>
            <button type="button" onClick={close} className="q-btn q-btn--ghost q-btn--md">
              Cancel
            </button>
          </div>
        </form>
      )}
    </>
  );
}
