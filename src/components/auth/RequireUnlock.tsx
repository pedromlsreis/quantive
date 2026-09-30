/**
 * Modal shown when an authenticated user has a session but no DK in memory
 * (e.g., page reload). Spec: docs/security/encryption.md §8.3.
 *
 * Captures the password and calls keySession.unlock(). On success, the
 * provider transitions to 'unlocked-encrypted' and this modal dismounts.
 * It cannot be dismissed: the data behind it stays encrypted until unlock
 * or sign-out.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { useAuthModalActions } from '@/contexts/AuthModalContext';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useModalLayer } from '@/hooks/useModalLayer';
import { Notice } from '@/components/ui/Notice';
import { analytics } from '@/lib/analytics';
import { MISSING_KEYS_MESSAGE } from '@/lib/authError';
import { isProtectedPath } from './protectedPaths';

const EMPTY_PASSWORD = 'Enter your password to unlock.';

export function RequireUnlock() {
  const { user, signOut } = useAuth();
  const keySession = useKeySession();
  const { openAuth } = useAuthModalActions();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Inline, beside the input being retried, and announced as an alert.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const visible = !!user && keySession.status === 'locked' && isProtectedPath(location.pathname);
  useModalLayer(visible);
  const trapRef = useFocusTrap<HTMLDivElement>(visible, {
    initialFocus: () => document.getElementById('unlock-password'),
  });

  if (!visible || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The button stays enabled so an empty submit says why instead of doing nothing.
    if (!password.trim()) {
      setErrorMessage(EMPTY_PASSWORD);
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { error, missingKeys } = await keySession.unlock(user.id, password);
      if (error) analytics.unlockFailed();
      else analytics.unlockSucceeded();
      if (missingKeys) {
        setErrorMessage(MISSING_KEYS_MESSAGE);
        return;
      }
      if (error) {
        // unlock() does not tell a wrong password from a network failure, so
        // the message covers both: retry for the transient case, reset for
        // the forgotten one.
        setErrorMessage("That password didn't work. Try again, or reset it with your recovery code.");
        return;
      }
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setPassword('');
    setErrorMessage(null);
  };

  // A reset link needs a signed-out session and Turnstile, neither of which
  // this dialog has, so sign out first and open the reset form with the email.
  const handleReset = async () => {
    const email = user.email ?? undefined;
    await handleSignOut();
    openAuth('forgot', { email });
  };

  return createPortal(
    <div className="q-modal-backdrop q-modal-backdrop--top" style={{ zIndex: 'var(--z-lock)' }}>
      <div
        ref={trapRef}
        className="q-modal"
        style={{ maxWidth: 400 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="require-unlock-title"
        aria-describedby="require-unlock-sub"
      >
        <div className="q-modal-head">
          <div>
            <h2 className="q-modal-title" id="require-unlock-title">Unlock your data</h2>
            <p className="q-modal-sub" id="require-unlock-sub">
              Your entries are encrypted. Enter your password to decrypt them on this device.
            </p>
          </div>
        </div>

        <div className="q-modal-body">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div className="q-field">
              <label className="q-field-label" htmlFor="unlock-password">Password</label>
              <span className="q-input">
                <input
                  id="unlock-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    // The message belongs to the attempt that produced it.
                    if (errorMessage) setErrorMessage(null);
                  }}
                  aria-invalid={errorMessage ? true : undefined}
                  aria-describedby={errorMessage ? 'require-unlock-error' : undefined}
                />
              </span>
            </div>

            {errorMessage && (
              <Notice variant="negative" role="alert" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-2)' }}>
                <p id="require-unlock-error" style={{ margin: 0 }}>{errorMessage}</p>
                {errorMessage !== EMPTY_PASSWORD && (
                  <button type="button" onClick={handleReset} className="q-link-btn" style={{ alignSelf: 'flex-start' }}>
                    Sign out and reset password
                  </button>
                )}
              </Notice>
            )}

            <button type="submit" disabled={submitting} className="q-btn q-btn--primary q-btn--lg" style={{ width: '100%' }}>
              {submitting ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>

          <button type="button" onClick={handleSignOut} className="q-btn q-btn--ghost q-btn--lg" style={{ width: '100%', marginTop: 'var(--s-2)' }}>
            Sign out instead
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
