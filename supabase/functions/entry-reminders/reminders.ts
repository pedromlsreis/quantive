// Pure decision logic for the entry-reminders cron. No Deno, no I/O — the
// handler in index.ts fetches rows and calls these; the logic is unit-tested
// in reminders.test.ts.

export type ReminderFrequency = "monthly" | "quarterly" | "biannual";

/**
 * How long a user may go without a sync before a reminder is due, per cadence.
 * Calendar-month approximations are fine here: the cron ticks daily, so a user
 * becomes due on whichever day crosses the threshold.
 */
export const REMINDER_INTERVAL_DAYS: Record<ReminderFrequency, number> = {
  monthly: 30,
  quarterly: 91,
  biannual: 182,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function isReminderFrequency(v: unknown): v is ReminderFrequency {
  return v === "monthly" || v === "quarterly" || v === "biannual";
}

/** Human cadence for email copy, e.g. "every three months". */
export function cadenceLabel(freq: ReminderFrequency): string {
  switch (freq) {
    case "monthly":
      return "every month";
    case "quarterly":
      return "every three months";
    case "biannual":
      return "every six months";
  }
}

export interface DueInput {
  /** profiles.reminder_frequency — may be null/'off'/garbage; validated here. */
  frequency: string | null;
  /** ISO timestamp of the user's last snapshot sync (portfolio_snapshots.updated_at). */
  lastActivityAt: string | null;
  /** ISO timestamp of the last reminder we sent, or null if never. */
  lastSentAt: string | null;
  /** Current time. */
  now: Date;
}

/**
 * A reminder is due when:
 *   1. the cadence is a recognised value, and
 *   2. the user has a sync on record (nothing to remind about otherwise), and
 *   3. at least one interval has passed since that sync, and
 *   4. we have not already nudged them within the last interval.
 *
 * Rule 4 is the anti-spam guard: a user who set "monthly" and then stops
 * updating gets one email per month, not one per day the cron runs.
 */
export function isReminderDue(input: DueInput): boolean {
  const { frequency, lastActivityAt, lastSentAt, now } = input;
  if (!isReminderFrequency(frequency)) return false;
  if (!lastActivityAt) return false;

  const interval = REMINDER_INTERVAL_DAYS[frequency];
  const activityMs = Date.parse(lastActivityAt);
  if (!Number.isFinite(activityMs)) return false;

  const daysSinceActivity = (now.getTime() - activityMs) / DAY_MS;
  if (daysSinceActivity < interval) return false;

  if (lastSentAt) {
    const sentMs = Date.parse(lastSentAt);
    if (Number.isFinite(sentMs)) {
      const daysSinceSent = (now.getTime() - sentMs) / DAY_MS;
      if (daysSinceSent < interval) return false;
    }
  }

  return true;
}
