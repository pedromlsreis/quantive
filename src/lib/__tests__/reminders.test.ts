import { describe, it, expect } from 'vitest';
import {
  REMINDER_OPTIONS,
  normaliseReminderFrequency,
  type ReminderFrequency,
} from '@/lib/reminders';

// Coerces a raw DB value to a known cadence. Unknown/legacy values fall back
// to 'monthly'; 'off' is preserved.
describe('normaliseReminderFrequency', () => {
  const KNOWN: ReminderFrequency[] = ['off', 'monthly', 'quarterly', 'biannual'];

  it.each(KNOWN)('preserves the known cadence %s unchanged', (cadence) => {
    expect(normaliseReminderFrequency(cadence)).toBe(cadence);
  });

  it("preserves 'off' (coercing it would silently re-enable reminders)", () => {
    expect(normaliseReminderFrequency('off')).toBe('off');
  });

  it('falls back to monthly for null / undefined (column default)', () => {
    expect(normaliseReminderFrequency(null)).toBe('monthly');
    expect(normaliseReminderFrequency(undefined)).toBe('monthly');
  });

  it('falls back to monthly for an empty string', () => {
    expect(normaliseReminderFrequency('')).toBe('monthly');
  });

  it('falls back to monthly for an unknown/legacy value', () => {
    expect(normaliseReminderFrequency('weekly')).toBe('monthly');
    expect(normaliseReminderFrequency('annually')).toBe('monthly');
  });

  it('is case-sensitive: capitalised variants fall back to the default', () => {
    expect(normaliseReminderFrequency('Monthly')).toBe('monthly');
    expect(normaliseReminderFrequency('OFF')).toBe('monthly');
  });
});

describe('REMINDER_OPTIONS', () => {
  it('every option value is a frequency normaliseReminderFrequency round-trips', () => {
    for (const opt of REMINDER_OPTIONS) {
      expect(normaliseReminderFrequency(opt.value)).toBe(opt.value);
    }
  });

  it('offers exactly the four supported cadences', () => {
    expect(REMINDER_OPTIONS.map((o) => o.value)).toEqual([
      'off',
      'monthly',
      'quarterly',
      'biannual',
    ]);
  });
});
