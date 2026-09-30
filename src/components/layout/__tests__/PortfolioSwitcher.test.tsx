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
const createPortfolio = vi.fn(async () => true);

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
    createPortfolio,
    renamePortfolio: vi.fn(),
    deletePortfolio: vi.fn(),
  }),
}));

import { PortfolioSwitcher } from '../PortfolioSwitcher';
import { PortfolioSettings } from '@/components/settings/PortfolioSettings';

const joint: ExtraPortfolioMeta = { id: 'p1', name: 'Joint', ownerId: 'u1', revision: 1, keyEpoch: 1 };

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

describe('PortfolioSettings', () => {
  it('renders nothing without Family or extra portfolios', () => {
    const { container } = renderIn(<PortfolioSettings />);
    expect(container).toBeEmptyDOMElement();
  });

  it('creates a portfolio from the name field', async () => {
    state.hasFamily = true;
    renderIn(<PortfolioSettings />);
    fireEvent.change(screen.getByLabelText('New portfolio'), { target: { value: 'Company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(createPortfolio).toHaveBeenCalledWith('Company'));
  });

  it('offers delete only to the owner', () => {
    state.hasFamily = true;
    state.extraPortfolios = [joint, { ...joint, id: 'p2', name: 'Shared with me', ownerId: 'someone-else' }];
    renderIn(<PortfolioSettings />);
    expect(screen.getByRole('button', { name: 'Delete Joint' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Shared with me' })).toBeNull();
  });

  it('stops offering new portfolios at the limit', () => {
    state.hasFamily = true;
    state.extraPortfolios = Array.from({ length: 5 }, (_, i) => ({ ...joint, id: `p${i}`, name: `P${i}` }));
    renderIn(<PortfolioSettings />);
    expect(screen.queryByLabelText('New portfolio')).toBeNull();
    expect(screen.getByText(/most portfolios allowed/i)).toBeInTheDocument();
  });
});
