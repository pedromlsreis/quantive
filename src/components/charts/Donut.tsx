interface DonutDatum {
  name: string;
  value: number;
}

interface DonutProps {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
}

export function Donut({ data, size = 160, thickness = 22 }: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - thickness / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -Math.PI / 2;

  const arcs = data.map((d, i) => {
    const a0 = angle;
    const a1 = angle + (d.value / total) * Math.PI * 2;
    angle = a1;
    const gap = 0.018;
    const sa = a0 + gap;
    const ea = a1 - gap;
    const x0 = cx + r * Math.cos(sa);
    const y0 = cy + r * Math.sin(sa);
    const x1 = cx + r * Math.cos(ea);
    const y1 = cy + r * Math.sin(ea);
    const large = ea - sa > Math.PI ? 1 : 0;
    return {
      d: `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      color: `var(--series-${(i % 8) + 1})`,
      name: d.name,
    };
  });

  return (
    <svg width={size} height={size}>
      {arcs.map((a, i) => (
        <path
          key={i}
          d={a.d}
          stroke={a.color}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          style={{ animation: `q-arc-in 600ms cubic-bezier(0.22,1,0.36,1) ${i * 80}ms backwards` }}
        />
      ))}
    </svg>
  );
}
