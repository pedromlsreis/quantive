import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state: { readOnlyReason: 'needs_family' | 'owner_needs_family' | null } = { readOnlyReason: null };

vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: () => state,
  READ_ONLY_MESSAGES: {
    needs_family: 'Editing this portfolio needs the Family plan.',
    owner_needs_family: 'The Family plan that shares this portfolio has ended.',
  },
}));

import { ReadOnlyBanner } from '../ReadOnlyBanner';

const renderBanner = () => render(<MemoryRouter><ReadOnlyBanner /></MemoryRouter>);

beforeEach(() => {
  state.readOnlyReason = null;
});

describe('ReadOnlyBanner', () => {
  it('renders nothing while the portfolio takes edits', () => {
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it('points the owner at the Family plan', () => {
    state.readOnlyReason = 'needs_family';
    renderBanner();
    expect(screen.getByRole('note', { name: 'Read-only portfolio' })).toHaveTextContent('needs the Family plan');
    expect(screen.getByRole('link', { name: 'See the Family plan' })).toHaveAttribute('href', '/pricing#family');
  });

  it("gives a partner no plan to buy: it's the owner's to renew", () => {
    state.readOnlyReason = 'owner_needs_family';
    renderBanner();
    expect(screen.getByRole('note')).toHaveTextContent('has ended');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
