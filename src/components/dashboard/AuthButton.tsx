import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, UserPlus, X, LogOut, User } from 'lucide-react';
import { toast } from 'sonner';

export function AuthButton() {
  const { user, signUp, signIn, signOut, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
        <button
          onClick={signOut}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setSubmitting(true);
    const fn = mode === 'signup' ? signUp : signIn;
    const { error } = await fn(email.trim(), password);
    setSubmitting(false);
    if (error) {
      toast.error(error);
    } else if (mode === 'signup') {
      toast.success('Check your email to confirm your account.');
      setOpen(false);
    } else {
      toast.success('Signed in successfully!');
      setOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setMode('signin'); }}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/20"
      >
        <User className="h-4 w-4" />
        <span className="hidden sm:inline">Sign in</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="mb-1 text-lg font-bold text-foreground">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              {mode === 'signin'
                ? 'Sign in to sync your data across devices.'
                : 'Create an account to save your portfolio data.'}
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
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                required
                minLength={6}
              />
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {mode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {submitting ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              {mode === 'signin' ? (
                <>
                  Don't have an account?{' '}
                  <button onClick={() => setMode('signup')} className="text-primary hover:underline">
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button onClick={() => setMode('signin')} className="text-primary hover:underline">
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
