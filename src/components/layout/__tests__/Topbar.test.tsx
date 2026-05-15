import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: vi.fn(),
}));

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: vi.fn(),
}));

vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: false }),
}));

vi.mock('@/components/dashboard/SyncIndicator', () => ({
  SyncIndicator: () => <div data-testid="sync-indicator" />,
}));

vi.mock('@/components/layout/Brand', () => ({
  Monogram: () => <span data-testid="monogram" />,
}));

vi.mock('@/components/layout/GlobalSearch', () => ({
  GlobalSearch: () => <div data-testid="global-search" />,
}));

import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Topbar } from '../Topbar';

type AuthShape = { user: { id: string } | null };
type PortfolioShape = { isMockData: boolean };
type PrefsShape = { privacyMode: boolean; setPrivacyMode: ReturnType<typeof vi.fn> };

function setup({
  user = null,
  isMockData = false,
  privacyMode = false,
}: { user?: AuthShape['user']; isMockData?: boolean; privacyMode?: boolean } = {}) {
  const setPrivacyMode = vi.fn();
  vi.mocked(useAuth).mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(usePortfolio).mockReturnValue({ isMockData } as unknown as ReturnType<typeof usePortfolio>);
  vi.mocked(usePreferences).mockReturnValue({ privacyMode, setPrivacyMode } as PrefsShape as unknown as ReturnType<typeof usePreferences>);

  const onMenuClick = vi.fn();
  const onAdd = vi.fn();
  const onSignIn = vi.fn();
  render(
    <Topbar
      pathname="/dashboard"
      onMenuClick={onMenuClick}
      onAdd={onAdd}
      onSignIn={onSignIn}
    />,
  );
  return { setPrivacyMode, onMenuClick, onAdd, onSignIn };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Topbar — privacy toggle', () => {
  it('renders the toggle with the "hide" affordance when privacy mode is off', () => {
    setup({ privacyMode: false });
    const btn = screen.getByRole('button', { name: /hide monetary values/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders the toggle with the "show" affordance when privacy mode is on', () => {
    setup({ privacyMode: true });
    const btn = screen.getByRole('button', { name: /show monetary values/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls setPrivacyMode with the inverse of the current state on click', () => {
    const { setPrivacyMode } = setup({ privacyMode: false });
    fireEvent.click(screen.getByRole('button', { name: /hide monetary values/i }));
    expect(setPrivacyMode).toHaveBeenCalledWith(true);
  });

  it('toggles the other direction when privacy mode is already on', () => {
    const { setPrivacyMode } = setup({ privacyMode: true });
    fireEvent.click(screen.getByRole('button', { name: /show monetary values/i }));
    expect(setPrivacyMode).toHaveBeenCalledWith(false);
  });
});

describe('Topbar — right-aligned action cluster', () => {
  it('wraps sync, privacy, sign-in, and add inside .q-topbar-actions when signed out', () => {
    setup({ user: null });
    const actions = document.querySelector('.q-topbar-actions');
    expect(actions).not.toBeNull();
    expect(actions?.querySelector('[data-testid="sync-indicator"]')).not.toBeNull();
    expect(actions?.querySelector('[aria-label="Sign in"]')).not.toBeNull();
    expect(actions?.querySelector('.q-topbar-add')).not.toBeNull();
    expect(
      actions?.querySelector('[aria-label="Hide monetary values"], [aria-label="Show monetary values"]'),
    ).not.toBeNull();
  });

  it('omits the sign-in button when a user is present', () => {
    setup({ user: { id: 'u1' } });
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    const actions = document.querySelector('.q-topbar-actions');
    expect(actions?.querySelector('.q-topbar-add')).not.toBeNull();
  });

  it('swaps the add button to a sign-up CTA when viewing mock data', () => {
    const { onAdd, onSignIn } = setup({ user: null, isMockData: true });
    const cta = screen.getByRole('button', { name: /sign up to track your own portfolio/i });
    fireEvent.click(cta);
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
