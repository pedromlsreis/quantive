// Pure freshness evaluation for the ingest dead-man's switch. No Deno- or
// Supabase-specific imports so the load-bearing staleness arithmetic stays
// under Vitest (mirrors benchmark-ingest/parsers.ts and entry-reminders/
// reminders.ts). The surrounding query + email plumbing lives in index.ts.

export type DatasetCheck = {
  /** Human label used in the alert, e.g. "S&P 500 (benchmarks.sp500)". */
  label: string;
  /** Most recent date present in the dataset (ISO YYYY-MM-DD), or null if empty. */
  latest: string | null;
  /**
   * Maximum age in whole days before the dataset is considered stale. Tuned
   * per cadence to tolerate the source's *legitimate* gaps without paging:
   *   - daily series (sp500, fx_rates): markets close weekends + holidays AND
   *     the upstream (FRED) can lag a trading day, so on a Monday a healthy
   *     "latest" can be Thursday's close (~4.5 days old) before Friday has even
   *     propagated. 5 days absorbs that single not-yet-published day while
   *     still firing well inside a real multi-day freeze.
   *   - monthly series (inflation_eu): ~3-week publication lag + the chance an
   *     expected month simply has not posted yet → 45 days.
   */
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
 * Returns one finding per dataset that is either empty or older than its
 * threshold. An empty result means everything is fresh — the dead-man's
 * switch stays silent. `now` is injectable for tests.
 *
 * The age maths mirrors benchmarkSeries.isStale: subtracting a UTC-midnight
 * epoch from `now` (absolute ms-since-epoch) is timezone-safe because both
 * sides are absolute instants.
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
