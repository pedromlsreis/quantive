// Pure freshness evaluation for the ingest dead-man's switch. No Deno- or
// Supabase-specific imports so the load-bearing staleness arithmetic stays
// under Vitest (mirrors benchmark-ingest/parsers.ts and entry-reminders/
// reminders.ts). The surrounding query + email plumbing lives in index.ts.

export type DatasetCheck = {
  /** Human label used in the alert, e.g. "S&P 500 (benchmarks.sp500)". */
  label: string;
  /** Most recent date present in the dataset (ISO YYYY-MM-DD), or null if empty. */
  latest: string | null;
  /** Max age in days before the dataset is stale; set per cadence to tolerate
   *  the source's legitimate gaps (weekends/holidays, publication lag). */
  thresholdDays: number;
};

export type StaleFinding = {
  label: string;
  /** null when the dataset is empty (never seeded — itself a finding). */
  latest: string | null;
  /** Age of `latest` in days, or null when empty. */
  ageDays: number | null;
  thresholdDays: number;
  /** Distinguishes "no rows at all" from "rows present but old". */
  reason: "empty" | "stale";
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns one finding per dataset that is empty or older than its threshold;
 * an empty result means everything is fresh. `now` is injectable for tests.
 * UTC-midnight epoch maths is timezone-safe (both sides are absolute instants).
 */
export function evaluateFreshness(checks: DatasetCheck[], now: Date): StaleFinding[] {
  const findings: StaleFinding[] = [];
  for (const c of checks) {
    if (c.latest === null) {
      findings.push({ label: c.label, latest: null, ageDays: null, thresholdDays: c.thresholdDays, reason: "empty" });
      continue;
    }
    const ageDays = (now.getTime() - new Date(`${c.latest}T00:00:00Z`).getTime()) / MS_PER_DAY;
    if (ageDays > c.thresholdDays) {
      findings.push({ label: c.label, latest: c.latest, ageDays, thresholdDays: c.thresholdDays, reason: "stale" });
    }
  }
  return findings;
}

/** One-line human summary of a finding, used in the alert subject and body. */
export function describeFinding(f: StaleFinding): string {
  if (f.reason === "empty") {
    return `${f.label}: no rows at all (never ingested)`;
  }
  return `${f.label}: last row ${f.latest} (${Math.floor(f.ageDays ?? 0)}d old, threshold ${f.thresholdDays}d)`;
}
