/**
 * Modal shown when an authenticated user has a session but no DK in memory
 * (e.g., page reload). Spec: docs/security/encryption.md §8.3.
 *
 * Captures the password and calls keySession.unlock(). On success, the
 * provider transitions to 'unlocked-encrypted' and this modal dismounts.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Lock, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { Notice } from '@/components/ui/Notice';
import { analytics } from '@/lib/analytics';
import { isProtectedPath } from './protectedPaths';

export function RequireUnlock() {
  const { user, signOut } = useAuth();
  const keySession = useKeySession();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  // Inline error instead of a toast: the toast auto-dismisses at the exact
  // moment the user is trying to read it (same defect AuthModal fixed by
  // bumping toast duration). An inline region inside the focused dialog
  // stays visible, is screen-reader-announced via Notice's aria-live, and
  // sits next to the input the user is about to retry.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Only show when the user is authed and we don't have a DK loaded.
  if (!user || keySession.status !== 'locked') return null;
  if (!isProtectedPath(location.pathname)) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await keySession.unlock(user.id, password);
      if (error) analytics.unlockFailed();
      else analytics.unlockSucceeded();
      if (error) {
        // The unlock boundary intentionally does not distinguish wrong
        // password from network failure (see KeySessionContext.unlock). The
        // message has to cover both; "try again" handles the transient case,
        // and the recovery link handles the genuinely-forgotten case.
        setErrorMessage("That password didn't work. Try again, or use your recovery code if you've forgotten it.");
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

  return createPortal(
    <div
      className="q-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="require-unlock-title"
      style={{ zIndex: 60 }}
    >
      <div ref={trapRef} className="q-modal" style={{ maxWidth: 384 }}>
        <div className="q-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 'var(--r-3)',
            background: 'var(--accent-faint-raw)', flexShrink: 0,
          }}>
            <Lock className="h-6 w-6 text-primary" />
          </div>

          <div>
            <div className="q-modal-title" id="require-unlock-title">Unlock your data</div>
            <div className="q-modal-sub" style={{ marginTop: 4 }}>
              Your portfolio is end-to-end encrypted. Enter your password to decrypt it on this device.
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <label className="q-input">
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  // Clear stale error the moment the user edits — keeps the
                  // message tied to the attempt that produced it.
                  if (errorMessage) setErrorMessage(null);
                }}
                required
                autoFocus
                aria-invalid={errorMessage ? true : undefined}
                aria-describedby={errorMessage ? 'require-unlock-error' : undefined}
              />
            </label>

            {errorMessage && (
              <Notice
                variant="negative"
                role="alert"
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-1)' }}
              >
                <p id="require-unlock-error" style={{ margin: 0 }}>{errorMessage}</p>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', opacity: 0.85 }}>
                  Forgotten your password?{' '}
                  <Link to="/reset-password" style={{ textDecoration: 'underline' }}>
                    Reset with your recovery code
                  </Link>
                  .
                </p>
              </Notice>
            )}

            <button
              type="submit"
              disabled={submitting || !password.trim()}
              className="q-btn q-btn--primary q-btn--md"
              style={{ width: '100%', opacity: submitting || !password.trim() ? 0.5 : 1 }}
            >
              {submitting ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>

          <button
            onClick={handleSignOut}
            className="q-btn q-btn--ghost q-btn--sm"
            style={{ width: '100%', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out instead
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
