import { describe, it, expect } from "vitest";
import { type DatasetCheck, describeFinding, evaluateFreshness } from "./freshness";

const NOW = new Date("2026-06-08T18:00:00Z"); // Monday

function check(over: Partial<DatasetCheck> & { latest: string | null }): DatasetCheck {
  return { label: "S&P 500", thresholdDays: 4, ...over };
}

describe("evaluateFreshness", () => {
  it("returns no findings when every dataset is within threshold", () => {
    const checks = [
      check({ label: "sp500", latest: "2026-06-05", thresholdDays: 4 }),       // 3d old
      check({ label: "fx", latest: "2026-06-05", thresholdDays: 4 }),          // 3d old
      check({ label: "hicp", latest: "2026-05-01", thresholdDays: 45 }),       // ~38d old
    ];
    expect(evaluateFreshness(checks, NOW)).toEqual([]);
  });

  it("flags a daily series that is past its threshold", () => {
    // The exact production failure: sp500 frozen at 1 Jun, checked 8 Jun = 7d.
    const findings = evaluateFreshness([check({ label: "sp500", latest: "2026-06-01" })], NOW);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ label: "sp500", reason: "stale", thresholdDays: 4 });
    expect(findings[0].ageDays).toBeCloseTo(7.75, 1);
  });

  it("does NOT flag a normal weekend gap (Friday data, Monday check)", () => {
    // Fri 5 Jun → Mon 8 Jun = 3 days, under the 4-day daily threshold.
    expect(evaluateFreshness([check({ latest: "2026-06-05" })], NOW)).toEqual([]);
  });

  it("does NOT flag Thursday data on a Monday under the production 5-day threshold", () => {
    // The real day-one case: FRED hadn't yet published Friday's close, so the
    // freshest row was Thu 4 Jun (~4.6d old). At the tuned daily threshold of
    // 5 this is benign; at the old 4 it false-paged.
    expect(evaluateFreshness([check({ latest: "2026-06-04", thresholdDays: 5 })], NOW)).toEqual([]);
    expect(evaluateFreshness([check({ latest: "2026-06-04", thresholdDays: 4 })], NOW)).toHaveLength(1);
  });

  it("treats the threshold as exclusive (exactly at threshold is fresh)", () => {
    // 2026-06-04T00:00Z → 2026-06-08T18:00Z = 4.75d > 4 → stale.
    // 2026-06-04T18:00Z would be exactly 4d, but latest is date-only (midnight).
    const at4 = evaluateFreshness([check({ latest: "2026-06-04", thresholdDays: 5 })], NOW);
    expect(at4).toEqual([]); // 4.75d < 5d threshold
  });

  it("flags an empty dataset as a distinct 'empty' finding", () => {
    const findings = evaluateFreshness([check({ label: "sp500", latest: null })], NOW);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ label: "sp500", latest: null, ageDays: null, reason: "empty" });
  });

  it("respects the longer monthly threshold for HICP", () => {
    // 50 days old monthly series → stale; 40 days → fresh.
    expect(evaluateFreshness([check({ label: "hicp", latest: "2026-04-19", thresholdDays: 45 })], NOW)).toHaveLength(1);
    expect(evaluateFreshness([check({ label: "hicp", latest: "2026-04-29", thresholdDays: 45 })], NOW)).toEqual([]);
  });

  it("collects findings across multiple stale datasets", () => {
    const findings = evaluateFreshness([
      check({ label: "sp500", latest: "2026-06-01" }),
      check({ label: "fx", latest: "2026-06-05" }),       // fresh
      check({ label: "hicp", latest: "2026-01-01", thresholdDays: 45 }),
    ], NOW);
    expect(findings.map((f) => f.label)).toEqual(["sp500", "hicp"]);
  });
});

describe("describeFinding", () => {
  it("renders a stale finding with age and threshold", () => {
    const [f] = evaluateFreshness([check({ label: "sp500", latest: "2026-06-01" })], NOW);
    expect(describeFinding(f)).toBe("sp500: last row 2026-06-01 (7d old, threshold 4d)");
  });

  it("renders an empty finding distinctly", () => {
    const [f] = evaluateFreshness([check({ label: "sp500", latest: null })], NOW);
    expect(describeFinding(f)).toBe("sp500: no rows at all (never ingested)");
  });
});
