import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ExtraPortfolioMeta } from '@/lib/portfolios';

const state = {
  user: { id: 'u1' } as { id: string } | null,
  hasFamily: false,
  activePortfolioId: 'personal',
  extraPortfolios: [] as ExtraPortfolioMeta[],
};
const switchPortfolio = vi.fn(async () => {});

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: () => ({ has: (e: string) => state.hasFamily && e.startsWith('portfolios.') }),
}));
vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: () => ({
    activePortfolioId: state.activePortfolioId,
    activePortfolioName: state.activePortfolioId === 'personal'
      ? 'Personal'
      : state.extraPortfolios.find((p) => p.id === state.activePortfolioId)?.name ?? '',
    extraPortfolios: state.extraPortfolios,
    switchPortfolio,
  }),
}));

import { PortfolioSwitcher } from '../PortfolioSwitcher';

const joint: ExtraPortfolioMeta = { id: 'p1', name: 'Joint', ownerId: 'u1', revision: 1, keyEpoch: 1, rotationDue: false };

function renderIn(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 'u1' };
  state.hasFamily = false;
  state.activePortfolioId = 'personal';
  state.extraPortfolios = [];
});

describe('PortfolioSwitcher', () => {
  it('renders nothing for Free or Pro users without extra portfolios', () => {
    const { container } = renderIn(<PortfolioSwitcher placement="sidebar" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for guests', () => {
    state.user = null;
    state.hasFamily = true;
    const { container } = renderIn(<PortfolioSwitcher placement="sidebar" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the active portfolio and switches to another', async () => {
    state.hasFamily = true;
    state.extraPortfolios = [joint];
    renderIn(<PortfolioSwitcher placement="sidebar" />);

    const trigger = screen.getByRole('button', { name: /portfolio: personal/i });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const option = await screen.findByRole('menuitemradio', { name: 'Joint' });
    expect(screen.getByRole('menuitemradio', { name: 'Personal' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(option);
    await waitFor(() => expect(switchPortfolio).toHaveBeenCalledWith('p1'));
  });

  it('still shows existing portfolios after Family ends', () => {
    state.extraPortfolios = [joint];
    renderIn(<PortfolioSwitcher placement="sidebar" />);
    expect(screen.getByRole('button', { name: /portfolio: personal/i })).toBeInTheDocument();
  });
});
