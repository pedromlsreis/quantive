import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseKeyStore } from '@/lib/keySession';
import { isValidRecoveryCode } from '@/lib/crypto';
import { urlLooksLikeRecovery } from '@/lib/recoveryUrl';

type LinkState = 'checking' | 'invalid' | 'verifying' | 'ready';

/**
 * What the user_keys row looks like for this user. Drives which form we show.
 *   - 'no-encryption'         : no user_keys row -> standard password reset.
 *   - 'with-recovery'         : has user_keys + wrapped_dk_recovery -> full recovery flow.
 *   - 'encrypted-no-recovery' : has user_keys but no recovery wrap -> data will orphan.
 */
type EncMode = 'unknown' | 'no-encryption' | 'with-recovery' | 'encrypted-no-recovery';

function submitButtonLabel(submitting: boolean, linkState: LinkState): string {
  if (submitting) return 'Updating…';
  if (linkState !== 'ready') return 'Verifying link…';
  return 'Update password';
}

const ResetPassword = () => {
  const { updatePassword } = useAuth();
  const { recoverWithCode } = useKeySession();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [acceptDataLoss, setAcceptDataLoss] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Single state machine: 'checking' (waiting for SDK) → 'verifying' (URL
  // looks like recovery, awaiting session) → 'ready' (session in hand);
  // 'invalid' if the 1.5s grace timer expires without progress.
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [encMode, setEncMode] = useState<EncMode>('unknown');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (urlLooksLikeRecovery(window.location)) {
      setLinkState('verifying');
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setLinkState(session ? 'ready' : 'verifying');
      }
    });

    // StrictMode remount safety: the SDK may have already processed the
    // URL on a prior mount, so PASSWORD_RECOVERY won't fire again. Ask
    // directly — but only promote to 'ready', never back to 'verifying'.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setLinkState(prev => (prev === 'verifying' ? 'ready' : prev));
    });

    // 1.5s covers slow PKCE token exchanges. After that, if we haven't
    // moved on from 'checking', the link wasn't a recovery link.
    const timer = setTimeout(() => {
      setLinkState(prev => (prev === 'checking' ? 'invalid' : prev));
    }, 1500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  // Once the session is ready, peek at user_keys to decide which form to show.
  useEffect(() => {
    if (linkState !== 'ready') return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      setUserId(user.id);
      try {
        const row = await supabaseKeyStore.getUserKeys(user.id);
        if (cancelled) return;
        if (!row) setEncMode('no-encryption');
        else if (row.wrapped_dk_recovery) setEncMode('with-recovery');
        else setEncMode('encrypted-no-recovery');
      } catch {
        // If we can't read user_keys, default to the safest path: assume
        // encryption is set up and require a recovery code. False positives
        // are recoverable; false negatives orphan data.
        if (!cancelled) setEncMode('with-recovery');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    if (encMode === 'with-recovery') {
      if (!isValidRecoveryCode(recoveryCode)) {
        toast.error('Recovery code is invalid (failed BIP-39 checksum).');
        return;
      }
    } else if (encMode === 'encrypted-no-recovery' && !acceptDataLoss) {
      toast.error('You must acknowledge the data-loss warning before continuing.');
      return;
    }

    // Defense-in-depth: the button is disabled unless 'ready', but a token
    // could be revoked between enable and click — re-check before mutating.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !userId) {
      toast.error('Reset session not ready. Please reopen the email link.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        toast.error(error);
        return;
      }

      // Password is rotated in Supabase auth. Now reconcile the at-rest wrap.
      if (encMode === 'with-recovery') {
        const { error: recoverErr } = await recoverWithCode(
          userId,
          recoveryCode,
          password,
        );
        if (recoverErr) {
          // Password is already rotated. Surface and bail; the user's
          // session remains valid but the wrap is still under the OLD
          // password. They'll be stuck on next sign-in unless they
          // re-enter the recovery code.
          toast.error(
            'Password updated, but the recovery code did not unlock your data. Try again on next sign-in.',
          );
          return;
        }
        toast.success('Password reset and data unlocked.');
      } else {
        toast.success('Password updated successfully!');
      }
      navigate('/');
    } finally {
      setSubmitting(false);
    }
  };

  if (linkState === 'checking') {
    return (
      <div className="flex flex-1 items-center justify-center bg-background p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (linkState === 'invalid') {
    return (
      <div className="flex flex-1 items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="mb-2 text-lg font-bold text-foreground">Invalid or expired reset link</h1>
          <p className="mb-5 text-sm text-muted-foreground">
            This link is invalid or has expired. Reset links are single-use and time-limited — please request a new one.
          </p>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-background p-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mb-1 text-lg font-bold text-foreground">Set new password</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          {encMode === 'with-recovery'
            ? 'Enter your new password and your 24-word recovery code below.'
            : 'Enter your new password below.'}
        </p>

        {encMode === 'encrypted-no-recovery' && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <p className="mb-1.5 flex items-start gap-2 font-medium">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your encrypted data cannot be recovered.
            </p>
            <p className="leading-relaxed">
              You didn't set up a recovery code. Resetting your password will
              leave your saved portfolio permanently inaccessible. The
              account will keep working — but past data will be lost.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
            required
            minLength={6}
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
            required
            minLength={6}
          />

          {encMode === 'with-recovery' && (
            <textarea
              placeholder="Your 24-word recovery code"
              value={recoveryCode}
              onChange={e => setRecoveryCode(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-secondary/50 px-4 py-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          )}

          {encMode === 'encrypted-no-recovery' && (
            <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={acceptDataLoss}
                onChange={e => setAcceptDataLoss(e.target.checked)}
                className="mt-0.5"
              />
              I understand my encrypted portfolio data will be permanently lost.
            </label>
          )}

          <button
            type="submit"
            disabled={
              submitting ||
              linkState !== 'ready' ||
              encMode === 'unknown' ||
              (encMode === 'encrypted-no-recovery' && !acceptDataLoss)
            }
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitButtonLabel(submitting, linkState)}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
