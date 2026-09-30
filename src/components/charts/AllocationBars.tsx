interface AllocationBarItem {
  name: string;
  value: number;
}

interface AllocationBarsProps {
  data: AllocationBarItem[];
  fmt: (v: number) => string;
  /** Optional ceiling for bar widths. Defaults to the dataset total. */
  max?: number;
  /** Per-item colour (sources); omitted for ordinal groups, which stay neutral. */
  colorOf?: (name: string) => string;
  /** Share formatter; defaults to one decimal. */
  fmtPct?: (v: number) => string;
}

/** Ruled rows with a 4px bar under each; the bar is the only mark, no track. */
export function AllocationBars({ data, fmt, max, colorOf, fmtPct = (v) => `${v.toFixed(1)}%` }: AllocationBarsProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const ceiling = max ?? total ?? 1;
  if (!data.length) return null;

  return (
    <ul className="q-rows">
      {data.map((d) => {
        const pct = ceiling > 0 ? (d.value / ceiling) * 100 : 0;
        const sharePct = total > 0 ? (d.value / total) * 100 : 0;
        return (
          <li key={d.name} className="q-row">
            <span className="q-row-name">{d.name}</span>
            <span className="q-row-val num">{fmt(d.value)}</span>
            <span className="q-row-val q-row-val--muted num">{fmtPct(sharePct)}</span>
            <span
              className="q-bar"
              aria-hidden="true"
              style={{ width: `${Math.max(1, pct)}%`, background: colorOf ? colorOf(d.name) : 'var(--fg-subtle)' }}
            />
          </li>
        );
      })}
    </ul>
  );
}
