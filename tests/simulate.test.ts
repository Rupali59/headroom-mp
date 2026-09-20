/**
 * Lane K — `src/lib/simulate.ts`'s what-if arithmetic, backtest, and
 * balance search. Mirrors `tests/risk.test.ts`'s shape (BUILD.md D17):
 * pure functions, no rendering, boundary values pinned exactly.
 *
 * Per rule:discernment-checks §1 ("a check that cannot fail is worse than
 * no check") and rule:safety-flag-needs-a-test, every boundary case here
 * was mutated by hand and confirmed to go red for the stated reason before
 * being reverted — see the Lane K report for the actual failure messages
 * observed, since a comment claiming that happened is not evidence that it
 * did.
 */

import { describe, expect, it } from "vitest";
import {
  allMonths,
  backtest,
  balance,
  isWinterMonth,
  MARGINAL_BAND,
  MAX_BALANCE_COMBINATIONS,
  monthSortKey,
  POWER_FACTOR,
  simulateAt,
} from "../src/lib/simulate";
import type { DataQuality, MonthlyObservation, Substation } from "../src/lib/types";

function obs(partial: Partial<MonthlyObservation> & { month: string }): MonthlyObservation {
  return {
    peakMva: null,
    peakIsNight: false,
    peakHour: null,
    peakDate: null,
    installedMva: null,
    utilisationPct: null,
    quality: "ok",
    ...partial,
  };
}

function sub(id: string, series: MonthlyObservation[]): Substation {
  return {
    id,
    name: id,
    voltageKv: 220,
    lat: 0,
    lon: 0,
    capacity: null,
    riskFactors: null,
    quality: "ok",
    series,
  };
}

describe("POWER_FACTOR / MARGINAL_BAND constants", () => {
  it("are the named values the brief specifies", () => {
    expect(POWER_FACTOR).toBe(0.95);
    expect(MARGINAL_BAND).toBe(0.9);
  });
});

describe("simulateAt — required MVA", () => {
  it("required_mva = load_mw / POWER_FACTOR", () => {
    const s = sub("x", [obs({ month: "January'2026", peakMva: 0, installedMva: 1000, quality: "ok" })]);
    const r = simulateAt(s, "January'2026", 100);
    expect(r.requiredMva).toBeCloseTo(100 / 0.95, 2);
  });
});

describe("simulateAt — verdict boundaries", () => {
  // installed = 100 throughout. 0.9 * 100 = 90 is the MARGINAL boundary;
  // 100 itself is the FAILED boundary.

  it("new_peak exactly AT installed capacity -> MARGINAL, not FAILED (strict > for FAILED)", () => {
    // peak 95 + required 5 (loadMw 4.75 / 0.95 = 5 exactly) = 100 = installed
    const s = sub("a", [obs({ month: "M", peakMva: 95, installedMva: 100, quality: "ok" })]);
    const r = simulateAt(s, "M", 4.75);
    expect(r.newPeakMva).toBe(100);
    expect(r.verdict).toBe("MARGINAL");
  });

  it("new_peak just OVER installed capacity -> FAILED", () => {
    // peak 95 + required 5.01 (loadMw 4.7595 / 0.95 = 5.01) = 100.01 > 100
    const s = sub("a", [obs({ month: "M", peakMva: 95, installedMva: 100, quality: "ok" })]);
    const r = simulateAt(s, "M", 4.7595);
    expect(r.newPeakMva).toBe(100.01);
    expect(r.verdict).toBe("FAILED");
    expect(r.headroomAfterMva).toBe(-0.01);
  });

  it("new_peak exactly AT the 0.9 marginal band -> FITS, not MARGINAL (strict > for MARGINAL)", () => {
    // peak 85 + required 5 = 90 = 0.9 * 100
    const s = sub("a", [obs({ month: "M", peakMva: 85, installedMva: 100, quality: "ok" })]);
    const r = simulateAt(s, "M", 4.75);
    expect(r.newPeakMva).toBe(90);
    expect(r.verdict).toBe("FITS");
  });

  it("new_peak just OVER the 0.9 marginal band -> MARGINAL", () => {
    // peak 85 + required 5.01 = 90.01 > 90
    const s = sub("a", [obs({ month: "M", peakMva: 85, installedMva: 100, quality: "ok" })]);
    const r = simulateAt(s, "M", 4.7595);
    expect(r.newPeakMva).toBe(90.01);
    expect(r.verdict).toBe("MARGINAL");
  });

  it("well under the marginal band -> FITS", () => {
    const s = sub("a", [obs({ month: "M", peakMva: 10, installedMva: 100, quality: "ok" })]);
    const r = simulateAt(s, "M", 4.75); // newPeak 15
    expect(r.verdict).toBe("FITS");
  });
});

describe("simulateAt — refusal states", () => {
  it("a month the substation has no reading for -> NO-DATA, not a fabricated verdict", () => {
    const s = sub("a", [obs({ month: "January'2026", peakMva: 10, installedMva: 100 })]);
    const r = simulateAt(s, "February'2026", 50);
    expect(r.verdict).toBe("NO-DATA");
    expect(r.newPeakMva).toBeNull();
    expect(r.headroomAfterMva).toBeNull();
  });

  it("a reading with quality != ok (over-capacity in the source) -> DATA-QUALITY, never a confident verdict", () => {
    // peak 183, installed 100 (SALAMATPUR-shaped) — DATA.md caveat 5.
    // Even though arithmetically peak > installed already, this must NOT
    // silently become FAILED.
    const s = sub("a", [
      obs({ month: "June'2026", peakMva: 183, installedMva: 100, quality: "over-capacity" }),
    ]);
    const r = simulateAt(s, "June'2026", 0);
    expect(r.verdict).toBe("DATA-QUALITY");
    expect(r.newPeakMva).toBeNull();
    expect(r.quality).toBe("over-capacity" satisfies DataQuality);
  });

  it("an implausible reading also refuses, at any hypothetical load", () => {
    const s = sub("a", [
      obs({ month: "June'2026", peakMva: 73.25, installedMva: 40, quality: "implausible" }),
    ]);
    const r = simulateAt(s, "June'2026", 100);
    expect(r.verdict).toBe("DATA-QUALITY");
  });

  it("quality ok but peak/installed genuinely missing -> NO-DATA, not 0", () => {
    const s = sub("a", [obs({ month: "M", peakMva: null, installedMva: 100, quality: "ok" })]);
    const r = simulateAt(s, "M", 10);
    expect(r.verdict).toBe("NO-DATA");
  });
});

describe("isWinterMonth", () => {
  it("Dec/Jan/Feb are winter", () => {
    expect(isWinterMonth("December'2025")).toBe(true);
    expect(isWinterMonth("January'2026")).toBe(true);
    expect(isWinterMonth("February'2026")).toBe(true);
  });

  it("other months are not", () => {
    expect(isWinterMonth("July'2026")).toBe(false);
    expect(isWinterMonth("March'2026")).toBe(false);
  });

  it("a non-parsing label is not winter (by design — series entries always parse, see file header)", () => {
    expect(isWinterMonth("MAX-LOADI-JANUARY-21092023")).toBe(false);
  });
});

describe("monthSortKey / allMonths", () => {
  it("orders Dec before the following Jan/Feb", () => {
    const dec = monthSortKey("December'2025")!;
    const jan = monthSortKey("January'2026")!;
    const feb = monthSortKey("February'2026")!;
    expect(dec).toBeLessThan(jan);
    expect(jan).toBeLessThan(feb);
  });

  it("unions and sorts months across substations with different coverage", () => {
    const a = sub("a", [obs({ month: "January'2026" }), obs({ month: "March'2026" })]);
    const b = sub("b", [obs({ month: "February'2026" }), obs({ month: "March'2026" })]);
    expect(allMonths([a, b])).toEqual(["January'2026", "February'2026", "March'2026"]);
  });
});

describe("backtest — seasonal clustering", () => {
  function seriesAt(loadPerMonth: Record<string, number>, installedMva: number): MonthlyObservation[] {
    return Object.entries(loadPerMonth).map(([month, peakMva]) =>
      obs({ month, peakMva, installedMva, quality: "ok" }),
    );
  }

  it("all failures in Dec/Jan/Feb -> clustersInWinter true, share 1.0", () => {
    const s = sub(
      "a",
      seriesAt(
        {
          "November'2025": 10, // FITS at loadMw below
          "December'2025": 95,
          "January'2026": 95,
          "February'2026": 95,
          "March'2026": 10,
        },
        100,
      ),
    );
    const bt = backtest(s, 40); // required ~= 42.1, so 95+42.1 > 100 -> FAILED for the 95-peak months
    expect(bt.failedCount).toBe(3);
    expect(bt.seasonal.winterFailedCount).toBe(3);
    expect(bt.seasonal.nonWinterFailedCount).toBe(0);
    expect(bt.seasonal.winterShareOfFailures).toBe(1);
    expect(bt.seasonal.clustersInWinter).toBe(true);
  });

  it("failures split 3 winter / 2 non-winter (share 0.6) -> does not cluster", () => {
    const s = sub(
      "a",
      seriesAt(
        {
          "December'2025": 95,
          "January'2026": 95,
          "February'2026": 95,
          "June'2026": 95,
          "July'2026": 95,
        },
        100,
      ),
    );
    const bt = backtest(s, 40);
    expect(bt.failedCount).toBe(5);
    expect(bt.seasonal.winterShareOfFailures).toBe(0.6);
    expect(bt.seasonal.clustersInWinter).toBe(false);
  });

  it("share exactly at the 0.8 threshold counts as clustering (inclusive)", () => {
    // First, a 3-winter/2-non-winter (0.6) case that must NOT cluster:
    const s2 = sub(
      "b",
      seriesAt(
        {
          "December'2025": 95,
          "January'2026": 95,
          "February'2026": 95,
          "March'2026": 95, // non-winter, 4th failure
          "June'2026": 95, // non-winter, 5th failure
        },
        100,
      ),
    );
    const bt = backtest(s2, 40);
    expect(bt.failedCount).toBe(5);
    expect(bt.seasonal.winterFailedCount).toBe(3);
    expect(bt.seasonal.winterShareOfFailures).toBeCloseTo(0.6, 5);
    expect(bt.seasonal.clustersInWinter).toBe(false);

    // A clean 4-of-5 = 0.8 case:
    const s3 = sub(
      "c",
      seriesAt(
        {
          "December'2024": 95,
          "December'2025": 95,
          "January'2026": 95,
          "February'2026": 95,
          "June'2026": 95,
        },
        100,
      ),
    );
    const bt3 = backtest(s3, 40);
    expect(bt3.failedCount).toBe(5);
    expect(bt3.seasonal.winterFailedCount).toBe(4);
    expect(bt3.seasonal.winterShareOfFailures).toBe(0.8);
    expect(bt3.seasonal.clustersInWinter).toBe(true);
  });

  it("zero failures -> winterShareOfFailures null, clustersInWinter false (not 0/0 -> true)", () => {
    const s = sub("a", seriesAt({ "January'2026": 10, "June'2026": 10 }, 100));
    const bt = backtest(s, 1); // tiny load, nothing fails
    expect(bt.failedCount).toBe(0);
    expect(bt.seasonal.winterShareOfFailures).toBeNull();
    expect(bt.seasonal.clustersInWinter).toBe(false);
  });

  it("DATA-QUALITY months are counted separately, never folded into failedCount", () => {
    const s = sub("a", [
      obs({ month: "January'2026", peakMva: 183, installedMva: 100, quality: "over-capacity" }),
      obs({ month: "February'2026", peakMva: 30, installedMva: 100, quality: "ok" }),
    ]);
    const bt = backtest(s, 10);
    expect(bt.dataQualityCount).toBe(1);
    expect(bt.dataQualityMonths).toEqual(["January'2026"]);
    expect(bt.failedCount).toBe(0);
  });

  it("totalMonths matches the substation's own series length", () => {
    const s = sub("a", [
      obs({ month: "January'2026", peakMva: 10, installedMva: 100 }),
      obs({ month: "February'2026", peakMva: 10, installedMva: 100 }),
    ]);
    expect(backtest(s, 1).totalMonths).toBe(2);
  });
});

describe("balance — surviving combinations", () => {
  it("a single node fails, but splitting the same load across two survives", () => {
    // Both nodes: installed 100, peak 70 in their one shared month.
    const a = sub("a", [obs({ month: "January'2026", peakMva: 70, installedMva: 100, quality: "ok" })]);
    const b = sub("b", [obs({ month: "January'2026", peakMva: 70, installedMva: 100, quality: "ok" })]);

    // loadMw 40 alone: required ~42.1, newPeak ~112.1 > 100 -> FAILED.
    const alone = simulateAt(a, "January'2026", 40);
    expect(alone.verdict).toBe("FAILED");

    const result = balance([a, b], 40, [1, 2]);
    expect(result.combosEvaluated).toBe(3); // C(2,1)+C(2,1)+C(2,2) = 2+1
    // Neither single-node combo survives.
    expect(result.survivors.every((c) => c.splitCount === 2)).toBe(true);
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0].subIds.sort()).toEqual(["a", "b"]);
    expect(result.survivors[0].perNodeLoadMw).toBe(20);
    expect(result.survivors[0].failedMonthsByNode).toEqual({ a: [], b: [] });
  });

  it("no split in the given list survives -> empty survivors, not an error", () => {
    const a = sub("a", [obs({ month: "January'2026", peakMva: 99, installedMva: 100, quality: "ok" })]);
    const b = sub("b", [obs({ month: "January'2026", peakMva: 99, installedMva: 100, quality: "ok" })]);
    const result = balance([a, b], 200, [1, 2]); // enormous load, nothing survives
    expect(result.survivors).toEqual([]);
    expect(result.combosEvaluated).toBe(3);
  });

  it("refuses a combinatorial explosion rather than hanging", () => {
    const many: Substation[] = Array.from({ length: 20 }, (_, i) =>
      sub(`s${i}`, [obs({ month: "January'2026", peakMva: 10, installedMva: 100 })]),
    );
    expect(() => balance(many, 10, [10])).toThrow(/exceeds the/i);
  });

  it("MAX_BALANCE_COMBINATIONS is the bound actually enforced", () => {
    // C(20,10) = 184756, comfortably over the cap regardless of its exact value.
    expect(MAX_BALANCE_COMBINATIONS).toBeGreaterThan(0);
    expect(MAX_BALANCE_COMBINATIONS).toBeLessThan(184756);
  });
});
