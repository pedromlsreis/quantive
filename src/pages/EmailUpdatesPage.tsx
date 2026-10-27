import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Wordmark } from '@/components/layout/Brand';
import { parseEmailListFragment, submitEmailListAction, type EmailListResult } from '@/lib/emailList';

type Problem = Exclude<EmailListResult, 'ok'>;

const PROBLEM_COPY: Record<Problem, { title: string; body: string }> = {
  invalid_link: {
    title: 'This link no longer works',
    body: "It may have expired, or a newer email replaced it. If you haven't confirmed yet, leave your email again for a fresh link.",
  },
  expired: {
    title: 'This link has expired',
    body: 'Links work for 7 days. Leave your email again to get a new one.',
  },
  rate_limited: {
    title: 'Too many attempts',
    body: 'Wait a minute, then try again.',
  },
  failed: {
    title: 'Something went wrong',
    body: 'Check your connection and try again.',
  },
};

const ACTION_COPY = {
  confirm: {
    title: 'Confirm your email',
    body: 'Confirm to get occasional updates about Quantive. Nothing else arrives until you do.',
    button: 'Confirm my email',
    working: 'Confirming…',
    doneTitle: "You're on the list",
    doneBody: "I'll write when there's something worth sharing. Every update has a link to unsubscribe.",
  },
  unsubscribe: {
    title: 'Unsubscribe from updates',
    body: 'This deletes your address from the list, and no more updates will arrive.',
    button: 'Unsubscribe',
    working: 'Unsubscribing…',
    doneTitle: "You're unsubscribed",
    doneBody: 'Your address is deleted from the list. No more updates will arrive.',
  },
} as const;

// The signup form sits in the landing page's closing section.
const SIGNUP_FORM = '/#lp-close-h2';

type View = { kind: 'ready' } | { kind: 'working' } | { kind: 'done' } | { kind: 'problem'; problem: Problem };

/**
 * /email-updates#confirm=<token> and #unsubscribe=<token>: the links in the
 * "Keep me posted" confirmation email and in every update. It acts only on a
 * click, so a mail scanner that opens the link can't confirm or unsubscribe.
 */
export default function EmailUpdatesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [link] = useState(() => parseEmailListFragment(location.hash));
  const [view, setView] = useState<View>({ kind: 'ready' });
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Out of the address bar, so a reload or a copied URL doesn't carry it.
  useEffect(() => {
    if (location.hash) navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  // The clicked button disappears with the old view, so focus moves to the
  // new heading and keyboard and screen-reader users hear the outcome.
  useEffect(() => {
    if (view.kind === 'done' || view.kind === 'problem') headingRef.current?.focus();
  }, [view.kind]);

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

  if (!link) {
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

  const copy = ACTION_COPY[link.action];

  if (view.kind === 'done') {
    return frame(
      <>
        <h1 className="q-h1" ref={headingRef} tabIndex={-1}>{copy.doneTitle}</h1>
        <p className="q-page-lede">{copy.doneBody}</p>
        <div className="q-auth-page-actions">
          <Link to="/changelog" className="q-btn q-btn--primary q-btn--lg">See what has shipped</Link>
          <Link to="/" className="q-btn q-btn--ghost q-btn--lg">Back to home</Link>
        </div>
      </>,
    );
  }

  if (view.kind === 'problem') {
    const problem = PROBLEM_COPY[view.problem];
    const retry = view.problem === 'rate_limited' || view.problem === 'failed';
    return frame(
      <>
        <h1 className="q-h1" ref={headingRef} tabIndex={-1}>{problem.title}</h1>
        <p className="q-page-lede">{problem.body}</p>
        <div className="q-auth-page-actions">
          {retry ? (
            <button type="button" onClick={() => setView({ kind: 'ready' })} className="q-btn q-btn--primary q-btn--lg">
              Try again
            </button>
          ) : (
            <Link to={SIGNUP_FORM} className="q-btn q-btn--primary q-btn--lg">Leave your email again</Link>
          )}
          <Link to="/" className="q-btn q-btn--ghost q-btn--lg">Back to home</Link>
        </div>
      </>,
    );
  }

  const act = async () => {
    setView({ kind: 'working' });
    const result = await submitEmailListAction(link.action, link.token);
    setView(result === 'ok' ? { kind: 'done' } : { kind: 'problem', problem: result });
  };
  const working = view.kind === 'working';

  return frame(
    <>
      <h1 className="q-h1">{copy.title}</h1>
      <p className="q-page-lede">{copy.body}</p>
      <div className="q-auth-page-actions">
        <button type="button" onClick={() => void act()} disabled={working} aria-busy={working} className="q-btn q-btn--primary q-btn--lg">
          {working ? copy.working : copy.button}
        </button>
      </div>
    </>,
  );
}
