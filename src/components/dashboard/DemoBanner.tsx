import { FlaskConical } from 'lucide-react';

export function DemoBanner() {
  return (
    <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 backdrop-blur-sm">
      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-amber-400" />
      <span className="text-xs font-medium tracking-wide text-amber-300">
        Demo data — figures shown are illustrative only
      </span>
    </div>
  );
}
