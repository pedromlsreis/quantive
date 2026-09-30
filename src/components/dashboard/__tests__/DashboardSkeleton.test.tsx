import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DashboardSkeleton } from '../DashboardSkeleton';

afterEach(() => {
  vi.useRealTimers();
});

describe('DashboardSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it('stays hidden for the first 300ms so a fast decrypt never flashes it', () => {
    vi.useFakeTimers();
    render(<DashboardSkeleton />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading your overview');
  });

  it('mirrors the overview: page head, hero and chart section', () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container.querySelector('.q-page-head')).toBeInTheDocument();
    expect(container.querySelector('.q-hero')).toBeInTheDocument();
    expect(container.querySelector('.q-sec')).toBeInTheDocument();
  });

  it('hides the placeholder blocks from assistive tech', () => {
    const { container } = render(<DashboardSkeleton />);
    const blocks = container.querySelectorAll('.q-skeleton');
    expect(blocks.length).toBeGreaterThan(0);
    blocks.forEach((b) => expect(b).toHaveAttribute('aria-hidden', 'true'));
  });
});
