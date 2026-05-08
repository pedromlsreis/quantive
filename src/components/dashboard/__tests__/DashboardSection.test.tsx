import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardSection } from '../DashboardSection';

describe('DashboardSection', () => {
  it('renders title and children when open', () => {
    render(
      <DashboardSection id="test" title="Performance">
        <div>Chart content</div>
      </DashboardSection>
    );
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Chart content')).toBeInTheDocument();
  });

  it('is expanded by default', () => {
    render(
      <DashboardSection id="test" title="Section">
        <div>Child</div>
      </DashboardSection>
    );
    const btn = screen.getByRole('button', { name: /section/i });
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('can start collapsed when defaultOpen=false', () => {
    render(
      <DashboardSection id="test" title="Section" defaultOpen={false}>
        <div>Child</div>
      </DashboardSection>
    );
    const btn = screen.getByRole('button', { name: /section/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles aria-expanded when clicked', () => {
    render(
      <DashboardSection id="test" title="Section">
        <div>Child</div>
      </DashboardSection>
    );
    const btn = screen.getByRole('button', { name: /section/i });
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('button has aria-controls pointing to content id', () => {
    render(
      <DashboardSection id="perf" title="Performance">
        <div>Content</div>
      </DashboardSection>
    );
    const btn = screen.getByRole('button', { name: /performance/i });
    expect(btn).toHaveAttribute('aria-controls', 'perf-content');
  });

  it('title uses uppercase tracking text', () => {
    render(
      <DashboardSection id="test" title="Milestones">
        <span />
      </DashboardSection>
    );
    const heading = screen.getByText('Milestones');
    expect(heading.tagName).toBe('H2');
  });
});
