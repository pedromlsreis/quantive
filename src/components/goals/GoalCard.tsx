import { useMemo } from 'react';
import { MoreHorizontal, Pencil, Archive } from 'lucide-react';
import type { Goal } from '@/lib/types';
import { useFormat } from '@/hooks/useFormat';
import { useFxRates } from '@/hooks/useFxRates';
import { goalProgress, projectEtaDate, trailingCagr, type GoalTrialState } from '@/lib/goalEta';
import { duration, monthYear } from '@/lib/formatters';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface GoalCardProps {
  goal: Goal;
  /** Trial state from classifyGoalTrial: `pro`, `trial` or `gated`. */
  trial: GoalTrialState;
  /** Snapshots (in display currency) — drives current progress and pace. */
  snapshots: { date: Date; total: number }[];
  /** Current net worth in display currency, for the progress fraction. */
  currentNetWorth: number | null;
  onEdit: (goal: Goal) => void;
  onArchive: (goal: Goal) => void;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * One goal as a ruled row: its target, a neutral progress bar and when your
 * current pace reaches it. A gated goal keeps its name and target only; the
 * page carries the single Pro prompt.
 */
export function GoalCard({ goal, trial, snapshots, currentNetWorth, onEdit, onArchive }: GoalCardProps) {
  const f = useFormat();
  const { convertAt, ready: fxReady } = useFxRates();
  const display = f.currency.code;

  // Targets are stored in their own currency; progress is read in the
  // display currency at today's rate, like every other figure.
  const target = useMemo(() => {
    if (goal.targetCurrency === display) return goal.targetAmount;
    if (!fxReady) return NaN;
    return convertAt(goal.targetAmount, goal.targetCurrency, display, new Date());
  }, [goal.targetAmount, goal.targetCurrency, display, convertAt, fxReady]);

  const progress = useMemo(() => goalProgress(currentNetWorth ?? 0, target), [currentNetWorth, target]);
  const pace = useMemo(() => trailingCagr(snapshots), [snapshots]);
  const eta = useMemo(() => projectEtaDate(currentNetWorth ?? 0, target, pace), [currentNetWorth, target, pace]);

  const byDate = isoToDate(goal.targetDate);
  const reached = currentNetWorth !== null && Number.isFinite(target) && currentNetWorth >= target;
  const pct = Math.round(progress * 100);
  const targetText = (
    <>
      Target <span className="num">{f.money(Number.isFinite(target) ? target : goal.targetAmount)}</span>
      {goal.targetCurrency !== display && (
        <span className="num"> ({new Intl.NumberFormat(f.ctx.locale, { style: 'currency', currency: goal.targetCurrency, maximumFractionDigits: 0 }).format(goal.targetAmount)})</span>
      )}
      {' by '}{monthYear(byDate)}
    </>
  );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="q-icon-btn" aria-label={`Actions for goal "${goal.name}"`}>
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(goal)} className="gap-2 min-h-9">
          <Pencil size={14} strokeWidth={1.75} aria-hidden="true" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onArchive(goal)} className="gap-2 min-h-9">
          <Archive size={14} strokeWidth={1.75} aria-hidden="true" /> Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (trial.kind === 'gated') {
    return (
      <li className="q-goal" aria-label={`${goal.name}, progress shown in Pro`}>
        <div className="q-goal-head">
          <h3 className="q-goal-name">{goal.name}</h3>
          {menu}
        </div>
        <p className="q-goal-meta">{targetText}</p>
      </li>
    );
  }

  let when: string | null;
  if (!Number.isFinite(target)) when = 'Waiting for exchange rates.';
  else if (reached) when = null;
  else if (eta && pace !== null) {
    const diff = monthsBetween(eta, byDate);
    const span = duration(Math.abs(diff) * 30.44);
    const relative = diff > 0 ? `${span} early` : diff < 0 ? `${span} late` : 'on time';
    when = `At your pace (${f.pct(pace * 100)} a year), you reach it in ${monthYear(eta)}, ${relative}.`;
  } else when = 'Add another entry to project when you reach it.';

  return (
    <li className="q-goal">
      <div className="q-goal-head">
        <h3 className="q-goal-name">{goal.name}</h3>
        {menu}
      </div>
      <p className="q-goal-meta">{targetText}</p>
      <div className="q-goal-progress">
        <span className="q-goal-now">
          {currentNetWorth === null ? 'No entries yet' : <>Now <span className="num">{f.money(currentNetWorth)}</span></>}
        </span>
        <span className="num" style={{ fontFamily: 'var(--font-mono)' }}>{reached ? 'Reached' : `${pct}%`}</span>
      </div>
      <div
        className="q-goal-bar"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progress toward ${goal.name}`}
      >
        <span style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {when && <p className="q-goal-meta">{when}</p>}
    </li>
  );
}
