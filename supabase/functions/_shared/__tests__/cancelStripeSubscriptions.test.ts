import { describe, it, expect, vi } from 'vitest';
import {
  cancelActiveSubscriptions,
  isFullyCancelled,
} from '../cancelStripeSubscriptions';

interface FakeSub {
  id: string;
  status: string;
}

function fakeStripe(opts: {
  subs?: FakeSub[];
  cancelThrowsOn?: Set<string>;
  listThrows?: boolean;
}) {
  const subs = opts.subs ?? [];
  const cancelled: string[] = [];
  const listSpy = vi.fn(async () => {
    if (opts.listThrows) throw new Error('stripe list failed');
    return { data: subs };
  });
  const cancelSpy = vi.fn(async (id: string) => {
    if (opts.cancelThrowsOn?.has(id)) {
      throw new Error(`cannot cancel ${id}`);
    }
    cancelled.push(id);
    return { id, status: 'canceled' };
  });
  return {
    stripe: { subscriptions: { list: listSpy, cancel: cancelSpy } },
    listSpy,
    cancelSpy,
    cancelled,
  };
}

describe('cancelActiveSubscriptions', () => {
  it('is a no-op when there is no customerId', async () => {
    const { stripe, listSpy, cancelSpy } = fakeStripe({});
    const result = await cancelActiveSubscriptions(stripe, null);
    expect(result).toEqual({ cancelled: [], skipped: [], errors: [] });
    // Critical: must not hit Stripe at all — every API call is real money
    // and rate quota, and a null customer is a perfectly normal free user.
    expect(listSpy).not.toHaveBeenCalled();
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when customerId is the empty string', async () => {
    const { stripe, listSpy } = fakeStripe({});
    const result = await cancelActiveSubscriptions(stripe, '');
    expect(result).toEqual({ cancelled: [], skipped: [], errors: [] });
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('cancels every active or trialing subscription', async () => {
    const { stripe, cancelSpy, cancelled } = fakeStripe({
      subs: [
        { id: 'sub_active', status: 'active' },
        { id: 'sub_trial', status: 'trialing' },
      ],
    });
    const result = await cancelActiveSubscriptions(stripe, 'cus_x');
    expect(cancelSpy).toHaveBeenCalledTimes(2);
    expect(cancelled).toEqual(['sub_active', 'sub_trial']);
    expect(result.cancelled).toEqual(['sub_active', 'sub_trial']);
    expect(result.errors).toEqual([]);
  });

  it('also cancels past_due subscriptions (dunning is still billing-eligible)', async () => {
    // A past_due subscription is mid-dunning — Stripe will retry the charge
    // unless we cancel it. Treating it as terminal would let charges fire
    // against a deleted account.
    const { stripe, cancelled } = fakeStripe({
      subs: [{ id: 'sub_past_due', status: 'past_due' }],
    });
    const result = await cancelActiveSubscriptions(stripe, 'cus_x');
    expect(cancelled).toEqual(['sub_past_due']);
    expect(result.cancelled).toEqual(['sub_past_due']);
  });

  it('skips subscriptions already in terminal states', async () => {
    // These can't generate any more charges, so cancelling them is wasted
    // API quota and confuses the audit log.
    const terminal = ['canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'];
    const { stripe, cancelSpy, cancelled } = fakeStripe({
      subs: terminal.map((s, i) => ({ id: `sub_${i}`, status: s })),
    });
    const result = await cancelActiveSubscriptions(stripe, 'cus_x');
    expect(cancelSpy).not.toHaveBeenCalled();
    expect(cancelled).toEqual([]);
    expect(result.cancelled).toEqual([]);
    expect(result.skipped.map((s) => s.status)).toEqual(terminal);
  });

  it('cancels active subs and skips terminal ones in the same customer', async () => {
    const { stripe, cancelled } = fakeStripe({
      subs: [
        { id: 'sub_old', status: 'canceled' },
        { id: 'sub_now', status: 'active' },
        { id: 'sub_dead', status: 'incomplete_expired' },
      ],
    });
    const result = await cancelActiveSubscriptions(stripe, 'cus_x');
    expect(cancelled).toEqual(['sub_now']);
    expect(result.skipped.map((s) => s.id)).toEqual(['sub_old', 'sub_dead']);
  });

  it('cancels a subscription with cancel_at_period_end=true (still billing-eligible)', async () => {
    // The user requested cancel-at-period-end earlier but hasn't reached
    // period_end yet — status is still `active`, so we must cancel hard.
    // Leaving it would let Stripe attempt a renewal-eligible state after
    // we delete the user.
    const { stripe, cancelled } = fakeStripe({
      subs: [{ id: 'sub_pending_cancel', status: 'active' }],
    });
    const result = await cancelActiveSubscriptions(stripe, 'cus_x');
    expect(cancelled).toEqual(['sub_pending_cancel']);
    expect(result.errors).toEqual([]);
  });

  it('collects errors per subscription and keeps going', async () => {
    // Stripe occasionally returns "no such subscription" or rate-limit
    // errors on individual cancels. We record them and continue rather
    // than aborting half-way, so the caller sees the full picture.
    const { stripe, cancelled } = fakeStripe({
      subs: [
        { id: 'sub_a', status: 'active' },
        { id: 'sub_b', status: 'active' },
        { id: 'sub_c', status: 'active' },
      ],
      cancelThrowsOn: new Set(['sub_b']),
    });
    const result = await cancelActiveSubscriptions(stripe, 'cus_x');
    expect(cancelled).toEqual(['sub_a', 'sub_c']);
    expect(result.cancelled).toEqual(['sub_a', 'sub_c']);
    expect(result.errors).toEqual([{ id: 'sub_b', message: 'cannot cancel sub_b' }]);
  });

  it('propagates errors from subscriptions.list (caller must fail-closed)', async () => {
    // We do NOT swallow list errors — the delete-account flow must abort
    // when it can't even enumerate subscriptions.
    const { stripe } = fakeStripe({ listThrows: true });
    await expect(cancelActiveSubscriptions(stripe, 'cus_x')).rejects.toThrow('stripe list failed');
  });

  it('asks Stripe for all subscription statuses, not just active', async () => {
    // We bucket the filter ourselves so we can report what we skipped.
    // If we asked for status=active we'd miss past_due and the caller
    // wouldn't know they existed.
    const { stripe, listSpy } = fakeStripe({});
    await cancelActiveSubscriptions(stripe, 'cus_x');
    expect(listSpy).toHaveBeenCalledWith({
      customer: 'cus_x',
      status: 'all',
      limit: 100,
    });
  });
});

describe('isFullyCancelled', () => {
  it('returns true when there are no errors', () => {
    expect(isFullyCancelled({ cancelled: [], skipped: [], errors: [] })).toBe(true);
    expect(isFullyCancelled({ cancelled: ['s'], skipped: [], errors: [] })).toBe(true);
    expect(
      isFullyCancelled({ cancelled: [], skipped: [{ id: 's', status: 'canceled' }], errors: [] }),
    ).toBe(true);
  });

  it('returns false when any cancel call failed', () => {
    expect(
      isFullyCancelled({
        cancelled: ['ok'],
        skipped: [],
        errors: [{ id: 'fail', message: 'rate limit' }],
      }),
    ).toBe(false);
  });
});
