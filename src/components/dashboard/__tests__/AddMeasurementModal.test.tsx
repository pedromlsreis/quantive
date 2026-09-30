import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: vi.fn(),
}));

vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: vi.fn(),
}));

// Numbers written en-GB regardless of the test machine's language.
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ numberLocale: 'en-GB' }),
}));

vi.mock('@/hooks/useFxRates', () => ({
  useFxRates: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/dashboard' }),
}));

import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useFxRates } from '@/hooks/useFxRates';
import { AddMeasurementModal } from '../AddMeasurementModal';
import { SNAPSHOT_SAVED_EVENT } from '@/lib/appEvents';

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
  /** When true, the modal treats the session as authed and skips draft persistence. */
  authed?: boolean;
}

function setup(open = true, overrides: SetupOverrides = {}) {
  const addMeasurement = overrides.addMeasurement ?? vi.fn();
  vi.mocked(useAuth).mockReturnValue({
    user: overrides.authed ? { id: 'test-user' } : null,
  } as unknown as ReturnType<typeof useAuth>);

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

// First-run seed: a portfolio with no existing sources, so nothing is
// carried forward and the modal behaves like a blank first measurement.
function emptySeed() {
  return {
    data: { facts: [], refSources: [] },
    allSnapshots: [],
    lastCurrencyBySource: new Map(),
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

/** Opens the new-source form unless it is already open (it is, with no sources to carry). */
function openNewSourceForm() {
  const trigger = screen.queryByRole('button', { name: /add a new source/i });
  if (trigger) fireEvent.click(trigger);
}

describe('AddMeasurementModal — chrome', () => {
  it('renders the modal title when open', () => {
    setup();
    expect(screen.getByText('Add entry')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    setup(false);
    expect(screen.queryByText('Add entry')).not.toBeInTheDocument();
  });

  it('says it is the first entry when there are no prior snapshots', () => {
    setup(true);
    expect(screen.getByText(/Your first entry/i)).toBeInTheDocument();
  });

  it('states the last entry and its age instead of a streak', () => {
    const today = new Date();
    const twoDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
    setup(true, {
      allSnapshots: [
        { date: new Date(today.getFullYear(), today.getMonth() - 1, 1), total: 1000, sources: [] },
        { date: twoDaysAgo, total: 5000, sources: [] },
      ],
    });
    expect(screen.getByText(/Last entry \d{1,2} \w{3} \d{4}, 2 days ago\./)).toBeInTheDocument();
    expect(screen.queryByText(/Tracked/i)).not.toBeInTheDocument();
  });

  it('calls onOpenChange(false) when Cancel is clicked', () => {
    // A seeded portfolio: with none, the new-source form (and its own Cancel) is open.
    const { onOpenChange } = setup(true, singleSourceSeed());
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
  it('Save is disabled on a first-run portfolio with no sources to carry forward', () => {
    setup(true, emptySeed());
    expect(screen.getByRole('button', { name: /save entry/i })).toBeDisabled();
  });

  it('Save is enabled on open when an existing source is pre-filled', () => {
    // Carry-forward seeds the row with its last value, so the user can confirm
    // a no-change month with a single click.
    setup(true, singleSourceSeed());
    expect(screen.getByRole('button', { name: /save entry/i })).toBeEnabled();
  });

  it('empty-state summary shows the prompt on a first-run portfolio', () => {
    setup(true, emptySeed());
    expect(screen.getByText(/Enter a value to see the new total/i)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledOnce();
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Santander Savings', value: 6000, currency: 'EUR' }),
      ]);
    });
    // No success panel: the dialog closes and the overview shows the new total.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('changing per-row currency persists through save', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed('US Broker', 'USD'));
    fireEvent.change(screen.getByLabelText(/Value for US Broker/i), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText(/Currency for US Broker/i), { target: { value: 'GBP' } });
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ value: 1.5 }),
      ]);
    });
  });

  it('accepts space-thousands + comma-decimal (e.g. "1 234,00" → 1234)', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed('Santander'));
    fireEvent.change(screen.getByLabelText(/Value for Santander/i), { target: { value: '1 234,00' } });
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Santander', value: 1234 }),
      ]);
    });
  });

  it('treats a non-numeric value as "not entered" and says so on save', () => {
    const { addMeasurement } = setup(true, singleSourceSeed());
    fireEvent.change(screen.getByLabelText(/Value for Santander Savings/i), { target: { value: 'abc' } });
    // Save stays reachable while rows exist; the error is inline instead.
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter a value for at least one source/);
    expect(addMeasurement).not.toHaveBeenCalled();
  });
});

describe('AddMeasurementModal — Add a new source flow', () => {
  it('clicking the row reveals the inline form', () => {
    setup(true, singleSourceSeed());
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    openNewSourceForm();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('opens the form straight away when there is nothing to carry forward', () => {
    setup(true, emptySeed());
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add a new source/i })).not.toBeInTheDocument();
  });

  it('"Add source" stays disabled until name is at least 2 characters', () => {
    setup(true, singleSourceSeed());
    openNewSourceForm();
    const addBtn = screen.getByRole('button', { name: /^add source$/i });
    expect(addBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'A' } });
    expect(addBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ally' } });
    expect(addBtn).toBeEnabled();
  });

  it('adding a source creates a New-tagged row and primes the initial value', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed());
    openNewSourceForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Revolut Pot' } });
    // The initial-value field has placeholder "0"; pick it from inside the form by closest input
    const valueInput = screen.getByPlaceholderText('0') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: /^add source$/i }));

    // Form closes; the new row carries a "New" tag
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.getByText('Revolut Pot')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();

    // Initial value primed → save sends through the new source
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ name: 'Revolut Pot', value: 750, currency: 'EUR' }),
      ]));
    });
  });

  it('new source can pick a non-default currency from the inline form', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed());
    openNewSourceForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Chase Checking' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '3000' } });
    // The form's currency select is the only one in the inline form
    const formCcySelect = screen.getByLabelText(/^Currency$/i) as HTMLSelectElement;
    fireEvent.change(formCcySelect, { target: { value: 'USD' } });
    fireEvent.click(screen.getByRole('button', { name: /^add source$/i }));
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ name: 'Chase Checking', value: 3000, currency: 'USD' }),
      ]));
    });
  });
});

describe('AddMeasurementModal — Save with the new-source form open', () => {
  it('saves a filled form without pressing "Add source"', async () => {
    const { addMeasurement } = setup(true, emptySeed());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cash ISA' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2500' } });
    const save = screen.getByRole('button', { name: /save entry/i });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith([expect.objectContaining({ name: 'Cash ISA', value: 2500 })]);
    });
  });

  it('refuses a half-filled form instead of dropping it', () => {
    const { addMeasurement } = setup(true, singleSourceSeed());
    fireEvent.click(screen.getByRole('button', { name: /add a new source/i }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Revolut' } });
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Finish or cancel the new source first.');
    expect(addMeasurement).not.toHaveBeenCalled();
  });
});

describe('AddMeasurementModal — backfill', () => {
  it('default snapshot date is today and addMeasurement is called without a date override', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed());
    fireEvent.change(screen.getByLabelText(/Value for Santander Savings/i), { target: { value: '6000' } });
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledOnce();
      const [, opts] = addMeasurement.mock.calls[0];
      expect(opts).toBeUndefined();
    });
  });

  it('changing the date tags it as a past date and passes a date opt to addMeasurement', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed());
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    fireEvent.change(dateInput, { target: { value: '2024-06-15' } });
    expect(screen.getByText('Past date')).toBeInTheDocument();
    expect(screen.getByText('Net worth on 15 Jun 2024')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Value for Santander Savings/i), { target: { value: '5500' } });
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
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

describe('AddMeasurementModal — after saving', () => {
  it('closes and tells the overview a new latest entry exists', async () => {
    const heard = vi.fn();
    window.addEventListener(SNAPSHOT_SAVED_EVENT, heard);
    const { onOpenChange } = setup(true, singleSourceSeed('Savings'));
    fireEvent.change(screen.getByLabelText(/Value for Savings/i), { target: { value: '5500' } });
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(heard).toHaveBeenCalledOnce();
    window.removeEventListener(SNAPSHOT_SAVED_EVENT, heard);
  });

  it('does not signal the overview for an entry older than the latest', () => {
    const heard = vi.fn();
    window.addEventListener(SNAPSHOT_SAVED_EVENT, heard);
    setup(true, singleSourceSeed('Savings'));
    fireEvent.change(document.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: '2023-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener(SNAPSHOT_SAVED_EVENT, heard);
  });
});

describe('AddMeasurementModal — dismissing', () => {
  it('asks before discarding a signed-in user\'s changes', () => {
    const { onOpenChange } = setup(true, { ...singleSourceSeed('Savings'), authed: true });
    fireEvent.change(screen.getByLabelText(/Value for Savings/i), { target: { value: '5500' } });
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('Discard 1 change?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(screen.queryByText('Discard 1 change?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes a guest composer straight away: the draft is kept', () => {
    const { onOpenChange } = setup(true, singleSourceSeed('Savings'));
    fireEvent.change(screen.getByLabelText(/Value for Savings/i), { target: { value: '5500' } });
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('AddMeasurementModal — keyboard entry', () => {
  it('Enter moves to the next value, and saves from the last one', () => {
    const { addMeasurement } = setup(true, {
      data: {
        facts: [
          { date: new Date(2024, 0, 1), idSource: 'Alpha', sourceVl: 2000, currency: 'EUR' },
          { date: new Date(2024, 0, 1), idSource: 'Beta', sourceVl: 1000, currency: 'EUR' },
        ],
        refSources: [
          { idSource: 'Alpha', volatType: 'stable', transferableInDays: true },
          { idSource: 'Beta', volatType: 'stable', transferableInDays: true },
        ],
      },
      allSnapshots: [{ date: new Date(2024, 0, 1), total: 3000, sources: [] }],
      lastCurrencyBySource: new Map([['Alpha', 'EUR'], ['Beta', 'EUR']]),
    });
    const alpha = screen.getByLabelText(/Value for Alpha/i);
    fireEvent.keyDown(alpha, { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByLabelText(/Value for Beta/i));
    expect(addMeasurement).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText(/Value for Beta/i), { key: 'Enter' });
    expect(addMeasurement).toHaveBeenCalledOnce();
  });
});

describe('AddMeasurementModal — draft persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists in-progress entries to localStorage and restores them on next open (guest)', async () => {
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

  it('does NOT write the draft to localStorage for authed users (cloud-only contract)', async () => {
    setup(true, { ...singleSourceSeed('Savings'), authed: true });
    fireEvent.change(screen.getByLabelText(/Value for Savings/i), { target: { value: '9999' } });
    // Settle pending effects so the draft-persistence useEffect has run.
    await waitFor(() => {
      const valueInput = screen.getByLabelText(/Value for Savings/i) as HTMLInputElement;
      expect(valueInput.value).toBe('9999');
    });
    // Plaintext draft must not have been persisted.
    expect(window.localStorage.getItem('add-measurement-draft')).toBeNull();
  });

  it('ignores a stale guest-era draft when opening as an authed user', async () => {
    // Seed a guest draft into localStorage from a previous session.
    window.localStorage.setItem(
      'add-measurement-draft',
      JSON.stringify({ date: '2026-01-15', entries: { 'Savings': '7777' } }),
    );
    setup(true, { ...singleSourceSeed('Savings'), authed: true });
    // The stale draft must not replay; the row falls back to the carried-
    // forward last value instead.
    const valueInput = screen.getByLabelText(/Value for Savings/i) as HTMLInputElement;
    expect(valueInput.value).not.toBe('7777');
    expect(valueInput.value).toBe('5000');
  });
});

describe('AddMeasurementModal — empty delta', () => {
  it('does not show a -100% delta on a row with no value entered', () => {
    setup(true, singleSourceSeed('Savings'));
    // Pre-fix, the row would render "-100%" because parseLocalizedNumber('')
    // returned 0 → delta = -lastValue. The delta cell should fall back to the
    // CSS placeholder ("—") instead.
    expect(screen.queryByText(/-?100\.0%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/−\s?100\.0%/)).not.toBeInTheDocument();
  });

  it('row delta column shows the is-empty class once a carried value is cleared', () => {
    setup(true, singleSourceSeed('Savings'));
    const delta = document.querySelector('.q-src-row-delta');
    // Carry-forward seeds the row with its last value, so the cell starts
    // filled (delta 0%). Clearing it returns the cell to the placeholder.
    fireEvent.change(screen.getByLabelText(/Value for Savings/i), { target: { value: '' } });
    expect(delta?.classList.contains('is-empty')).toBe(true);
    expect(delta?.classList.contains('is-neg')).toBe(false);

    fireEvent.change(screen.getByLabelText(/Value for Savings/i), { target: { value: '5500' } });
    expect(delta?.classList.contains('is-empty')).toBe(false);
    expect(delta).toHaveTextContent('+€500');
  });

  it('a carried row shows no change figure until it is edited', () => {
    setup(true, singleSourceSeed('Savings'));
    expect(document.querySelector('.q-src-row-delta')).toHaveTextContent('');
  });
});

describe('AddMeasurementModal — paused sources', () => {
  function multiSeed() {
    return {
      data: {
        facts: [
          { date: new Date(2024, 0, 1), idSource: 'Active Pot', sourceVl: 1000, currency: 'EUR' },
          { date: new Date(2024, 0, 1), idSource: 'Old Account', sourceVl: 500, currency: 'EUR' },
        ],
        refSources: [
          { idSource: 'Active Pot', volatType: 'stable', transferableInDays: true },
          { idSource: 'Old Account', volatType: 'stable', transferableInDays: true, isPaused: true },
        ],
      },
      allSnapshots: [{ date: new Date(2024, 0, 1), total: 1500, sources: [] }],
      lastCurrencyBySource: new Map([['Active Pot', 'EUR'], ['Old Account', 'EUR']]),
    };
  }

  it('paused sources are excluded from the modal rows', () => {
    setup(true, multiSeed());
    expect(screen.getByText('Active Pot')).toBeInTheDocument();
    expect(screen.queryByText('Old Account')).not.toBeInTheDocument();
  });

  it('source count reflects only active (non-paused) sources', () => {
    setup(true, multiSeed());
    // The one active source is carried (unchanged) on open and the paused
    // source is excluded entirely.
    expect(screen.getByTestId('composer-count')).toHaveTextContent('0 changed, 1 unchanged');
  });
});

describe('AddMeasurementModal — category dropdown', () => {
  it('the new-source form shows a Category select seeded with the canonical categories', () => {
    setup(true, singleSourceSeed());
    openNewSourceForm();
    const select = screen.getByLabelText(/Source category/i) as HTMLSelectElement;
    const values = Array.from(select.options).map(o => o.value);
    expect(values).toEqual(expect.arrayContaining([
      'Bank', 'Savings', 'Brokerage', 'Crypto', 'Pension', 'Real estate',
      'P2P & crowdfunding', 'Insurance & capitalisation', 'Alternative',
      'Liability', 'Other',
    ]));
  });

  it('selected category flows through to addMeasurement on save', async () => {
    const { addMeasurement } = setup(true, singleSourceSeed());
    openNewSourceForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bitcoin' } });
    fireEvent.change(screen.getByLabelText(/Source category/i), { target: { value: 'Crypto' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /^add source$/i }));
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));
    await waitFor(() => {
      expect(addMeasurement).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ name: 'Bitcoin', category: 'Crypto' }),
      ]));
    });
  });
});

describe('AddMeasurementModal — unique source name', () => {
  function seedWithName(name: string) {
    return {
      data: {
        facts: [{ date: new Date(2024, 0, 1), idSource: name, sourceVl: 5000, currency: 'EUR' }],
        refSources: [{ idSource: name, volatType: 'stable', transferableInDays: true }],
      },
      allSnapshots: [{ date: new Date(2024, 0, 1), total: 5000, sources: [] }],
      lastCurrencyBySource: new Map([[name, 'EUR']]),
    };
  }

  it('blocks creating a new source whose name matches an existing one (case-insensitive)', () => {
    setup(true, seedWithName('Santander Savings'));
    openNewSourceForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'SANTANDER savings' } });
    expect(screen.getByRole('button', { name: /^add source$/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
  });

  it('blocks duplicate names even when the existing source is paused', () => {
    const data = {
      facts: [{ date: new Date(2024, 0, 1), idSource: 'Old Pot', sourceVl: 100, currency: 'EUR' }],
      refSources: [{ idSource: 'Old Pot', volatType: 'stable', transferableInDays: true, isPaused: true }],
    };
    setup(true, {
      data,
      allSnapshots: [{ date: new Date(2024, 0, 1), total: 100, sources: [] }],
      lastCurrencyBySource: new Map([['Old Pot', 'EUR']]),
    });
    openNewSourceForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'old pot' } });
    expect(screen.getByRole('button', { name: /^add source$/i })).toBeDisabled();
  });

  it('allows a name that differs from every existing source', () => {
    setup(true, seedWithName('Santander Savings'));
    openNewSourceForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Revolut' } });
    expect(screen.getByRole('button', { name: /^add source$/i })).toBeEnabled();
  });
});
