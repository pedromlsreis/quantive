import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/PortfolioContext', () => ({ usePortfolio: vi.fn() }));
vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ currency: { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE' } }),
}));
vi.mock('@/contexts/PreferencesContext', () => ({ usePreferences: () => ({ numberLocale: 'en-GB' }) }));

import { usePortfolio } from '@/contexts/PortfolioContext';
import { NetWorthHero } from '../NetWorthHero';
import { SNAPSHOT_SAVED_EVENT } from '@/lib/appEvents';

const snaps = (latest: number) => [
  { date: new Date(2026, 7, 1), total: 1000, sources: [] },
  { date: new Date(2026, 8, 1), total: latest, sources: [] },
];

function renderWith(latest: number) {
  vi.mocked(usePortfolio).mockReturnValue({ allSnapshots: snaps(latest) } as unknown as ReturnType<typeof usePortfolio>);
  return (
    <MemoryRouter>
      <NetWorthHero />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('NetWorthHero — the save announcement', () => {
  it('announces a save that changed the total', () => {
    const { rerender } = render(renderWith(1200));
    act(() => { window.dispatchEvent(new Event(SNAPSHOT_SAVED_EVENT)); });
    rerender(renderWith(1500));
    expect(screen.getByRole('status')).toHaveTextContent('Saved. Net worth €1,500, +€500 since 1 Aug.');
  });

  it('announces an unchanged save, then stays quiet when the figure later changes for another reason', () => {
    const { rerender } = render(renderWith(1200));
    act(() => {
      window.dispatchEvent(new Event(SNAPSHOT_SAVED_EVENT));
      vi.runAllTimers();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saved. Net worth €1,200, +€200 since 1 Aug.');
    // A currency switch or decrypt re-renders with a new figure: not a save.
    rerender(renderWith(1300));
    expect(screen.getByRole('status')).toHaveTextContent('Saved. Net worth €1,200');
    expect(document.querySelector('.q-roll-ch.is-new')).toBeNull();
  });
});
