/**
 * Modal shown when an authenticated user has a session but no DK in memory
 * (e.g., page reload). Spec: docs/security/encryption.md §8.3.
 *
 * Captures the password and calls keySession.unlock(). On success, the
 * provider transitions to 'unlocked-encrypted' (or 'unlocked-legacy' if
 * the user is pre-encryption) and this modal dismounts.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';

export function RequireUnlock() {
  const { user, signOut } = useAuth();
  const keySession = useKeySession();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only show when the user is authed and we don't have a DK loaded.
  if (!user || keySession.status !== 'locked') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await keySession.unlock(user.id, password);
      if (error) {
        // We don't echo the underlying message — too easy to leak the
        // distinction between "wrong password" and "transient network".
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <Lock className="h-6 w-6 text-primary" />
        </div>

        <h2 className="mb-1 text-lg font-bold text-foreground">Unlock your data</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Your portfolio is end-to-end encrypted. Enter your password to decrypt it on this device.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
            required
            autoFocus
          />
          <button
            type="submit"
            disabled={submitting || !password.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>

        <button
          onClick={handleSignOut}
          className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out instead
        </button>
      </div>
    </div>,
    document.body,
  );
}
