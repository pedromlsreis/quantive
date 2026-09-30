import { useNavigate } from 'react-router-dom';
import { Plus, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { SyncIndicator } from '@/components/dashboard/SyncIndicator';
import { Monogram } from '@/components/layout/Brand';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { PortfolioSwitcher } from '@/components/layout/PortfolioSwitcher';
import { analytics } from '@/lib/analytics';

export function Topbar({
  onAdd,
  onSignIn,
  onSignUp,
  onFeedback,
}: {
  onAdd: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onFeedback: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isMockData, clearData } = usePortfolio();
  const { privacyMode, setPrivacyMode } = usePreferences();

  // One primary action per state. Guests on the demo keep the sign-up path;
  // a signed-in user who opened the demo swaps it for their own numbers.
  const primary = isMockData
    ? user
      ? {
          label: 'Use my own numbers',
          Icon: Plus,
          onClick: () => {
            clearData();
            navigate('/dashboard');
            onAdd();
          },
        }
      : { label: 'Sign up to track yours', Icon: UserPlus, onClick: onSignUp }
    : { label: 'Add entry', Icon: Plus, onClick: onAdd };

  return (
    <header className="q-topbar">
      {/* Mobile only: the sidebar carries the wordmark on wider screens. */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="q-topbar-brand"
        aria-label="Quantive home"
        style={{ background: 'none', border: 0, padding: 0, minHeight: 44, cursor: 'pointer', color: 'var(--fg-subtle)' }}
      >
        <Monogram size={22} />
      </button>

      <PortfolioSwitcher placement="topbar" />

      <GlobalSearch onAdd={onAdd} onSignUp={onSignUp} onFeedback={onFeedback} />

      <div className="q-topbar-actions">
        <SyncIndicator />

        <button
          type="button"
          onClick={() => {
            setPrivacyMode(!privacyMode);
            analytics.privacyModeToggled({ enabled: !privacyMode });
          }}
          className="q-icon-btn"
          aria-label={privacyMode ? 'Show monetary values' : 'Hide monetary values'}
          aria-pressed={privacyMode}
          title={privacyMode ? 'Show values' : 'Hide values'}
        >
          {privacyMode ? <Eye size={16} strokeWidth={1.75} /> : <EyeOff size={16} strokeWidth={1.75} />}
        </button>

        {!user && (
          <button
            type="button"
            className="q-btn q-btn--secondary q-btn--md q-topbar-signin"
            onClick={onSignIn}
            aria-label="Sign in"
          >
            <LogIn size={14} strokeWidth={1.75} aria-hidden="true" />
            Sign in
          </button>
        )}

        {/* Empty states carry their own first-entry action; one primary per screen. */}
        {(data || isMockData) && <button
          type="button"
          className="q-btn q-btn--primary q-btn--md q-topbar-add"
          onClick={primary.onClick}
          aria-label={primary.label}
        >
          <primary.Icon size={16} strokeWidth={2} aria-hidden="true" />
          <span className="q-topbar-add-label">{primary.label}</span>
        </button>}
      </div>
    </header>
  );
}
