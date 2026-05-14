/**
 * Modal shown when an authenticated user has a session but no DK in memory
 * (e.g., page reload). Spec: docs/security/encryption.md §8.3.
 *
 * Captures the password and calls keySession.unlock(). On success, the
 * provider transitions to 'unlocked-encrypted' and this modal dismounts.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Lock, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { useFocusTrap } from '@/hooks/useFocusTrap';

// Routes that actually decrypt portfolio data. Marketing, legal, demo, admin,
// and the reset-password flow don't need an unlocked DK and shouldn't show
// the modal — reset-password in particular runs its own password+recovery
// flow, and prompting for the forgotten password there is the bug of bugs.
const PROTECTED_PATHS = ['/dashboard', '/settings', '/admin'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export function RequireUnlock() {
  const { user, signOut } = useAuth();
  const keySession = useKeySession();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  // Only show when the user is authed and we don't have a DK loaded.
  if (!user || keySession.status !== 'locked') return null;
  if (!isProtectedPath(location.pathname)) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await keySession.unlock(user.id, password);
      if (error) {
        toast.error('Could not unlock. Check your password and try again.');
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
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
              />
            </label>
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
