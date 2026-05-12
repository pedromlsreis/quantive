function Skel({ w, h, r }: { w?: number | string; h?: number | string; r?: number }) {
  return (
    <div
      className="q-skeleton"
      aria-hidden="true"
      style={{
        width: typeof w === 'number' ? w : (w ?? '100%'),
        height: typeof h === 'number' ? h : (h ?? 16),
        borderRadius: r ?? 'var(--r-2)',
      }}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' }} role="status" aria-label="Loading dashboard">
      {/* KPI row */}
      <div className="q-grid q-grid--kpi">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="q-card q-card--p-lg" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skel w={80} h={10} />
            <Skel w="60%" h={32} r={4} />
            <Skel w={100} h={10} />
          </div>
        ))}
      </div>

      {/* Chart cards */}
      {[320, 300, 280].map((h, i) => (
        <div key={i} className="q-card q-card--p-lg" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Skel w={120} h={14} />
            <Skel w={80} h={24} r={6} />
          </div>
          <Skel w="100%" h={h} r={8} />
        </div>
      ))}
    </div>
  );
}
