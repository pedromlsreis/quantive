import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { supabase } from '@/integrations/supabase/client';
import { LogIn, UserPlus, X, Mail, KeyRound, MailCheck, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Notice } from '@/components/ui/Notice';
import { mapAuthError } from '@/lib/authError';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
}

export function AuthModal({ open, onClose, defaultMode = 'signup' }: AuthModalProps) {
  const { signUp, signIn, resetPassword, resendConfirmation } = useAuth();
  const keySession = useKeySession();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'confirm'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Resend cooldown: Supabase rate-limits resends to ~once per minute; keep
  // the button visually unavailable during that window so users don't keep
  // tapping and hit a 429.
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // Each open event honours the latest `defaultMode` from the trigger.
  // Without this, a user who switched to 'signin' inside the modal would
  // re-open in 'signin' next time even if the new trigger asked for 'signup'.
  useEffect(() => {
    if (open) setMode(defaultMode);
  }, [open, defaultMode]);

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setAcceptedTerms(false);
    setSubmitting(false);
    setShowPassword(false);
    onClose();
  };

  if (!open) return null;

  // Backdrop dismiss is "soft close" — fine when the form is empty and idle,
  // but a stray edge-click should NOT throw away typed credentials or
  // interrupt a submit in flight. The × button and Esc remain the always-on
  // explicit close (#3: "popup closed without saying why").
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

    if (mode === 'forgot') {
      const { error } = await resetPassword(email.trim());
      setSubmitting(false);
      if (error) {
        toast.error(mapAuthError(error));
      } else {
        toast.success('Check your email for a password reset link.');
        handleClose();
      }
      return;
    }

    if (!password.trim()) { setSubmitting(false); return; }
    if (mode === 'signup' && !acceptedTerms) {
      toast.error('You must accept the Privacy Policy and Terms of Service.');
      setSubmitting(false);
      return;
    }
    const fn = mode === 'signup' ? signUp : signIn;
    const { error } = await fn(email.trim(), password);
    if (error) {
      setSubmitting(false);
      // 8s instead of the default ~4s — auth errors are the moment the user
      // most needs the message ("wrong password", "user not found") and a
      // toast that vanishes mid-read is what made #3 feel like a silent close.
      toast.error(mapAuthError(error), { duration: 8000 });
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { error: unlockErr } = await keySession.unlock(session.user.id, password);
      if (unlockErr) {
        setSubmitting(false);
        toast.error('Could not unlock encrypted data. Try again or reset your password.');
        return;
      }
    }

    setSubmitting(false);
    if (mode === 'signup') {
      if (session?.user) {
        toast.success('Account created and unlocked.');
        handleClose();
      } else {
        // No session means email confirmation is required. Keep the modal
        // open and switch to a confirmation panel — a toast is too ephemeral
        // for a moment where the user is asking "did anything happen?".
        setPassword('');
        setMode('confirm');
      }
    } else {
      toast.success('Signed in successfully!');
      handleClose();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email.trim()) return;
    setResendCooldown(60);
    const { error } = await resendConfirmation(email.trim());
    if (error) {
      toast.error(mapAuthError(error));
      setResendCooldown(0);
    } else {
      toast.success('Confirmation email resent.');
    }
  };

  return createPortal(
    <div
      className="q-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={handleBackdropClick}
    >
      <div ref={trapRef} className="q-modal">
        <div className="q-modal-head">
          <div>
            <div className="q-modal-title" id="auth-modal-title">
              {mode === 'signin' ? 'Sign in'
                : mode === 'signup' ? 'Create your account'
                : mode === 'forgot' ? 'Reset password'
                : 'Check your inbox'}
            </div>
            <div className="q-modal-sub">
              {mode === 'signin'
                ? 'Sign in to access your dashboard.'
                : mode === 'signup'
                ? 'Sign up to save and sync your portfolio data.'
                : mode === 'forgot'
                ? "Enter your email and we'll send you a reset link."
                : "We've sent a confirmation link to your email. Click it to activate your account."}
            </div>
          </div>
          <button type="button" onClick={handleClose} className="q-icon-btn" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="q-modal-body">
          {mode === 'confirm' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s-3)', textAlign: 'center', paddingBlock: 'var(--s-2)' }}>
              <div
                aria-hidden="true"
                style={{
                  display: 'grid', placeItems: 'center',
                  width: 56, height: 56,
                  borderRadius: '50%',
                  background: 'var(--accent-faint-raw)',
                  color: 'var(--accent-fg-raw)',
                }}
              >
                <MailCheck className="h-7 w-7" />
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', lineHeight: 1.5, maxWidth: 360 }}>
                Sent to <strong style={{ color: 'var(--fg)', fontWeight: 600, wordBreak: 'break-all' }}>{email}</strong>.
                The link expires in 24 hours. You can close this window — your account is waiting.
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="q-btn q-btn--secondary q-btn--md"
                style={{ width: '100%', opacity: resendCooldown > 0 ? 0.5 : 1 }}
              >
                <Mail className="h-4 w-4" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend confirmation email'}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="q-btn q-btn--ghost q-btn--sm"
                style={{ width: '100%' }}
              >
                I'll do it later
              </button>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', marginTop: 'var(--s-1)' }}>
                Wrong address?{' '}
                <button type="button" onClick={() => setMode('signup')} className="text-primary hover:underline">
                  Start over
                </button>
              </p>
            </div>
          ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <label className="q-input">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            {mode !== 'forgot' && (
              <label className="q-input" style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  style={{ paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  style={{
                    position: 'absolute',
                    right: 8, top: '50%', transform: 'translateY(-50%)',
                    display: 'grid', placeItems: 'center',
                    width: 28, height: 28,
                    background: 'transparent', border: 0,
                    color: 'var(--fg-muted)', cursor: 'pointer',
                    borderRadius: 'var(--r-1)',
                  }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </label>
            )}
            {mode === 'signup' && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)', cursor: 'pointer' }}>
                <Checkbox
                  checked={acceptedTerms}
                  onCheckedChange={(v) => setAcceptedTerms(v === true)}
                  className="mt-0.5"
                />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', lineHeight: 1.4 }}>
                  I agree to the{' '}
                  <Link to="/privacy" onClick={handleClose} className="text-primary hover:underline">Privacy Policy</Link>
                  {' '}and{' '}
                  <Link to="/terms" onClick={handleClose} className="text-primary hover:underline">Terms of Service</Link>
                </span>
              </label>
            )}
            {mode === 'forgot' && (
              <Notice variant="warning">
                <KeyRound className="h-3.5 w-3.5 shrink-0" style={{ marginTop: 2 }} aria-hidden="true" />
                <span>
                  Have your 24-word recovery code handy. Without it, encrypted data cannot be recovered.
                </span>
              </Notice>
            )}
            <button
              type="submit"
              disabled={submitting || (mode === 'signup' && !acceptedTerms)}
              className="q-btn q-btn--primary q-btn--md"
              style={{ width: '100%', opacity: submitting || (mode === 'signup' && !acceptedTerms) ? 0.5 : 1 }}
            >
              {mode === 'signin' ? <LogIn className="h-4 w-4" /> : mode === 'signup' ? <UserPlus className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Sign up' : 'Send reset link'}
            </button>
          </form>
          )}

          {mode !== 'confirm' && (
            <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginTop: 'var(--s-4)' }}>
              {mode === 'signin' ? (
                <>
                  <button type="button" onClick={() => setMode('forgot')} className="text-primary hover:underline">
                    Forgot password?
                  </button>
                  <span style={{ margin: '0 6px' }}>·</span>
                  <button type="button" onClick={() => setMode('signup')} className="text-primary hover:underline">
                    Sign up
                  </button>
                </>
              ) : mode === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <button type="button" onClick={() => setMode('signin')} className="text-primary hover:underline">
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Remember your password?{' '}
                  <button type="button" onClick={() => setMode('signin')} className="text-primary hover:underline">
                    Sign in
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
