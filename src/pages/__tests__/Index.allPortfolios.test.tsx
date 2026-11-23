import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PortfolioPart } from '@/lib/allPortfolios';
import type { FactRow } from '@/lib/types';

vi.mock('@/contexts/PortfolioContext', () => ({ usePortfolio: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, checkSubscription: vi.fn() }) }));
vi.mock('@/contexts/KeySessionContext', () => ({ useKeySession: vi.fn() }));
vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ currency: { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE' } }),
}));
vi.mock('@/contexts/PreferencesContext', () => ({ usePreferences: () => ({ numberLocale: 'en-GB' }) }));
vi.mock('@/hooks/useFxRates', () => ({ useFxRates: () => ({ convertAt: (v: number) => v }) }));
// A stub that's easy to spot; the sections below only render with data on screen.
vi.mock('@/components/dashboard/EmptyState', () => ({ DashboardEmpty: () => <p>First-entry empty state</p> }));
vi.mock('@/components/dashboard/SubscribeIntentNotice', () => ({ SubscribeIntentNotice: () => null }));
vi.mock('@/components/dashboard/NetWorthHero', () => ({ NetWorthHero: () => null }));
vi.mock('@/components/dashboard/NetWorthChart', () => ({ NetWorthChart: () => null }));
vi.mock('@/components/dashboard/OverviewSections', () => ({
  WhatMoved: () => null,
  AllocationSummary: () => null,
  YearByYear: () => null,
}));

import { usePortfolio } from '@/contexts/PortfolioContext';
import Index from '../Index';

const house = (sourceVl: number): FactRow => ({ date: new Date(2026, 9, 1), idSource: 'House', sourceVl, currency: 'EUR' });
const personal: PortfolioPart = { id: 'personal', name: 'Personal', share: 100, data: null };
const zeroShare: PortfolioPart[] = [personal, { id: 'p1', name: 'Joint', share: 0, data: { facts: [house(1000)], refSources: [], goals: [] } }];
const noEntries: PortfolioPart[] = [personal, { id: 'p1', name: 'Joint', share: 100, data: null }];

describe('Overview in All portfolios with nothing counted', () => {
  // Value: protects=with nothing counted, All portfolios still shows each portfolio's share field, so one set to 0% can be raised again;
  // fails_when=the Overview falls back to the first-entry state in All portfolios, leaving no control to change a share;
  // why_new=PortfolioBreakdown.test renders the table alone and nothing renders the Overview in this view; seam=none; no_claim=how the context builds the parts (PortfolioContext mocked; component only)
  it.each([
    ['every portfolio with entries is at 0%', zeroShare, /set to 0%, so nothing is counted/],
    ['no portfolio has entries yet', noEntries, /None of your portfolios has entries yet/],
  ])('keeps the share fields when %s', (_case, parts, lede) => {
    vi.mocked(usePortfolio).mockReturnValue({
      data: null,
      isLoading: false,
      isMockData: false,
      activePortfolioId: 'all',
      portfolioParts: parts,
      setPortfolioShare: vi.fn(async () => true),
    } as unknown as ReturnType<typeof usePortfolio>);
    render(<MemoryRouter><Index /></MemoryRouter>);
    expect(screen.getByText(lede)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your share of Joint, in percent' })).toBeInTheDocument();
    expect(screen.queryByText('First-entry empty state')).toBeNull();
  });
});
