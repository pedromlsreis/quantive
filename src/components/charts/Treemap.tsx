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

// Binary slice-and-dice layout (locked per design spec).
// Splits use ratios (leftSum / sum) at every level, so absolute values
// don't need rescaling — preserving the original value lets us render it.
function binaryLayout(items: TreemapItem[], x: number, y: number, w: number, h: number): Cell[] {
  const result: Cell[] = [];
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

  rec(items, x, y, w, h, w >= h);
  return result;
}

interface TreemapProps {
  data: TreemapItem[];
  width?: number;
  height?: number;
  fmt?: (v: number) => string;
}

export function Treemap({ data, width = 700, height = 360, fmt }: TreemapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  const sorted = useMemo(() => [...data].filter(d => d.value > 0).sort((a, b) => b.value - a.value), [data]);
  const layout = useMemo(() => binaryLayout(sorted, 0, 0, width, height), [sorted, width, height]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const total = sorted.reduce((s, d) => s + d.value, 0);
  const hoveredCell = hovered ? layout.find((c) => (c.id ?? c.name) === hovered) : null;

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
      onPointerLeave={() => { setHovered(null); setCursor(null); }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setCursor({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        });
      }}
    >
      {layout.map((c) => {
        const key = c.id ?? c.name;
        const isHovered = hovered === key;
        const colorVar = `var(--series-${(c.idx % 8) + 1})`;
        const pct = (c.value / total) * 100;
        const showLabel = c.w > 70 && c.h > 40;
        const showValue = c.w > 90 && c.h > 60;

        const valueLabel = fmt ? fmt(c.value) : `${pct.toFixed(1)}%`;
        const ariaLabel = `${c.name}: ${valueLabel} (${pct.toFixed(1)}% of total)`;

        return (
          <div
            key={key}
            role="img"
            aria-label={ariaLabel}
            onPointerEnter={() => setHovered(key)}
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
                <div className="num" style={{
                  position: 'absolute', bottom: 10, left: 12, right: 12,
                  color: 'oklch(98% 0 0 / 0.85)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {valueLabel}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {hoveredCell && cursor && (() => {
        const pct = (hoveredCell.value / total) * 100;
        const valueLabel = fmt ? fmt(hoveredCell.value) : `${pct.toFixed(1)}%`;
        const flipX = cursor.x > 70;
        const flipY = cursor.y > 80;
        return (
          <div
            role="tooltip"
            style={{
              position: 'absolute',
              left: `${cursor.x}%`,
              top: `${cursor.y}%`,
              transform: `translate(${flipX ? 'calc(-100% - 12px)' : '12px'}, ${flipY ? 'calc(-100% - 12px)' : '12px'})`,
              pointerEvents: 'none',
              zIndex: 10,
              background: 'var(--surface-1, oklch(18% 0.005 250))',
              color: 'var(--fg, oklch(98% 0 0))',
              border: '1px solid oklch(100% 0 0 / 0.08)',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.35,
              boxShadow: '0 8px 24px oklch(0% 0 0 / 0.35)',
              whiteSpace: 'nowrap',
              maxWidth: 240,
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 2 }}>{hoveredCell.name}</div>
            <div style={{ color: 'var(--fg-muted, oklch(70% 0 0))', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              <span className="num">{valueLabel}</span> <span style={{ color: 'var(--fg-faint, oklch(55% 0 0))' }}>· {pct.toFixed(1)}%</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
