import { useMemo, useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useAuth } from '@/contexts/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { GoalCard } from '@/components/goals/GoalCard';
import { GoalForm } from '@/components/goals/GoalForm';
import { ProGate } from '@/components/billing/UpsellCard';
import { classifyGoalTrial, latestNetWorth } from '@/lib/goalEta';
import { formatDate } from '@/lib/formatters';
import type { Goal } from '@/lib/types';
import type { CurrencyCode } from '@/contexts/CurrencyContext';
import { analytics } from '@/lib/analytics';

const GoalsPage = () => {
  const { goals, addGoal, updateGoal, archiveGoal, allSnapshots } = usePortfolio();
  const { has } = useEntitlements();
  const { user } = useAuth();
  const f = useFormat();
  const hasMilestones = has('milestones');

  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const currentNetWorth = useMemo(() => latestNetWorth(allSnapshots), [allSnapshots]);
  const snapshotSeries = useMemo(() => allSnapshots.map((s) => ({ date: s.date, total: s.total })), [allSnapshots]);
  const trials = useMemo(
    () => new Map(goals.map((g) => [g.id, classifyGoalTrial({ hasMilestones, goals, goalId: g.id })])),
    [goals, hasMilestones],
  );
  const trialGoal = [...trials.values()].find((t) => t.kind === 'trial');
  const anyGated = [...trials.values()].some((t) => t.kind === 'gated');

  const openAdd = () => {
    setEditingGoal(null);
    setFormOpen(true);
  };

  const handleSubmit = (input: { name: string; targetAmount: number; targetCurrency: CurrencyCode; targetDate: string }) => {
    if (editingGoal) {
      updateGoal(editingGoal.id, input);
    } else {
      const created = addGoal(input);
      // Best-effort completion event, for goals already reached when created.
      if (currentNetWorth !== null && created.targetCurrency === f.currency.code && currentNetWorth >= created.targetAmount) {
        analytics.goalCompleted();
      }
    }
    setFormOpen(false);
    setEditingGoal(null);
  };

  const handleArchive = (goal: Goal) => {
    if (window.confirm(`Archive "${goal.name}"? It stops showing here; you can add it again any time.`)) {
      archiveGoal(goal.id);
    }
  };

  const trialEnd = trialGoal && trialGoal.kind === 'trial'
    ? new Date(Date.now() + trialGoal.daysRemaining * 86_400_000)
    : null;

  return (
    <div>
      <header className="q-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
        <div>
          <h1 className="q-h1" tabIndex={-1}>Goals</h1>
          <p className="q-page-lede">
            {goals.length === 0 && currentNetWorth !== null
              ? `Name an amount and a date. Progress is measured against your latest net worth, ${f.money(currentNetWorth)}, and projected at your current pace.`
              : 'Progress is measured against your latest net worth and projected at your current pace.'}
          </p>
          {trialEnd && (
            <p className="q-page-meta">{`Goals are part of Pro. On the free plan, your first goal shows progress until ${formatDate(trialEnd)}.`}</p>
          )}
        </div>
        {goals.length > 0 && (
          <button type="button" onClick={openAdd} className="q-btn q-btn--secondary q-btn--md" aria-label="Add a goal">
            Add goal
          </button>
        )}
      </header>

      {goals.length === 0 ? (
        <div className="q-empty">
          <div className="q-empty-actions" style={{ marginTop: 0 }}>
            <button type="button" onClick={openAdd} className="q-btn q-btn--secondary q-btn--md">
              Add your first goal
            </button>
          </div>
          {!user && <p className="q-empty-close">Goals stay in this browser until you sign in.</p>}
        </div>
      ) : (
        <section className="q-sec" aria-label="Your goals">
          <ul className="q-goals">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                trial={trials.get(goal.id) ?? { kind: 'gated' }}
                snapshots={snapshotSeries}
                currentNetWorth={currentNetWorth}
                onEdit={(g) => { setEditingGoal(g); setFormOpen(true); }}
                onArchive={handleArchive}
              />
            ))}
          </ul>
          {anyGated && <ProGate feature="milestones" variant="row" />}
        </section>
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
