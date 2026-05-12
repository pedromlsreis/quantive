import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardSkeleton } from '../DashboardSkeleton';

describe('DashboardSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it('has accessible loading status role', () => {
    render(<DashboardSkeleton />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label', 'Loading dashboard');
  });

  it('renders KPI card skeletons (4 of them)', () => {
    const { container } = render(<DashboardSkeleton />);
    // New design system uses q-card class
    const kpiCards = container.querySelectorAll('.q-card');
    // 4 KPI cards + 3 skeleton chart cards = 7 total
    expect(kpiCards.length).toBeGreaterThanOrEqual(4);
  });

  it('has aria-hidden on shimmer blocks', () => {
    const { container } = render(<DashboardSkeleton />);
    const shimmerBlocks = container.querySelectorAll('[aria-hidden="true"]');
    expect(shimmerBlocks.length).toBeGreaterThan(0);
  });

  it('applies shimmer animation class', () => {
    const { container } = render(<DashboardSkeleton />);
    // New design system uses q-skeleton instead of animate-shimmer
    const shimmerEl = container.querySelector('.q-skeleton');
    expect(shimmerEl).toBeInTheDocument();
  });
});
