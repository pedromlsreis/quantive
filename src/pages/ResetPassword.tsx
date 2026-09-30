import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthModalActions } from '@/contexts/AuthModalContext';
import { Wordmark } from '@/components/layout/Brand';
import { Notice } from '@/components/ui/Notice';
import { supabase } from '@/integrations/supabase/client';
import { supabaseKeyStore } from '@/lib/keySession';
import { isValidRecoveryCode } from '@/lib/crypto';
import { urlLooksLikeRecovery } from '@/lib/recoveryUrl';
import { mapAuthError } from '@/lib/authError';
import { analytics } from '@/lib/analytics';
import { PASSWORD_MIN_LENGTH, PASSWORD_LENGTH_HINT, passwordTooShort } from '@/lib/passwordPolicy';

type LinkState = 'checking' | 'invalid' | 'verifying' | 'ready';

/**
 * What the user_keys row looks like for this user. Drives which form we show.
 *   - 'no-encryption'         : no user_keys row and no snapshot -> standard password reset.
 *   - 'with-recovery'         : has user_keys + wrapped_dk_recovery -> full recovery flow.
 *   - 'encrypted-no-recovery' : has user_keys but no recovery wrap, or a snapshot whose
 *                               user_keys row is missing -> the old data is cleared
 *                               (reset-encrypted-data) and the account starts empty.
 */
type EncMode = 'unknown' | 'no-encryption' | 'with-recovery' | 'encrypted-no-recovery';

function submitButtonLabel(submitting: boolean, linkState: LinkState): string {
  if (submitting) return 'Saving…';
  if (linkState !== 'ready') return 'Checking the link…';
  return 'Save new password';
}

const ResetPassword = () => {
  const { updatePassword } = useAuth();
  const { recoverWithCode } = useKeySession();
  const navigate = useNavigate();
  const { openAuth } = useAuthModalActions();
  const [password, setPassword] = useState('');
  // Inline beside the fields, not a toast, so the reason stays readable.
  const [formError, setFormError] = useState<string | null>(null);
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
        if (row?.wrapped_dk_recovery) setEncMode('with-recovery');
        else if (row) setEncMode('encrypted-no-recovery');
        else {
          // A snapshot without its key row can't be opened either (MissingKeysError).
          const orphaned = await supabaseKeyStore.hasPortfolioSnapshot(user.id);
          if (cancelled) return;
          setEncMode(orphaned ? 'encrypted-no-recovery' : 'no-encryption');
        }
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
    setFormError(null);
    if (password !== confirm) {
      setFormError("The two passwords don't match.");
      return;
    }
    if (passwordTooShort(password)) {
      setFormError(PASSWORD_LENGTH_HINT);
      return;
    }

    if (encMode === 'with-recovery') {
      if (!isValidRecoveryCode(recoveryCode)) {
        setFormError("That recovery code isn't valid. Check the 24 words and their order.");
        return;
      }
    } else if (encMode === 'encrypted-no-recovery' && !acceptDataLoss) {
      setFormError('Tick the box to confirm your saved entries will be lost.');
      return;
    }

    // Defense-in-depth: the button is disabled unless 'ready', but a token
    // could be revoked between enable and click — re-check before mutating.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !userId) {
      setFormError('This page lost the reset session. Open the link from the email again.');
      return;
    }

    setSubmitting(true);
    try {
      // Clear the undecryptable data first. Left in place, the old key row
      // stays wrapped under the old password and every later unlock fails.
      // Doing it before the password change means a failure changes nothing.
      if (encMode === 'encrypted-no-recovery') {
        const { error: wipeErr } = await supabase.functions.invoke('reset-encrypted-data');
        if (wipeErr) {
          setFormError("We couldn't clear your old saved entries, so your password wasn't changed. Try again.");
          return;
        }
        setEncMode('no-encryption');
      }

      const { error } = await updatePassword(password);
      if (error) {
        setFormError(mapAuthError(error));
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
          setFormError(
            "Password changed, but the recovery code didn't unlock your data. Enter it again at your next sign-in.",
          );
          return;
        }
        analytics.recoveryUsed();
        toast.success('Password changed. Your data is unlocked.');
      } else if (encMode === 'encrypted-no-recovery') {
        toast.success("Password changed. You're starting with an empty portfolio.");
      } else {
        toast.success('Password changed');
      }
      navigate('/');
    } finally {
      setSubmitting(false);
    }
  };

  const frame = (children: React.ReactNode) => (
    <div className="q-auth-page">
      <header className="q-auth-page-head">
        <Link to="/" aria-label="Quantive home" style={{ display: 'inline-flex' }}><Wordmark size={22} /></Link>
      </header>
      <main className="q-auth-page-main">
        <div className="q-auth-page-col">{children}</div>
      </main>
    </div>
  );

  if (linkState === 'checking') {
    return frame(<p className="q-page-lede" role="status">Checking your reset link…</p>);
  }

  if (linkState === 'invalid') {
    return frame(
      <>
        <h1 className="q-h1">{"This reset link doesn't work"}</h1>
        <p className="q-page-lede">Reset links work once and expire. Request a new one.</p>
        <div className="q-auth-page-actions">
          <button type="button" onClick={() => openAuth('forgot')} className="q-btn q-btn--primary q-btn--lg">
            Request a new link
          </button>
          <Link to="/" className="q-btn q-btn--ghost q-btn--lg">Back to home</Link>
        </div>
      </>,
    );
  }

  return frame(
    <>
      <h1 className="q-h1">Choose a new password</h1>
      <p className="q-page-lede">
        {encMode === 'with-recovery'
          ? 'Enter a new password and your 24-word recovery code. The code opens your data under the new password.'
          : 'Enter a new password.'}
      </p>

      {encMode === 'encrypted-no-recovery' && (
        <Notice variant="negative" role="note" style={{ marginTop: 'var(--s-5)' }}>
          <span>
            {"You didn't save a recovery code, so a new password can't decrypt your saved data. Your account keeps working and starts empty."}
          </span>
        </Notice>
      )}

      <form onSubmit={handleSubmit} className="q-auth-page-form">
        <div className="q-field">
          <label className="q-field-label" htmlFor="reset-password">New password</label>
          <span className="q-input">
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFormError(null); }}
              required
              minLength={PASSWORD_MIN_LENGTH}
              aria-describedby="reset-password-help"
            />
          </span>
          <span className="q-field-help" id="reset-password-help">{PASSWORD_LENGTH_HINT}</span>
        </div>
        <div className="q-field">
          <label className="q-field-label" htmlFor="reset-confirm">Confirm new password</label>
          <span className="q-input">
            <input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setFormError(null); }}
              required
              minLength={PASSWORD_MIN_LENGTH}
            />
          </span>
        </div>

        {encMode === 'with-recovery' && (
          <div className="q-field">
            <label className="q-field-label" htmlFor="reset-recovery">Recovery code</label>
            <span className="q-input q-input--textarea">
              <textarea
                id="reset-recovery"
                value={recoveryCode}
                onChange={(e) => { setRecoveryCode(e.target.value); setFormError(null); }}
                rows={3}
                style={{ resize: 'none', fontFamily: 'var(--font-mono)', fontSize: 14 }}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </span>
            <span className="q-field-help">24 words, separated by spaces, in order.</span>
          </div>
        )}

        {encMode === 'encrypted-no-recovery' && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)', cursor: 'pointer', fontSize: 14, lineHeight: '20px', color: 'var(--fg-muted)' }}>
            <input
              type="checkbox"
              checked={acceptDataLoss}
              onChange={(e) => { setAcceptDataLoss(e.target.checked); setFormError(null); }}
              style={{ marginTop: 3 }}
            />
            I understand my saved entries will be lost.
          </label>
        )}

        {formError && (
          <Notice variant="negative" role="alert"><span>{formError}</span></Notice>
        )}

        <button
          type="submit"
          disabled={
            submitting ||
            linkState !== 'ready' ||
            encMode === 'unknown' ||
            (encMode === 'encrypted-no-recovery' && !acceptDataLoss)
          }
          className="q-btn q-btn--primary q-btn--lg"
          style={{ width: '100%' }}
        >
          {submitButtonLabel(submitting, linkState)}
        </button>
      </form>
    </>,
  );
};

export default ResetPassword;
