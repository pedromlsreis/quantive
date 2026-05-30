/**
 * @module reminders
 *
 * Client-side constants for the recurring entry-reminder preference. The
 * cadence strings here are the contract with the server: they must match the
 * CHECK constraint on `profiles.reminder_frequency` and the cadences the
 * `entry-reminders` edge function understands. Keep the two in sync.
 */

/** Stored cadence values. `'off'` (or a null column) means reminders are disabled. */
export type ReminderFrequency = 'off' | 'monthly' | 'quarterly' | 'biannual';

export const REMINDER_OPTIONS: { value: ReminderFrequency; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'biannual', label: 'Every 6 months' },
];

/** Coerce a raw DB value (possibly null or legacy) into a known cadence. */
export function normaliseReminderFrequency(raw: string | null | undefined): ReminderFrequency {
  if (raw === 'monthly' || raw === 'quarterly' || raw === 'biannual') return raw;
  return 'off';
}
