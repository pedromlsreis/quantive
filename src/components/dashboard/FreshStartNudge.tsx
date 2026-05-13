import { Sparkles } from 'lucide-react';

export function FreshStartNudge() {
  return (
    <div className="q-insight">
      <div className="q-insight-icon">
        <Sparkles size={16} />
      </div>
      <div>
        <p className="q-insight-title">Great start!</p>
        <p className="q-insight-body">
          Add measurements on different days (monthly works well) to unlock trends, forecasts, and year-over-year comparisons.
        </p>
      </div>
    </div>
  );
}
