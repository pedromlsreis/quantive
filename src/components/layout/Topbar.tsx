import { useNavigate } from 'react-router-dom';
import { Plus, Menu, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { SyncIndicator } from '@/components/dashboard/SyncIndicator';
import { Monogram } from '@/components/layout/Brand';
import { GlobalSearch } from '@/components/layout/GlobalSearch';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':    'Overview',
  '/allocations':  'Allocations',
  '/forecast':     'Forecast',
  '/goals':        'Goals',
  '/sources':      'Sources',
  '/settings':     'Settings',
  '/security':     'Security',
};

export function Topbar({
  pathname,
  onMenuClick,
  onAdd,
  onSignIn,
  onSignUp,
}: {
  pathname: string;
  onMenuClick: () => void;
  onAdd: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isMockData } = usePortfolio();
  const { privacyMode, setPrivacyMode } = usePreferences();
  const title = PAGE_TITLES[pathname] ?? 'Overview';

  return (
    <div className="q-topbar">
      {/* Mobile hamburger — hidden on desktop via CSS */}
      <button
        type="button"
        className="q-topbar-menu-btn"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu size={16} />
      </button>

      {/* Quantive monogram */}
      <button
        onClick={() => navigate('/')}
        className="q-topbar-brand"
        aria-label="Quantive home"
        style={{
          background: 'none', border: 0, padding: 0, cursor: 'pointer',
          color: 'var(--fg-faint)',
        }}
      >
        <Monogram size={20} />
      </button>

      {/* Breadcrumb — fixed width so the search bar doesn't shift between pages */}
      <div className="q-topbar-crumbs" style={{ width: 180, flexShrink: 0 }}>
        <span>Personal</span>
        <span className="q-topbar-crumb-sep">›</span>
        <span className="q-topbar-crumb-active">{title}</span>
      </div>

      {/* Search — fills remaining space so actions land flush-right */}
      <GlobalSearch onAdd={onAdd} />

      {/* Right-aligned actions */}
      <div className="q-topbar-actions">
        <SyncIndicator />

        <button
          type="button"
          onClick={() => setPrivacyMode(!privacyMode)}
          className="q-icon-btn q-topbar-privacy"
          aria-label={privacyMode ? 'Show monetary values' : 'Hide monetary values'}
          aria-pressed={privacyMode}
          title={privacyMode ? 'Show values' : 'Hide values'}
        >
          {privacyMode ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>

        {/* Mobile-only sign-in button — shown only when signed out */}
        {!user && (
          <button
            type="button"
            className="q-btn q-btn--secondary q-btn--sm q-topbar-signin"
            onClick={onSignIn}
            aria-label="Sign in"
          >
            <LogIn size={14} />
            <span className="q-topbar-signin-label">Sign in</span>
          </button>
        )}

        <button
          className="q-btn q-btn--primary q-btn--sm q-topbar-add"
          onClick={isMockData ? onSignUp : onAdd}
          aria-label={isMockData ? 'Sign up to track your own portfolio' : 'Add measurement'}
          title={isMockData ? 'Sign up to track your own portfolio' : undefined}
        >
          {isMockData ? <UserPlus size={14} /> : <Plus size={14} />}
          <span className="q-topbar-add-label">
            {isMockData ? 'Sign up to track yours' : 'Add measurement'}
          </span>
        </button>
      </div>
    </div>
  );
}
