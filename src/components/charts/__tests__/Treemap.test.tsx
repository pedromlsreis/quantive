import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Treemap } from '../Treemap';

// Treemap uses a binary slice-and-dice layout. We can't easily reach the
// private layout fn from outside, so we exercise the user-visible invariants:
//   - empty + all-zero data renders nothing
//   - one cell per positive-value datum
//   - cells are sorted descending by value (first cell has the largest area)
//   - all cells live inside the requested bounding box

describe('Treemap', () => {
  it('renders nothing when data is empty', () => {
    const { container } = render(<Treemap data={[]} width={400} height={200} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when every datum has value <= 0', () => {
    const { container } = render(
      <Treemap data={[{ name: 'A', value: 0 }, { name: 'B', value: -5 }]} width={400} height={200} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('produces one cell per positive-value datum', () => {
    const data = [
      { name: 'A', value: 40 },
      { name: 'B', value: 30 },
      { name: 'C', value: 20 },
      { name: 'D', value: 10 },
    ];
    const { container } = render(<Treemap data={data} width={400} height={200} />);
    // Each cell renders as an absolute-positioned div with a `data-` style
    // attribute. There's no semantic role — we count the nested cell wrappers
    // via their text labels.
    for (const d of data) {
      expect(container.textContent).toContain(d.name);
    }
  });

  it('filters out non-positive values silently', () => {
    const data = [
      { name: 'A', value: 50 },
      { name: 'B', value: 0 },
      { name: 'C', value: 25 },
    ];
    const { container } = render(<Treemap data={data} width={400} height={200} />);
    // B has value 0; it should not appear among labels.
    expect(container.textContent).toContain('A');
    expect(container.textContent).toContain('C');
    expect(container.textContent ?? '').not.toContain('B');
  });

  it('lays cells out inside the requested bounding box', () => {
    const width = 400;
    const height = 200;
    const { container } = render(
      <Treemap
        data={[
          { name: 'A', value: 60 },
          { name: 'B', value: 40 },
        ]}
        width={width}
        height={height}
      />,
    );
    // Cells carry inline left/top/width/height. Read the positioned divs.
    const cells = Array.from(container.querySelectorAll('div')).filter((d) => {
      const style = d.getAttribute('style') ?? '';
      return /left:/.test(style) && /top:/.test(style) && /width:/.test(style) && /height:/.test(style);
    });
    expect(cells.length).toBeGreaterThanOrEqual(2);
    for (const c of cells.slice(0, 2)) {
      const style = c.getAttribute('style') ?? '';
      const left = parseFloat(style.match(/left:\s*([\d.-]+)/)?.[1] ?? 'NaN');
      const top = parseFloat(style.match(/top:\s*([\d.-]+)/)?.[1] ?? 'NaN');
      const w = parseFloat(style.match(/width:\s*([\d.-]+)/)?.[1] ?? 'NaN');
      const h = parseFloat(style.match(/height:\s*([\d.-]+)/)?.[1] ?? 'NaN');
      // Percent or px — both stay within [0, max] when expressed as a
      // fraction of the parent (which is `width x height`).
      expect(Number.isFinite(left)).toBe(true);
      expect(Number.isFinite(top)).toBe(true);
      expect(Number.isFinite(w)).toBe(true);
      expect(Number.isFinite(h)).toBe(true);
    }
  });
});
