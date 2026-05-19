import { describe, it, expect, vi } from "vitest";
import {
  eurostatPeriodToDate,
  parseEurostatJson,
  parseFredCsv,
} from "./parsers";

describe("eurostatPeriodToDate", () => {
  it("anchors YYYY-MM to the first day of the month", () => {
    expect(eurostatPeriodToDate("2026-02")).toBe("2026-02-01");
    expect(eurostatPeriodToDate("2019-12")).toBe("2019-12-01");
  });

  it("tolerates surrounding whitespace", () => {
    expect(eurostatPeriodToDate("  2026-02  ")).toBe("2026-02-01");
  });

  it("throws on unrecognised period format", () => {
    expect(() => eurostatPeriodToDate("Feb 2026")).toThrow(/Unexpected/);
    expect(() => eurostatPeriodToDate("2026-2")).toThrow(/Unexpected/);
    expect(() => eurostatPeriodToDate("")).toThrow(/Unexpected/);
  });
});

describe("parseEurostatJson", () => {
  // A miniature, structurally-faithful Eurostat HICP JSON. The real response
  // has many more dimensions but only `dimension.time.category.index` and
  // `value` are load-bearing for our parser.
  const fixture = {
    value: {
      "0": 100.1,
      "1": 101.4,
      "2": 102.0,
    },
    dimension: {
      time: {
        category: {
          index: {
            "2025-12": 0,
            "2026-01": 1,
            "2026-02": 2,
          },
        },
      },
    },
  };

  it("converts a well-formed response into normalised rows", () => {
    const rows = parseEurostatJson(fixture);
    expect(rows).toEqual([
      { series_id: "inflation_eu", date: "2025-12-01", value: 100.1, currency: null, source: "eurostat" },
      { series_id: "inflation_eu", date: "2026-01-01", value: 101.4, currency: null, source: "eurostat" },
      { series_id: "inflation_eu", date: "2026-02-01", value: 102.0, currency: null, source: "eurostat" },
    ]);
  });

  it("throws when the time dimension is missing entirely (real schema change)", () => {
    expect(() => parseEurostatJson({ value: {} } as never)).toThrow(/dimension.time.category.index/);
  });

  it("skips rows with non-numeric or non-finite values and reports them via onSkip", () => {
    const onSkip = vi.fn();
    const broken = {
      value: {
        "0": 100.1,
        "1": "oops" as unknown as number,
        "2": Number.NaN,
        "3": 102.5,
      },
      dimension: {
        time: { category: { index: { "2025-12": 0, "2026-01": 1, "2026-02": 2, "2026-03": 3 } } },
      },
    };
    const rows = parseEurostatJson(broken, onSkip);
    expect(rows.map((r) => r.date)).toEqual(["2025-12-01", "2026-03-01"]);
    expect(onSkip).toHaveBeenCalledTimes(2);
    expect(onSkip.mock.calls[0][0]).toMatch(/non-numeric/);
  });

  it("skips rows whose index has no matching period", () => {
    const onSkip = vi.fn();
    const orphan = {
      value: { "0": 100.1, "99": 555.5 },
      dimension: { time: { category: { index: { "2026-01": 0 } } } },
    };
    const rows = parseEurostatJson(orphan, onSkip);
    expect(rows).toHaveLength(1);
    expect(onSkip).toHaveBeenCalledWith("no period for index", { idxStr: "99" });
  });
});

describe("parseFredCsv", () => {
  it("parses a typical CSV body into rows", () => {
    const csv = [
      "observation_date,SP500",
      "2026-05-13,5295.18",
      "2026-05-14,5305.42",
      "2026-05-15,5310.12",
    ].join("\n");
    const rows = parseFredCsv(csv);
    expect(rows).toEqual([
      { series_id: "sp500", date: "2026-05-13", value: 5295.18, currency: "USD", source: "fred" },
      { series_id: "sp500", date: "2026-05-14", value: 5305.42, currency: "USD", source: "fred" },
      { series_id: "sp500", date: "2026-05-15", value: 5310.12, currency: "USD", source: "fred" },
    ]);
  });

  it("handles CRLF line endings and trims values", () => {
    const csv = "observation_date,SP500\r\n2026-05-13,5295.18\r\n2026-05-14,5305.42\r\n";
    const rows = parseFredCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].value).toBe(5295.18);
  });

  it("skips FRED's missing-value sentinels (. and NA)", () => {
    const csv = [
      "observation_date,SP500",
      "2026-05-13,.",
      "2026-05-14,NA",
      "2026-05-15,5310.12",
    ].join("\n");
    const rows = parseFredCsv(csv);
    expect(rows).toEqual([
      { series_id: "sp500", date: "2026-05-15", value: 5310.12, currency: "USD", source: "fred" },
    ]);
  });

  it("skips non-numeric value rows defensively", () => {
    const csv = [
      "observation_date,SP500",
      "2026-05-13,not_a_number",
      "2026-05-14,5305.42",
    ].join("\n");
    const rows = parseFredCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-05-14");
  });

  it("throws when the CSV header is missing the SP500 column (real schema change)", () => {
    const csv = "observation_date,SOMETHING_ELSE\n2026-05-13,5295.18";
    expect(() => parseFredCsv(csv)).toThrow(/header missing SP500/);
  });

  it("throws when the CSV body is empty", () => {
    expect(() => parseFredCsv("")).toThrow(/unexpectedly empty/);
    expect(() => parseFredCsv("observation_date,SP500")).toThrow(/unexpectedly empty/);
  });
});
