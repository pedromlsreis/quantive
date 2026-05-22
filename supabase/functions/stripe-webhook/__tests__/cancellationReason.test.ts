import { describe, it, expect } from 'vitest';
import { formatCancellationReason } from '../cancellationReason';

describe('formatCancellationReason', () => {
  it('returns the placeholder when details are missing', () => {
    expect(formatCancellationReason(null)).toBe('(none provided)');
    expect(formatCancellationReason(undefined)).toBe('(none provided)');
    expect(formatCancellationReason({})).toBe('(none provided)');
  });

  it('returns just the feedback enum when no comment is set', () => {
    expect(formatCancellationReason({ feedback: 'too_expensive' })).toBe('too_expensive');
  });

  it('returns just the comment in quotes when no feedback is set', () => {
    expect(formatCancellationReason({ comment: 'switching to a spreadsheet' }))
      .toBe('"switching to a spreadsheet"');
  });

  it('joins feedback and comment with an em-dash separator', () => {
    expect(
      formatCancellationReason({ feedback: 'other', comment: 'too cheap, raise your prices' }),
    ).toBe('other — "too cheap, raise your prices"');
  });

  it('ignores reason when feedback or comment are present (the original bug)', () => {
    // Portal cancellations always set reason="cancellation_requested" — using
    // ?? on reason masked the actual customer-provided feedback/comment.
    expect(
      formatCancellationReason({
        reason: 'cancellation_requested',
        feedback: 'missing_features',
        comment: 'no crypto support',
      }),
    ).toBe('missing_features — "no crypto support"');
  });

  it('falls back to reason only when feedback and comment are both absent', () => {
    // Non-portal cancellations (e.g. dunning timeout) carry signal in `reason`
    // and nothing else — keep it visible in that case.
    expect(formatCancellationReason({ reason: 'payment_failed' })).toBe('payment_failed');
    expect(formatCancellationReason({ reason: 'payment_disputed' })).toBe('payment_disputed');
  });

  it('treats empty strings on feedback/comment as absent', () => {
    // Stripe occasionally returns "" rather than null for unset fields.
    expect(formatCancellationReason({ feedback: '', comment: '', reason: 'payment_failed' }))
      .toBe('payment_failed');
  });
});
