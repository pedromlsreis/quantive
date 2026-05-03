import { useState } from 'react';
import { createPortal } from 'react-dom';
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

  // Reset form when modal opens
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

    // Auth succeeded. If a session exists (sign-in, or sign-up with auto-
    // confirm), unlock the key session immediately while the password is
    // still in scope. With email-confirm flows, signUp returns no session
    // here; the user will unlock on first sign-in after clicking the link.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { error: unlockErr } = await keySession.unlock(session.user.id, password);
      if (unlockErr) {
        // Auth credentials worked but the key wrap failed to open. This
        // means the wrap is corrupted or the password truly doesn't match
        // the wrap (e.g., a server-side reset). Surface and bail.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="mb-1 text-lg font-bold text-foreground">
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset password'}
        </h2>
        <p className="mb-5 text-sm text-muted-foreground">
          {mode === 'signin'
            ? 'Sign in to access your dashboard.'
            : mode === 'signup'
            ? 'Sign up to save and sync your portfolio data.'
            : "Enter your email and we'll send you a reset link."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
            required
          />
          {mode !== 'forgot' && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
              required
              minLength={6}
            />
          )}
          {mode === 'signup' && (
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={acceptedTerms}
                onCheckedChange={(v) => setAcceptedTerms(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs text-muted-foreground leading-snug">
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {mode === 'signin' ? <LogIn className="h-4 w-4" /> : mode === 'signup' ? <UserPlus className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            {submitting ? 'Please wait...' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Sign up' : 'Send reset link'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {mode === 'signin' ? (
            <>
              <button onClick={() => setMode('forgot')} className="text-primary hover:underline">
                Forgot password?
              </button>
              <span className="mx-1.5">·</span>
              <button onClick={() => setMode('signup')} className="text-primary hover:underline">
                Sign up
              </button>
            </>
          ) : mode === 'signup' ? (
            <>
              Already have an account?{' '}
              <button onClick={() => setMode('signin')} className="text-primary hover:underline">
                Sign in
              </button>
            </>
          ) : (
            <>
              Remember your password?{' '}
              <button onClick={() => setMode('signin')} className="text-primary hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>,
    document.body
  );
}
