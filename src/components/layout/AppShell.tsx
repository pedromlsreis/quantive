import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Settings,
  LogOut, Shield, MessageSquarePlus, ChevronUp, LogIn, User, KeyRound,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { AddMeasurementModal } from '@/components/dashboard/AddMeasurementModal';
import { FeedbackButton } from '@/components/dashboard/FeedbackButton';
import { useAuthModalActions } from '@/contexts/AuthModalContext';
import { EmailConfirmationBanner } from '@/components/auth/EmailConfirmationBanner';
import { Wordmark } from '@/components/layout/Brand';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import { Topbar } from '@/components/layout/Topbar';
import { Footer } from '@/components/Footer';
import { NAV_SECTIONS } from '@/lib/nav-config';

function UserMenu({
  displayName,
  email,
  initial,
  isAdmin,
  needsRecovery,
  onNavigate,
  onSignOut,
}: {
  displayName: string | null;
  email: string | undefined;
  initial: string;
  isAdmin: boolean;
  /** True only when keySession has loaded and confirmed no recovery code exists. Null/undefined during load → no warning. */
  needsRecovery: boolean;
  onNavigate: (to: string) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="q-side-user"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          needsRecovery
            ? `${displayName || 'You'} — account menu (recovery code not set up)`
            : `${displayName || 'You'} — account menu`
        }
        style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
      >
        <div className="q-avatar" style={{ position: 'relative' }}>
          {initial}
          {needsRecovery && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--warning)',
                border: '2px solid var(--bg)',
                boxSizing: 'content-box',
              }}
            />
          )}
        </div>
        <div className="q-side-user-meta" style={{ flex: 1 }}>
          <span className="q-side-user-name">{displayName || 'You'}</span>
          {email && <span className="q-side-user-mail">{email}</span>}
        </div>
        <ChevronUp
          size={14}
          style={{
            color: 'var(--fg-faint)',
            transform: open ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: `transform var(--d-fast) var(--ease-out)`,
            flexShrink: 0,
          }}
        />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--bg-elev-1, var(--bg))',
            border: '1px solid var(--border-raw)',
            borderRadius: 'var(--r-3)',
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            zIndex: 50,
            animation: `q-fade-in var(--d-fast) var(--ease-out)`,
          }}
        >
          {needsRecovery && (
            <>
              <button
                role="menuitem"
                onClick={() => { setOpen(false); onNavigate('/settings#recovery'); }}
                className="q-nav-item"
                style={{ color: 'var(--warning)' }}
              >
                <KeyRound size={15} />
                <span>Set up recovery code</span>
              </button>
              <div style={{ height: 1, background: 'var(--border-raw)', margin: '4px 0' }} />
            </>
          )}
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onNavigate('/settings'); }}
            className="q-nav-item"
          >
            <Settings size={15} />
            <span>Settings</span>
          </button>
          {isAdmin && (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onNavigate('/admin'); }}
              className="q-nav-item"
            >
              <Shield size={15} />
              <span>Admin</span>
            </button>
          )}
          <div style={{ height: 1, background: 'var(--border-raw)', margin: '4px 0' }} />
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onSignOut(); }}
            className="q-nav-item"
            style={{ color: 'var(--negative, var(--fg-muted))' }}
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

function SignedOutMenu({
  onSignIn,
  onFeedback,
}: {
  onSignIn: () => void;
  onFeedback: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        onClick={onFeedback}
        className="q-nav-item"
      >
        <MessageSquarePlus size={15} />
        <span>Suggest a feature</span>
      </button>
      <button
        type="button"
        onClick={onSignIn}
        className="q-side-user"
        style={{
          width: '100%', border: 0, background: 'transparent',
          textAlign: 'left', cursor: 'pointer',
        }}
      >
        <div className="q-avatar" aria-hidden="true">
          <User size={14} />
        </div>
        <div className="q-side-user-meta" style={{ flex: 1 }}>
          <span className="q-side-user-name">Sign in to sync</span>
        </div>
        <LogIn size={14} style={{ color: 'var(--fg-faint)', flexShrink: 0 }} />
      </button>
    </div>
  );
}

function Sidebar({
  isOpen,
  onClose,
  onFeedback,
  onSignIn,
}: {
  isOpen: boolean;
  onClose: () => void;
  onFeedback: () => void;
  onSignIn: () => void;
}) {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const keySession = useKeySession();
  const navigate = useNavigate();

  // Only treat as "needs recovery" when keySession has loaded and confirmed
  // it's missing. Null/undefined during load → no warning flicker.
  const needsRecovery = keySession.hasRecovery === false;

  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    // Reset before fetch so a sign-out or account-switch can't flash the
    // previous user's name while the new fetch is in flight.
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

  const initial = (() => {
    const source = displayName || user?.user_metadata?.full_name || user?.email || 'Q';
    return source.trim().charAt(0).toUpperCase() || 'Q';
  })();

  const handleSignOut = () => {
    signOut();
  };

  return (
    <>
      <div
        className={`q-sidebar-overlay${isOpen ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`q-sidebar${isOpen ? ' is-open' : ''}`}>
        {/* Brand */}
        <div className="q-side-brand">
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
            aria-label="Quantive home"
          >
            <Wordmark size={22} />
          </button>
        </div>

        {/* Primary nav */}
        <nav className="q-nav" aria-label="Main navigation">
          {NAV_SECTIONS.map((section, sectionIdx) => (
            <div key={section.id}>
              {sectionIdx > 0 && <div style={{ height: 8 }} />}
              <div className="q-nav-section-title">{section.title}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `q-nav-item${isActive ? ' is-active' : ''}`}
                  onClick={onClose}
                >
                  <item.Icon size={15} />
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <span className="q-nav-shortcut" aria-hidden="true">{item.shortcut}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="q-side-foot">
          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                type="button"
                onClick={() => { onClose(); onFeedback(); }}
                className="q-nav-item"
              >
                <MessageSquarePlus size={15} />
                <span>Suggest a feature</span>
              </button>
              <UserMenu
                displayName={displayName}
                email={user.email}
                initial={initial}
                isAdmin={isAdmin}
                needsRecovery={needsRecovery}
                onNavigate={(to) => { onClose(); navigate(to); }}
                onSignOut={handleSignOut}
              />
            </div>
          ) : (
            <SignedOutMenu
              onSignIn={onSignIn}
              onFeedback={() => { onClose(); onFeedback(); }}
            />
          )}
        </div>
      </aside>
    </>
  );
}

export function AppShell({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [feedbackTrigger, setFeedbackTrigger] = useState(0);
  const { openAuth } = useAuthModalActions();

  return (
    <div className="q-app">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onFeedback={() => setFeedbackTrigger(n => n + 1)}
        onSignIn={() => { setSidebarOpen(false); openAuth('signin'); }}
      />

      <div className="q-main">
        <EmailConfirmationBanner />
        <Topbar
          pathname={pathname}
          onMenuClick={() => setSidebarOpen(true)}
          onAdd={() => setAddOpen(true)}
          onSignIn={() => openAuth('signin')}
          onSignUp={() => openAuth('signup')}
        />
        <main id="main-content" className="q-content q-screen">
          {children}
        </main>
        <Footer />
        <MobileTabBar />
      </div>

      <AddMeasurementModal open={addOpen} onOpenChange={setAddOpen} />
      <FeedbackLauncher trigger={feedbackTrigger} />
    </div>
  );
}

/**
 * Renders the FeedbackButton off-screen and opens its modal whenever the
 * `trigger` value changes. This lets the sidebar user menu reuse the existing
 * FeedbackButton modal without duplicating its logic.
 */
function FeedbackLauncher({ trigger }: { trigger: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (trigger === 0) return;
    const btn = ref.current?.querySelector('button');
    btn?.click();
  }, [trigger]);
  return (
    <div ref={ref} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
      <FeedbackButton />
    </div>
  );
}
