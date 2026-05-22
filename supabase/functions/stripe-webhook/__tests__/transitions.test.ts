import { describe, it, expect } from 'vitest';
import { cancellationTransition } from '../transitions';

describe('cancellationTransition', () => {
  it('returns none when previous_attributes is missing', () => {
    // A subscription.updated where Stripe sent no previous_attributes —
    // shouldn't ever happen on real events, but supabase-js typing allows
    // undefined so we guard.
    expect(cancellationTransition(undefined, { cancel_at_period_end: true }))
      .toEqual({ kind: 'none' });
    expect(cancellationTransition(null, { cancel_at_period_end: false }))
      .toEqual({ kind: 'none' });
  });

  it('returns none when previous_attributes did not include cancel_at_period_end', () => {
    // The vast majority of updated events: price changed, status flipped to
    // past_due, quantity adjusted. None of those should trigger an admin email.
    expect(cancellationTransition({}, { cancel_at_period_end: false }))
      .toEqual({ kind: 'none' });
    expect(cancellationTransition({}, { cancel_at_period_end: true }))
      .toEqual({ kind: 'none' });
  });

  it('returns started when the customer requested cancellation', () => {
    // false -> true: customer clicked "Cancel subscription" in the portal.
    expect(cancellationTransition(
      { cancel_at_period_end: false },
      { cancel_at_period_end: true },
    )).toEqual({ kind: 'started' });
  });

  it('returns reverted when the customer reactivated', () => {
    // true -> false: customer changed their mind before period_end.
    expect(cancellationTransition(
      { cancel_at_period_end: true },
      { cancel_at_period_end: false },
    )).toEqual({ kind: 'reverted' });
  });

  it('returns none when the flag did not actually flip', () => {
    // Some Stripe updates echo cancel_at_period_end in previous_attributes
    // without changing it. Treat as noise.
    expect(cancellationTransition(
      { cancel_at_period_end: true },
      { cancel_at_period_end: true },
    )).toEqual({ kind: 'none' });
    expect(cancellationTransition(
      { cancel_at_period_end: false },
      { cancel_at_period_end: false },
    )).toEqual({ kind: 'none' });
  });

  it('treats current.cancel_at_period_end=null as false', () => {
    // Newer Stripe API versions sometimes return null on detached subscriptions.
    expect(cancellationTransition(
      { cancel_at_period_end: true },
      { cancel_at_period_end: null },
    )).toEqual({ kind: 'reverted' });
  });
});
