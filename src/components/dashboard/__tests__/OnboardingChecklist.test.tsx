import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingChecklist } from '@/components/dashboard/OnboardingChecklist';

// Mutable session/portfolio state the mocked hooks read from, plus navigate and
// analytics spies. `vi.hoisted` exposes them to the hoisted vi.mock factories.
const { navigate, analytics, state } = vi.hoisted(() => ({
  navigate: vi.fn(),
  analytics: {
    onboardingChecklistShown: vi.fn(),
    onboardingCtaClicked: vi.fn(),
    onboardingChecklistDismissed: vi.fn(),
  },
  state: {
    user: { id: 'u1' } as { id: string } | null,
    data: null as { facts: unknown[]; refSources: unknown[]; goals: unknown[] } | null,
    isMockData: false,
    hasRecovery: null as boolean | null,
  },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/contexts/PortfolioContext', () => ({ usePortfolio: () => ({ data: state.data, isMockData: state.isMockData }) }));
vi.mock('@/contexts/KeySessionContext', () => ({ useKeySession: () => ({ hasRecovery: state.hasRecovery }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/lib/analytics', () => ({ analytics }));

beforeEach(() => {
  localStorage.clear();
  navigate.mockClear();
  analytics.onboardingChecklistShown.mockClear();
  analytics.onboardingCtaClicked.mockClear();
  analytics.onboardingChecklistDismissed.mockClear();
  state.user = { id: 'u1' };
  // First balances logged (one source, one fact), nothing else done.
  state.data = { facts: [{}], refSources: [{}], goals: [] };
  state.isMockData = false;
  state.hasRecovery = null;
});

describe('OnboardingChecklist', () => {
  it('renders nothing for a guest', () => {
    state.user = null;
    const { container } = render(<OnboardingChecklist />);
    expect(container.firstChild).toBeNull();
    expect(analytics.onboardingChecklistShown).not.toHaveBeenCalled();
  });

  it('renders nothing in demo / mock mode', () => {
    state.isMockData = true;
    const { container } = render(<OnboardingChecklist />);
    expect(container.firstChild).toBeNull();
    expect(analytics.onboardingChecklistShown).not.toHaveBeenCalled();
  });

  it('shows progress and the incomplete steps, and fires the shown event once', () => {
    const { container } = render(<OnboardingChecklist />);
    expect(container.textContent).toContain('1 of 4 done');
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeTruthy();
    expect(screen.getByText('Add your other accounts')).toBeTruthy();
    expect(analytics.onboardingChecklistShown).toHaveBeenCalledTimes(1);
    expect(analytics.onboardingChecklistShown).toHaveBeenCalledWith({ completed: 1 });
  });

  it('hides once every step is done', () => {
    state.data = { facts: [{}], refSources: [{}, {}], goals: [{}] };
    state.hasRecovery = true;
    const { container } = render(<OnboardingChecklist />);
    expect(container.firstChild).toBeNull();
  });

  it('dispatches the add-measurement event and a cta_clicked from the Add step', () => {
    const spy = vi.fn();
    window.addEventListener('quantive:add-measurement', spy);
    render(<OnboardingChecklist />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(analytics.onboardingCtaClicked).toHaveBeenCalledWith({ step: 'accounts' });
    window.removeEventListener('quantive:add-measurement', spy);
  });

  it('navigates and reports the cta from the recovery and goal steps', () => {
    render(<OnboardingChecklist />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up' }));
    expect(navigate).toHaveBeenCalledWith('/settings');
    expect(analytics.onboardingCtaClicked).toHaveBeenCalledWith({ step: 'recovery' });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(navigate).toHaveBeenCalledWith('/goals');
    expect(analytics.onboardingCtaClicked).toHaveBeenCalledWith({ step: 'goal' });
  });

  it('dismiss hides it, persists a per-user flag, and reports completion', () => {
    const { container } = render(<OnboardingChecklist />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss getting started' }));
    expect(container.firstChild).toBeNull();
    expect(localStorage.getItem('onboarding-dismissed:u1')).toBe('1');
    expect(analytics.onboardingChecklistDismissed).toHaveBeenCalledWith({ completed: 1 });
  });

  it('stays hidden on mount when the dismissed flag is already set', () => {
    localStorage.setItem('onboarding-dismissed:u1', '1');
    const { container } = render(<OnboardingChecklist />);
    expect(container.firstChild).toBeNull();
    expect(analytics.onboardingChecklistShown).not.toHaveBeenCalled();
  });
});
