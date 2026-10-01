import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Settings, LogOut, Shield, MessageSquarePlus, ChevronsUpDown, KeyRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { AddMeasurementModal } from '@/components/dashboard/AddMeasurementModal';
import { FeedbackDialog } from '@/components/dashboard/FeedbackDialog';
import { useAuthModalActions } from '@/contexts/AuthModalContext';
import { analytics } from '@/lib/analytics';
import { EmailConfirmationBanner } from '@/components/auth/EmailConfirmationBanner';
import { Wordmark } from '@/components/layout/Brand';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import { Topbar } from '@/components/layout/Topbar';
import { PortfolioSwitcher } from '@/components/layout/PortfolioSwitcher';
import { ReadOnlyBanner } from '@/components/layout/ReadOnlyBanner';
import { READ_ONLY_MESSAGES, usePortfolio } from '@/contexts/PortfolioContext';
import { NAV_SECTIONS, MOBILE_PRIMARY_ITEMS, LEGAL_LINKS } from '@/lib/nav-config';
import { intentPrefetch, prefetchAppRoute } from '@/routes/appRoutes';
import { ADD_MEASUREMENT_EVENT } from '@/lib/appEvents';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** The signed-in user's display name, reset on account switch. */
function useDisplayName(): string | null {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  useEffect(() => {
    // Reset before fetch so an account switch can't flash the previous name.
    setDisplayName(null);
    if (!user) return;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setDisplayName(data.display_name);
      });
  }, [user]);
  return displayName;
}

function UserMenu({ onFeedback }: { onFeedback: () => void }) {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const keySession = useKeySession();
  const navigate = useNavigate();
  const displayName = useDisplayName();

  // Only warn once the key session has confirmed there is no recovery code;
  // null while loading, so the dot never flickers.
  const needsRecovery = keySession.hasRecovery === false;
  const source = displayName || user?.user_metadata?.full_name || user?.email || 'Q';
  const initial = source.trim().charAt(0).toUpperCase() || 'Q';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="q-side-user"
          aria-label={needsRecovery ? 'Account menu, recovery code not saved' : 'Account menu'}
          style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }}
        >
          <span className="q-avatar" style={{ position: 'relative' }} aria-hidden="true">
            {initial}
            {needsRecovery && (
              <span
                style={{
                  position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                  borderRadius: '50%', background: 'var(--warning)',
                  border: '2px solid var(--bg)', boxSizing: 'content-box',
                }}
              />
            )}
          </span>
          <span className="q-side-user-meta" style={{ flex: 1 }}>
            <span className="q-side-user-name">{displayName || 'Your account'}</span>
            {user?.email && <span className="q-side-user-mail">{user.email}</span>}
          </span>
          <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--fg-subtle)', flexShrink: 0 }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[208px]">
        {needsRecovery && (
          <>
            <DropdownMenuItem onSelect={() => navigate('/settings#recovery')} className="gap-2 min-h-9">
              <KeyRound size={15} strokeWidth={1.75} aria-hidden="true" />
              Save your recovery code
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => navigate('/settings')} className="gap-2 min-h-9">
          <Settings size={15} strokeWidth={1.75} aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onSelect={() => navigate('/admin')} className="gap-2 min-h-9">
            <Shield size={15} strokeWidth={1.75} aria-hidden="true" />
            Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onFeedback} className="gap-2 min-h-9">
          <MessageSquarePlus size={15} strokeWidth={1.75} aria-hidden="true" />
          Send feedback
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut()} className="gap-2 min-h-9">
          <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar({ onFeedback }: { onFeedback: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="q-sidebar">
      <div className="q-side-brand">
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
          aria-label="Quantive home"
        >
          <Wordmark size={22} />
        </button>
      </div>

      <PortfolioSwitcher placement="sidebar" />

      <nav className="q-nav" aria-label="Main navigation">
        {NAV_SECTIONS.map((section, sectionIdx) => (
          <div key={section.id} style={{ marginTop: sectionIdx > 0 ? 16 : 0 }}>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `q-nav-item${isActive ? ' is-active' : ''}`}
                {...intentPrefetch(item.to)}
              >
                <item.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="q-side-foot">
        {user ? (
          <UserMenu onFeedback={onFeedback} />
        ) : (
          <>
            <button type="button" onClick={onFeedback} className="q-nav-item">
              <MessageSquarePlus size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Send feedback</span>
            </button>
          </>
        )}
        {/* Legal pages stay one click away for guests, who can't open Settings. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', padding: '4px 12px 0' }}>
          {LEGAL_LINKS.map((l) => (
            <Link key={l.to} to={l.to} style={{ fontSize: 12, lineHeight: '20px', color: 'var(--fg-subtle)', textDecoration: 'none' }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [addOpen, setAddOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { openAuth } = useAuthModalActions();
  const { readOnlyReason } = usePortfolio();

  // Every in-app sign-in / sign-up entry is captured: a guest exploring the
  // demo who opens sign-up is the intent signal `demo_loaded` alone can't reach.
  const openAuthTracked = (mode: 'signin' | 'signup') => {
    analytics.appAuthOpened({ mode });
    openAuth(mode);
  };

  // Lets descendants (empty states, the dashboard's monthly prompt) open the
  // composer without threading a callback through the tree.
  // A read-only portfolio explains itself instead of opening a form it can't save.
  const openAdd = useCallback(() => {
    if (readOnlyReason) toast.error(READ_ONLY_MESSAGES[readOnlyReason]);
    else setAddOpen(true);
  }, [readOnlyReason]);
  useEffect(() => {
    window.addEventListener(ADD_MEASUREMENT_EVENT, openAdd);
    return () => window.removeEventListener(ADD_MEASUREMENT_EVENT, openAdd);
  }, [openAdd]);

  // Once the first page has rendered, fetch the tab-bar pages in idle time so
  // the common hops never wait on a chunk.
  useEffect(() => {
    const warm = () => MOBILE_PRIMARY_ITEMS.forEach((i) => prefetchAppRoute(i.to));
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(warm);
    else window.setTimeout(warm, 1500);
  }, []);

  const openFeedback = () => setFeedbackOpen(true);

  return (
    <div className="q-app">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar onFeedback={openFeedback} />

      <div className="q-main">
        <EmailConfirmationBanner />
        <Topbar
          onAdd={openAdd}
          onSignIn={() => openAuthTracked('signin')}
          onSignUp={() => openAuthTracked('signup')}
          onFeedback={openFeedback}
        />
        <main id="main-content" className="q-content">
          <ReadOnlyBanner />
          {children}
        </main>
        <MobileTabBar onFeedback={openFeedback} />
      </div>

      <AddMeasurementModal open={addOpen} onOpenChange={setAddOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  );
}
