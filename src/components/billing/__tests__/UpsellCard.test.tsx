import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { proUpgradeClicked, proGateHit } = vi.hoisted(() => ({ proUpgradeClicked: vi.fn(), proGateHit: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  analytics: { proUpgradeClicked, proGateHit },
}));

import { ProGate, UpsellCard, type ProFeature } from '../UpsellCard';


beforeEach(() => {
  proUpgradeClicked.mockClear();
  proGateHit.mockClear();
});

function renderGate(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ProGate', () => {
  it.each<[ProFeature, RegExp]>([
    ['history.full',    /your full history/i],
    ['forecasting',     /scenarios and the likely range/i],
    ['export.excel',    /excel workbook/i],
    ['export.csv',      /csv export/i],
    ['export.pdf',      /pdf report/i],
    ['milestones',      /progress for your goals/i],
    ['benchmarks',      /your full history/i],
    ['support.priority',/priority support/i],
  ])('renders the canonical copy for feature %s', (feature, titlePattern) => {
    renderGate(<UpsellCard feature={feature} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(titlePattern);
  });

  it('states the price and links a secondary CTA to /pricing', () => {
    const { container } = renderGate(<ProGate feature="forecasting" />);
    expect(screen.getByText(/€9 a month or €90 a year/)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /upgrade to pro/i });
    expect(cta.getAttribute('href')).toBe('/pricing');
    expect(cta.className).toContain('q-btn--secondary');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('reports one impression per mount and the click', () => {
    renderGate(<ProGate feature="benchmarks" />);
    expect(proGateHit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('link', { name: /upgrade to pro/i }));
    expect(proUpgradeClicked).toHaveBeenCalledWith({ feature: 'benchmarks' });
  });

  it('renders the row form with overridden copy', () => {
    const { container } = renderGate(
      <ProGate feature="history.full" variant="row" title="14 earlier months are saved" body="Shown in Pro." />,
    );
    expect(container.querySelector('.q-gate--row')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('14 earlier months are saved');
  });
});
