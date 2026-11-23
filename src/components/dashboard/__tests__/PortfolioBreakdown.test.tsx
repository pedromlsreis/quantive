import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { PortfolioPart } from '@/lib/allPortfolios';
import type { FactRow } from '@/lib/types';

vi.mock('@/contexts/PortfolioContext', () => ({ usePortfolio: vi.fn() }));
vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ currency: { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE' } }),
}));
const prefs = vi.hoisted(() => ({ numberLocale: 'en-GB' }));
vi.mock('@/contexts/PreferencesContext', () => ({ usePreferences: () => prefs }));
vi.mock('@/hooks/useFxRates', () => ({ useFxRates: () => ({ convertAt: (v: number) => v }) }));
const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
vi.mock('sonner', () => ({ toast }));

import { usePortfolio } from '@/contexts/PortfolioContext';
import { PortfolioBreakdown } from '../PortfolioBreakdown';

const fact = (date: Date, idSource: string, sourceVl: number): FactRow => ({ date, idSource, sourceVl, currency: 'EUR' });
const data = (facts: FactRow[]) => ({ facts, refSources: [], goals: [] });
const setPortfolioShare = vi.fn(async () => true);

function renderWith(parts: PortfolioPart[]) {
  vi.mocked(usePortfolio).mockReturnValue({ portfolioParts: parts, setPortfolioShare } as unknown as ReturnType<typeof usePortfolio>);
  return render(<PortfolioBreakdown />);
}

const parts: PortfolioPart[] = [
  { id: 'personal', name: 'Personal', share: 100, data: data([fact(new Date(2026, 9, 1), 'Savings', 1000)]) },
  { id: 'p1', name: 'Joint', share: 50, data: data([fact(new Date(2026, 9, 3), 'House', 300_000)]) },
  { id: 'p2', name: 'New', share: 100, data: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  prefs.numberLocale = 'en-GB';
});

describe('PortfolioBreakdown', () => {
  it('lists each portfolio, its share and what it adds, and totals them', () => {
    renderWith(parts);
    const [, personal, jointRow, empty, total] = screen.getAllByRole('row');
    expect(within(personal).getByText('100%')).toBeInTheDocument();
    expect(personal).toHaveTextContent('Last entry 1 Oct 2026');
    expect(within(jointRow).getByRole('textbox', { name: 'Your share of Joint, in percent' })).toHaveValue('50');
    expect(jointRow).toHaveTextContent('€150,000');
    expect(empty).toHaveTextContent('No entries yet');
    expect(total).toHaveTextContent('Total');
    expect(total).toHaveTextContent('€151,000');
    expect(screen.getByText(/valued on 3 Oct 2026/)).toBeInTheDocument();
    // Personal's 1 Oct entry predates Joint's first, so the combined history is cut.
    expect(screen.getByText(/combined history starts on 3 Oct 2026/)).toBeInTheDocument();
  });

  it('saves a new share on Enter', () => {
    renderWith(parts);
    const field = screen.getByRole('textbox', { name: 'Your share of Joint, in percent' });
    fireEvent.change(field, { target: { value: '33,33' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.blur(field);
    expect(setPortfolioShare).toHaveBeenCalledWith('p1', 33.33);
  });

  it('refuses a share over 100% and puts the saved one back', () => {
    renderWith(parts);
    const field = screen.getByRole('textbox', { name: 'Your share of Joint, in percent' });
    fireEvent.change(field, { target: { value: '150' } });
    fireEvent.blur(field);
    expect(toast.error).toHaveBeenCalledWith("A share can't be more than 100%.");
    expect(setPortfolioShare).not.toHaveBeenCalled();
    expect(field).toHaveValue('50');
  });

  it('drops an edit on Escape', () => {
    renderWith(parts);
    const field = screen.getByRole('textbox', { name: 'Your share of Joint, in percent' });
    fireEvent.change(field, { target: { value: '20' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.blur(field);
    expect(setPortfolioShare).not.toHaveBeenCalled();
    expect(field).toHaveValue('50');
  });

  it('writes the share in Latin digits, which it can read back, so tabbing past changes nothing', () => {
    // Arabic (Egypt) writes numbers in Arabic-Indic digits by default.
    prefs.numberLocale = 'ar-EG';
    renderWith(parts);
    const field = screen.getByRole('textbox', { name: 'Your share of Joint, in percent' });
    expect(field).toHaveValue('50');
    fireEvent.blur(field);
    expect(toast.error).not.toHaveBeenCalled();
    expect(setPortfolioShare).not.toHaveBeenCalled();
  });

  it('shows a share saved elsewhere', () => {
    const { rerender } = renderWith(parts);
    vi.mocked(usePortfolio).mockReturnValue({
      portfolioParts: parts.map((p) => (p.id === 'p1' ? { ...p, share: 25 } : p)),
      setPortfolioShare,
    } as unknown as ReturnType<typeof usePortfolio>);
    rerender(<PortfolioBreakdown />);
    expect(screen.getByRole('textbox', { name: 'Your share of Joint, in percent' })).toHaveValue('25');
  });
});
