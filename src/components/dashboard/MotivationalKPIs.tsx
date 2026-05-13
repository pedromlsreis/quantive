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
      className="q-card q-card--p-md"
      style={{ display: 'flex', flexDirection: 'column' }}
      variants={staggerItem}
      whileHover={{ scale: 1.008, transition: springTransition }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
        <div
          className="q-insight-icon"
          style={{ width: 28, height: 28, borderRadius: 'var(--r-2)' }}
        >
          {icon}
        </div>
        <span className="q-metric-eyebrow">{label}</span>
      </div>
      <p className="q-metric-value q-metric-value--md num">{value}</p>
      <p className="q-metric-sub" style={{ marginTop: 'var(--s-1)' }}>{meta}</p>
      {extra && <div style={{ marginTop: 'var(--s-3)' }}>{extra}</div>}
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
    <div className="q-card q-card--p-lg">
      <div className="q-section-head">
        <h2>Your journey</h2>
      </div>

      <motion.div
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* ATH Tracker */}
        <StatCard
          icon={<Trophy className="h-4 w-4 text-primary" />}
          label="All-time high"
          value={fmtFull(ath)}
          meta={athDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          extra={
            isAtATH ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 'var(--s-1-5)',
                borderRadius: 'var(--r-2)',
                background: 'color-mix(in oklch, var(--accent-raw) 12%, transparent)',
                padding: '6px 10px',
                fontSize: 'var(--text-xs)', fontWeight: 600,
                color: 'var(--accent-raw)',
              }}>
                <Rocket className="h-3.5 w-3.5" />
                You're at your all-time high right now!
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginBottom: 'var(--s-1)' }}>
                  <span>{(athProximity * 100).toFixed(1)}% of ATH</span>
                  <span>{fmtFull(ath - latest.total)} to go</span>
                </div>
                <div style={{ height: 6, width: '100%', overflow: 'hidden', borderRadius: 9999, background: 'color-mix(in oklch, var(--fg) 10%, transparent)' }}>
                  <motion.div
                    style={{ height: 6, borderRadius: 9999, background: 'var(--accent-raw)' }}
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
          label="Best month"
          value={<span style={{ color: POSITIVE_COLOR }}>+{fmtFull(bestMonth.gain)}</span>}
          meta={bestMonthLabel}
        />

        {/* Total Wealth Created */}
        <StatCard
          icon={<Rocket className="h-4 w-4 text-primary" />}
          label="Total wealth created"
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
        <div style={{ marginTop: 'var(--s-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s-3)' }}>
            <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--fg-muted)', margin: 0 }}>Milestones</p>
            <button
              onClick={() => setEditingMilestones(!editingMilestones)}
              className="q-btn q-btn--ghost q-btn--sm"
              style={{ fontSize: 'var(--text-xs)' }}
            >
              {editingMilestones ? 'Done' : 'Customise'}
            </button>
          </div>

          <AnimatePresence>
            {editingMilestones && (
              <motion.div
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
              >
                <label className="q-input" style={{ width: 128 }}>
                  <input
                    type="number"
                    aria-label="New milestone threshold"
                    value={newMilestone}
                    onChange={e => setNewMilestone(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddMilestone(); }}
                    placeholder="e.g. 50000"
                  />
                </label>
                <button
                  onClick={handleAddMilestone}
                  className="q-btn q-btn--secondary q-btn--sm"
                >
                  Add
                </button>
                <button
                  onClick={handleResetMilestones}
                  className="q-btn q-btn--ghost q-btn--sm"
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
                style={{
                  position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--s-1)',
                  borderRadius: 9999,
                  border: '1px solid color-mix(in oklch, var(--accent-raw) 30%, transparent)',
                  background: 'color-mix(in oklch, var(--accent-raw) 12%, transparent)',
                  padding: '6px 12px',
                  fontSize: 'var(--text-xs)', fontWeight: 600,
                  color: 'var(--accent-raw)',
                }}
              >
                <Flag className="h-3 w-3" />
                {fmtMilestone(m)}
                {editingMilestones && (
                  <button
                    aria-label={`Remove milestone ${fmtMilestone(m)}`}
                    onClick={() => handleRemoveMilestone(m)}
                    className="q-icon-btn"
                    style={{ width: 16, height: 16, marginLeft: 2, marginRight: -4, color: 'inherit', opacity: 0.6 }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </motion.div>
            ))}

            {nextMilestone && (
              <motion.div
                variants={staggerItem}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--s-2)',
                  borderRadius: 9999,
                  border: '1px solid var(--border-raw)',
                  background: 'color-mix(in oklch, var(--fg) 5%, transparent)',
                  padding: '6px 12px',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--fg-muted)',
                }}
              >
                <Flag className="h-3 w-3 shrink-0" />
                <span>{fmtMilestone(nextMilestone)}</span>
                <div style={{ height: 4, width: 56, overflow: 'hidden', borderRadius: 9999, background: 'color-mix(in oklch, var(--fg) 10%, transparent)' }}>
                  <motion.div
                    style={{ height: 4, borderRadius: 9999, background: 'color-mix(in oklch, var(--accent-raw) 60%, transparent)' }}
                    variants={progressFill(progressToNext, 0.4)}
                    initial="hidden"
                    animate="visible"
                  />
                </div>
                {editingMilestones && (
                  <button
                    aria-label={`Remove milestone ${fmtMilestone(nextMilestone)}`}
                    onClick={() => handleRemoveMilestone(nextMilestone)}
                    className="q-icon-btn"
                    style={{ width: 16, height: 16, marginRight: -4, opacity: 0.6 }}
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
