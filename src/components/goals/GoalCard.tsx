import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MoreHorizontal, Pencil, Archive, Lock } from 'lucide-react';
import type { Goal } from '@/lib/types';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useFxRates } from '@/hooks/useFxRates';
import {
  classifyGoalTrial,
  goalProgress,
  projectEtaDate,
  trailingCagr,
  type GoalTrialState,
} from '@/lib/goalEta';
import { fadeIn, progressFill } from '@/lib/motion';
import { UpsellCard } from '@/components/billing/UpsellCard';
import { CURRENCIES } from '@/lib/currencies';

interface GoalCardProps {
  goal: Goal;
  /** All active goals — needed for the first-goal staged-gate decision. */
  goals: Goal[];
  /** Pro entitlement check (`milestones`). */
  hasMilestones: boolean;
  /** Snapshots (in display currency) — drives current progress and CAGR. */
  snapshots: { date: Date; total: number }[];
  /** Current net worth in display currency, for the progress fraction. */
  currentNetWorth: number | null;
  onEdit: (goal: Goal) => void;
  onArchive: (goal: Goal) => void;
  /** Optional: if true, render the locked variant regardless of gate. Used for downgraded users. */
  forceLocked?: boolean;
}

function formatTargetDate(iso: string): string {
  // ISO date — render as "MMM yyyy" for compact display.
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function GoalCard({
  goal,
  goals,
  hasMilestones,
  snapshots,
  currentNetWorth,
  onEdit,
  onArchive,
  forceLocked = false,
}: GoalCardProps) {
  const { fmtFull, currency: displayCurrency } = useCurrencyFormatter();
  const { convertAt, ready: fxReady } = useFxRates();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const trial: GoalTrialState = forceLocked
    ? { kind: 'gated' }
    : classifyGoalTrial({ hasMilestones, goals, goalId: goal.id });

  // Convert the target to the display currency at today's rate. The goal
  // amount is stored in `targetCurrency`; we show progress and ETA against
  // the user's current display currency for consistency with the rest of
  // the app.
  const targetInDisplay = useMemo(() => {
    if (goal.targetCurrency === displayCurrency.code) return goal.targetAmount;
    if (!fxReady) return NaN;
    return convertAt(goal.targetAmount, goal.targetCurrency, displayCurrency.code, new Date());
  }, [goal.targetAmount, goal.targetCurrency, displayCurrency.code, convertAt, fxReady]);

  const progress = useMemo(
    () => goalProgress(currentNetWorth ?? 0, targetInDisplay),
    [currentNetWorth, targetInDisplay],
  );
  const cagr = useMemo(() => trailingCagr(snapshots), [snapshots]);
  const etaDate = useMemo(
    () => projectEtaDate(currentNetWorth ?? 0, targetInDisplay, cagr),
    [currentNetWorth, targetInDisplay, cagr],
  );

  const targetDateObj = new Date(goal.targetDate);
  const isHit = currentNetWorth !== null && Number.isFinite(targetInDisplay) && currentNetWorth >= targetInDisplay;

  // Locked variant: name only, plus an inline upsell. Kept in the same card
  // shell so the page rhythm survives a Pro→Free downgrade.
  if (trial.kind === 'gated') {
    return (
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="q-card q-card--p-lg"
        aria-label={`${goal.name} — locked`}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--s-3)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <Lock size={14} style={{ color: 'var(--fg-faint)', flexShrink: 0 }} aria-hidden="true" />
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 500, margin: 0 }}>{goal.name}</h3>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', margin: '4px 0 0' }}>
              Target <span className="num">{fmtFull(targetInDisplay)}</span> {goal.targetCurrency !== displayCurrency.code ? `(${goal.targetCurrency})` : ''} by {formatTargetDate(goal.targetDate)}
            </p>
          </div>
        </div>
        <div style={{ marginTop: 'var(--s-4)' }}>
          <UpsellCard feature="milestones" compact />
        </div>
      </motion.div>
    );
  }

  // Allowed: full live progress + ETA.
  const pct = Math.round(progress * 100);
  const daysLeft = trial.kind === 'trial' ? trial.daysRemaining : null;

  let etaCaption: string;
  if (!Number.isFinite(targetInDisplay)) {
    etaCaption = 'ETA unavailable while rates load.';
  } else if (isHit) {
    etaCaption = `Goal reached. Target ${formatTargetDate(goal.targetDate)}.`;
  } else if (etaDate && cagr !== null) {
    const monthsToEta = monthsBetween(new Date(), etaDate);
    const monthsToTarget = monthsBetween(new Date(), targetDateObj);
    const diff = monthsToTarget - monthsToEta;
    const ratePct = (cagr * 100).toFixed(1);
    const aheadBehind = diff > 0
      ? `${diff} month${diff === 1 ? '' : 's'} ahead of target`
      : diff < 0
        ? `${-diff} month${diff === -1 ? '' : 's'} behind target`
        : 'on target';
    etaCaption = `On current ${ratePct}% trajectory, you reach this goal in ${formatTargetDate(etaDate.toISOString())} (${aheadBehind}).`;
  } else {
    etaCaption = 'ETA unavailable — add more snapshots to project a trajectory.';
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="q-card q-card--p-lg"
      aria-label={`${goal.name} — ${pct}% complete`}
    >
      {/* Header row: name + meta + menu */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--s-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 500, margin: 0 }}>{goal.name}</h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', margin: '4px 0 0' }}>
            Target{' '}
            <span className="num" style={{ fontFamily: 'var(--font-mono)' }}>
              {fmtFull(Number.isFinite(targetInDisplay) ? targetInDisplay : goal.targetAmount)}
            </span>{' '}
            {goal.targetCurrency !== displayCurrency.code && (
              <span className="num" style={{ color: 'var(--fg-faint)' }}>
                ({CURRENCIES[goal.targetCurrency]?.symbol ?? goal.targetCurrency}
                {goal.targetAmount.toLocaleString()})
              </span>
            )}{' '}
            by {formatTargetDate(goal.targetDate)}
          </p>
        </div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            className="q-icon-btn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Open actions menu for goal "${goal.name}"`}
            style={{ background: 'transparent', border: 0, padding: 4, cursor: 'pointer' }}
          >
            <MoreHorizontal size={16} style={{ color: 'var(--fg-subtle)' }} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                background: 'var(--bg-elev-1, var(--bg))',
                border: '1px solid var(--border-raw)',
                borderRadius: 'var(--r-3)',
                boxShadow: 'var(--shadow-lg)',
                padding: 4,
                zIndex: 20,
                minWidth: 160,
              }}
            >
              <button
                role="menuitem"
                type="button"
                onClick={() => { setMenuOpen(false); onEdit(goal); }}
                className="q-nav-item"
              >
                <Pencil size={14} />
                <span>Edit</span>
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => { setMenuOpen(false); onArchive(goal); }}
                className="q-nav-item"
                style={{ color: 'var(--negative, var(--fg-muted))' }}
              >
                <Archive size={14} />
                <span>Archive</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress meter */}
      <div style={{ marginTop: 'var(--s-4)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 'var(--s-2)',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
            {currentNetWorth === null
              ? 'No snapshots yet'
              : <>Now <span className="num" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{fmtFull(currentNetWorth)}</span></>}
          </span>
          <span className="num" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>
            {pct}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progress toward ${goal.name}`}
          style={{
            position: 'relative',
            width: '100%',
            height: 8,
            borderRadius: 'var(--r-1)',
            background: 'var(--surface-soft)',
            overflow: 'hidden',
          }}
        >
          <motion.div
            variants={progressFill(pct)}
            initial="hidden"
            animate="visible"
            style={{
              height: '100%',
              background: isHit ? 'var(--positive)' : 'var(--accent-raw)',
            }}
          />
        </div>
      </div>

      {/* ETA caption */}
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', margin: 'var(--s-3) 0 0' }}>
        {etaCaption}
      </p>

      {/* Free-trial badge */}
      {daysLeft !== null && daysLeft > 0 && (
        <div
          style={{
            marginTop: 'var(--s-3)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 8px',
            borderRadius: 'var(--r-1)',
            background: 'color-mix(in oklch, var(--accent-raw) 12%, transparent)',
            color: 'var(--accent-raw)',
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
          }}
        >
          Free preview · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
        </div>
      )}

    </motion.div>
  );
}
