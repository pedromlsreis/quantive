/**
 * @module goalEta
 * Pure derivations for the Goals page: progress, ETA, free-tier gating.
 *
 * No React, no Supabase — keeps the load-bearing math testable in isolation.
 * Reuses the CAGR routine from `forecast.ts` so the ETA stays consistent with
 * the Forecast page's "On current trajectory…" framing.
 */

import type { Goal, Snapshot } from '@/lib/types';

/** Number of days the first goal is unlocked for free users. */
export const FREE_TRIAL_DAYS = 30;
/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute the trailing CAGR (annualised rate of growth) from a series of
 * snapshot points. Mirrors the CAGR step inside `generateForecast`. Returns
 * `null` when we don't have enough history (or values are non-positive) to
 * project — callers render an "ETA unavailable" caption in that case.
 */
export function trailingCagr(snapshots: { date: Date; total: number }[]): number | null {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.total <= 0 || last.total <= 0) return null;
  const totalMonths =
    (last.date.getFullYear() - first.date.getFullYear()) * 12 +
    (last.date.getMonth() - first.date.getMonth());
  if (totalMonths <= 0) return null;
  const years = totalMonths / 12;
  return Math.pow(last.total / first.total, 1 / years) - 1;
}

/**
 * Progress fraction toward `targetInBase` given the current net worth.
 * Clamped to [0, 1]. Returns 0 for non-positive targets so the bar stays sane.
 */
export function goalProgress(currentNetWorth: number, targetInBase: number): number {
  if (!Number.isFinite(currentNetWorth) || !Number.isFinite(targetInBase) || targetInBase <= 0) {
    return 0;
  }
  if (currentNetWorth <= 0) return 0;
  return Math.min(1, Math.max(0, currentNetWorth / targetInBase));
}

/**
 * Estimated date the goal is hit on the current trajectory. Returns `null`
 * if the goal is already reached (caller renders the "Hit" state), or if the
 * inputs make a projection unsafe (no growth, missing CAGR, etc.).
 */
export function projectEtaDate(
  currentNetWorth: number,
  targetInBase: number,
  cagr: number | null,
  asOf: Date = new Date(),
): Date | null {
  if (!Number.isFinite(currentNetWorth) || !Number.isFinite(targetInBase)) return null;
  if (targetInBase <= 0) return null;
  if (currentNetWorth >= targetInBase) return null;
  if (cagr === null || cagr <= 0) return null;
  // years until value(t) = currentNetWorth * (1 + cagr)^t = targetInBase
  const years = Math.log(targetInBase / currentNetWorth) / Math.log(1 + cagr);
  if (!Number.isFinite(years) || years <= 0) return null;
  const eta = new Date(asOf);
  eta.setMonth(eta.getMonth() + Math.round(years * 12));
  return eta;
}

/**
 * Trial state for a single goal.
 *
 *  - `pro`:   unlocked via the `milestones` entitlement; no trial to count.
 *  - `trial`: free user's first active goal, still within the window.
 *             `daysRemaining` is ≥ 1.
 *  - `gated`: any other free-user goal; UI shows the FeatureGate fallback.
 *
 * `daysRemaining` exists only on `trial`, so the countdown badge can't be
 * rendered for a gated or Pro goal.
 */
export type GoalTrialState =
  | { kind: 'pro' }
  | { kind: 'trial'; daysRemaining: number }
  | { kind: 'gated' };

/**
 * Classify a goal's trial state.
 *
 * Free users get their first active (non-archived) goal free for
 * `FREE_TRIAL_DAYS`; every other goal is gated. "First" is by `createdAt`
 * ascending (ties broken by id), so archiving the trial goal does not unlock
 * the next one.
 */
export function classifyGoalTrial(args: {
  hasMilestones: boolean;
  goals: Goal[];
  goalId: string;
  now?: Date;
}): GoalTrialState {
  const { hasMilestones, goals, goalId } = args;
  const now = args.now ?? new Date();
  if (hasMilestones) return { kind: 'pro' };

  const active = goals.filter((g) => !g.archivedAt);
  if (active.length === 0) return { kind: 'gated' };

  const ordered = [...active].sort((a, b) => {
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : 1;
  });
  const first = ordered[0];
  if (first.id !== goalId) return { kind: 'gated' };

  const created = Date.parse(first.createdAt);
  if (!Number.isFinite(created)) return { kind: 'gated' };
  const ageDays = (now.getTime() - created) / DAY_MS;
  if (ageDays >= FREE_TRIAL_DAYS) return { kind: 'gated' };

  // ageDays < FREE_TRIAL_DAYS → at least 1 day left; min caps a future createdAt.
  const daysRemaining = Math.min(FREE_TRIAL_DAYS, Math.max(1, Math.ceil(FREE_TRIAL_DAYS - ageDays)));
  return { kind: 'trial', daysRemaining };
}

/**
 * The latest snapshot's total net worth, or null when there are no snapshots.
 * Tiny helper so call sites don't repeat the array-tail check.
 */
export function latestNetWorth(snapshots: Snapshot[]): number | null {
  if (snapshots.length === 0) return null;
  return snapshots[snapshots.length - 1].total;
}
