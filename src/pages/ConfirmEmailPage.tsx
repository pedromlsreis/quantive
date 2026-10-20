import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModalActions } from '@/contexts/AuthModalContext';
import { Wordmark } from '@/components/layout/Brand';
import { supabase } from '@/integrations/supabase/client';
import { confirmEmailChange, pendingEmailChange } from '@/lib/emailChange';

type Problem = 'no_request' | 'expired' | 'changed' | 'email_taken' | 'rate_limited' | 'confirm_failed';

type View =
  | { kind: 'ready' }
  | { kind: 'confirming' }
  | { kind: 'done'; email: string }
  | { kind: 'problem'; problem: Problem };

const PROBLEM_COPY: Record<Problem, { title: string; body: string }> = {
  no_request: {
    title: "This link isn't for this account",
    body: "You may be signed in to a different account, or a newer request replaced this one. Sign in to the account you're changing, or start again in Settings.",
  },
  expired: {
    title: 'This link has expired',
    body: 'Links work for 24 hours. Start the change again in Settings.',
  },
  changed: {
    title: 'This link is out of date',
    body: "This account's email changed after the link was sent. Start again in Settings if you still want to change it.",
  },
  email_taken: {
    title: 'Another account uses that email',
    body: 'Start again in Settings with a different address.',
  },
  rate_limited: {
    title: 'Too many attempts',
    body: 'Wait a minute, then try again.',
  },
  confirm_failed: {
    title: "Couldn't confirm the change",
    body: 'Check your connection and try again.',
  },
};

const TOKEN_FRAGMENT = /^#t=([A-Za-z0-9_-]{43})$/;

function asProblem(code: string): Problem {
  return code in PROBLEM_COPY ? (code as Problem) : 'confirm_failed';
}

/**
 * /confirm-email#t=<token>: finishes an email change from the link sent to
 * the new address. It needs a session for the account being changed, so
 * whoever receives a mistyped address can't complete it. Spec:
 * docs/security/encryption.md §8.11.
 */
export default function ConfirmEmailPage() {
  const { user, loading, signOut } = useAuth();
  const { openAuth } = useAuthModalActions();
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => TOKEN_FRAGMENT.exec(location.hash)?.[1] ?? null);
  const [view, setView] = useState<View>({ kind: 'ready' });

  // Out of the address bar, so a reload or a copied URL doesn't carry it.
  useEffect(() => {
    if (location.hash) navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  const frame = (children: ReactNode) => (
    <div className="q-auth-page">
      <header className="q-auth-page-head">
        <Link to="/" aria-label="Quantive home" style={{ display: 'inline-flex' }}><Wordmark size={22} /></Link>
      </header>
      <main className="q-auth-page-main">
        <div className="q-auth-page-col">{children}</div>
      </main>
    </div>
  );

  if (view.kind === 'done') {
    return frame(
      <>
        <h1 className="q-h1">Your email is changed</h1>
        <p className="q-page-lede">
          {`You sign in with ${view.email} from now on. Your password stays the same, and we've emailed your old address to let you know.`}
        </p>
        <div className="q-auth-page-actions">
          <Link to="/settings" className="q-btn q-btn--primary q-btn--lg">Go to Settings</Link>
        </div>
      </>,
    );
  }

  if (!token) {
    return frame(
      <>
        <h1 className="q-h1">This link is incomplete</h1>
        <p className="q-page-lede">
          Open the link from the email again, exactly as you received it. Reloading this page removes part of it.
        </p>
        <div className="q-auth-page-actions">
          <Link to="/" className="q-btn q-btn--ghost q-btn--lg">Back to home</Link>
        </div>
      </>,
    );
  }

  if (!user) {
    if (loading) return frame(<p className="q-page-lede" role="status">Checking your link…</p>);
    return frame(
      <>
        <h1 className="q-h1">Confirm your new email</h1>
        <p className="q-page-lede">
          {"Sign in to the account you're changing, with the email you use now and your password. Keep this tab open while you do."}
        </p>
        <div className="q-auth-page-actions">
          <button type="button" onClick={() => openAuth('signin')} className="q-btn q-btn--primary q-btn--lg">
            Sign in
          </button>
        </div>
      </>,
    );
  }

  if (view.kind === 'problem') {
    const copy = PROBLEM_COPY[view.problem];
    const retry = view.problem === 'rate_limited' || view.problem === 'confirm_failed';
    return frame(
      <>
        <h1 className="q-h1">{copy.title}</h1>
        <p className="q-page-lede">{copy.body}</p>
        <div className="q-auth-page-actions">
          {retry && (
            <button type="button" onClick={() => setView({ kind: 'ready' })} className="q-btn q-btn--primary q-btn--lg">
              Try again
            </button>
          )}
          {view.problem === 'no_request' && (
            <button type="button" onClick={() => void signOut()} className="q-btn q-btn--primary q-btn--lg">
              Sign out
            </button>
          )}
          <Link to="/settings" className="q-btn q-btn--ghost q-btn--lg">Go to Settings</Link>
        </div>
      </>,
    );
  }

  const confirm = async () => {
    setView({ kind: 'confirming' });
    const result = await confirmEmailChange(supabase, token);
    setView('code' in result ? { kind: 'problem', problem: asProblem(result.code) } : { kind: 'done', email: result.email });
  };

  const target = pendingEmailChange(user)?.email;
  return frame(
    <>
      <h1 className="q-h1">Change your sign-in email?</h1>
      <p className="q-page-lede">
        {target ? `From ${user.email} to ${target}.` : `From ${user.email} to the address this link was sent to.`}
      </p>
      <p className="q-page-lede">
        {"You'll sign in with the new address from now on. Your password and your data stay as they are."}
      </p>
      <div className="q-auth-page-actions">
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={view.kind === 'confirming'}
          className="q-btn q-btn--primary q-btn--lg"
        >
          {view.kind === 'confirming' ? 'Confirming…' : 'Confirm change'}
        </button>
        <Link to="/settings" className="q-btn q-btn--ghost q-btn--lg">Not now</Link>
      </div>
    </>,
  );
}
