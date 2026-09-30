interface SparklineProps {
  /** One value per period; null is a period with no entry (drawn as a gap). */
  values: (number | null)[];
  width?: number;
  height?: number;
  /** Direction of the change over the span; colours the end dot only. */
  tone?: 'pos' | 'neg' | 'zero';
  /** @deprecated use `tone`. */
  positive?: boolean;
}

/**
 * A 12-month shape, not a scale: a neutral line with the end dot carrying the
 * direction. The vertical span is at least 5% of the latest value, so a
 * savings account that moved by pennies draws flat instead of jagged.
 */
export function Sparkline({ values, width = 64, height = 20, tone, positive }: SparklineProps) {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length < 2) return null;
  const latest = present[present.length - 1];
  let min = Math.min(...present);
  let max = Math.max(...present);
  const minSpan = Math.abs(latest) * 0.05 || 1;
  if (max - min < minSpan) {
    const mid = (max + min) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  const xStep = width / Math.max(1, values.length - 1);
  const y = (v: number) => height - 1 - ((v - min) / (max - min)) * (height - 2);

  // Break the path wherever a period is missing.
  let path = '';
  let penDown = false;
  let last: [number, number] | null = null;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) { penDown = false; return; }
    const pt: [number, number] = [i * xStep, y(v)];
    path += `${path ? ' ' : ''}${penDown ? 'L' : 'M'} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`;
    penDown = true;
    last = pt;
  });

  const t = tone ?? (positive === undefined ? 'zero' : positive ? 'pos' : 'neg');
  const dot = t === 'pos' ? 'var(--positive)' : t === 'neg' ? 'var(--negative)' : 'var(--fg-subtle)';

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block' }}>
      <path d={path} fill="none" stroke="var(--fg-subtle)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={2.5} fill={dot} />}
    </svg>
  );
}
