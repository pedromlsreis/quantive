import { describe, it, expect } from 'vitest';
import {
  trailingCagr,
  goalProgress,
  projectEtaDate,
  classifyGoalTrial,
  latestNetWorth,
  FREE_TRIAL_DAYS,
} from '@/lib/goalEta';
import type { Goal } from '@/lib/types';

function makeGoal(partial: Partial<Goal> = {}): Goal {
  return {
    id: partial.id ?? 'g1',
    name: partial.name ?? 'Test goal',
    targetAmount: partial.targetAmount ?? 100_000,
    targetCurrency: partial.targetCurrency ?? 'EUR',
    targetDate: partial.targetDate ?? '2027-12-31',
    createdAt: partial.createdAt ?? new Date().toISOString(),
    archivedAt: partial.archivedAt,
  };
}

describe('trailingCagr', () => {
  it('returns null with fewer than 2 snapshots', () => {
    expect(trailingCagr([])).toBeNull();
    expect(trailingCagr([{ date: new Date(2024, 0, 1), total: 10_000 }])).toBeNull();
  });

  it('returns null when total spans zero months', () => {
    const d = new Date(2024, 0, 1);
    expect(trailingCagr([{ date: d, total: 100 }, { date: d, total: 110 }])).toBeNull();
  });

  it('returns null when any value is non-positive', () => {
    expect(
      trailingCagr([
        { date: new Date(2024, 0, 1), total: 0 },
        { date: new Date(2025, 0, 1), total: 1_000 },
      ]),
    ).toBeNull();
  });

  it('computes correct CAGR for a one-year doubling (≈ 1.0)', () => {
    const cagr = trailingCagr([
      { date: new Date(2024, 0, 1), total: 1_000 },
      { date: new Date(2025, 0, 1), total: 2_000 },
    ])!;
    expect(cagr).toBeGreaterThan(0.99);
    expect(cagr).toBeLessThan(1.01);
  });

  it('handles unsorted input (sorts internally)', () => {
    const sorted = trailingCagr([
      { date: new Date(2024, 0, 1), total: 10_000 },
      { date: new Date(2025, 0, 1), total: 11_000 },
    ])!;
    const unsorted = trailingCagr([
      { date: new Date(2025, 0, 1), total: 11_000 },
      { date: new Date(2024, 0, 1), total: 10_000 },
    ])!;
    expect(unsorted).toBeCloseTo(sorted, 6);
  });
});

describe('goalProgress', () => {
  it('clamps to [0, 1]', () => {
    expect(goalProgress(50_000, 100_000)).toBe(0.5);
    expect(goalProgress(0, 100_000)).toBe(0);
    expect(goalProgress(-10, 100_000)).toBe(0);
    expect(goalProgress(200_000, 100_000)).toBe(1);
  });

  it('returns 0 for non-positive target', () => {
    expect(goalProgress(10_000, 0)).toBe(0);
    expect(goalProgress(10_000, -5)).toBe(0);
  });

  it('returns 0 when current is NaN', () => {
    expect(goalProgress(NaN, 100_000)).toBe(0);
  });
});

describe('projectEtaDate', () => {
  it('returns null when already past target', () => {
    expect(projectEtaDate(150_000, 100_000, 0.07)).toBeNull();
  });

  it('returns null when CAGR is null or non-positive', () => {
    expect(projectEtaDate(50_000, 100_000, null)).toBeNull();
    expect(projectEtaDate(50_000, 100_000, 0)).toBeNull();
    expect(projectEtaDate(50_000, 100_000, -0.05)).toBeNull();
  });

  it('returns a future date when growth carries you to the target', () => {
    const eta = projectEtaDate(50_000, 100_000, 0.10, new Date(2026, 0, 1));
    expect(eta).not.toBeNull();
    expect(eta!.getTime()).toBeGreaterThan(new Date(2026, 0, 1).getTime());
  });

  it('higher CAGR yields an earlier ETA', () => {
    const asOf = new Date(2026, 0, 1);
    const slow = projectEtaDate(50_000, 100_000, 0.05, asOf)!;
    const fast = projectEtaDate(50_000, 100_000, 0.20, asOf)!;
    expect(fast.getTime()).toBeLessThan(slow.getTime());
  });
});

describe('classifyGoalTrial (gate classification)', () => {
  const now = new Date('2026-05-19T12:00:00Z');

  it('Pro users are always pro (no trial concept)', () => {
    const goals = [
      makeGoal({ id: 'a', createdAt: '2020-01-01T00:00:00Z' }),
      makeGoal({ id: 'b', createdAt: '2024-01-01T00:00:00Z' }),
    ];
    expect(classifyGoalTrial({ hasMilestones: true, goals, goalId: 'a', now })).toEqual({ kind: 'pro' });
    expect(classifyGoalTrial({ hasMilestones: true, goals, goalId: 'b', now })).toEqual({ kind: 'pro' });
  });

  it("Free: first goal within 30 days is in trial", () => {
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const goals = [makeGoal({ id: 'a', createdAt: recent })];
    expect(classifyGoalTrial({ hasMilestones: false, goals, goalId: 'a', now }).kind).toBe('trial');
  });

  it('Free: first goal past 30 days is gated', () => {
    const stale = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const goals = [makeGoal({ id: 'a', createdAt: stale })];
    expect(classifyGoalTrial({ hasMilestones: false, goals, goalId: 'a', now })).toEqual({ kind: 'gated' });
  });

  it('Free: second goal is gated even within 30 days', () => {
    const recentA = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const recentB = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 + 1000).toISOString();
    const goals = [
      makeGoal({ id: 'a', createdAt: recentA }),
      makeGoal({ id: 'b', createdAt: recentB }),
    ];
    expect(classifyGoalTrial({ hasMilestones: false, goals, goalId: 'a', now }).kind).toBe('trial');
    expect(classifyGoalTrial({ hasMilestones: false, goals, goalId: 'b', now })).toEqual({ kind: 'gated' });
  });

  it('Free: archived goals do not unlock the next-oldest in the queue', () => {
    // Archiving the trial goal must NOT promote the next goal into the slot —
    // otherwise users could rotate goals forever to dodge the wall.
    const oldA = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const recentB = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const goals = [
      makeGoal({ id: 'a', createdAt: oldA, archivedAt: now.toISOString() }),
      makeGoal({ id: 'b', createdAt: recentB }),
    ];
    // 'b' is the first *active* goal, recent enough — in trial.
    expect(classifyGoalTrial({ hasMilestones: false, goals, goalId: 'b', now }).kind).toBe('trial');
  });

  it('Free: returns gated when there are no active goals', () => {
    expect(classifyGoalTrial({ hasMilestones: false, goals: [], goalId: 'x', now })).toEqual({ kind: 'gated' });
  });

  it("boundary: exactly 30 days old is gated", () => {
    const exactlyOld = new Date(now.getTime() - FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const goals = [makeGoal({ id: 'a', createdAt: exactlyOld })];
    expect(classifyGoalTrial({ hasMilestones: false, goals, goalId: 'a', now })).toEqual({ kind: 'gated' });
  });

  it('Free: gated when the first goal has an unparseable createdAt', () => {
    const goals = [makeGoal({ id: 'a', createdAt: 'not-a-date' })];
    expect(classifyGoalTrial({ hasMilestones: false, goals, goalId: 'a', now })).toEqual({ kind: 'gated' });
  });
});

describe('goalProgress with currency-converted target', () => {
  // Mirrors the GoalCard flow: target lives in `targetCurrency`, but progress
  // is computed in display currency. We pre-convert the target with convert()
  // (the same pure routine the card calls via convertAt) and pass it to
  // goalProgress. This guards the integration shape without mounting React.
  it('matches expected progress after converting USD target to EUR', async () => {
    const { buildSeries, convert } = await import('@/lib/fxConvert');
    const series = buildSeries([
      { date: '2026-05-19', currency: 'USD', rate_to_base: 0.9 }, // 1 USD = 0.9 EUR
    ]);
    const targetUsd = 100_000;
    const date = new Date('2026-05-19');
    const targetInEur = convert(targetUsd, 'USD', 'EUR', date, series);
    expect(targetInEur).toBeCloseTo(90_000, 2);

    const currentNetWorthEur = 45_000;
    expect(goalProgress(currentNetWorthEur, targetInEur)).toBeCloseTo(0.5, 4);
  });

  it('passes through unchanged when target currency equals display currency', async () => {
    const { buildSeries, convert } = await import('@/lib/fxConvert');
    const series = buildSeries([]);
    const targetEur = 100_000;
    const date = new Date('2026-05-19');
    // EUR->EUR is the identity, even with no rates loaded.
    expect(convert(targetEur, 'EUR', 'EUR', date, series)).toBe(targetEur);
    expect(goalProgress(50_000, targetEur)).toBe(0.5);
  });
});

describe('latestNetWorth', () => {
  it('returns null for empty snapshots', () => {
    expect(latestNetWorth([])).toBeNull();
  });

  it('returns the trailing element total', () => {
    expect(
      latestNetWorth([
        { date: new Date(2024, 0, 1), total: 100, sources: [] },
        { date: new Date(2025, 0, 1), total: 200, sources: [] },
      ]),
    ).toBe(200);
  });
});
