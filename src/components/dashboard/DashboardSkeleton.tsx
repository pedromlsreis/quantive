function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded ${className}`}
      aria-hidden="true"
    />
  );
}

function KPICardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3" aria-hidden="true">
      <div className="flex items-center justify-between">
        <ShimmerBlock className="h-4 w-20" />
        <ShimmerBlock className="h-8 w-8 rounded-lg" />
      </div>
      <ShimmerBlock className="h-7 w-28" />
      <ShimmerBlock className="h-3 w-24 opacity-60" />
    </div>
  );
}

function SkeletonCard({ height }: { height: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4" aria-hidden="true">
      <ShimmerBlock className="h-4 w-36" />
      <div style={{ height }} className="rounded-lg overflow-hidden">
        <ShimmerBlock className="h-full w-full opacity-50" />
      </div>
    </div>
  );
}

function DashboardHeaderSkeleton() {
  return (
    <div
      className="border-b border-border px-6 py-4 flex items-center justify-between"
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <ShimmerBlock className="h-9 w-9 rounded-lg" />
        <div className="space-y-1.5">
          <ShimmerBlock className="h-5 w-24" />
          <ShimmerBlock className="h-3 w-32 opacity-50" />
        </div>
      </div>
      <div className="flex gap-2">
        <ShimmerBlock className="h-9 w-20 rounded-lg" />
        <ShimmerBlock className="h-9 w-9 rounded-lg" />
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
        <ShimmerBlock className="h-4 w-16" />
        <ShimmerBlock className="flex-1 h-2 rounded-full" />
        <ShimmerBlock className="h-4 w-16" />
      </div>
      <ShimmerBlock className="h-6 w-px" />
      <ShimmerBlock className="h-9 w-24 rounded-lg" />
      <ShimmerBlock className="h-6 w-px" />
      <ShimmerBlock className="h-9 w-28 rounded-lg" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col bg-background" role="status" aria-label="Loading dashboard">
      <DashboardHeaderSkeleton />
      <FilterBarSkeleton />
      <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-8 p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <KPICardSkeleton key={i} />
          ))}
        </div>
        <SkeletonCard height={320} />
        <SkeletonCard height={350} />
        <SkeletonCard height={300} />
        <SkeletonCard height={320} />
        <SkeletonCard height={200} />
      </main>
    </div>
  );
}
