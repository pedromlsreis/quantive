import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  MOBILE_PRIMARY_ITEMS,
  MOBILE_MORE_SECTIONS,
} from '@/lib/nav-config';
import { modalOverlay, softSpring } from '@/lib/motion';

const MOBILE_ICON_SIZE = 18;

/**
 * Bottom tab bar. Renders the items flagged `mobilePrimary` in nav-config
 * (currently 4) plus a fifth "More" tab that opens a bottom sheet listing
 * the remaining sections (Plan, Account). Keeps the bar within the 5-item
 * Material Design `bottom-nav-limit` while preserving full reach to every
 * page available in the desktop sidebar.
 */
export function MobileTabBar() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreRoutes = MOBILE_MORE_SECTIONS.flatMap((s) => s.items.map((i) => i.to));
  const moreIsActive = moreRoutes.includes(location.pathname);

  // Close the sheet whenever the route changes (e.g. after picking an item
  // or any external navigation). NavLink's own click handler covers the
  // common case; this catches edge cases like programmatic navigation.
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  return (
    <>
      <nav className="q-mobile-tabbar" aria-label="Primary">
        {MOBILE_PRIMARY_ITEMS.map((item) => {
          const label = item.mobileLabel ?? item.label;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `q-mobile-tab${isActive ? ' is-active' : ''}`}
              aria-label={item.label}
            >
              <item.Icon size={MOBILE_ICON_SIZE} />
              <span>{label}</span>
            </NavLink>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`q-mobile-tab${moreIsActive ? ' is-active' : ''}`}
          aria-label="More navigation"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={MOBILE_ICON_SIZE} />
          <span>More</span>
        </button>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  // Escape closes the sheet. Bound when open so we don't leak listeners.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="q-mobile-more-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="q-mobile-more-title"
          variants={modalOverlay}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div
            className="q-mobile-more-backdrop"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            ref={trapRef}
            className="q-mobile-more-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0, transition: softSpring }}
            exit={{ y: '100%', transition: { duration: 0.18, ease: 'easeIn' } }}
          >
            <div className="q-mobile-more-grabber" aria-hidden="true" />

            <div className="q-mobile-more-head">
              <div className="q-mobile-more-title" id="q-mobile-more-title">More</div>
              <button
                type="button"
                onClick={onClose}
                className="q-icon-btn"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <nav className="q-mobile-more-nav" aria-label="More navigation">
              {MOBILE_MORE_SECTIONS.map((section) => (
                <div key={section.id} className="q-mobile-more-section">
                  <div className="q-nav-section-title">{section.title}</div>
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `q-nav-item${isActive ? ' is-active' : ''}`
                      }
                    >
                      <item.Icon size={16} />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
