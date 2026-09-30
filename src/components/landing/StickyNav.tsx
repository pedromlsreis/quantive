import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModalActions } from '@/contexts/AuthModalContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Wordmark } from '@/components/layout/Brand';
import { analytics } from '@/lib/analytics';
import '@/styles/public.css';

type NavLink =
  | { label: string; section: string }
  | { label: string; href: string; onClick?: () => void };

export function StickyNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const { openAuth } = useAuthModalActions();
  const { isAdmin } = useUserRole();
  const location = useLocation();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const isLanding = location.pathname === '/';

  // A sentinel at the top of the page decides the hairline, instead of a
  // scroll listener firing on every frame.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMobileOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const openSignIn = () => {
    setMobileOpen(false);
    analytics.landingCtaClicked({ cta: 'sign_in', location: 'nav' });
    openAuth('signin');
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    setMobileOpen(false);
    // Closing the menu unmounts the focused item; hand focus to the section
    // heading so keyboard users continue from where they landed.
    const heading = el?.querySelector<HTMLElement>('h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  };

  const links: NavLink[] = [
    isLanding ? { label: 'Features', section: 'features' } : { label: 'Features', href: '/#features' },
    isLanding ? { label: 'Pricing', section: 'pricing' } : { label: 'Pricing', href: '/pricing' },
    { label: 'Security', href: '/security' },
    ...(!user
      ? [{ label: 'Demo', href: '/demo', onClick: () => analytics.landingCtaClicked({ cta: 'try_demo', location: 'nav' }) }]
      : [{ label: 'Dashboard', href: '/dashboard' }]),
    ...(isAdmin ? [{ label: 'Admin', href: '/admin' }] : []),
  ];

  const current = (href: string): 'page' | undefined => (location.pathname === href ? 'page' : undefined);

  const primary = (
    <Link
      to="/dashboard"
      className="pub-btn pub-btn--primary pub-btn--sm"
      onClick={() => {
        setMobileOpen(false);
        if (!user) analytics.landingCtaClicked({ cta: 'get_started', location: 'nav' });
      }}
    >
      {user ? 'Go to dashboard' : 'Get started free'}
    </Link>
  );

  return (
    <>
      <div ref={sentinelRef} className="pub-nav-sentinel" aria-hidden="true" />
      <nav className={`pub-nav ${scrolled || mobileOpen ? 'is-scrolled' : ''}`} aria-label="Main">
        <div className="pub-wrap pub-nav-row">
          <Link to="/" aria-label="Quantive home" className="inline-flex min-h-11 items-center">
            <Wordmark size={22} />
          </Link>

          <div className="pub-nav-links">
            {links.map((link) =>
              'section' in link ? (
                <button key={link.label} type="button" className="pub-nav-link" onClick={() => scrollToSection(link.section)}>
                  {link.label}
                </button>
              ) : (
                <Link
                  key={link.label}
                  to={link.href}
                  className="pub-nav-link"
                  aria-current={current(link.href)}
                  onClick={link.onClick}
                >
                  {link.label}
                </Link>
              ),
            )}
            {!user && (
              <button type="button" onClick={openSignIn} aria-label="Sign in to your account" className="pub-nav-link">
                Sign in
              </button>
            )}
            {primary}
          </div>

          <div className="pub-nav-mobile">
            {!user && (
              <button type="button" onClick={openSignIn} aria-label="Sign in to your account" className="pub-nav-icon-btn">
                Sign in
              </button>
            )}
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-menu"
              className="pub-nav-icon-btn -mr-2"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div id="mobile-nav-menu" className="pub-nav-menu">
            <div className="pub-wrap pub-nav-menu-list">
              {links.map((link) =>
                'section' in link ? (
                  <button key={link.label} type="button" className="pub-nav-menu-item" onClick={() => scrollToSection(link.section)}>
                    {link.label}
                  </button>
                ) : (
                  <Link
                    key={link.label}
                    to={link.href}
                    className="pub-nav-menu-item"
                    aria-current={current(link.href)}
                    onClick={() => {
                      link.onClick?.();
                      setMobileOpen(false);
                    }}
                  >
                    {link.label}
                  </Link>
                ),
              )}
              {primary}
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
