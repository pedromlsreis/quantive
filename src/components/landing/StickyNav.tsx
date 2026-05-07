import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileSpreadsheet, Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';

export function StickyNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const location = useLocation();

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
    { label: 'Demo', href: '/demo' },
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
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
            </div>
            <span className="text-lg font-bold text-foreground">Quantive</span>
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
            <Link
              to="/dashboard"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-105"
            >
              {user ? 'Go to Dashboard' : 'Get Started Free'}
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-foreground md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="border-b border-border/50 bg-background/95 backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-3 px-6 py-4">
              {navLinks.map((link) => (
                'action' in link && link.action ? (
                  <button
                    key={link.label}
                    onClick={link.action}
                    className="text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </button>
                ) : (
                  <Link
                    key={link.label}
                    to={'href' in link ? link.href! : '/'}
                    onClick={() => setMobileOpen(false)}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                )
              ))}
              <Link
                to="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="mt-2 rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground transition-transform hover:scale-105"
              >
                {user ? 'Go to Dashboard' : 'Get Started Free'}
              </Link>
            </div>
          </div>
        )}
    </nav>
  );
}
