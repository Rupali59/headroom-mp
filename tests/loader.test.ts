/**
 * Lane H — pins three things `src/data/loader.ts` decides and nothing
 * previously tested:
 *
 *   1. the night-band boundary (19:00-06:00, both ends inclusive) —
 *      DATA.md caveat 6 / the Sendhwa investigation;
 *   2. the voltage-class rule (highest mean installed MVA across the whole
 *      series wins) — DATA.md's voltage-class-mismatch task;
 *   3. the data-quality threshold (100% / 150% of installed capacity) —
 *      DATA.md caveat 5.
 *
 * Exercises `aggregateSubstations()`, the pure aggregation function split
 * out of `loadSubstations()` specifically so these can run without a
 * MongoDB connection (`src/data/loader.ts`'s file header explains the
 * split).
 */

import { describe, expect, it } from "vitest";
import {
  aggregateSubstations,
  classifyLoadQuality,
  isNightHour,
  pickPrimaryClass,
  slugifySubstation,
} from "../src/data/loader";

// ---------------------------------------------------------------- fixtures

/** Builds one raw loading row with sensible defaults, matching the private
 * `LoadingDoc` shape `src/data/loader.ts` reads from Mongo. Not imported by
 * name (that type isn't exported — it's an internal Mongo-doc mirror) but
 * TypeScript checks the object shape structurally at each call site. */
function row(overrides: {
  substation: string;
  voltage_class: string;
  month: string;
  installed_mva?: number | null;
  peak_mva?: number | null;
  peak_hour?: number | null;
  min_mva?: number | null;
}) {
  return {
    substation: overrides.substation,
    voltage_class: overrides.voltage_class,
    zone: "Z",
    district: "D",
    circle: "C",
    installed_mva: overrides.installed_mva ?? 100,
    peak_mva: overrides.peak_mva ?? 50,
    peak_hour: overrides.peak_hour ?? null,
    peak_is_night: null, // deliberately never trusted — see isNightHour tests
    peak_date: null,
    min_mva: overrides.min_mva ?? null,
    avg_mva: null,
    spare_at_peak_mva: null,
    month: overrides.month,
    source_url: "https://www.mptransco.in/example.xlsx",
  };
}

// ---------------------------------------------------------------- 1. night-band boundary

describe("isNightHour — DATA.md's 19:00-06:00 band, both ends inclusive", () => {
  it("18:00 is day (just before the evening edge)", () => {
    expect(isNightHour(18)).toBe(false);
  });
  it("19:00 is night (the evening edge is inclusive)", () => {
    expect(isNightHour(19)).toBe(true);
  });
  it("23:00 is night", () => {
    expect(isNightHour(23)).toBe(true);
  });
  it("00:00 is night (wraps past midnight)", () => {
    expect(isNightHour(0)).toBe(true);
  });
  it("06:00 is night (the morning edge is inclusive)", () => {
    expect(isNightHour(6)).toBe(true);
  });
  it("07:00 is day (just after the morning edge)", () => {
    expect(isNightHour(7)).toBe(false);
  });
  it("a null hour is treated as day, never as unknown-night", () => {
    expect(isNightHour(null)).toBe(false);
  });
});

// ---------------------------------------------------------------- 2. voltage-class rule

describe("pickPrimaryClass — the class with the highest mean installed MVA wins", () => {
  it("picks the class with more capacity even when it isn't the higher kV number", () => {
    // Mirrors the one genuine disagreement found in the real dataset while
    // writing this file: "400KV CHHEGAON"'s 220KV rows average MORE
    // installed MVA (654) than its own 400KV rows (630).
    const rows = [
      row({ substation: "400KV CHHEGAON", voltage_class: "400KV", month: "January'2024", installed_mva: 630 }),
      row({ substation: "400KV CHHEGAON", voltage_class: "220KV", month: "January'2024", installed_mva: 654 }),
      row({ substation: "400KV CHHEGAON", voltage_class: "220KV", month: "February'2024", installed_mva: 654 }),
    ];
    expect(pickPrimaryClass(rows)).toBe("220KV");
  });

  it("picks the higher kV number on an exact capacity tie", () => {
    const rows = [
      row({ substation: "X", voltage_class: "132KV", month: "January'2024", installed_mva: 100 }),
      row({ substation: "X", voltage_class: "220KV", month: "January'2024", installed_mva: 100 }),
    ];
    expect(pickPrimaryClass(rows)).toBe("220KV");
  });

  it("uses the median, not the mean, so one bad reading in an otherwise-smaller class can't flip the choice", () => {
    // 132KV: five consistent ~100 MVA months. 220KV: four consistent ~90
    // MVA months PLUS one wildly mis-recorded 900 MVA month. A mean would
    // let that single bad reading drag 220KV's average (90*4+900)/5=252
    // past 132KV's 100 and win; the median of [90,90,90,90,900] is still
    // 90, so 132KV correctly stays primary.
    const rows = [
      row({ substation: "X", voltage_class: "132KV", month: "January'2024", installed_mva: 100 }),
      row({ substation: "X", voltage_class: "132KV", month: "February'2024", installed_mva: 100 }),
      row({ substation: "X", voltage_class: "132KV", month: "March'2024", installed_mva: 100 }),
      row({ substation: "X", voltage_class: "132KV", month: "April'2024", installed_mva: 100 }),
      row({ substation: "X", voltage_class: "132KV", month: "May'2024", installed_mva: 100 }),
      row({ substation: "X", voltage_class: "220KV", month: "January'2024", installed_mva: 90 }),
      row({ substation: "X", voltage_class: "220KV", month: "February'2024", installed_mva: 90 }),
      row({ substation: "X", voltage_class: "220KV", month: "March'2024", installed_mva: 90 }),
      row({ substation: "X", voltage_class: "220KV", month: "April'2024", installed_mva: 90 }),
      row({ substation: "X", voltage_class: "220KV", month: "May'2024", installed_mva: 900 }), // one bad reading
    ];
    expect(pickPrimaryClass(rows)).toBe("132KV");
  });

  it("documents the limit: a class with only one observation has no protection from that observation being wrong", () => {
    // Not a bug — a median needs more than one data point to reject an
    // outlier. Pinned so a future change to pickPrimaryClass() can't
    // silently start claiming a robustness it doesn't have here either.
    const rows = [
      row({ substation: "X", voltage_class: "132KV", month: "January'2024", installed_mva: 100 }),
      row({ substation: "X", voltage_class: "220KV", month: "January'2024", installed_mva: 900 }),
    ];
    expect(pickPrimaryClass(rows)).toBe("220KV");
  });
});

// ---------------------------------------------------------------- 3. data-quality threshold

describe("classifyLoadQuality — DATA.md caveat 5: over-capacity vs implausible", () => {
  it("at or under 100% of installed capacity is ok", () => {
    expect(classifyLoadQuality(100, 100)).toBe("ok");
    expect(classifyLoadQuality(100, 60)).toBe("ok");
  });
  it("just over 100% is over-capacity, not implausible", () => {
    expect(classifyLoadQuality(100, 100.1)).toBe("over-capacity");
  });
  it("DATA.md's own worked example — 400KV KIRNAPUR at 101% — is over-capacity", () => {
    expect(classifyLoadQuality(200, 202)).toBe("over-capacity"); // 101%
  });
  it("exactly at the 150% line is still over-capacity (the line is exclusive)", () => {
    expect(classifyLoadQuality(100, 150)).toBe("over-capacity");
  });
  it("just over 150% is implausible", () => {
    expect(classifyLoadQuality(100, 150.1)).toBe("implausible");
  });
  it("DATA.md's own worked example — 132KV SALAMATPUR at 183% — is implausible", () => {
    expect(classifyLoadQuality(40, 73.25)).toBe("implausible"); // 183.1%
  });
  it("a missing input is ok — nothing to be suspicious of", () => {
    expect(classifyLoadQuality(null, 50)).toBe("ok");
    expect(classifyLoadQuality(100, null)).toBe("ok");
    expect(classifyLoadQuality(0, 10)).toBe("ok"); // guards divide-by-zero too
  });
});

// ---------------------------------------------------------------- integration: aggregateSubstations

describe("aggregateSubstations — quality gate on the aggregate", () => {
  it("a node with one implausible month is flagged implausible even though most months are fine", () => {
    const rows = [
      row({ substation: "220KV TESTNODE", voltage_class: "220KV", month: "January'2024", installed_mva: 100, peak_mva: 40 }),
      row({ substation: "220KV TESTNODE", voltage_class: "220KV", month: "February'2024", installed_mva: 100, peak_mva: 183 }), // implausible
      row({ substation: "220KV TESTNODE", voltage_class: "220KV", month: "March'2024", installed_mva: 100, peak_mva: 45 }),
    ];
    const [node] = aggregateSubstations(rows);
    expect(node.quality).toBe("implausible");
  });

  it("an over-capacity-only node is flagged over-capacity, not implausible", () => {
    const rows = [
      row({ substation: "220KV TESTNODE2", voltage_class: "220KV", month: "January'2024", installed_mva: 100, peak_mva: 105 }),
    ];
    const [node] = aggregateSubstations(rows);
    expect(node.quality).toBe("over-capacity");
  });

  it("a clean node is ok", () => {
    const rows = [
      row({ substation: "220KV TESTNODE3", voltage_class: "220KV", month: "January'2024", installed_mva: 100, peak_mva: 40 }),
    ];
    const [node] = aggregateSubstations(rows);
    expect(node.quality).toBe("ok");
  });
});

describe("aggregateSubstations — series is chronological and drops unparseable months", () => {
  it("orders a scoped node's series ascending by calendar month, not by row order", () => {
    // "220KV SENDHWA" is one of the labels GEOMETRY_LABEL_ALIAS resolves
    // (geometry id "sendhwa") — deliberately reused here rather than an
    // invented label, so this test also pins the series-scoping contract.
    const rows = [
      row({ substation: "220KV SENDHWA", voltage_class: "220KV", month: "March'2024", installed_mva: 160, peak_mva: 92, peak_hour: 14 }),
      row({ substation: "220KV SENDHWA", voltage_class: "220KV", month: "January'2024", installed_mva: 160, peak_mva: 76, peak_hour: 11 }),
      row({ substation: "220KV SENDHWA", voltage_class: "220KV", month: "February'2024", installed_mva: 160, peak_mva: 83, peak_hour: 13 }),
      // Unparseable filename-stem month — must be dropped from `series`
      // but still counted in observationCount.
      row({ substation: "220KV SENDHWA", voltage_class: "220KV", month: "R-Max-Loading-Nov-22-1", installed_mva: 160, peak_mva: 47, peak_hour: 12 }),
    ];
    const [node] = aggregateSubstations(rows);
    expect(node.series.map((s) => s.month)).toEqual(["January'2024", "February'2024", "March'2024"]);
    expect(node.observationCount).toBe(4);
  });

  it("a label GEOMETRY_LABEL_ALIAS does not resolve gets an empty series", () => {
    const rows = [
      row({ substation: "132KV SOME UNMATCHED SITE", voltage_class: "132KV", month: "January'2024" }),
    ];
    const [node] = aggregateSubstations(rows);
    expect(node.series).toEqual([]);
  });
});

describe("aggregateSubstations — Sendhwa night-peak finding (DATA.md caveat 6)", () => {
  it("finds no night-time peak for 220KV SENDHWA's primary (220KV) class — matches the source, not DATA.md's worked table", () => {
    // Reproduces the real source shape: the 220KV class's peaks all land
    // in daytime hours (including the exact 93.0/93.4 MVA values DATA.md's
    // worked table calls a "night peak"); the only genuine night-time
    // readings recorded for this raw label sit on the smaller 132KV class,
    // which pickPrimaryClass() correctly does not select as primary.
    const rows = [
      row({ substation: "220KV SENDHWA", voltage_class: "220KV", month: "January'2025", installed_mva: 160, peak_mva: 93.4, peak_hour: 11 }),
      row({ substation: "220KV SENDHWA", voltage_class: "220KV", month: "November'2025", installed_mva: 160, peak_mva: 93.0, peak_hour: 16 }),
      row({ substation: "220KV SENDHWA", voltage_class: "132KV", month: "May'2023", installed_mva: 63, peak_mva: 22, peak_hour: 5 }), // genuine night, wrong class
    ];
    const [node] = aggregateSubstations(rows);
    expect(node.voltageClass).toBe("220KV");
    expect(node.nightPeakMva).toBeNull();
  });
});

// ---------------------------------------------------------------- slugifySubstation (pre-existing, re-pinned)

describe("slugifySubstation", () => {
  it("strips the voltage-class prefix and hyphenates", () => {
    expect(slugifySubstation("220KV SENDHWA")).toBe("sendhwa");
    expect(slugifySubstation("400KV KATNI")).toBe("katni");
  });
});
