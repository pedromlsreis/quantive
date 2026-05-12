interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}

export function Sparkline({ values, width = 80, height = 24, positive = true }: SparklineProps) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xStep = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [
    i * xStep,
    height - ((v - min) / Math.max(1, max - min)) * (height - 2) - 1,
  ] as [number, number]);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const color = positive ? 'var(--positive)' : 'var(--negative)';
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
    </svg>
  );
}
