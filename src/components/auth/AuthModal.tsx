import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useModalLayer } from '@/hooks/useModalLayer';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Notice } from '@/components/ui/Notice';
import { mapAuthError } from '@/lib/authError';
import { analytics } from '@/lib/analytics';
import { PASSWORD_MIN_LENGTH, PASSWORD_LENGTH_HINT, passwordTooShort } from '@/lib/passwordPolicy';
import { Turnstile } from './Turnstile';
import { isCaptchaEnabled } from '@/lib/captcha';

type Mode = 'signin' | 'signup' | 'forgot' | 'confirm';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup' | 'forgot';
  /** Pre-fills the email field, e.g. after "Sign out and reset password". */
  defaultEmail?: string;
}

const TITLE: Record<Mode, string> = {
  signin: 'Sign in',
  signup: 'Create your account',
  forgot: 'Reset password',
  confirm: 'Check your inbox',
};

const SUB: Record<Mode, string> = {
  signin: 'Your password signs you in and decrypts your data on this device.',
  signup: 'Save your history and open it on any device. Entries are encrypted in your browser before upload.',
  forgot: "Enter your email and we'll send you a reset link.",
  confirm: 'Open the link in that email to activate your account.',
};

export function AuthModal({ open, onClose, defaultMode = 'signup', defaultEmail }: AuthModalProps) {
  const { signUp, signIn, resetPassword, resendConfirmation } = useAuth();
  const keySession = useKeySession();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Inline, not a toast: the page behind the dialog is inert, so a toast
  // there is neither announced nor readable for long enough.
  const [error, setError] = useState<string | null>(null);
  // Supabase rate-limits resends to about once a minute.
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  // Turnstile token + a nonce that remounts the widget for a fresh token.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);

  // Tokens are single-use: reset after each attempt.
  const resetCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaNonce((n) => n + 1);
  };
  const captchaPending = isCaptchaEnabled && !captchaToken;
  const submitDisabled = submitting || (mode === 'signup' && !acceptedTerms) || captchaPending;
  // Turnstile is invisible, so say why the button waits when it is the only blocker.
  const captchaVerifying = captchaPending && !submitting && (mode !== 'signup' || acceptedTerms);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // Each open honours the trigger's mode and email.
  useEffect(() => {
    if (!open) return;
    setMode(defaultMode);
    setEmail(defaultEmail ?? '');
    setError(null);
  }, [open, defaultMode, defaultEmail]);

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setAcceptedTerms(false);
    setSubmitting(false);
    setShowPassword(false);
    setError(null);
    resetCaptcha();
    onClose();
  };

  useModalLayer(open, handleClose);
  // With a known email (reset after unlock), start where the typing is.
  const trapRef = useFocusTrap<HTMLDivElement>(open, {
    initialFocus: () => document.getElementById(defaultEmail ? 'auth-password' : 'auth-email')
      ?? document.querySelector<HTMLElement>('.q-modal button[type="submit"]'),
  });

  if (!open) return null;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  // A stray backdrop click must not throw away typed credentials or a submit
  // in flight; the close button and Escape always close.
  const hasUserInput = email.trim().length > 0 || password.trim().length > 0;
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    if (submitting || mode === 'confirm' || hasUserInput) return;
    handleClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);

    if (mode === 'forgot') {
      const { error: resetErr } = await resetPassword(email.trim(), captchaToken ?? undefined);
      resetCaptcha();
      setSubmitting(false);
      if (resetErr) {
        setError(mapAuthError(resetErr));
      } else {
        toast.success('Reset link sent. Check your email.');
        handleClose();
      }
      return;
    }

    if (!password.trim()) { setSubmitting(false); return; }
    if (mode === 'signup' && passwordTooShort(password)) {
      setSubmitting(false);
      setError(PASSWORD_LENGTH_HINT);
      return;
    }
    if (mode === 'signup' && !acceptedTerms) {
      setSubmitting(false);
      setError('Accept the Privacy Policy and Terms to continue.');
      return;
    }
    const token = captchaToken ?? undefined;
    const { error: authErr } = mode === 'signup'
      ? await signUp(email.trim(), password, token)
      : await signIn(email.trim(), password, token);
    resetCaptcha();
    if (authErr) {
      setSubmitting(false);
      setError(mapAuthError(authErr));
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { error: unlockErr } = await keySession.unlock(session.user.id, password);
      // Only returning users count as unlock attempts: a sign-up provisions
      // keys and never "fails to unlock", which would inflate the metric.
      if (mode === 'signin') {
        if (unlockErr) analytics.unlockFailed();
        else analytics.unlockSucceeded();
      }
      if (unlockErr) {
        setSubmitting(false);
        setError("Signed in, but your data couldn't be decrypted. Try again, or reset your password.");
        return;
      }
    }

    setSubmitting(false);
    if (mode === 'signup') {
      if (session?.user) {
        toast.success('Account created');
        handleClose();
      } else {
        // No session: email confirmation is required, so stay open and say so.
        setPassword('');
        switchMode('confirm');
      }
    } else {
      toast.success('Signed in');
      handleClose();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email.trim() || captchaPending) return;
    setResendCooldown(60);
    setError(null);
    const { error: resendErr } = await resendConfirmation(email.trim(), captchaToken ?? undefined);
    resetCaptcha();
    if (resendErr) {
      setError(mapAuthError(resendErr));
      setResendCooldown(0);
    } else {
      toast.success('Confirmation email sent again');
    }
  };

  const errorNotice = error && (
    <Notice variant="negative" role="alert">
      <span>{error}</span>
    </Notice>
  );

  return createPortal(
    <div className="q-modal-backdrop q-modal-backdrop--top" onClick={handleBackdropClick}>
      <div
        ref={trapRef}
        className="q-modal"
        style={{ maxWidth: 440 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        aria-describedby="auth-modal-sub"
      >
        <div className="q-modal-head">
          <div>
            <h2 className="q-modal-title" id="auth-modal-title">{TITLE[mode]}</h2>
            <p className="q-modal-sub" id="auth-modal-sub">{SUB[mode]}</p>
          </div>
          <button type="button" onClick={handleClose} className="q-icon-btn" aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="q-modal-body">
          {mode === 'confirm' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--fg-muted)' }}>
                Sent to <strong style={{ color: 'var(--fg)', fontWeight: 500, overflowWrap: 'anywhere' }}>{email}</strong>. The link expires in 24 hours.
              </p>
              {errorNotice}
              <Turnstile
                key={`confirm-${captchaNonce}`}
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
                onError={() => setCaptchaToken(null)}
              />
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || captchaPending}
                aria-busy={captchaVerifying && resendCooldown <= 0}
                className="q-btn q-btn--secondary q-btn--lg"
                style={{ width: '100%' }}
              >
                {captchaVerifying && resendCooldown <= 0 && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {resendCooldown > 0 ? `Send again in ${resendCooldown}s`
                  : captchaVerifying ? 'Checking your browser…'
                  : 'Send the email again'}
              </button>
              <button type="button" onClick={handleClose} className="q-btn q-btn--ghost q-btn--lg" style={{ width: '100%' }}>
                Close
              </button>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-subtle)' }}>
                Wrong address?{' '}
                <button type="button" onClick={() => switchMode('signup')} className="q-link-btn">Start again</button>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
              <div className="q-field">
                <label className="q-field-label" htmlFor="auth-email">Email</label>
                <span className="q-input">
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    required
                    autoComplete="email"
                  />
                </span>
              </div>
              {mode !== 'forgot' && (
                <div className="q-field">
                  <label className="q-field-label" htmlFor="auth-password">Password</label>
                  <span className="q-input">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      required
                      minLength={mode === 'signup' ? PASSWORD_MIN_LENGTH : undefined}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      aria-describedby={mode === 'signup' ? 'auth-password-help' : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="q-input-reveal"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                    </button>
                  </span>
                  {mode === 'signup' && <span className="q-field-help" id="auth-password-help">{PASSWORD_LENGTH_HINT}</span>}
                </div>
              )}
              {mode === 'signup' && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)', cursor: 'pointer' }}>
                  <Checkbox
                    checked={acceptedTerms}
                    onCheckedChange={(v) => setAcceptedTerms(v === true)}
                    className="mt-0.5"
                  />
                  <span style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: '20px' }}>
                    I agree to the{' '}
                    <Link to="/privacy" onClick={handleClose} className="q-inline-link">Privacy Policy</Link>
                    {' '}and{' '}
                    <Link to="/terms" onClick={handleClose} className="q-inline-link">Terms of Service</Link>
                  </span>
                </label>
              )}
              {mode === 'forgot' && (
                <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--fg-muted)' }}>
                  {"You'll need your 24-word recovery code to keep your data. Without it, a new password opens an empty account."}
                </p>
              )}
              {errorNotice}
              <Turnstile
                key={`form-${captchaNonce}`}
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
                onError={() => setCaptchaToken(null)}
              />
              <button
                type="submit"
                disabled={submitDisabled}
                aria-busy={submitting || captchaVerifying}
                className="q-btn q-btn--primary q-btn--lg"
                style={{ width: '100%' }}
              >
                {(submitting || captchaVerifying) && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {submitting ? (mode === 'signin' ? 'Signing in…' : mode === 'signup' ? 'Creating account…' : 'Sending link…')
                  : captchaVerifying ? 'Checking your browser…'
                  : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Sign up' : 'Send reset link'}
              </button>
            </form>
          )}

          {mode !== 'confirm' && (
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--fg-subtle)', margin: 'var(--s-4) 0 0' }}>
              {mode === 'signin' ? (
                <>
                  <button type="button" onClick={() => switchMode('forgot')} className="q-link-btn">Forgot password?</button>
                  <span aria-hidden="true" style={{ margin: '0 8px' }}>·</span>
                  <button type="button" onClick={() => switchMode('signup')} className="q-link-btn">Create an account</button>
                </>
              ) : mode === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <button type="button" onClick={() => switchMode('signin')} className="q-link-btn">Sign in</button>
                </>
              ) : (
                <>
                  Remember your password?{' '}
                  <button type="button" onClick={() => switchMode('signin')} className="q-link-btn">Sign in</button>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
