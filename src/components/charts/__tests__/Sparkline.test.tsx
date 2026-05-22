import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from '../Sparkline';

// Sparkline is a tiny SVG path generator + last-point dot. The shape under
// test is pure: same input -> same `d` attribute. We assert the structural
// invariants (M/L commands count, point bounds, dot placement) rather than
// pin a single string, so refactors that preserve the geometry still pass.

function parsePathPoints(d: string): [number, number][] {
  // Splits "M 0.0 12.5 L 10.0 13.0 ..." into [[0, 12.5], [10, 13], ...].
  const tokens = d.split(/\s+/).filter(Boolean);
  const pts: [number, number][] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'M' || tokens[i] === 'L') {
      pts.push([parseFloat(tokens[i + 1]), parseFloat(tokens[i + 2])]);
      i += 2;
    }
  }
  return pts;
}

describe('Sparkline', () => {
  it('renders nothing for an empty values array', () => {
    const { container } = render(<Sparkline values={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders an SVG with a single path and a circle marker', () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 4]} />);
    const svg = container.querySelector('svg')!;
    expect(svg).not.toBeNull();
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    expect(svg.querySelectorAll('circle')).toHaveLength(1);
  });

  it('produces one M command followed by N-1 L commands for N points', () => {
    const { container } = render(<Sparkline values={[10, 20, 30, 40, 50]} />);
    const d = container.querySelector('path')!.getAttribute('d')!;
    const pts = parsePathPoints(d);
    expect(pts).toHaveLength(5);
    expect(d.startsWith('M')).toBe(true);
    // L appears exactly N-1 times.
    expect((d.match(/\bL\b/g) ?? []).length).toBe(4);
  });

  it('keeps every plotted Y coordinate inside the [0, height] band', () => {
    const { container } = render(<Sparkline values={[5, 1, 9, 3, 7]} width={80} height={24} />);
    const pts = parsePathPoints(container.querySelector('path')!.getAttribute('d')!);
    for (const [, y] of pts) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(24);
    }
  });

  it('places the trailing circle at the last computed point', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} width={60} height={20} />);
    const pts = parsePathPoints(container.querySelector('path')!.getAttribute('d')!);
    const circle = container.querySelector('circle')!;
    const cx = parseFloat(circle.getAttribute('cx')!);
    const cy = parseFloat(circle.getAttribute('cy')!);
    expect(cx).toBeCloseTo(pts[pts.length - 1][0], 1);
    expect(cy).toBeCloseTo(pts[pts.length - 1][1], 1);
  });

  it('paints with the positive color by default and switches to negative when prop is false', () => {
    const positive = render(<Sparkline values={[1, 2, 3]} />);
    expect(positive.container.querySelector('path')!.getAttribute('stroke')).toMatch(/positive/);

    const negative = render(<Sparkline values={[3, 2, 1]} positive={false} />);
    expect(negative.container.querySelector('path')!.getAttribute('stroke')).toMatch(/negative/);
  });

  it('handles a constant series (max === min) without dividing by zero', () => {
    // The implementation guards against zero-range with `Math.max(1, max-min)`
    // so the chart still renders — every Y collapses to a single horizontal
    // band but no NaN/Infinity appears.
    const { container } = render(<Sparkline values={[42, 42, 42, 42]} />);
    const pts = parsePathPoints(container.querySelector('path')!.getAttribute('d')!);
    for (const [, y] of pts) {
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it('handles a single-point series gracefully', () => {
    const { container } = render(<Sparkline values={[100]} width={50} height={10} />);
    const path = container.querySelector('path')!.getAttribute('d')!;
    expect(path).toMatch(/^M /);
    // No L commands when only one point.
    expect((path.match(/\bL\b/g) ?? []).length).toBe(0);
  });
});
