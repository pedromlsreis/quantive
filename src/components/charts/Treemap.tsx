import { useEffect, useMemo, useRef, useState } from 'react';

interface TreemapItem {
  id?: string;
  name: string;
  value: number;
  [key: string]: unknown;
}

interface Cell extends TreemapItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Binary slice-and-dice layout. Splits use ratios (leftSum / sum) at every
// level, so absolute values don't need rescaling.
function binaryLayout(items: TreemapItem[], x: number, y: number, w: number, h: number): Cell[] {
  const result: Cell[] = [];

  function rec(arr: TreemapItem[], x: number, y: number, w: number, h: number, horizontal: boolean) {
    if (arr.length === 0) return;
    if (arr.length === 1) {
      result.push({ ...arr[0], x, y, w, h });
      return;
    }
    const sum = arr.reduce((s, it) => s + it.value, 0);
    const half = sum / 2;
    let acc = 0, splitIdx = 0;
    for (let i = 0; i < arr.length; i++) {
      acc += arr[i].value;
      if (acc >= half) { splitIdx = Math.max(1, i + 1); break; }
    }
    const left = arr.slice(0, splitIdx);
    const right = arr.slice(splitIdx);
    const ratio = left.reduce((s, it) => s + it.value, 0) / sum;
    if (horizontal) {
      const lw = w * ratio;
      rec(left, x, y, lw, h, !horizontal);
      rec(right, x + lw, y, w - lw, h, !horizontal);
    } else {
      const lh = h * ratio;
      rec(left, x, y, w, lh, !horizontal);
      rec(right, x, y + lh, w, h - lh, !horizontal);
    }
  }

  rec(items, x, y, w, h, w >= h);
  return result;
}

interface TreemapProps {
  data: TreemapItem[];
  /** Initial layout width; the tiles re-lay out to the container's width. */
  width?: number;
  height?: number;
  fmt?: (v: number) => string;
  /** Colour for a source; tiles are a tint of it with a full-colour top edge. */
  colorOf?: (name: string) => string;
}

/**
 * Sources as tinted tiles sized by value. Calm by design: a 22% tint of the
 * source's colour, a 3px edge in the colour itself, ink labels only where
 * they fit. The allocations table on the same page is its text twin.
 */
export function Treemap({ data, width: initialWidth = 720, height = 280, fmt, colorOf = () => 'var(--series-other)' }: TreemapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initialWidth);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || initialWidth));
    ro.observe(el);
    setWidth(el.clientWidth || initialWidth);
    return () => ro.disconnect();
  }, [initialWidth]);

  const sorted = useMemo(() => [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value), [data]);
  const layout = useMemo(() => binaryLayout(sorted, 0, 0, width, height), [sorted, width, height]);
  const total = sorted.reduce((s, d) => s + d.value, 0);

  if (!sorted.length) return null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height }} onPointerLeave={() => setHovered(null)}>
      {layout.map((c) => {
        const key = c.id ?? c.name;
        const color = colorOf(c.name);
        const pct = (c.value / total) * 100;
        const valueLabel = fmt ? fmt(c.value) : `${pct.toFixed(1)}%`;
        const showLabel = c.w >= 88 && c.h >= 44;
        const showValue = showLabel && c.h >= 64;
        return (
          <div
            key={key}
            role="img"
            aria-label={`${c.name}: ${valueLabel}, ${pct.toFixed(1)}% of assets`}
            title={`${c.name}: ${valueLabel} (${pct.toFixed(1)}%)`}
            onPointerEnter={() => setHovered(key)}
            style={{
              position: 'absolute',
              left: c.x, top: c.y, width: c.w, height: c.h,
              padding: 1,
            }}
          >
            <div
              style={{
                position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
                borderRadius: 2,
                borderTop: `3px solid ${color}`,
                background: `color-mix(in oklab, ${color} ${hovered === key ? 32 : 22}%, var(--bg))`,
              }}
            >
              {showLabel && (
                <div style={{
                  position: 'absolute', top: 8, left: 10, right: 10,
                  color: 'var(--fg)', fontSize: 12, fontWeight: 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{c.name}</div>
              )}
              {showValue && (
                <div className="num" style={{
                  position: 'absolute', bottom: 8, left: 10, right: 10,
                  color: 'var(--fg-muted)', fontSize: 12, fontFamily: 'var(--font-mono)',
                }}>{valueLabel}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
