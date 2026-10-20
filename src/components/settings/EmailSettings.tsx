import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { usePasswordCheck } from '@/hooks/usePasswordCheck';
import { supabase } from '@/integrations/supabase/client';
import { pendingEmailChange, requestEmailChange, requestErrorMessage } from '@/lib/emailChange';
import { SettingsRow as Row } from './SettingsRows';

/**
 * Settings → Profile → Email. A change takes the current password (a fresh
 * sign-in the server checks) and a link sent to the new address, opened while
 * signed in. The old inbox isn't needed. Spec: docs/security/encryption.md §8.11.
 */
export function EmailRow() {
  const { user } = useAuth();
  const passwordCheck = usePasswordCheck();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const pending = user ? pendingEmailChange(user) : null;
  const pendingEmail = pending?.email ?? null;

  // The link is often opened on another device, which this tab would hear
  // about only at its next token refresh, up to an hour later. While a change
  // is pending, refresh on mount and whenever the tab comes back into view.
  useEffect(() => {
    if (!pendingEmail) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void supabase.auth.refreshSession();
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [pendingEmail]);

  if (!user?.email) return null;
  const current = user.email;

  const open = (address = '') => {
    setDraft(address);
    setPassword('');
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft('');
    setPassword('');
  };

  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cancel();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const address = draft.trim().toLowerCase();
    if (!address || !password || passwordCheck.captchaPending) return;
    if (address === current.toLowerCase()) {
      toast.error("That's already your email.");
      return;
    }
    setSending(true);
    try {
      const passwordError = await passwordCheck.check(password);
      if (passwordError) {
        toast.error(passwordError);
        return;
      }
      const code = await requestEmailChange(supabase, address);
      if (code) {
        toast.error(requestErrorMessage(code));
        return;
      }
      cancel();
      toast.success(`Check ${address} for a link to confirm the change.`);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Row
        label="Email"
        description={editing
          ? "We'll email a link to the new address. Open it while signed in to finish the change. Your password stays the same."
          : undefined}
      >
        <div className="q-set-inline">
          <span className="q-set-value">{current}</span>
          {!editing && (
            <button type="button" onClick={() => open()} className="q-link-btn" aria-label="Change email">
              Change
            </button>
          )}
        </div>
      </Row>
      {editing && (
        <form onSubmit={handleSubmit} className="q-set-form">
          <div className="q-field">
            <label className="q-field-label" htmlFor="new-email">New email</label>
            <span className="q-input">
              <input
                id="new-email"
                type="email"
                autoComplete="email"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onEscape}
                required
                autoFocus
              />
            </span>
          </div>
          <div className="q-field">
            <label className="q-field-label" htmlFor="email-change-password">Current password</label>
            <span className="q-input">
              <input
                id="email-change-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onEscape}
                required
              />
            </span>
          </div>
          {passwordCheck.captcha}
          <div className="q-set-inline">
            <button
              type="submit"
              disabled={sending || !draft.trim() || !password || passwordCheck.captchaPending}
              className="q-btn q-btn--secondary q-btn--md"
            >
              {sending ? 'Sending…' : passwordCheck.captchaPending ? 'Checking your browser…' : 'Send link'}
            </button>
            <button type="button" onClick={cancel} className="q-btn q-btn--ghost q-btn--md">
              Cancel
            </button>
          </div>
        </form>
      )}
      {pending && !editing && (
        <Row label="New email" description="Waiting for you to open the link we sent there. It works for 24 hours.">
          <div className="q-set-inline">
            <span className="q-set-value">{pending.email}</span>
            <button type="button" onClick={() => open(pending.email)} className="q-link-btn">
              Send again
            </button>
          </div>
        </Row>
      )}
    </>
  );
}
