import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { formatPercent } from '@/lib/formatters';
import { Trophy, CalendarHeart, Rocket, Flag, X } from 'lucide-react';
import { POSITIVE_COLOR } from '@/lib/chartColors';
import { staggerContainer, staggerItem, springTransition, progressFill } from '@/lib/motion';

const DEFAULT_MILESTONES = [
  10_000, 25_000, 50_000, 75_000, 100_000,
  150_000, 200_000, 300_000, 500_000, 750_000,
  1_000_000, 2_000_000, 5_000_000,
];
const MILESTONES_STORAGE_KEY = 'portfolio-custom-milestones';

function loadMilestones(): number[] {
  try {
    const raw = localStorage.getItem(MILESTONES_STORAGE_KEY);
    if (!raw) return [...DEFAULT_MILESTONES];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_MILESTONES];
    const validated = parsed
      .map(v => typeof v === 'string' ? parseFloat(v) : v)
      .filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b);
    const unique = [...new Set(validated)];
    return unique.length > 0 ? unique : [...DEFAULT_MILESTONES];
  } catch {
    return [...DEFAULT_MILESTONES];
  }
}

function saveMilestones(milestones: number[]) {
  localStorage.setItem(MILESTONES_STORAGE_KEY, JSON.stringify(milestones));
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  meta: React.ReactNode;
  extra?: React.ReactNode;
}

function StatCard({ icon, label, value, meta, extra }: StatCardProps) {
  return (
    <motion.div
      className="flex flex-col rounded-xl border border-border bg-secondary/20 p-5"
      variants={staggerItem}
      whileHover={{ scale: 1.008, transition: springTransition }}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          {icon}
        </div>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
      {extra && <div className="mt-3">{extra}</div>}
    </motion.div>
  );
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
    const unique = [...new Set([...milestones, val].sort((a, b) => a - b))];
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

  // ATH
  const ath = Math.max(...snapshots.map(s => s.total));
  const athDate = snapshots.find(s => s.total === ath)!.date;
  const athProximity = latest.total / ath;
  const isAtATH = athProximity > 0.999;

  // Best Month
  const sortedSnapshots = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());
  const monthlyEnd = new Map<string, { date: Date; total: number }>();
  for (const snap of sortedSnapshots) {
    const key = `${snap.date.getFullYear()}-${String(snap.date.getMonth() + 1).padStart(2, '0')}`;
    const existing = monthlyEnd.get(key);
    if (!existing || snap.date > existing.date) monthlyEnd.set(key, { date: snap.date, total: snap.total });
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

  // Milestones
  const reached = milestones.filter(m => ath >= m);
  const nextMilestone = milestones.find(m => m > ath);
  const progressToNext = nextMilestone ? Math.min((latest.total / nextMilestone) * 100, 100) : 100;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-5 text-sm font-semibold text-muted-foreground">Your Journey</h3>

      <motion.div
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* ATH Tracker */}
        <StatCard
          icon={<Trophy className="h-4 w-4 text-primary" />}
          label="All-Time High"
          value={fmtFull(ath)}
          meta={athDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          extra={
            isAtATH ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent">
                <Rocket className="h-3.5 w-3.5" />
                You're at your ATH right now!
              </div>
            ) : (
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>{(athProximity * 100).toFixed(1)}% of ATH</span>
                  <span>{fmtFull(ath - latest.total)} to go</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-1.5 rounded-full bg-primary"
                    variants={progressFill(Math.min(athProximity * 100, 100), 0.3)}
                    initial="hidden"
                    animate="visible"
                  />
                </div>
              </div>
            )
          }
        />

        {/* Best Month */}
        <StatCard
          icon={<CalendarHeart className="h-4 w-4 text-primary" />}
          label="Best Month Ever"
          value={<span style={{ color: POSITIVE_COLOR }}>+{fmtFull(bestMonth.gain)}</span>}
          meta={bestMonthLabel}
        />

        {/* Total Wealth Created */}
        <StatCard
          icon={<Rocket className="h-4 w-4 text-primary" />}
          label="Total Wealth Created"
          value={
            <span style={{ color: totalCreated >= 0 ? POSITIVE_COLOR : undefined }}>
              {totalCreated >= 0 ? '+' : ''}{fmtFull(totalCreated)}
            </span>
          }
          meta={`${formatPercent(totalPct)} since first measurement · ${daysSinceStart} days`}
        />
      </motion.div>

      {/* Milestones */}
      {(editingMilestones || reached.length > 0 || nextMilestone) && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">Milestones</p>
            <button
              onClick={() => setEditingMilestones(!editingMilestones)}
              className="text-xs text-primary transition-colors hover:text-primary/80"
            >
              {editingMilestones ? 'Done' : 'Customize'}
            </button>
          </div>

          <AnimatePresence>
            {editingMilestones && (
              <motion.div
                className="mb-3 flex items-center gap-2"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
              >
                <input
                  type="number"
                  aria-label="New milestone threshold"
                  value={newMilestone}
                  onChange={e => setNewMilestone(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddMilestone(); }}
                  placeholder="e.g. 50000"
                  className="w-32 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
                <button
                  onClick={handleAddMilestone}
                  className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  Add
                </button>
                <button
                  onClick={handleResetMilestones}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Reset
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="flex flex-wrap gap-2"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {reached.map(m => (
              <motion.div
                key={m}
                variants={staggerItem}
                className="group relative flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent"
              >
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
              </motion.div>
            ))}

            {nextMilestone && (
              <motion.div
                variants={staggerItem}
                className="flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground"
              >
                <Flag className="h-3 w-3 shrink-0" />
                <span>{fmtMilestone(nextMilestone)}</span>
                <div className="h-1 w-14 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-1 rounded-full bg-primary/60"
                    variants={progressFill(progressToNext, 0.4)}
                    initial="hidden"
                    animate="visible"
                  />
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
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
