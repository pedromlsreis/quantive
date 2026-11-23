import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PortfolioData, Snapshot } from '@/lib/types';

vi.mock('@/contexts/PortfolioContext', () => ({ usePortfolio: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ currency: { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE' } }),
}));
vi.mock('@/contexts/PreferencesContext', () => ({ usePreferences: () => ({ numberLocale: 'en-GB' }) }));
// It opens only from a row's menu.
vi.mock('@/components/sources/MeasurementHistoryModal', () => ({ MeasurementHistoryModal: () => null }));

import { usePortfolio } from '@/contexts/PortfolioContext';
import SourcesPage from '../SourcesPage';

const date = new Date(2026, 9, 1);
const combined: PortfolioData = {
  facts: [
    { date, idSource: 'Joint · House', sourceVl: 150_000, currency: 'EUR' },
    { date, idSource: 'Personal · Savings', sourceVl: 1000, currency: 'EUR' },
  ],
  refSources: [
    // Unset volatility, which prompts a fix in a single portfolio.
    { idSource: 'Joint · House', volatType: 'Unknown', transferableInDays: false },
    { idSource: 'Personal · Savings', volatType: 'Non-volatile', transferableInDays: true },
  ],
  goals: [],
};
const snapshots: Snapshot[] = [{
  date,
  total: 151_000,
  sources: [
    { name: 'Joint · House', value: 150_000, volatType: 'Unknown', isLiquid: false },
    { name: 'Personal · Savings', value: 1000, volatType: 'Non-volatile', isLiquid: true },
  ],
}];
const cases: Array<[string, PortfolioData | null, Snapshot[], string | RegExp]> = [
  ['with entries', combined, snapshots, 'Joint · House'],
  ['before any entry', null, [], /Nothing is counted in All portfolios yet/],
];

describe('Sources in All portfolios', () => {
  // Value: protects=in All portfolios, Sources offers no edit or add control: no row actions or volatility prompt with entries, no first-entry button before any;
  // fails_when=the editable gate on SourcesPage, or RouteEmpty's All portfolios branch, is dropped;
  // why_new=no SourcesPage or RouteEmpty unit test exists; seam=none; no_claim=the context's refusal of edits (PortfolioContext mocked; component only)
  it.each(cases)('offers no edit or add control %s', (_case, data, allSnapshots, anchor) => {
    vi.mocked(usePortfolio).mockReturnValue({
      data,
      isLoading: false,
      allSnapshots,
      activePortfolioId: 'all',
      updateRefSource: vi.fn(),
      renameSource: vi.fn(),
      lastCurrencyBySource: new Map(),
    } as unknown as ReturnType<typeof usePortfolio>);
    render(<MemoryRouter><SourcesPage /></MemoryRouter>);
    expect(screen.getByText(anchor)).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Actions for/ })).toEqual([]);
    expect(screen.queryByText(/Some sources have no volatility set/)).toBeNull();
    expect(screen.queryByRole('button', { name: /add your first entry/i })).toBeNull();
  });
});
