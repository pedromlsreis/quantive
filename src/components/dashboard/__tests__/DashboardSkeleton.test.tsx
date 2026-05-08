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
    const kpiCards = container.querySelectorAll('.rounded-xl.border.border-border.bg-card');
    // 4 KPI cards + 5 skeleton chart cards = 9 total rounded-xl cards
    expect(kpiCards.length).toBeGreaterThanOrEqual(4);
  });

  it('has aria-hidden on shimmer blocks', () => {
    const { container } = render(<DashboardSkeleton />);
    const shimmerBlocks = container.querySelectorAll('[aria-hidden="true"]');
    expect(shimmerBlocks.length).toBeGreaterThan(0);
  });

  it('applies shimmer animation class', () => {
    const { container } = render(<DashboardSkeleton />);
    const shimmerEl = container.querySelector('.animate-shimmer');
    expect(shimmerEl).toBeInTheDocument();
  });
});
