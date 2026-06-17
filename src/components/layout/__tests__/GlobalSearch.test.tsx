import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/KeySessionContext', () => ({
  useKeySession: vi.fn(),
}));

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: vi.fn(),
}));

import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { GlobalSearch } from '../GlobalSearch';

interface SetupOpts {
  user?: { id: string } | null;
  isMockData?: boolean;
  privacyMode?: boolean;
  status?: 'locked' | 'unlocked-encrypted';
  hasRecovery?: boolean | null;
  allSources?: string[];
  snapshots?: { sources: { name: string; value: number }[] }[];
}

function setup(opts: SetupOpts = {}) {
  const {
    user = null,
    isMockData = false,
    privacyMode = false,
    status = 'locked',
    hasRecovery = null,
    allSources = [],
    snapshots = [],
  } = opts;

  vi.mocked(usePortfolio).mockReturnValue(
    { allSources, snapshots, isMockData } as unknown as ReturnType<typeof usePortfolio>,
  );
  vi.mocked(useAuth).mockReturnValue(
    { user, signOut: vi.fn() } as unknown as ReturnType<typeof useAuth>,
  );
  vi.mocked(useKeySession).mockReturnValue(
    { status, lock: vi.fn(), hasRecovery } as unknown as ReturnType<typeof useKeySession>,
  );
  vi.mocked(usePreferences).mockReturnValue(
    { privacyMode, setPrivacyMode: vi.fn() } as unknown as ReturnType<typeof usePreferences>,
  );

  const onAdd = vi.fn();
  const onSignUp = vi.fn();
  const onFeedback = vi.fn();
  render(<GlobalSearch onAdd={onAdd} onSignUp={onSignUp} onFeedback={onFeedback} />);

  const input = screen.getByRole('combobox');
  // The dropdown only renders once the palette is open.
  const open = () => fireEvent.focus(input);
  const type = (value: string) => fireEvent.change(input, { target: { value } });
  return { input, open, type, onAdd, onSignUp, onFeedback };
}

// jsdom doesn't implement scrollIntoView; the keyboard-nav effect calls it.
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('GlobalSearch — action gating', () => {
  it('a signed-out guest sees only the always-on actions', () => {
    const { open } = setup({ user: null, status: 'locked' });
    open();

    // Available to everyone.
    expect(screen.getByText('Add measurement')).toBeInTheDocument();
    expect(screen.getByText('Hide values')).toBeInTheDocument();
    expect(screen.getByText('Send feedback')).toBeInTheDocument();

    // Gated to a signed-in / unlocked session.
    expect(screen.queryByText('Export data')).not.toBeInTheDocument();
    expect(screen.queryByText('Lock session')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
    expect(screen.queryByText('Set up recovery code')).not.toBeInTheDocument();
  });

  it('in demo mode the primary action is sign-up, not add measurement', () => {
    const { open } = setup({ isMockData: true });
    open();

    expect(screen.getByText('Sign up to track yours')).toBeInTheDocument();
    expect(screen.queryByText('Add measurement')).not.toBeInTheDocument();
  });

  it('a signed-in, unlocked user can lock, export and sign out', () => {
    const { open } = setup({
      user: { id: 'u1' },
      status: 'unlocked-encrypted',
      hasRecovery: true,
    });
    open();

    expect(screen.getByText('Lock session')).toBeInTheDocument();
    expect(screen.getByText('Export data')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
    // Recovery is already set up, so its action stays hidden.
    expect(screen.queryByText('Set up recovery code')).not.toBeInTheDocument();
  });

  it('surfaces the recovery action only when recovery is unset', () => {
    const { open } = setup({
      user: { id: 'u1' },
      status: 'unlocked-encrypted',
      hasRecovery: false,
    });
    open();

    expect(screen.getByText('Set up recovery code')).toBeInTheDocument();
  });

  it('flips the privacy label to match the current mode', () => {
    const { open } = setup({ privacyMode: true });
    open();

    expect(screen.getByText('Show values')).toBeInTheDocument();
    expect(screen.queryByText('Hide values')).not.toBeInTheDocument();
  });
});

describe('GlobalSearch — sources', () => {
  it('does not list sources on an empty palette, only after a query', () => {
    const { open, type } = setup({ allSources: ['Acme Savings'] });
    open();

    // Nothing typed yet — sources stay out of the way.
    expect(screen.queryByText('Acme Savings')).not.toBeInTheDocument();

    type('acme');
    expect(screen.getByText('Acme Savings')).toBeInTheDocument();
  });
});
