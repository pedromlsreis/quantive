export function DashboardSkeleton() {
  return (
    <div className="flex flex-col bg-background animate-pulse">
      <DashboardHeaderSkeleton />
      <FilterBarSkeleton />
      <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-8 p-6">
        {/* KPI Cards skeleton */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-5 space-y-3"
              aria-hidden="true"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-20 rounded bg-muted" />
                <div className="h-8 w-8 rounded-lg bg-primary/10" />
              </div>
              <div className="h-7 w-28 rounded bg-muted" />
              <div className="h-3 w-36 rounded bg-muted/50" />
            </div>
          ))}
        </div>

        {/* Net Worth Chart skeleton */}
        <SkeletonCard height={320} />

        {/* Stacked Area Chart skeleton */}
        <SkeletonCard height={350} />

        {/* Allocation section skeleton */}
        <SkeletonCard height={300} />

        {/* Forecast skeleton */}
        <SkeletonCard height={320} />

        {/* Milestones skeleton */}
        <SkeletonCard height={200} />
      </main>
    </div>
  );
}

function SkeletonCard({ height }: { height: number }) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-6 space-y-3"
      aria-hidden="true"
    >
      <div className="h-5 w-40 rounded bg-muted" />
      <div style={{ height }} className="rounded-lg bg-muted/30" />
    </div>
  );
}

function DashboardHeaderSkeleton() {
  return (
    <div
      className="border-b border-border px-6 py-4 flex items-center justify-between"
      aria-hidden="true"
    >
      <div className="h-6 w-32 rounded bg-muted" />
      <div className="flex gap-3">
        <div className="h-9 w-24 rounded-lg bg-muted" />
        <div className="h-9 w-24 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

function FilterBarSkeleton() {
  return (
    <div
      className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3"
      aria-hidden="true"
    >
      <div className="flex items-center gap-3 min-w-[280px]">
        <div className="h-4 w-20 rounded bg-muted" />
        <div className="flex-1 h-9 rounded-lg bg-muted" />
        <div className="h-4 w-20 rounded bg-muted" />
      </div>
      <div className="h-6 w-px bg-border" />
      <div className="h-9 w-24 rounded-lg bg-muted" />
      <div className="h-6 w-px bg-border" />
      <div className="h-9 w-28 rounded-lg bg-muted" />
    </div>
  );
}
