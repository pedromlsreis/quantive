import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Numbers written en-GB regardless of the test machine's language.
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ numberLocale: 'en-GB' }),
}));

vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: vi.fn(),
}));

vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: vi.fn(),
}));

vi.mock('@/hooks/useFxRates', () => ({
  useFxRates: () => ({ convertAt: (v: number) => v, rates: {}, isLoading: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { MeasurementHistoryModal } from '../MeasurementHistoryModal';
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies';

const ALL_CURRENCIES = CURRENCY_CODES.map(c => CURRENCIES[c]);

interface MockFact {
  date: Date;
  idSource: string;
  sourceVl: number;
  currency: string;
}

function setupPortfolio(facts: MockFact[]) {
  const updateMeasurement = vi.fn();
  const deleteMeasurement = vi.fn();
  vi.mocked(usePortfolio).mockReturnValue({
    data: {
      facts,
      refSources: [{ idSource: 'Checking', volatType: 'Stable', transferableInDays: true }],
      goals: [],
    },
    updateMeasurement,
    deleteMeasurement,
  } as unknown as ReturnType<typeof usePortfolio>);

  vi.mocked(useCurrency).mockReturnValue({
    currency: { code: 'EUR', symbol: '€', locale: 'de-DE' },
    allCurrencies: ALL_CURRENCIES,
    setCurrency: vi.fn(),
  } as unknown as ReturnType<typeof useCurrency>);

  return { updateMeasurement, deleteMeasurement };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MeasurementHistoryModal', () => {
  it('renders a row per (date) for the targeted source, newest first', () => {
    setupPortfolio([
      { date: new Date('2026-01-15T00:00:00.000Z'), idSource: 'Checking', sourceVl: 1000, currency: 'EUR' },
      { date: new Date('2026-02-15T00:00:00.000Z'), idSource: 'Checking', sourceVl: 1100, currency: 'EUR' },
      { date: new Date('2026-02-15T00:00:00.000Z'), idSource: 'Brokerage', sourceVl: 5200, currency: 'USD' },
    ]);

    render(
      <MeasurementHistoryModal open={true} onOpenChange={vi.fn()} idSource="Checking" />,
    );

    expect(screen.getByText(/Entries for Checking/)).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    // 1 header row + 2 data rows for Checking; Brokerage row excluded.
    expect(rows).toHaveLength(3);
    // Feb (newer) before Jan.
    const dataRows = rows.slice(1);
    expect(within(dataRows[0]).getByText(/15 Feb 2026/)).toBeInTheDocument();
    expect(within(dataRows[1]).getByText(/15 Jan 2026/)).toBeInTheDocument();
  });

  it('opens the Edit sub-modal when the pencil is clicked', () => {
    setupPortfolio([
      { date: new Date('2026-01-15T00:00:00.000Z'), idSource: 'Checking', sourceVl: 1000, currency: 'EUR' },
    ]);

    render(
      <MeasurementHistoryModal open={true} onOpenChange={vi.fn()} idSource="Checking" />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit entry from 15 Jan 2026/ }));
    expect(screen.getByRole('dialog', { name: /Edit entry/i })).toBeInTheDocument();
  });

  it('calls updateMeasurement with the parsed value on save', () => {
    const { updateMeasurement } = setupPortfolio([
      { date: new Date('2026-01-15T00:00:00.000Z'), idSource: 'Checking', sourceVl: 1000, currency: 'EUR' },
    ]);

    render(
      <MeasurementHistoryModal open={true} onOpenChange={vi.fn()} idSource="Checking" />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit entry from 15 Jan 2026/ }));
    const valueInput = screen.getByLabelText('Entry value') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: '1234.56' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    expect(updateMeasurement).toHaveBeenCalledTimes(1);
    const [date, idSource, patch] = updateMeasurement.mock.calls[0];
    expect((date as Date).getTime()).toBe(new Date('2026-01-15T00:00:00.000Z').getTime());
    expect(idSource).toBe('Checking');
    expect(patch).toEqual({ sourceVl: 1234.56, currency: 'EUR' });
  });

  it('opens the delete confirm dialog and calls deleteMeasurement on confirm', () => {
    const { deleteMeasurement } = setupPortfolio([
      { date: new Date('2026-01-15T00:00:00.000Z'), idSource: 'Checking', sourceVl: 1000, currency: 'EUR' },
      { date: new Date('2026-02-15T00:00:00.000Z'), idSource: 'Checking', sourceVl: 1100, currency: 'EUR' },
    ]);

    render(
      <MeasurementHistoryModal open={true} onOpenChange={vi.fn()} idSource="Checking" />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete entry from 15 Jan 2026/ }));
    // AlertDialog renders into a portal; its title becomes accessible.
    expect(screen.getByText(/Delete entry from 15 Jan 2026\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Delete entry$/ }));
    expect(deleteMeasurement).toHaveBeenCalledTimes(1);
    const [date, idSource] = deleteMeasurement.mock.calls[0];
    expect((date as Date).getTime()).toBe(new Date('2026-01-15T00:00:00.000Z').getTime());
    expect(idSource).toBe('Checking');
  });

  it('warns when deleting the only remaining measurement for a source', () => {
    setupPortfolio([
      { date: new Date('2026-01-15T00:00:00.000Z'), idSource: 'Checking', sourceVl: 1000, currency: 'EUR' },
    ]);

    render(
      <MeasurementHistoryModal open={true} onOpenChange={vi.fn()} idSource="Checking" />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete entry from 15 Jan 2026/ }));
    expect(screen.getByText(/This is the only entry for Checking/)).toBeInTheDocument();
  });

  it('renders an empty-state when the source has no measurements', () => {
    setupPortfolio([]);

    render(
      <MeasurementHistoryModal open={true} onOpenChange={vi.fn()} idSource="Checking" />,
    );

    expect(screen.getByText(/No entries for this source yet/)).toBeInTheDocument();
  });

  it('does not call onOpenChange(false) when Escape is pressed while the edit sub-modal is open', () => {
    const onOpenChange = vi.fn();
    setupPortfolio([
      { date: new Date('2026-01-15T00:00:00.000Z'), idSource: 'Checking', sourceVl: 1000, currency: 'EUR' },
    ]);

    render(
      <MeasurementHistoryModal open={true} onOpenChange={onOpenChange} idSource="Checking" />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit entry from 15 Jan 2026/ }));
    fireEvent.keyDown(window, { key: 'Escape' });

    // Edit sub-modal closes (no longer in the DOM); parent stays open.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
