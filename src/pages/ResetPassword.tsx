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
import { mapAuthError } from '@/lib/authError';

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
        toast.error(mapAuthError(error));
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
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: 'var(--s-8)' }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '4px solid var(--accent-raw)',
            borderTopColor: 'transparent',
            animation: 'spin 1s linear infinite',
          }}
        />
      </div>
    );
  }

  const heroIcon = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 48, height: 48, borderRadius: 'var(--r-3)',
      background: 'var(--accent-faint-raw)',
      marginBottom: 'var(--s-4)',
    }}>
      <KeyRound className="h-6 w-6 text-primary" />
    </div>
  );

  if (linkState === 'invalid') {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: 'var(--s-8)' }}>
        <div className="q-card q-card--p-lg" style={{ width: '100%', maxWidth: 384, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>{heroIcon}</div>
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--fg)', marginBottom: 'var(--s-2)' }}>
            Invalid or expired reset link
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', marginBottom: 'var(--s-5)' }}>
            This link is invalid or has expired. Reset links are single-use and time-limited — please request a new one.
          </p>
          <button
            onClick={() => navigate('/')}
            className="q-btn q-btn--primary q-btn--md"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: 'var(--s-8)' }}>
      <div className="q-card q-card--p-lg" style={{ width: '100%', maxWidth: 448 }}>
        {heroIcon}
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>
          Set new password
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', marginBottom: 'var(--s-5)' }}>
          {encMode === 'with-recovery'
            ? 'Enter your new password and your 24-word recovery code below.'
            : 'Enter your new password below.'}
        </p>

        {encMode === 'encrypted-no-recovery' && (
          <div style={{
            borderRadius: 'var(--r-2)',
            border: '1px solid color-mix(in oklch, var(--negative) 40%, transparent)',
            background: 'color-mix(in oklch, var(--negative) 10%, transparent)',
            padding: 'var(--s-3)',
            fontSize: 'var(--text-xs)',
            color: 'var(--negative)',
            marginBottom: 'var(--s-4)',
          }}>
            <p style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)', fontWeight: 500, margin: 0, marginBottom: 6 }}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your encrypted data cannot be recovered.
            </p>
            <p style={{ lineHeight: 1.5, margin: 0 }}>
              You didn't set up a recovery code. Resetting your password will
              leave your saved portfolio permanently inaccessible. The
              account will keep working — but past data will be lost.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <label className="q-input">
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          <label className="q-input">
            <input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={6}
            />
          </label>

          {encMode === 'with-recovery' && (
            <label className="q-input q-input--textarea">
              <textarea
                placeholder="Your 24-word recovery code"
                value={recoveryCode}
                onChange={e => setRecoveryCode(e.target.value)}
                rows={3}
                style={{ resize: 'none', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </label>
          )}

          {encMode === 'encrypted-no-recovery' && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
              <input
                type="checkbox"
                checked={acceptDataLoss}
                onChange={e => setAcceptDataLoss(e.target.checked)}
                style={{ marginTop: 2 }}
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
            className="q-btn q-btn--primary q-btn--md"
            style={{ width: '100%' }}
          >
            {submitButtonLabel(submitting, linkState)}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
