import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { supabase } from '@/integrations/supabase/client';
import { LogIn, UserPlus, X, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
}

export function AuthModal({ open, onClose, defaultMode = 'signup' }: AuthModalProps) {
  const { signUp, signIn, resetPassword } = useAuth();
  const keySession = useKeySession();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

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
    onClose();
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);

    if (mode === 'forgot') {
      const { error } = await resetPassword(email.trim());
      setSubmitting(false);
      if (error) {
        toast.error(error);
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
      toast.error(error);
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
      toast.success(
        session?.user
          ? 'Account created and unlocked.'
          : 'Check your email to confirm your account.',
      );
    } else {
      toast.success('Signed in successfully!');
    }
    handleClose();
  };

  return createPortal(
    <div
      className="q-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div ref={trapRef} className="q-modal">
        <div className="q-modal-head">
          <div>
            <div className="q-modal-title" id="auth-modal-title">
              {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset password'}
            </div>
            <div className="q-modal-sub">
              {mode === 'signin'
                ? 'Sign in to access your dashboard.'
                : mode === 'signup'
                ? 'Sign up to save and sync your portfolio data.'
                : "Enter your email and we'll send you a reset link."}
            </div>
          </div>
          <button type="button" onClick={handleClose} className="q-icon-btn" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="q-modal-body">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <label className="q-input">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </label>
            {mode !== 'forgot' && (
              <label className="q-input">
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
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
        </div>
      </div>
    </div>,
    document.body
  );
}
