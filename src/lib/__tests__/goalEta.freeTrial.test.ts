import { describe, it, expect } from 'vitest';
import { classifyGoalTrial, FREE_TRIAL_DAYS, type GoalTrialState } from '@/lib/goalEta';
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

// daysRemaining exists only on the `trial` variant. These tests pin the day
// arithmetic and assert that gated/pro states never carry a countdown.
describe('classifyGoalTrial — daysRemaining on the trial variant', () => {
  const now = new Date('2026-05-19T12:00:00Z');

  const trialState = (createdAt: string): Extract<GoalTrialState, { kind: 'trial' }> => {
    const goals = [makeGoal({ id: 'a', createdAt })];
    const state = classifyGoalTrial({ hasMilestones: false, goals, goalId: 'a', now });
    if (state.kind !== 'trial') throw new Error(`expected trial, got ${state.kind}`);
    return state;
  };

  it('reports the full window for a freshly-created first goal', () => {
    expect(trialState(now.toISOString()).daysRemaining).toBe(FREE_TRIAL_DAYS);
  });

  it('counts down by whole days as the goal ages (ceil of remaining)', () => {
    const created = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(trialState(created).daysRemaining).toBe(20);
  });

  it('never drops below 1 while still in trial (last day shows "1 day left")', () => {
    // 29.5 days old → ceil(0.5) = 1. Only ≥ 30 days flips to gated.
    const created = new Date(now.getTime() - 29.5 * 24 * 60 * 60 * 1000).toISOString();
    expect(trialState(created).daysRemaining).toBe(1);
  });

  it('caps a clock-skewed future createdAt at the full window', () => {
    const future = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(trialState(future).daysRemaining).toBe(FREE_TRIAL_DAYS);
  });
});

describe('classifyGoalTrial — gated and pro carry no countdown', () => {
  const now = new Date('2026-05-19T12:00:00Z');

  it('a gated goal has no daysRemaining property at all', () => {
    const stale = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const state = classifyGoalTrial({
      hasMilestones: false,
      goals: [makeGoal({ id: 'a', createdAt: stale })],
      goalId: 'a',
      now,
    });
    expect(state.kind).toBe('gated');
    expect('daysRemaining' in state).toBe(false);
  });

  it('a pro goal has no daysRemaining even though it was created recently', () => {
    const state = classifyGoalTrial({
      hasMilestones: true,
      goals: [makeGoal({ id: 'a', createdAt: now.toISOString() })],
      goalId: 'a',
      now,
    });
    expect(state.kind).toBe('pro');
    expect('daysRemaining' in state).toBe(false);
  });

  it('a recent-but-gated second goal reports no countdown', () => {
    // The day count is tied to the gate decision: a gated goal never shows one,
    // even when freshly created.
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const goals = [
      makeGoal({ id: 'a', createdAt: recent }),
      makeGoal({ id: 'b', createdAt: new Date(now.getTime() - 1000).toISOString() }),
    ];
    const second = classifyGoalTrial({ hasMilestones: false, goals, goalId: 'b', now });
    expect(second.kind).toBe('gated');
    expect('daysRemaining' in second).toBe(false);
  });
});
