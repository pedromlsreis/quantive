import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Wordmark } from '@/components/layout/Brand';
import { AuthModal } from '@/components/auth/AuthModal';
import { analytics } from '@/lib/analytics';

export function StickyNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const location = useLocation();

  const openSignIn = () => {
    setMobileOpen(false);
    analytics.landingCtaClicked({ cta: 'sign_in', location: 'nav' });
    setAuthOpen(true);
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isLanding = location.pathname === '/';

  const scrollToSection = (id: string) => {
    if (!isLanding) return;
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };

  const navLinks = [
    ...(isLanding
      ? [
          { label: 'Features', action: () => scrollToSection('features') },
          { label: 'Pricing', action: () => scrollToSection('pricing') },
        ]
      : [
          { label: 'Features', href: '/#features' },
          { label: 'Pricing', href: '/pricing' },
        ]),
    ...(!user ? [{ label: 'Demo', href: '/demo' }] : []),
    ...(user ? [{ label: 'Dashboard', href: '/dashboard' }] : []),
    ...(isAdmin ? [{ label: 'Admin', href: '/admin' }] : []),
  ];

  return (
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-border/50 bg-background/80 backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <Link to="/" aria-label="Quantive home" className="inline-flex items-center">
            <Wordmark size={22} />
          </Link>

          {/* Desktop */}
          <div className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              'action' in link && link.action ? (
                <button
                  key={link.label}
                  onClick={link.action}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </button>
              ) : (
                <Link
                  key={link.label}
                  to={'href' in link ? link.href! : '/'}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              )
            ))}
            {!user && (
              <button
                type="button"
                onClick={openSignIn}
                aria-label="Sign in to your account"
                className="rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Sign in
              </button>
            )}
            <Link
              to="/dashboard"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-105"
              onClick={() => {
                if (!user) analytics.landingCtaClicked({ cta: 'get_started', location: 'nav' });
              }}
            >
              {user ? 'Go to Dashboard' : 'Get Started Free'}
            </Link>
          </div>

          {/* Mobile: persistent Sign in + hamburger */}
          <div className="flex items-center gap-2 md:hidden">
            {!user && (
              <button
                type="button"
                onClick={openSignIn}
                aria-label="Sign in to your account"
                className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Sign in
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-menu"
              className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div id="mobile-nav-menu" className="border-b border-border/50 bg-background/95 backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-1 px-4 py-3">
              {navLinks.map((link) => (
                'action' in link && link.action ? (
                  <button
                    key={link.label}
                    type="button"
                    onClick={link.action}
                    className="rounded-md px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {link.label}
                  </button>
                ) : (
                  <Link
                    key={link.label}
                    to={'href' in link ? link.href! : '/'}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {link.label}
                  </Link>
                )
              ))}
              {!user && (
                <button
                  type="button"
                  onClick={openSignIn}
                  className="mt-2 rounded-md px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Sign in
                </button>
              )}
              <Link
                to="/dashboard"
                onClick={() => {
                  setMobileOpen(false);
                  if (!user) analytics.landingCtaClicked({ cta: 'get_started', location: 'nav' });
                }}
                className="mt-2 rounded-lg bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {user ? 'Go to Dashboard' : 'Get Started Free'}
              </Link>
            </div>
          </div>
        )}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultMode="signin" />
    </nav>
  );
}
