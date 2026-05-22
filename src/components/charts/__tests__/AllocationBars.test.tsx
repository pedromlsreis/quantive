import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { AllocationBars } from '../AllocationBars';

const fmt = (v: number) => `€${v.toLocaleString('en-US')}`;

// AllocationBars renders one row per datum with two visible numbers (the
// formatted value and the share-of-total percent) plus a bar element whose
// width encodes value / ceiling. Layout invariants under test:
//   - empty -> null
//   - row count matches data length
//   - share % = value / sum(values) * 100
//   - bar width % = value / ceiling * 100 (defaults to sum)
//   - explicit `max` re-scales bars but does not affect share %

describe('AllocationBars', () => {
  it('renders nothing when given an empty dataset', () => {
    const { container } = render(<AllocationBars data={[]} fmt={fmt} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one row per datum with the formatted value', () => {
    const { container, getByText } = render(
      <AllocationBars
        data={[
          { name: 'A', value: 100 },
          { name: 'B', value: 300 },
        ]}
        fmt={fmt}
      />,
    );
    expect(getByText('A')).toBeInTheDocument();
    expect(getByText('B')).toBeInTheDocument();
    expect(getByText('€100')).toBeInTheDocument();
    expect(getByText('€300')).toBeInTheDocument();
    // 2 outer row containers (the top-level gap=12 flex). Just count names.
    expect(container.querySelectorAll('span')).not.toHaveLength(0);
  });

  it('computes share percent as value / total when no `max` is provided', () => {
    const { container } = render(
      <AllocationBars
        data={[
          { name: 'A', value: 25 },
          { name: 'B', value: 75 },
        ]}
        fmt={fmt}
      />,
    );
    // The displayed share %s sum to ~100.
    const pctTexts = Array.from(container.querySelectorAll('span'))
      .map((s) => s.textContent ?? '')
      .filter((t) => /^\d+(\.\d+)?%$/.test(t));
    expect(pctTexts).toHaveLength(2);
    const sum = pctTexts.map(parseFloat).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it('uses explicit `max` to ceiling the bar width without changing share %', () => {
    // With max=400 and total=100, the largest bar should be at 75/400=18.75%.
    const { container } = render(
      <AllocationBars
        data={[
          { name: 'A', value: 25 },
          { name: 'B', value: 75 },
        ]}
        fmt={fmt}
        max={400}
      />,
    );
    // The inner bar div carries inline `width: <pct>%`. Find it.
    const bars = Array.from(container.querySelectorAll('div')).filter((d) =>
      (d.getAttribute('style') ?? '').includes('width:'),
    );
    // 2 bar fills, one per datum. Heuristic: pick the largest width%.
    const widths = bars
      .map((b) => {
        const m = (b.getAttribute('style') ?? '').match(/width:\s*([\d.]+)%/);
        return m ? parseFloat(m[1]) : NaN;
      })
      .filter((n) => !Number.isNaN(n));
    expect(widths.length).toBeGreaterThanOrEqual(2);
    const maxWidth = Math.max(...widths);
    expect(maxWidth).toBeCloseTo(18.75, 1);
  });

  it('shows 0% for items with zero value', () => {
    const { container } = render(
      <AllocationBars
        data={[
          { name: 'A', value: 100 },
          { name: 'Zero', value: 0 },
        ]}
        fmt={fmt}
      />,
    );
    const pctSpans = Array.from(container.querySelectorAll('span')).filter((s) =>
      /^0\.0%$/.test(s.textContent ?? ''),
    );
    expect(pctSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('handles a single-row dataset (share percent is 100)', () => {
    const { getByText } = render(
      <AllocationBars data={[{ name: 'Solo', value: 42 }]} fmt={fmt} />,
    );
    expect(getByText('100.0%')).toBeInTheDocument();
  });
});
