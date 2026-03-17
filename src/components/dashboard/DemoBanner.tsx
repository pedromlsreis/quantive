import { FlaskConical } from 'lucide-react';

export function DemoBanner() {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 shadow-lg backdrop-blur-sm">
        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        <span className="whitespace-nowrap text-xs font-medium tracking-wide text-amber-300">
          Demo data — figures shown are illustrative only
        </span>
      </div>
    </div>
  );
}
