import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/contexts/PortfolioContext', () => ({ usePortfolio: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useEntitlements', () => ({ useEntitlements: () => ({ has: () => true }) }));
vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ currency: { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE' } }),
}));
vi.mock('@/contexts/PreferencesContext', () => ({ usePreferences: () => ({ numberLocale: 'en-GB' }) }));
// The goal form and cards render only outside All portfolios.
vi.mock('@/components/goals/GoalForm', () => ({ GoalForm: () => null }));
vi.mock('@/components/goals/GoalCard', () => ({ GoalCard: () => null }));

import { usePortfolio } from '@/contexts/PortfolioContext';
import GoalsPage from '../GoalsPage';

describe('Goals in All portfolios', () => {
  // Value: protects=Goals in All portfolios explains that each goal lives in one portfolio and offers no way to add one;
  // fails_when=the All portfolios early return is dropped, so Add your first goal opens a form whose save is refused;
  // why_new=no GoalsPage unit test exists; seam=none; no_claim=goal storage and the refusal toast (PortfolioContext mocked; component only)
  it('says where goals live and offers no way to add one', () => {
    vi.mocked(usePortfolio).mockReturnValue({
      goals: [],
      addGoal: vi.fn(),
      updateGoal: vi.fn(),
      archiveGoal: vi.fn(),
      allSnapshots: [],
      activePortfolioId: 'all',
    } as unknown as ReturnType<typeof usePortfolio>);
    render(<GoalsPage />);
    expect(screen.getByText(/Each goal belongs to one portfolio/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /goal/i })).toBeNull();
  });
});
