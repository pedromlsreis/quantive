import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { MoreHorizontal, X, KeyRound, LogOut, MessageSquarePlus, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useModalLayer } from '@/hooks/useModalLayer';
import { MOBILE_PRIMARY_ITEMS, MOBILE_MORE_SECTIONS, LEGAL_LINKS } from '@/lib/nav-config';
import { intentPrefetch } from '@/routes/appRoutes';

const ICON = 18;

/**
 * Bottom tab bar (≤768px): the four items flagged `mobilePrimary` plus a
 * "More" sheet holding the remaining pages, account actions and legal
 * links. It is the only mobile navigation; there is no drawer.
 */
export function MobileTabBar({ onFeedback }: { onFeedback: () => void }) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreRoutes = MOBILE_MORE_SECTIONS.flatMap((s) => s.items.map((i) => i.to));
  const moreIsActive = moreRoutes.includes(location.pathname);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  return (
    <>
      <nav className="q-mobile-tabbar" aria-label="Primary">
        {MOBILE_PRIMARY_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `q-mobile-tab${isActive ? ' is-active' : ''}`}
            {...intentPrefetch(item.to)}
          >
            <item.Icon size={ICON} strokeWidth={1.75} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`q-mobile-tab${moreIsActive ? ' is-active' : ''}`}
          aria-label="More navigation"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={ICON} strokeWidth={1.75} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <MoreSheet
          onClose={() => setMoreOpen(false)}
          onFeedback={() => { setMoreOpen(false); onFeedback(); }}
        />
      )}
    </>
  );
}

function MoreSheet({ onClose, onFeedback }: { onClose: () => void; onFeedback: () => void }) {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const keySession = useKeySession();
  const navigate = useNavigate();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  useModalLayer(true, onClose);

  const needsRecovery = !!user && keySession.hasRecovery === false;
  const go = (to: string) => { onClose(); navigate(to); };

  return createPortal(
    <div className="q-mobile-more-overlay" role="dialog" aria-modal="true" aria-labelledby="q-mobile-more-title">
      <div className="q-mobile-more-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={trapRef} className="q-mobile-more-sheet">
        <div className="q-mobile-more-head">
          <h2 className="q-mobile-more-title" id="q-mobile-more-title">More</h2>
          <button type="button" onClick={onClose} className="q-icon-btn" aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="q-mobile-more-nav">
          <nav aria-label="More navigation">
            {MOBILE_MORE_SECTIONS.map((section) => (
              <div key={section.id} className="q-mobile-more-section">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) => `q-nav-item${isActive ? ' is-active' : ''}`}
                  >
                    <item.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="q-mobile-more-section">
            {needsRecovery && (
              <button type="button" className="q-nav-item" onClick={() => go('/settings#recovery')}>
                <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Save your recovery code</span>
              </button>
            )}
            {isAdmin && (
              <button type="button" className="q-nav-item" onClick={() => go('/admin')}>
                <Shield size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Admin</span>
              </button>
            )}
            <button type="button" className="q-nav-item" onClick={onFeedback}>
              <MessageSquarePlus size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Send feedback</span>
            </button>
            {user && (
              <button type="button" className="q-nav-item" onClick={() => { onClose(); signOut(); }}>
                <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Sign out</span>
              </button>
            )}
          </div>

          <div className="q-mobile-more-legal">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={onClose}>{l.label}</Link>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
