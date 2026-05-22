import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Donut } from '../Donut';

// Donut renders one SVG path per non-zero datum and uses the
// `--series-{1..8}` color tokens, cycling modulo 8 for >8 datums.

describe('Donut', () => {
  it('renders one path per datum', () => {
    const { container } = render(
      <Donut data={[{ name: 'A', value: 1 }, { name: 'B', value: 2 }, { name: 'C', value: 3 }]} />,
    );
    expect(container.querySelectorAll('path')).toHaveLength(3);
  });

  it('respects size and produces an SVG of that dimension', () => {
    const { container } = render(<Donut data={[{ name: 'A', value: 1 }]} size={200} thickness={20} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('200');
    expect(svg.getAttribute('height')).toBe('200');
  });

  it('cycles colors mod 8 for more than 8 slices', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ name: `S${i}`, value: 1 }));
    const { container } = render(<Donut data={items} />);
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(10);
    // 9th slice (index 8) wraps back to --series-1.
    expect(paths[8].getAttribute('stroke')).toBe('var(--series-1)');
    // 10th slice (index 9) -> --series-2.
    expect(paths[9].getAttribute('stroke')).toBe('var(--series-2)');
  });

  it('renders nothing meaningful for a zero-total dataset but does not throw', () => {
    // The hook uses `total || 1` as a divide-by-zero guard. We just verify it
    // renders an empty SVG without errors.
    const { container } = render(<Donut data={[]} />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });

  it('builds arc paths whose endpoints lie on the donut radius', () => {
    // For a single full-slice donut, the arc end-points should sit on the
    // circle of radius r = size/2 - thickness/2 - 2 centred at (size/2, size/2).
    const size = 160;
    const thickness = 22;
    const r = size / 2 - thickness / 2 - 2;
    const { container } = render(
      <Donut data={[{ name: 'Only', value: 1 }]} size={size} thickness={thickness} />,
    );
    const d = container.querySelector('path')!.getAttribute('d')!;
    // Path: "M x0 y0 A r r 0 large 1 x1 y1"
    const m = d.match(/^M\s+([\d.-]+)\s+([\d.-]+)\s+A\s+([\d.-]+)\s+([\d.-]+)\s+0\s+\d\s+1\s+([\d.-]+)\s+([\d.-]+)$/);
    expect(m).not.toBeNull();
    const [, x0, y0, ra, rb, x1, y1] = m!.map(Number);
    expect(ra).toBeCloseTo(r, 1);
    expect(rb).toBeCloseTo(r, 1);
    // Distance from centre to each endpoint equals r.
    const dist = (x: number, y: number) =>
      Math.sqrt((x - size / 2) ** 2 + (y - size / 2) ** 2);
    expect(dist(x0, y0)).toBeCloseTo(r, 1);
    expect(dist(x1, y1)).toBeCloseTo(r, 1);
  });
});
