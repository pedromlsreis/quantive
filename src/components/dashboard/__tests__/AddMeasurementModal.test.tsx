import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: vi.fn(),
}));

vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: vi.fn(),
}));

vi.mock('@/hooks/useFxRates', () => ({
  useFxRates: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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
import { useFxRates } from '@/hooks/useFxRates';
import { AddMeasurementModal } from '../AddMeasurementModal';

// Pull from the canonical module so new currencies don't quietly skip coverage.
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from '@/lib/currencies';
const ALL_CURRENCIES = CURRENCY_CODES.map(c => CURRENCIES[c]);

// Simple FX stub: identity for same currency, fixed rates for EUR/USD/GBP, NaN otherwise.
// Mirrors enough of the real shape for the modal's delta + summary calculations
// without needing the supabase-backed series.
const FX: Record<string, Record<string, number>> = {
  EUR: { EUR: 1, USD: 1.08, GBP: 0.85 },
  USD: { USD: 1, EUR: 0.93, GBP: 0.79 },
  GBP: { GBP: 1, EUR: 1.18, USD: 1.27 },
};
const stubConvertAt = (amount: number, from: CurrencyCode, to: CurrencyCode) => {
  const rate = FX[from]?.[to];
  return rate === undefined ? NaN : amount * rate;
};

interface SetupOverrides {
  data?: unknown;
  allSnapshots?: { date: Date; total: number; sources: unknown[] }[];
  addMeasurement?: ReturnType<typeof vi.fn>;
  lastCurrencyBySource?: Map<string, string>;
  convertAt?: (amount: number, from: CurrencyCode, to: CurrencyCode, date: Date) => number;
}

function setup(open = true, overrides: SetupOverrides = {}) {
  const addMeasurement = overrides.addMeasurement ?? vi.fn();
  vi.mocked(usePortfolio).mockReturnValue({
    data: overrides.data !== undefined ? overrides.data : null,
    addMeasurement,
    allSnapshots: overrides.allSnapshots ?? [],
    lastCurrencyBySource: overrides.lastCurrencyBySource ?? new Map(),
  } as unknown as ReturnType<typeof usePortfolio>);

  vi.mocked(useCurrency).mockReturnValue({
    currency: { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE' },
    allCurrencies: ALL_CURRENCIES,
    setCurrency: vi.fn(),
  } as unknown as ReturnType<typeof useCurrency>);

  vi.mocked(useFxRates).mockReturnValue({
    ready: true,
    convertAt: overrides.convertAt ?? stubConvertAt,
  });

  const onOpenChange = vi.fn();
  const utils = render(<AddMeasurementModal open={open} onOpenChange={onOpenChange} />);
  return { addMeasurement, onOpenChange, ...utils };
}

// Single-source seed used by most "existing source" tests.
function singleSourceSeed(name = 'Santander Savings', currency: CurrencyCode = 'EUR') {
  return {
    data: {
      facts: [{ date: new Date(2024, 0, 1), idSource: name, sourceVl: 5000, currency }],
      refSources: [{ idSource: name, volatType: 'Stable', transferableInDays: true }],
    },
    allSnapshots: [{ date: new Date(2024, 0, 1), total: 5000, sources: [] }],
    lastCurrencyBySource: new Map([[name, currency]]),
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AddMeasurementModal — chrome', () => {
  it('renders the modal title when open', () => {
    setup();
    expect(screen.getByText('Add measurement')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    setup(false);
    expect(screen.queryByText('Add measurement')).not.toBeInTheDocument();
  });

  it('shows "First snapshot" subtitle when there are no prior snapshots', () => {
    setup(true);
    expect(screen.getByText(/First snapshot/i)).toBeInTheDocument();
  });

  it('shows monthly streak and last-snapshot age when snapshots exist', () => {
    const today = new Date();
    const twoDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
    setup(true, {
      allSnapshots: [
        { date: new Date(today.getFullYear(), today.getMonth() - 1, 1), total: 1000, sources: [] },
        { date: twoDaysAgo, total: 5000, sources: [] },
      ],
    });
    expect(screen.getByText(/Monthly streak/i)).toBeInTheDocument();
    expect(screen.getByText(/2 months/i)).toBeInTheDocument();
    expect(screen.getByText(/2d ago/i)).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when Cancel is clicked', () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) when Close (×) is clicked', () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('AddMeasurementModal — Save gating', () => {
  it('Save is disabled when no values are entered', () => {
    setup(true, singleSourceSeed());
    expect(screen.getByRole('button', { name: /save measurement/i })).toBeDisabled();
  });

  it('Save enables once any row has a value', () => {
    setup(true, singleSourceSeed());
    const valueInput = screen.getByLabelText(/Value for Santander Savings/i);
    fireEvent.change(valueInput, { target: { value: '5500' } });
    expect(screen.getByRole('button', { name: /save measurement/i })).toBeEnabled();
  });

  it('empty-state summary shows the prompt when no values are entered', () => {
    setup(true, singleSourceSeed());
    expect(screen.getByText(/Enter at least one value to preview the impact/i)).toBeInTheDocument();
  });
});

describe('AddMeasurementModal — existing sources', () => {
  it('renders one row per existing source with the source name as a text label (no name input)', () => {
    setup(true, singleSourceSeed('Santander Savings'));
    expect(screen.getByText('Santander Savings')).toBeInTheDocument();
    // Existing rows do not expose a name input — names are immutable from this modal.
    expect(screen.queryByPlaceholderText(/Account or asset/i)).not.toBeInTheDocument();
  });

  it('seeds the per-row currency from lastCurrencyBySource', () => {
    setup(true, {
      ...singleSourceSeed('GBP Pot', 'GBP'),
    });
    const select = screen.getByLabelText(/Currency for GBP Pot/i) as HTMLSelectElement;
    expect(select.value).toBe('GBP');
  });

  it('calls addMeasurement with the entered values and selected currency', async () => {
    const { addMeasurement, onOpenChange } = setup(true, singleSourceSeed('Santander Savings'));
    fireEvent.change(screen.getByLabelText(/Value for Santander Savings/i), { target: { value: '6000' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledOnce();
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Santander Savings', value: 6000, currency: 'EUR' }),
      ]);
    });
    // Save reveals the success panel — close happens after its auto-dismiss timer (not awaited here).
    expect(screen.getByText(/Snapshot saved/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('changing per-row currency persists through save', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed('US Broker', 'USD'));
    fireEvent.change(screen.getByLabelText(/Value for US Broker/i), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText(/Currency for US Broker/i), { target: { value: 'GBP' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'US Broker', value: 12000, currency: 'GBP' }),
      ]);
    });
  });

  it('lists every supported currency in the per-row picker', () => {
    setup(true, singleSourceSeed());
    const select = screen.getByLabelText(/Currency for Santander Savings/i) as HTMLSelectElement;
    const values = Array.from(select.options).map(o => o.value);
    for (const code of CURRENCY_CODES) {
      expect(values, `Missing ${code} in per-row picker`).toContain(code);
    }
  });
});

describe('AddMeasurementModal — number parsing', () => {
  it('accepts comma-decimal (e.g. "1,5" → 1.5)', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed('Crypto'));
    fireEvent.change(screen.getByLabelText(/Value for Crypto/i), { target: { value: '1,5' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ value: 1.5 }),
      ]);
    });
  });

  it('accepts space-thousands + comma-decimal (e.g. "1 234,00" → 1234)', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed('Santander'));
    fireEvent.change(screen.getByLabelText(/Value for Santander/i), { target: { value: '1 234,00' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Santander', value: 1234 }),
      ]);
    });
  });

  it('treats a non-numeric value as "not entered" — save stays disabled', () => {
    setup(true, singleSourceSeed());
    fireEvent.change(screen.getByLabelText(/Value for Santander Savings/i), { target: { value: 'abc' } });
    expect(screen.getByRole('button', { name: /save measurement/i })).toBeDisabled();
  });
});

describe('AddMeasurementModal — Add a new source flow', () => {
  it('clicking the row reveals the inline form', () => {
    setup(true, singleSourceSeed());
    expect(screen.queryByPlaceholderText(/Bank of America/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add a new source/i }));
    expect(screen.getByPlaceholderText(/Bank of America/i)).toBeInTheDocument();
  });

  it('"Add source" stays disabled until name is at least 2 characters', () => {
    setup(true, singleSourceSeed());
    fireEvent.click(screen.getByRole('button', { name: /add a new source/i }));
    const addBtn = screen.getByRole('button', { name: /^add source$/i });
    expect(addBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Bank of America/i), { target: { value: 'A' } });
    expect(addBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Bank of America/i), { target: { value: 'Ally' } });
    expect(addBtn).toBeEnabled();
  });

  it('adding a source creates a NEW-tagged row and primes the initial value', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed());
    fireEvent.click(screen.getByRole('button', { name: /add a new source/i }));
    fireEvent.change(screen.getByPlaceholderText(/Bank of America/i), { target: { value: 'Revolut Pot' } });
    // The initial-value field has placeholder "0"; pick it from inside the form by closest input
    const valueInput = screen.getByPlaceholderText('0') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: /^add source$/i }));

    // Form closes; new row appears with NEW badge
    expect(screen.queryByPlaceholderText(/Bank of America/i)).not.toBeInTheDocument();
    expect(screen.getByText('Revolut Pot')).toBeInTheDocument();
    expect(screen.getByText('NEW')).toBeInTheDocument();

    // Initial value primed → save sends through the new source
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ name: 'Revolut Pot', value: 750, currency: 'EUR' }),
      ]));
    });
  });

  it('new source can pick a non-default currency from the inline form', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed());
    fireEvent.click(screen.getByRole('button', { name: /add a new source/i }));
    fireEvent.change(screen.getByPlaceholderText(/Bank of America/i), { target: { value: 'Chase Checking' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '3000' } });
    // The form's currency select is the only one in the inline form
    const formCcySelect = screen.getByLabelText(/^Currency$/i) as HTMLSelectElement;
    fireEvent.change(formCcySelect, { target: { value: 'USD' } });
    fireEvent.click(screen.getByRole('button', { name: /^add source$/i }));
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ name: 'Chase Checking', value: 3000, currency: 'USD' }),
      ]));
    });
  });
});

describe('AddMeasurementModal — backfill', () => {
  it('default snapshot date is today and addMeasurement is called without a date override', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed());
    fireEvent.change(screen.getByLabelText(/Value for Santander Savings/i), { target: { value: '6000' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledOnce();
      const [, opts] = addMeasurement.mock.calls[0];
      expect(opts).toBeUndefined();
    });
  });

  it('changing the date adds the Backfill chip and passes a date opt to addMeasurement', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed());
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    fireEvent.change(dateInput, { target: { value: '2024-06-15' } });
    expect(screen.getByLabelText(/Backfill/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Value for Santander Savings/i), { target: { value: '5500' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      const [, opts] = addMeasurement.mock.calls[0];
      expect(opts).toEqual({ date: new Date(2024, 5, 15) });
    });
  });
});

describe('AddMeasurementModal — keyboard shortcut', () => {
  it('Cmd/Ctrl+Enter triggers save when at least one value is entered', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed('Savings'));
    fireEvent.change(screen.getByLabelText(/Value for Savings/i), { target: { value: '5500' } });
    // Fire on the modal — the keydown handler is on the modal container.
    const modal = screen.getByRole('dialog');
    fireEvent.keyDown(modal, { key: 'Enter', ctrlKey: true });
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledOnce();
    });
  });
});

describe('AddMeasurementModal — save success panel', () => {
  it('replaces the body with the success panel after save', async () => {
    setup(true, singleSourceSeed('Savings'));
    fireEvent.change(screen.getByLabelText(/Value for Savings/i), { target: { value: '5500' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    await waitFor(() => {
      expect(screen.getByText(/Snapshot saved/i)).toBeInTheDocument();
    });
  });

  it('Done button on success panel dismisses immediately', async () => {
    const { onOpenChange } = setup(true, singleSourceSeed('Savings'));
    fireEvent.change(screen.getByLabelText(/Value for Savings/i), { target: { value: '5500' } });
    fireEvent.click(screen.getByRole('button', { name: /save measurement/i }));
    const doneBtn = await screen.findByRole('button', { name: /^done$/i });
    fireEvent.click(doneBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('AddMeasurementModal — draft persistence', () => {
  it('persists in-progress entries to localStorage and restores them on next open', async () => {
    const { rerender, onOpenChange } = setup(true, singleSourceSeed('Savings'));
    fireEvent.change(screen.getByLabelText(/Value for Savings/i), { target: { value: '4321' } });
    // Close (no save) — draft should remain.
    rerender(<AddMeasurementModal open={false} onOpenChange={onOpenChange} />);
    // Re-open — the previously typed value should be back.
    rerender(<AddMeasurementModal open={true} onOpenChange={onOpenChange} />);
    await waitFor(() => {
      const valueInput = screen.getByLabelText(/Value for Savings/i) as HTMLInputElement;
      expect(valueInput.value).toBe('4321');
    });
  });
});
