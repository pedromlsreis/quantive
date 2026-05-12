interface AllocationBarItem {
  name: string;
  value: number;
}

interface AllocationBarsProps {
  data: AllocationBarItem[];
  fmt: (v: number) => string;
  /** Optional ceiling for bar widths. Defaults to the dataset total. */
  max?: number;
}

export function AllocationBars({ data, fmt, max }: AllocationBarsProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const ceiling = max ?? total ?? 1;
  if (!data.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map((d, i) => {
        const pct = ceiling > 0 ? (d.value / ceiling) * 100 : 0;
        const sharePct = total > 0 ? (d.value / total) * 100 : 0;
        return (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.name}
                </span>
                <span style={{
                  color: 'var(--fg-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 11,
                  flexShrink: 0,
                  marginLeft: 8,
                }}>
                  {fmt(d.value)}
                  <span style={{ color: 'var(--fg-faint)', marginLeft: 8 }}>
                    {sharePct.toFixed(1)}%
                  </span>
                </span>
              </div>
              <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: 'var(--surface-strong)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: `var(--series-${(i % 8) + 1})`,
                    width: `${pct}%`,
                    borderRadius: 2,
                    animation: `q-bar-grow 800ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms backwards`,
                    transformOrigin: 'left center',
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
