import { describe, it, expect } from "vitest";
import {
  cadenceLabel,
  isReminderDue,
  isReminderFrequency,
  REMINDER_INTERVAL_DAYS,
} from "./reminders";

const NOW = new Date("2026-05-30T09:00:00Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("isReminderFrequency", () => {
  it("accepts the three supported cadences", () => {
    expect(isReminderFrequency("monthly")).toBe(true);
    expect(isReminderFrequency("quarterly")).toBe(true);
    expect(isReminderFrequency("biannual")).toBe(true);
  });

  it("rejects null, 'off', and anything else", () => {
    expect(isReminderFrequency(null)).toBe(false);
    expect(isReminderFrequency("off")).toBe(false);
    expect(isReminderFrequency("weekly")).toBe(false);
    expect(isReminderFrequency("")).toBe(false);
  });
});

describe("cadenceLabel", () => {
  it("maps each cadence to plain copy", () => {
    expect(cadenceLabel("monthly")).toBe("every month");
    expect(cadenceLabel("quarterly")).toBe("every three months");
    expect(cadenceLabel("biannual")).toBe("every six months");
  });
});

describe("isReminderDue", () => {
  it("is false for a disabled or unknown cadence", () => {
    expect(isReminderDue({ frequency: null, lastActivityAt: daysAgo(90), lastSentAt: null, now: NOW })).toBe(false);
    expect(isReminderDue({ frequency: "off", lastActivityAt: daysAgo(90), lastSentAt: null, now: NOW })).toBe(false);
  });

  it("is false when the user has never synced", () => {
    expect(isReminderDue({ frequency: "monthly", lastActivityAt: null, lastSentAt: null, now: NOW })).toBe(false);
  });

  it("is false when the user synced within the interval", () => {
    expect(isReminderDue({ frequency: "monthly", lastActivityAt: daysAgo(10), lastSentAt: null, now: NOW })).toBe(false);
  });

  it("is true once a monthly user passes 30 days without a sync", () => {
    expect(isReminderDue({ frequency: "monthly", lastActivityAt: daysAgo(31), lastSentAt: null, now: NOW })).toBe(true);
  });

  it("respects the quarterly and biannual thresholds", () => {
    // 60 days: past monthly, not yet quarterly.
    expect(isReminderDue({ frequency: "quarterly", lastActivityAt: daysAgo(60), lastSentAt: null, now: NOW })).toBe(false);
    expect(isReminderDue({ frequency: "quarterly", lastActivityAt: daysAgo(100), lastSentAt: null, now: NOW })).toBe(true);
    expect(isReminderDue({ frequency: "biannual", lastActivityAt: daysAgo(100), lastSentAt: null, now: NOW })).toBe(false);
    expect(isReminderDue({ frequency: "biannual", lastActivityAt: daysAgo(200), lastSentAt: null, now: NOW })).toBe(true);
  });

  it("does not nudge again within the same interval (anti-spam)", () => {
    // Due on activity (40 days stale) but already nudged 5 days ago.
    expect(
      isReminderDue({ frequency: "monthly", lastActivityAt: daysAgo(40), lastSentAt: daysAgo(5), now: NOW }),
    ).toBe(false);
  });

  it("nudges again once a full interval has passed since the last send", () => {
    expect(
      isReminderDue({ frequency: "monthly", lastActivityAt: daysAgo(70), lastSentAt: daysAgo(35), now: NOW }),
    ).toBe(true);
  });

  it("ignores an unparseable activity timestamp", () => {
    expect(isReminderDue({ frequency: "monthly", lastActivityAt: "not-a-date", lastSentAt: null, now: NOW })).toBe(false);
  });

  it("treats an unparseable last-sent timestamp as 'never sent'", () => {
    expect(
      isReminderDue({ frequency: "monthly", lastActivityAt: daysAgo(40), lastSentAt: "garbage", now: NOW }),
    ).toBe(true);
  });

  it("interval table matches the documented cadences", () => {
    expect(REMINDER_INTERVAL_DAYS).toEqual({ monthly: 30, quarterly: 91, biannual: 182 });
  });
});
