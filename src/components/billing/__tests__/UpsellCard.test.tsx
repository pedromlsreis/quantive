import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { proGateHit } = vi.hoisted(() => ({ proGateHit: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  analytics: { proGateHit },
}));

import { UpsellCard } from '../UpsellCard';
import type { Entitlement } from '@/lib/billing/plans';

beforeEach(() => {
  proGateHit.mockClear();
});

function renderCard(feature: Entitlement, compact = false) {
  return render(
    <MemoryRouter>
      <UpsellCard feature={feature} compact={compact} />
    </MemoryRouter>,
  );
}

describe('UpsellCard', () => {
  it.each<[Entitlement, RegExp]>([
    ['history.full',    /full history/i],
    ['forecasting',     /forecast where/i],
    ['export.excel',    /export to excel/i],
    ['export.csv',      /export to csv/i],
    ['export.pdf',      /wealth report pdf/i],
    ['milestones',      /milestones/i],
    ['benchmarks',      /full benchmark history/i],
    ['support.priority',/priority support/i],
  ])('renders the canonical copy for feature %s', (feature, titlePattern) => {
    renderCard(feature);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(titlePattern);
  });

  it('links the CTA to /pricing', () => {
    renderCard('forecasting');
    const cta = screen.getByRole('link', { name: /upgrade to pro/i });
    expect(cta.getAttribute('href')).toBe('/pricing');
  });

  it('fires proGateHit analytics when the CTA is clicked', () => {
    renderCard('benchmarks');
    fireEvent.click(screen.getByRole('link', { name: /upgrade to pro/i }));
    expect(proGateHit).toHaveBeenCalledTimes(1);
    expect(proGateHit).toHaveBeenCalledWith({ feature: 'benchmarks' });
  });

  it('applies the compact padding modifier when compact=true', () => {
    const { container } = renderCard('export.pdf', true);
    expect(container.querySelector('.q-card--p-md')).not.toBeNull();
    expect(container.querySelector('.q-card--p-lg')).toBeNull();
  });

  it('applies the default large padding modifier when compact is omitted', () => {
    const { container } = renderCard('export.pdf');
    expect(container.querySelector('.q-card--p-lg')).not.toBeNull();
    expect(container.querySelector('.q-card--p-md')).toBeNull();
  });
});
