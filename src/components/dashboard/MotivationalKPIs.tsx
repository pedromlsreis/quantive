import { useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { formatPercent } from '@/lib/formatters';
import { Trophy, CalendarHeart, Rocket, Flag, X } from 'lucide-react';
import { POSITIVE_COLOR } from '@/lib/chartColors';

const DEFAULT_MILESTONES = [10_000, 25_000, 50_000, 75_000, 100_000, 150_000, 200_000, 300_000, 500_000, 750_000, 1_000_000, 2_000_000, 5_000_000];
const MILESTONES_STORAGE_KEY = 'portfolio-custom-milestones';

function loadMilestones(): number[] {
  try {
    const raw = localStorage.getItem(MILESTONES_STORAGE_KEY);
    if (!raw) return [...DEFAULT_MILESTONES];

    const parsed = JSON.parse(raw);

    // Validate: must be array with finite numbers
    if (!Array.isArray(parsed)) return [...DEFAULT_MILESTONES];

    // Filter, coerce, and normalize
    const validated = parsed
      .map(v => typeof v === 'string' ? parseFloat(v) : v)
      .filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b);

    // Deduplicate
    const unique = [...new Set(validated)];

    // Return normalized array or default if empty/invalid
    return unique.length > 0 ? unique : [...DEFAULT_MILESTONES];
  } catch {
    return [...DEFAULT_MILESTONES];
  }
}

function saveMilestones(milestones: number[]) {
  localStorage.setItem(MILESTONES_STORAGE_KEY, JSON.stringify(milestones));
}

export function MotivationalKPIs() {
  const { snapshots } = usePortfolio();
  const { fmtFull, fmtMilestone } = useCurrencyFormatter();
  const [milestones, setMilestones] = useState<number[]>(loadMilestones);
  const [editingMilestones, setEditingMilestones] = useState(false);
  const [newMilestone, setNewMilestone] = useState('');
  const handleAddMilestone = () => {
    const val = parseFloat(newMilestone);
    if (isNaN(val) || val <= 0) return;
    const updated = [...milestones, val].sort((a, b) => a - b);
    // Remove duplicates
    const unique = [...new Set(updated)];
    setMilestones(unique);
    saveMilestones(unique);
    setNewMilestone('');
  };

  const handleRemoveMilestone = (value: number) => {
    const updated = milestones.filter(m => m !== value);
    setMilestones(updated);
    saveMilestones(updated);
  };

  const handleResetMilestones = () => {
    setMilestones([...DEFAULT_MILESTONES]);
    saveMilestones([...DEFAULT_MILESTONES]);
    setEditingMilestones(false);
  };

  if (snapshots.length < 2) return null;

  const latest = snapshots[snapshots.length - 1];
  const first = snapshots[0];

  // ATH Tracker
  const ath = Math.max(...snapshots.map(s => s.total));
  const athDate = snapshots.find(s => s.total === ath)!.date;
  const athProximity = latest.total / ath;
  const isAtATH = athProximity > 0.999;

  // Best Month Ever
  const sortedSnapshots = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());
  const monthlyEnd = new Map<string, { date: Date; total: number }>();
  for (const snap of sortedSnapshots) {
    const key = `${snap.date.getFullYear()}-${String(snap.date.getMonth() + 1).padStart(2, '0')}`;
    const existing = monthlyEnd.get(key);
    if (!existing || snap.date > existing.date) {
      monthlyEnd.set(key, { date: snap.date, total: snap.total });
    }
  }

  const monthKeys = Array.from(monthlyEnd.keys()).sort();
  let bestMonth = { key: '', gain: -Infinity };
  for (let i = 1; i < monthKeys.length; i++) {
    const prev = monthlyEnd.get(monthKeys[i - 1])!;
    const curr = monthlyEnd.get(monthKeys[i])!;
    const gain = curr.total - prev.total;
    if (gain > bestMonth.gain) bestMonth = { key: monthKeys[i], gain };
  }

  const bestMonthLabel = bestMonth.key
    ? new Date(bestMonth.key + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : '';

  // Total Wealth Created
  const totalCreated = latest.total - first.total;
  const totalPct = first.total > 0 ? (totalCreated / first.total) * 100 : 0;
  const daysSinceStart = Math.max(1, Math.round((latest.date.getTime() - first.date.getTime()) / (1000 * 60 * 60 * 24)));

  // Milestone Badges
  const reached = milestones.filter(m => ath >= m);
  const nextMilestone = milestones.find(m => m > ath);
  const progressToNext = nextMilestone ? latest.total / nextMilestone : 1;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-5 text-sm font-medium text-muted-foreground">Your Journey</h3>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* ATH Tracker */}
        <div className="rounded-xl border border-border bg-secondary/30 p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Trophy className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">All-Time High</span>
          </div>
          <p className="text-xl font-bold text-foreground">{fmtFull(ath)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {athDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          {isAtATH ? (
            <div className="mt-3 flex items-center gap-1.5 rounded-md bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent">
              <Rocket className="h-3.5 w-3.5" />
              You're at your ATH right now!
            </div>
          ) : (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>{(athProximity * 100).toFixed(1)}% of ATH</span>
                <span>{fmtFull(ath - latest.total)} to go</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary">
                <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${athProximity * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Best Month */}
        <div className="rounded-xl border border-border bg-secondary/30 p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <CalendarHeart className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Best Month Ever</span>
          </div>
          <p className="text-xl font-bold" style={{ color: POSITIVE_COLOR }}>+{fmtFull(bestMonth.gain)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{bestMonthLabel}</p>
        </div>

        {/* Total Wealth Created */}
        <div className="rounded-xl border border-border bg-secondary/30 p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Rocket className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Total Wealth Created</span>
          </div>
          <p className="text-xl font-bold" style={{ color: totalCreated >= 0 ? POSITIVE_COLOR : undefined }}>
            {totalCreated >= 0 ? '+' : ''}{fmtFull(totalCreated)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatPercent(totalPct)} since first measurement · {daysSinceStart} days
          </p>
        </div>
      </div>

      {/* Milestone Badges */}
      {(editingMilestones || milestones.length === 0 || reached.length > 0 || nextMilestone) && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Milestones</p>
            <button
              onClick={() => setEditingMilestones(!editingMilestones)}
              className="text-xs text-primary hover:underline"
            >
              {editingMilestones ? 'Done' : 'Customize'}
            </button>
          </div>
          {editingMilestones && (
            <div className="mb-3 flex items-center gap-2">
              <input
                type="number"
                aria-label="New milestone threshold"
                value={newMilestone}
                onChange={e => setNewMilestone(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddMilestone(); }}
                placeholder="e.g. 50000"
                className="w-28 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
              <button
                onClick={handleAddMilestone}
                className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                Add
              </button>
              <button
                onClick={handleResetMilestones}
                className="text-xs text-muted-foreground hover:underline"
              >
                Reset
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {reached.map(m => (
              <div key={m} className="group relative flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent">
                <Flag className="h-3 w-3" />
                {fmtMilestone(m)}
                {editingMilestones && (
                  <button
                    aria-label={`Remove milestone ${fmtMilestone(m)}`}
                    onClick={() => handleRemoveMilestone(m)}
                    className="ml-0.5 -mr-1 rounded-full p-0.5 text-accent/60 hover:bg-accent/20 hover:text-accent"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            ))}
            {nextMilestone && (
              <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground">
                <Flag className="h-3 w-3" />
                <span>{fmtMilestone(nextMilestone)}</span>
                <div className="h-1 w-12 rounded-full bg-secondary">
                  <div className="h-1 rounded-full bg-primary/60 transition-all" style={{ width: `${Math.min(progressToNext * 100, 100)}%` }} />
                </div>
                {editingMilestones && (
                  <button
                    aria-label={`Remove milestone ${fmtMilestone(nextMilestone)}`}
                    onClick={() => handleRemoveMilestone(nextMilestone)}
                    className="-mr-1 rounded-full p-0.5 text-muted-foreground/60 hover:bg-secondary hover:text-muted-foreground"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
