import { Sparkles } from 'lucide-react';

export function FreshStartNudge() {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Great start!</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add measurements on different days (monthly works well) to unlock trends, forecasts, and year-over-year comparisons.
          </p>
        </div>
      </div>
    </div>
  );
}
