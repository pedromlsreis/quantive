import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModalActions } from '@/contexts/AuthModalContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Wordmark } from '@/components/layout/Brand';
import { supabase } from '@/integrations/supabase/client';
import { analytics } from '@/lib/analytics';
import { clearInviteSecret, peekInviteSecret } from '@/lib/inviteFragment';
import {
  INVITE_LIFETIME_DAYS,
  InviteLinkMismatchError,
  acceptInvite,
  getInvite,
  type InviteLookup,
  type InviteProblem,
} from '@/lib/portfolioSharing';

type ReadyInvite = Extract<InviteLookup, { status: 'ok' }>;
type Problem = InviteProblem | 'mismatch' | 'error';

type View =
  | { kind: 'checking' }
  | { kind: 'ready'; invite: ReadyInvite }
  | { kind: 'joining'; invite: ReadyInvite }
  | { kind: 'problem'; problem: Problem };

const PROBLEM_COPY: Record<Problem, { title: string; body: string }> = {
  not_found: {
    title: "This invite doesn't exist any more",
    body: 'It may have been cancelled, or replaced by a newer invite. Ask for a new link.',
  },
  own_invite: {
    title: 'This is your own invite',
    body: 'Send the link to the person you invited. They open it while signed in to their own account.',
  },
  wrong_account: {
    title: 'This invite is for a different email address',
    body: 'Sign out, then sign in or create an account with the address the invite was sent to.',
  },
  already_member: {
    title: "You're already in this portfolio",
    body: 'It is in your portfolio list.',
  },
  unconfirmed: {
    title: 'Confirm your email address first',
    body: "Use the confirmation link we emailed you, then come back to this tab and check again. If you've closed this tab, open the invite link again.",
  },
  used: {
    title: 'This invite has been used',
    body: 'Each invite works once. Ask for a new link if you need one.',
  },
  expired: {
    title: 'This invite has expired',
    body: `Invites last ${INVITE_LIFETIME_DAYS} days, and stop working when the portfolio is re-encrypted. Ask for a new link.`,
  },
  unavailable: {
    title: "This invite can't be used right now",
    body: "The Family plan it belongs to isn't active. Ask the person who invited you to check their plan.",
  },
  seat_taken: {
    title: 'This Family plan already has a partner',
    body: 'A Family plan is shared by two people. Ask the person who invited you to check who they share with.',
  },
  already_partnered: {
    title: 'You already share a Family plan',
    body: 'You can be the partner on one Family plan at a time. Leave the portfolios shared with you in Settings first.',
  },
  mismatch: {
    title: "This invite link doesn't match its invite",
    body: 'Part of the link may be missing. Open it again exactly as you received it, or ask for a new one.',
  },
  error: {
    title: "Couldn't check the invite",
    body: 'Check your connection and try again.',
  },
};

/**
 * /join/<inviteId>#k=<secret>: a partner joins a shared portfolio. The
 * secret was taken from the URL before the app started (inviteFragment.ts);
 * signing in and unlocking happen here, so it stays in memory throughout.
 * Spec: docs/security/encryption.md §8.8.
 */
export default function JoinPage() {
  const { inviteId = '' } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const keySession = useKeySession();
  const { openAuth } = useAuthModalActions();
  const { openJoinedPortfolio } = usePortfolio();
  const [hasSecret] = useState(() => peekInviteSecret() !== null);
  const [view, setView] = useState<View>({ kind: 'checking' });
  const unlocked = keySession.status === 'unlocked-encrypted';

  const check = useCallback(async () => {
    setView({ kind: 'checking' });
    try {
      const invite = await getInvite(supabase, inviteId);
      setView(invite.status === 'ok' ? { kind: 'ready', invite } : { kind: 'problem', problem: invite.status });
    } catch (e) {
      console.error('[join] invite lookup failed:', e);
      setView({ kind: 'problem', problem: 'error' });
    }
  }, [inviteId]);

  const userId = user?.id;
  useEffect(() => {
    if (hasSecret && userId && unlocked) void check();
  }, [hasSecret, userId, unlocked, check]);

  const openPortfolio = async (portfolioId: string) => {
    if (await openJoinedPortfolio(portfolioId)) navigate('/dashboard');
    else navigate('/settings#portfolios');
  };

  const join = async (invite: ReadyInvite) => {
    const secret = peekInviteSecret();
    const dataKey = keySession.getDataKey();
    if (!user || !secret || !dataKey) return;
    setView({ kind: 'joining', invite });
    try {
      const status = await acceptInvite(supabase, { inviteId, invite, inviteSecret: secret, dataKey, userId: user.id });
      if (status !== 'ok') {
        setView({ kind: 'problem', problem: status });
        return;
      }
      clearInviteSecret();
      analytics.inviteAccepted();
      toast.success('You joined the portfolio.');
      await openPortfolio(invite.portfolioId);
    } catch (e) {
      if (!(e instanceof InviteLinkMismatchError)) console.error('[join] accept failed:', e);
      setView({ kind: 'problem', problem: e instanceof InviteLinkMismatchError ? 'mismatch' : 'error' });
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

  if (!hasSecret) {
    return frame(
      <>
        <h1 className="q-h1">This invite link is incomplete</h1>
        <p className="q-page-lede">
          {"The part of the link that unlocks the portfolio is missing. Open the link again exactly as you received it. Reloading this page removes that part, so it can't be reused from here."}
        </p>
        <div className="q-auth-page-actions">
          <Link to="/" className="q-btn q-btn--ghost q-btn--lg">Back to home</Link>
        </div>
      </>,
    );
  }

  if (!user) {
    if (authLoading) return frame(<p className="q-page-lede" role="status">Checking your invite…</p>);
    return frame(
      <>
        <h1 className="q-h1">{"You've been invited to a shared portfolio"}</h1>
        <p className="q-page-lede">
          Sign in, or create a free account, with the email address the invite was sent to. Keep this tab open while you do.
        </p>
        <p className="q-page-lede">
          {"If you create an account, confirm your email address first, then come back to this tab."}
        </p>
        <div className="q-auth-page-actions">
          <button type="button" onClick={() => openAuth('signin')} className="q-btn q-btn--primary q-btn--lg">
            Sign in
          </button>
          <button type="button" onClick={() => openAuth('signup')} className="q-btn q-btn--ghost q-btn--lg">
            Create an account
          </button>
        </div>
      </>,
    );
  }

  // Locked: RequireUnlock covers the page until the password is entered.
  if (!unlocked || view.kind === 'checking') {
    return frame(<p className="q-page-lede" role="status">Checking your invite…</p>);
  }

  if (view.kind === 'problem') {
    const copy = PROBLEM_COPY[view.problem];
    return frame(
      <>
        <h1 className="q-h1">{copy.title}</h1>
        <p className="q-page-lede">{copy.body}</p>
        <div className="q-auth-page-actions">
          {view.problem === 'unconfirmed' || view.problem === 'error' ? (
            <button type="button" onClick={() => void check()} className="q-btn q-btn--primary q-btn--lg">
              Check again
            </button>
          ) : null}
          {view.problem === 'wrong_account' ? (
            <button type="button" onClick={() => void signOut()} className="q-btn q-btn--primary q-btn--lg">
              Sign out
            </button>
          ) : null}
          <Link to="/dashboard" className="q-btn q-btn--ghost q-btn--lg">Go to your dashboard</Link>
        </div>
      </>,
    );
  }

  const { invite } = view;
  return frame(
    <>
      <h1 className="q-h1">Join a shared portfolio</h1>
      <p className="q-page-lede">
        {invite.invitedBy ? `${invite.invitedBy} invited you` : "You've been invited"} to share a portfolio on Quantive.
        {' '}You will both be able to see and edit its entries and goals.
      </p>
      <p className="q-page-lede">
        {"Your own portfolio stays private: neither of you can see the other's. You can leave the shared one at any time in Settings."}
      </p>
      <div className="q-auth-page-actions">
        <button
          type="button"
          onClick={() => void join(invite)}
          disabled={view.kind === 'joining'}
          className="q-btn q-btn--primary q-btn--lg"
        >
          {view.kind === 'joining' ? 'Joining…' : 'Join portfolio'}
        </button>
        <Link to="/dashboard" className="q-btn q-btn--ghost q-btn--lg">Not now</Link>
      </div>
    </>,
  );
}
