import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// vi.mock factories are hoisted above top-level `const`s. Use vi.hoisted()
// so the references inside the factories are initialised at hoist time.
const { entitlements, proGateHit } = vi.hoisted(() => ({
  entitlements: { has: (_f: string) => true as boolean },
  proGateHit: vi.fn(),
}));

vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: () => entitlements,
}));

vi.mock('@/lib/analytics', () => ({
  analytics: { proGateHit },
}));

import { FeatureGate } from '../FeatureGate';

beforeEach(() => {
  entitlements.has = () => true;
  proGateHit.mockClear();
});

function renderGate(ui: React.ReactNode) {
  // FeatureGate's fallback is an UpsellCard which renders a <Link>. Wrap in
  // a router so the Link can resolve without crashing.
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('FeatureGate', () => {
  it('renders children when the user has the entitlement', () => {
    entitlements.has = () => true;
    renderGate(
      <FeatureGate feature="forecasting">
        <div data-testid="content">protected content</div>
      </FeatureGate>,
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('does NOT fire the proGateHit analytics event when allowed', () => {
    entitlements.has = () => true;
    renderGate(
      <FeatureGate feature="forecasting">
        <div>ok</div>
      </FeatureGate>,
    );
    expect(proGateHit).not.toHaveBeenCalled();
  });

  it('renders the default UpsellCard fallback when blocked', () => {
    entitlements.has = () => false;
    renderGate(
      <FeatureGate feature="forecasting">
        <div data-testid="content">protected content</div>
      </FeatureGate>,
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /upgrade to pro/i })).toBeInTheDocument();
  });

  it('renders a custom fallback when one is provided', () => {
    entitlements.has = () => false;
    renderGate(
      <FeatureGate feature="export.csv" fallback={<div data-testid="custom-fallback">nope</div>}>
        <div>kept hidden</div>
      </FeatureGate>,
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /upgrade to pro/i })).not.toBeInTheDocument();
  });

  it('fires the proGateHit analytics event exactly once per mount when blocked', () => {
    entitlements.has = () => false;
    renderGate(
      <FeatureGate feature="benchmarks">
        <div>blocked</div>
      </FeatureGate>,
    );
    expect(proGateHit).toHaveBeenCalledTimes(1);
    expect(proGateHit).toHaveBeenCalledWith({ feature: 'benchmarks' });
  });
});
