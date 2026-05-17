import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: vi.fn(),
}));

vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: () => void; disabled?: boolean }) => (
    <button role="switch" aria-checked={checked} onClick={onCheckedChange} disabled={disabled} />
  ),
}));

vi.mock('@/components/ui/help-hint', () => ({
  HelpHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const MOTION_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants', 'custom',
    'whileHover', 'whileTap', 'whileFocus', 'whileDrag', 'whileInView',
    'layout', 'layoutId', 'layoutDependency', 'layoutScroll', 'layoutRoot',
    'viewport', 'inherit', 'transformTemplate', 'transformValues',
    'onAnimationStart', 'onAnimationComplete', 'onUpdate',
    'onHoverStart', 'onHoverEnd', 'onTapStart', 'onTap', 'onTapCancel',
    'onViewportEnter', 'onViewportLeave',
    'onLayoutAnimationStart', 'onLayoutAnimationComplete',
  ]);
  const stripMotionProps = (props: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const k in props) if (!MOTION_PROPS.has(k)) out[k] = props[k];
    return out;
  };
  const tags = ['div', 'button', 'span', 'p'];
  const motion = Object.fromEntries(
    tags.map(tag => [
      tag,
      React.forwardRef(({ children, ...props }: Record<string, unknown>, ref: unknown) =>
        React.createElement(tag as string, { ...stripMotionProps(props), ref }, children as React.ReactNode)
      ),
    ])
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { AddMeasurementModal } from '../AddMeasurementModal';

// Import from the canonical module rather than hand-maintaining a list — that
// way adding a new currency doesn't quietly skip modal coverage.
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies';
const ALL_CURRENCIES = CURRENCY_CODES.map(c => CURRENCIES[c]);

function setup(open = true, overrides: { data?: unknown; addMeasurement?: ReturnType<typeof vi.fn>; lastCurrencyBySource?: Map<string, string> } = {}) {
  const addMeasurement = overrides.addMeasurement ?? vi.fn();
  vi.mocked(usePortfolio).mockReturnValue({
    data: overrides.data !== undefined ? overrides.data : null,
    addMeasurement,
    lastCurrencyBySource: overrides.lastCurrencyBySource ?? new Map(),
  } as unknown as ReturnType<typeof usePortfolio>);

  vi.mocked(useCurrency).mockReturnValue({
    currency: { code: 'EUR', symbol: '€', locale: 'de-DE' },
    allCurrencies: ALL_CURRENCIES,
    setCurrency: vi.fn(),
  } as unknown as ReturnType<typeof useCurrency>);

  const onOpenChange = vi.fn();
  render(<AddMeasurementModal open={open} onOpenChange={onOpenChange} />);
  return { addMeasurement, onOpenChange };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AddMeasurementModal', () => {
  it('renders the modal when open', () => {
    setup();
    expect(screen.getByText('Add measurement')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    setup(false);
    expect(screen.queryByText('Add measurement')).not.toBeInTheDocument();
  });

  it('Save button is disabled when no source name is filled', () => {
    setup();
    const saveBtn = screen.getByRole('button', { name: /save measurement/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save button enables after typing a source name', () => {
    setup();
    const nameInput = screen.getByPlaceholderText(/Account or asset/i);
    fireEvent.change(nameInput, { target: { value: 'Savings' } });
    expect(screen.getByRole('button', { name: /save measurement/i })).toBeEnabled();
  });

  it('calls onOpenChange(false) when Cancel is clicked', () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) when Close (×) is clicked', () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('adds a new source row when "Add data source" is clicked', () => {
    setup();
    const before = screen.getAllByPlaceholderText(/Account or asset/i).length;
    fireEvent.click(screen.getByRole('button', { name: /add data source/i }));
    expect(screen.getAllByPlaceholderText(/Account or asset/i).length).toBe(before + 1);
  });

  it('shows validation error when a row has a value but no name', async () => {
    setup();
    // Row 1: fill name so Save becomes enabled
    fireEvent.change(screen.getByPlaceholderText(/Account or asset/i), { target: { value: 'Savings' } });
    // Row 2: add a row, fill value but leave name blank
    fireEvent.click(screen.getByRole('button', { name: /add data source/i }));
    const valueInputs = screen.getAllByPlaceholderText('0');
    fireEvent.change(valueInputs[1], { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/source name cannot be empty/i)).toBeInTheDocument();
    });
  });

  it('shows validation error for duplicate source names on submit', async () => {
    setup();
    const [nameInput] = screen.getAllByPlaceholderText(/Account or asset/i);
    fireEvent.change(nameInput, { target: { value: 'Savings' } });
    fireEvent.click(screen.getByRole('button', { name: /add data source/i }));
    const nameInputs = screen.getAllByPlaceholderText(/Account or asset/i);
    fireEvent.change(nameInputs[1], { target: { value: 'Savings' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(screen.getByText(/"Savings" appears more than once/i)).toBeInTheDocument();
    });
  });

  it('flags duplicates inline as the user types, case-insensitively', async () => {
    setup();
    const [nameInput] = screen.getAllByPlaceholderText(/Account or asset/i);
    fireEvent.change(nameInput, { target: { value: 'Santander' } });
    fireEvent.click(screen.getByRole('button', { name: /add data source/i }));
    const nameInputs = screen.getAllByPlaceholderText(/Account or asset/i);
    // Different case still matches — the inline check is more forgiving than
    // the submit-time check so the user gets warned earlier.
    fireEvent.change(nameInputs[1], { target: { value: 'santander' } });
    await waitFor(() => {
      expect(screen.getByText(/is already in this measurement/i)).toBeInTheDocument();
    });
  });

  it('calls addMeasurement and closes on valid save', async () => {
    const { addMeasurement, onOpenChange } = setup();
    fireEvent.change(screen.getByPlaceholderText(/Account or asset/i), { target: { value: 'Savings' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledOnce();
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Savings', value: 5000, currency: 'EUR' }),
      ]);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('lists every supported currency in the dropdown', () => {
    setup();
    const select = screen.getByLabelText('Currency') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map(o => o.value);
    // Canonical list drives the dropdown — adding a code in currencies.ts
    // should automatically appear here without a separate code change.
    for (const code of CURRENCY_CODES) {
      expect(optionValues, `Missing ${code} in modal dropdown`).toContain(code);
    }
  });

  it('persists the chosen currency per row', async () => {
    const { addMeasurement } = setup();
    fireEvent.change(screen.getByPlaceholderText(/Account or asset/i), { target: { value: 'US Brokerage' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'US Brokerage', value: 12000, currency: 'USD' }),
      ]);
    });
  });

  it('seeds a row\'s currency from the source\'s last-known currency', async () => {
    const seedDate = new Date(2024, 0, 1);
    const { addMeasurement } = setup(true, {
      data: {
        facts: [{ date: seedDate, idSource: 'GBP Savings', sourceVl: 8000, currency: 'GBP' }],
        refSources: [{ idSource: 'GBP Savings', volatType: 'Non-Volatile', transferableInDays: true }],
      },
      lastCurrencyBySource: new Map([['GBP Savings', 'GBP']]),
    });
    // Seeded row is pre-filled; just save to confirm the seeded currency rides through.
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'GBP Savings', currency: 'GBP' }),
      ]);
    });
  });

  it('accepts comma-decimal format (e.g. "1,5" → 1.5)', async () => {
    const { addMeasurement } = setup();
    fireEvent.change(screen.getByPlaceholderText(/Account or asset/i), { target: { value: 'Crypto' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1,5' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ value: 1.5, currency: 'EUR' }),
      ]);
    });
  });

  it('shows validation error for non-numeric value', async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(/Account or asset/i), { target: { value: 'Savings' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid number/i)).toBeInTheDocument();
    });
  });

  it('accepts European thousand-separator format with spaces (e.g. "1 234,00" → 1234)', async () => {
    const { addMeasurement } = setup();
    fireEvent.change(screen.getByPlaceholderText(/Account or asset/i), { target: { value: 'Santander' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1 234,00' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Santander', value: 1234 }),
      ]);
    });
  });

  it('re-seeds rows when the modal transitions closed → open with newly available data', async () => {
    // Regression for #8: AppShell's AddMeasurementModal mounts once at app
    // boot with data=null. Before the fix, useState ran exactly once with
    // that empty data and never re-seeded — so after the first save, the
    // next "Add measurement" opened a blank modal.
    const addMeasurement = vi.fn();
    vi.mocked(usePortfolio).mockReturnValue({
      data: null,
      addMeasurement,
      lastCurrencyBySource: new Map(),
    } as unknown as ReturnType<typeof usePortfolio>);
    vi.mocked(useCurrency).mockReturnValue({
      currency: { code: 'EUR', symbol: '€', locale: 'de-DE' },
      allCurrencies: ALL_CURRENCIES,
      setCurrency: vi.fn(),
    } as unknown as ReturnType<typeof useCurrency>);

    const onOpenChange = vi.fn();
    const { rerender } = render(<AddMeasurementModal open={false} onOpenChange={onOpenChange} />);

    // Simulate the user finishing their first save: data now has facts.
    vi.mocked(usePortfolio).mockReturnValue({
      data: {
        facts: [{ date: new Date(2024, 0, 1), idSource: 'Santander Savings', sourceVl: 5000, currency: 'EUR' }],
        refSources: [{ idSource: 'Santander Savings', volatType: 'Stable', transferableInDays: true }],
      },
      addMeasurement,
      lastCurrencyBySource: new Map([['Santander Savings', 'EUR']]),
    } as unknown as ReturnType<typeof usePortfolio>);

    await act(async () => {
      rerender(<AddMeasurementModal open={true} onOpenChange={onOpenChange} />);
    });

    await waitFor(() => {
      const nameInputs = screen.getAllByPlaceholderText(/Account or asset/i) as HTMLInputElement[];
      expect(nameInputs[0].value).toBe('Santander Savings');
    });
  });
});
