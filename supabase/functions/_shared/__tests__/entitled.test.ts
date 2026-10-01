import { describe, it, expect } from 'vitest';
import { pickEntitledSubscription, isEntitledStatus } from '../entitled';

const sub = (status: string, id = status) => ({ id, status });

describe('isEntitledStatus', () => {
  it.each(['active', 'trialing', 'past_due'])('treats %s as entitled', (s) => {
    expect(isEntitledStatus(s)).toBe(true);
  });

  it.each(['canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused', ''])(
    'treats %s as not entitled',
    (s) => {
      expect(isEntitledStatus(s)).toBe(false);
    },
  );
});

describe('pickEntitledSubscription', () => {
  it('returns null when the list is empty', () => {
    expect(pickEntitledSubscription([])).toBeNull();
  });

  it('returns null when no subscription is in an entitled status', () => {
    expect(pickEntitledSubscription([sub('canceled'), sub('incomplete')])).toBeNull();
  });

  it('returns the active subscription over a trialing one', () => {
    const result = pickEntitledSubscription([sub('trialing', 't'), sub('active', 'a')]);
    expect(result?.id).toBe('a');
  });

  it('returns the trialing subscription over a past_due one', () => {
    const result = pickEntitledSubscription([sub('past_due', 'p'), sub('trialing', 't')]);
    expect(result?.id).toBe('t');
  });

  it('returns the past_due subscription when nothing stronger exists', () => {
    // The dunning case: card declined on renewal day. We must NOT drop the
    // user to Free here — the UI surfaces a banner instead.
    const result = pickEntitledSubscription([sub('canceled'), sub('past_due', 'pd')]);
    expect(result?.id).toBe('pd');
  });

  it('ignores non-entitled statuses even when listed first', () => {
    const result = pickEntitledSubscription([
      sub('canceled'),
      sub('incomplete'),
      sub('active', 'win'),
      sub('past_due'),
    ]);
    expect(result?.id).toBe('win');
  });

  it('returns the first encountered when two entries share the highest rank', () => {
    const result = pickEntitledSubscription([sub('active', 'first'), sub('active', 'second')]);
    expect(result?.id).toBe('first');
  });
});
