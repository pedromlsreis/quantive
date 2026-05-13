import { useEffect, useMemo, useState } from 'react';

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
  idx: number;
}

// Binary slice-and-dice layout (locked per design spec)
function binaryLayout(items: TreemapItem[], x: number, y: number, w: number, h: number): Cell[] {
  const result: Cell[] = [];
  const total = items.reduce((s, it) => s + it.value, 0) || 1;
  let idx = 0;

  function rec(arr: TreemapItem[], x: number, y: number, w: number, h: number, horizontal: boolean) {
    if (arr.length === 0) return;
    if (arr.length === 1) {
      result.push({ ...arr[0], x, y, w, h, idx: idx++ });
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
    const leftSum = left.reduce((s, it) => s + it.value, 0);
    const ratio = leftSum / sum;
    if (horizontal) {
      const lw = w * ratio;
      rec(left,  x,      y, lw,      h, !horizontal);
      rec(right, x + lw, y, w - lw,  h, !horizontal);
    } else {
      const lh = h * ratio;
      rec(left,  x, y,      w, lh,      !horizontal);
      rec(right, x, y + lh, w, h - lh,  !horizontal);
    }
  }

  // Scale items so total area == w*h
  const area = w * h;
  const scaled = items.map(it => ({ ...it, value: it.value * area / total }));
  rec(scaled, x, y, w, h, w >= h);
  return result;
}

interface TreemapProps {
  data: TreemapItem[];
  width?: number;
  height?: number;
}

export function Treemap({ data, width = 700, height = 360 }: TreemapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const sorted = useMemo(() => [...data].filter(d => d.value > 0).sort((a, b) => b.value - a.value), [data]);
  const layout = useMemo(() => binaryLayout(sorted, 0, 0, width, height), [sorted, width, height]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const total = sorted.reduce((s, d) => s + d.value, 0);

  if (!sorted.length) return null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${width}/${height}`,
        overflow: 'hidden',
        borderRadius: 'var(--r-3)',
        background: 'var(--bg)',
      }}
      onMouseLeave={() => setHovered(null)}
    >
      {layout.map((c) => {
        const key = c.id ?? c.name;
        const isHovered = hovered === key;
        const colorVar = `var(--series-${(c.idx % 8) + 1})`;
        const pct = (c.value / total) * 100;
        const showLabel = c.w > 70 && c.h > 40;
        const showValue = c.w > 90 && c.h > 60;

        return (
          <div
            key={key}
            onMouseEnter={() => setHovered(key)}
            style={{
              position: 'absolute',
              left: `${(c.x / width) * 100}%`,
              top: `${(c.y / height) * 100}%`,
              width: `${(c.w / width) * 100}%`,
              height: `${(c.h / height) * 100}%`,
              padding: 2,
              transition: mounted
                ? `left 520ms cubic-bezier(0.22,1,0.36,1), top 520ms cubic-bezier(0.22,1,0.36,1), width 520ms cubic-bezier(0.22,1,0.36,1), height 520ms cubic-bezier(0.22,1,0.36,1), opacity 320ms ${c.idx * 18}ms ease-out`
                : 'none',
              opacity: mounted ? 1 : 0,
              boxSizing: 'border-box',
              cursor: 'pointer',
              zIndex: isHovered ? 5 : 1,
            }}
          >
            <div
              style={{
                width: '100%', height: '100%',
                background: colorVar,
                borderRadius: 6,
                position: 'relative',
                overflow: 'hidden',
                opacity: hovered && !isHovered ? 0.4 : 1,
                transform: isHovered ? 'scale(1.005)' : 'scale(1)',
                transition: 'opacity 200ms ease, transform 240ms cubic-bezier(0.22,1,0.36,1)',
                boxShadow: isHovered
                  ? '0 8px 24px oklch(0% 0 0 / 0.25), inset 0 0 0 1px oklch(100% 0 0 / 0.15)'
                  : 'inset 0 0 0 1px oklch(100% 0 0 / 0.04)',
              }}
            >
              {/* depth gradient overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(135deg, oklch(100% 0 0 / 0.08), oklch(0% 0 0 / 0.1))',
                pointerEvents: 'none',
              }} />

              {showLabel && (
                <div style={{
                  position: 'absolute', top: 10, left: 12, right: 12,
                  color: 'oklch(98% 0 0 / 0.95)',
                  fontSize: 12, fontWeight: 500, letterSpacing: '-0.01em',
                  textShadow: '0 1px 2px oklch(0% 0 0 / 0.2)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{c.name}</div>
              )}

              {showValue && (
                <div style={{
                  position: 'absolute', bottom: 10, left: 12, right: 12,
                  color: 'oklch(98% 0 0 / 0.85)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {pct.toFixed(1)}%
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
