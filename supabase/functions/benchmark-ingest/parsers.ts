// Pure parsing logic for benchmark-ingest. No Deno-specific imports — this
// file is loaded both by the edge function (Deno runtime) and by the Vitest
// suite running on Node, so the load-bearing string/JSON shaping stays under
// CI even though the surrounding fetch + upsert plumbing does not.

export type Row = {
  series_id: string;
  date: string; // YYYY-MM-DD
  value: number;
  currency: string | null;
  source: string;
};

export type EurostatJson = {
  value: Record<string, number>;
  dimension: {
    time: { category: { index: Record<string, number> } };
  };
};

/**
 * Eurostat monthly periods are "YYYY-MM". Anchor to the 1st of the month so
 * the client's "month-end ≤ date" lookup is unambiguous. Whitespace is
 * tolerated because some Eurostat responses include trailing whitespace on
 * period strings.
 */
export function eurostatPeriodToDate(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!m) throw new Error(`Unexpected Eurostat period format: ${period}`);
  return `${m[1]}-${m[2]}-01`;
}

/**
 * Convert an Eurostat HICP JSON response into normalised rows. Throws if the
 * response shape is unrecognisable; logs and skips individual rows that fail
 * silent validation (non-numeric value, missing period for the index, etc.).
 * The `onSkip` callback is invoked per skipped row for observability —
 * the edge function wires this to its structured logger so a regression
 * shows up in function logs rather than as a quiet count discrepancy.
 */
export function parseEurostatJson(
  json: EurostatJson,
  onSkip: (reason: string, ctx: Record<string, unknown>) => void = () => {},
): Row[] {
  const timeIndex = json.dimension?.time?.category?.index;
  if (!timeIndex) {
    throw new Error("Eurostat response missing dimension.time.category.index");
  }
  const periodByIdx = new Map<number, string>();
  for (const [period, idx] of Object.entries(timeIndex)) {
    periodByIdx.set(idx, period);
  }
  const rows: Row[] = [];
  for (const [idxStr, value] of Object.entries(json.value)) {
    const idx = Number(idxStr);
    const period = periodByIdx.get(idx);
    if (!period) {
      onSkip("no period for index", { idxStr });
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      onSkip("non-numeric value", { idxStr, period, value });
      continue;
    }
    rows.push({
      series_id: "inflation_eu",
      date: eurostatPeriodToDate(period),
      value,
      currency: null,
      source: "eurostat",
    });
  }
  return rows;
}

/**
 * Convert a FRED CSV response (e.g. `observation_date,SP500\n2026-05-15,5310.12`)
 * into normalised rows. FRED encodes missing values as ".", and rare older
 * series sometimes use "NA"; both are skipped. Values are trimmed before
 * comparison and Number-cast to tolerate CRLF / trailing whitespace coming
 * from the upstream CSV.
 */
export function parseFredCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error(`FRED CSV unexpectedly empty (${lines.length} lines)`);
  }
  const header = lines[0].toLowerCase();
  if (!header.includes("sp500") && !header.includes("sp_500")) {
    throw new Error(`FRED CSV header missing SP500: ${lines[0]}`);
  }
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const date = parts[0]?.trim();
    const valueRaw = parts[1]?.trim();
    if (!date || !valueRaw) continue;
    if (valueRaw === "." || valueRaw === "NA") continue;
    const value = Number(valueRaw);
    if (!Number.isFinite(value)) continue;
    rows.push({
      series_id: "sp500",
      date,
      value,
      currency: "USD",
      source: "fred",
    });
  }
  return rows;
}
