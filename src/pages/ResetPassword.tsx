import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { urlLooksLikeRecovery } from '@/lib/recoveryUrl';

type LinkState = 'checking' | 'invalid' | 'verifying' | 'ready';

function submitButtonLabel(submitting: boolean, linkState: LinkState): string {
  if (submitting) return 'Updating...';
  if (linkState !== 'ready') return 'Verifying link...';
  return 'Update password';
}

const ResetPassword = () => {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Single state machine: 'checking' (waiting for SDK) → 'verifying' (URL
  // looks like recovery, awaiting session) → 'ready' (session in hand);
  // 'invalid' if the 1.5s grace timer expires without progress.
  const [linkState, setLinkState] = useState<LinkState>('checking');

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
    // Defense-in-depth: the button is disabled unless 'ready', but a token
    // could be revoked between enable and click — re-check before mutating.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error('Reset session not ready. Please reopen the email link.');
      return;
    }
    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success('Password updated successfully!');
      navigate('/');
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
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mb-1 text-lg font-bold text-foreground">Set new password</h1>
        <p className="mb-5 text-sm text-muted-foreground">Enter your new password below.</p>

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
          <button
            type="submit"
            disabled={submitting || linkState !== 'ready'}
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
