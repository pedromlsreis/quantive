import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Target } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { GoalCard } from '@/components/goals/GoalCard';
import { GoalForm } from '@/components/goals/GoalForm';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { latestNetWorth } from '@/lib/goalEta';
import type { Goal } from '@/lib/types';
import type { CurrencyCode } from '@/contexts/CurrencyContext';
import { analytics } from '@/lib/analytics';

const GoalsPage = () => {
  const { goals, addGoal, updateGoal, archiveGoal, allSnapshots } = usePortfolio();
  const { has } = useEntitlements();
  const { user } = useAuth();
  const { currency } = useCurrency();
  const hasMilestones = has('milestones');

  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const currentNetWorth = useMemo(() => latestNetWorth(allSnapshots), [allSnapshots]);
  const snapshotSeries = useMemo(
    () => allSnapshots.map(s => ({ date: s.date, total: s.total })),
    [allSnapshots],
  );

  const openAdd = () => {
    setEditingGoal(null);
    setFormOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormOpen(true);
  };

  const handleSubmit = (input: {
    name: string;
    targetAmount: number;
    targetCurrency: CurrencyCode;
    targetDate: string;
  }) => {
    if (editingGoal) {
      updateGoal(editingGoal.id, input);
    } else {
      const created = addGoal(input);
      // Best-effort completion event — fires if the user is already past the
      // target at creation time.
      if (currentNetWorth !== null && created.targetCurrency === currency.code && currentNetWorth >= created.targetAmount) {
        analytics.goalCompleted();
      }
    }
    setFormOpen(false);
    setEditingGoal(null);
  };

  const handleArchive = (goal: Goal) => {
    if (window.confirm(`Archive "${goal.name}"? You can still see archived goals if you re-upgrade later.`)) {
      archiveGoal(goal.id);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
            Goals
          </h1>
          <p style={{ color: 'var(--fg-subtle)', fontSize: 14, margin: '6px 0 0' }}>
            Set net-worth milestones and watch your trajectory toward them.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="q-btn q-btn--primary q-btn--sm"
          aria-label="Add a goal"
        >
          <Plus size={14} />
          <span>Add goal</span>
        </button>
      </div>

      {/* Empty state or list */}
      {goals.length === 0 ? (
        <div
          className="q-card q-card--p-lg"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 'var(--s-3)',
            padding: 'var(--s-8) var(--s-6)',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 40, height: 40,
              borderRadius: 'var(--r-3)',
              background: 'var(--surface-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--fg-subtle)',
            }}
          >
            <Target size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 500, margin: 0 }}>
              No goals yet
            </h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-subtle)', margin: '6px auto 0', maxWidth: 420 }}>
              Try{' '}
              <em style={{ fontStyle: 'normal', color: 'var(--fg)' }}>
                "Reach €100k by 2027"
              </em>
              {' '}or{' '}
              <em style={{ fontStyle: 'normal', color: 'var(--fg)' }}>
                "Hit €1M by 50"
              </em>
              . We'll show progress against your latest net worth and project an ETA from your trailing growth.
            </p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="q-btn q-btn--primary q-btn--sm"
            style={{ marginTop: 'var(--s-2)' }}
          >
            <Plus size={14} />
            <span>Add your first goal</span>
          </button>
          {!user && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-faint)', margin: '6px 0 0' }}>
              You can preview goals as a guest; sign in to keep them across sessions.
            </p>
          )}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          style={{ display: 'grid', gap: 'var(--s-4)' }}
        >
          {goals.map((goal) => (
            <motion.div key={goal.id} variants={staggerItem}>
              <GoalCard
                goal={goal}
                goals={goals}
                hasMilestones={hasMilestones}
                snapshots={snapshotSeries}
                currentNetWorth={currentNetWorth}
                onEdit={openEdit}
                onArchive={handleArchive}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      <GoalForm
        open={formOpen}
        goal={editingGoal}
        onClose={() => { setFormOpen(false); setEditingGoal(null); }}
        onSubmit={handleSubmit}
      />
    </div>
  );
};

export default GoalsPage;
