/**
 * Lane G — `sparkline.tsx`'s geometry and winter-detection helpers. DATA.md
 * "Seasonality, computed not asserted": winter nights run hotter — this
 * pins that a winter month is actually detected and that a missing month
 * renders as a gap, never a fabricated zero (DATA.md caveat 3).
 */

import { describe, expect, it } from "vitest";
import {
  computeSparklineGeometry,
  buildSparklinePath,
  isWinterMonth,
  type SparklinePoint,
} from "../src/components/map/sparkline";

describe("isWinterMonth", () => {
  it("matches the clean MonthName'Year form for Dec/Jan/Feb", () => {
    expect(isWinterMonth("December'2025")).toBe(true);
    expect(isWinterMonth("January'2026")).toBe(true);
    expect(isWinterMonth("February'2026")).toBe(true);
  });

  it("matches a filename-stem label that still embeds the month name", () => {
    expect(isWinterMonth("MAX-LOADI-JANUARY-21092023")).toBe(true);
  });

  it("does not match a non-winter month", () => {
    expect(isWinterMonth("July'2026")).toBe(false);
    expect(isWinterMonth("SimJune26nn")).toBe(false);
  });
});

describe("computeSparklineGeometry", () => {
  const points: SparklinePoint[] = [
    { month: "November'2025", nightUtilisationPct: 40 },
    { month: "December'2025", nightUtilisationPct: 55 },
    { month: "January'2026", nightUtilisationPct: 88 },
    { month: "February'2026", nightUtilisationPct: null },
    { month: "March'2026", nightUtilisationPct: 60 },
  ];

  it("flags winter points and leaves the missing month as a null y (a gap, not zero)", () => {
    const geoms = computeSparklineGeometry(points, 100, 40);
    expect(geoms.map((g) => g.isWinter)).toEqual([false, true, true, true, false]);
    expect(geoms[3].y).toBeNull();
    expect(geoms[3].value).toBeNull();
  });

  it("spaces points evenly by index across the given width", () => {
    const geoms = computeSparklineGeometry(points, 100, 40);
    expect(geoms[0].x).toBe(0);
    expect(geoms[geoms.length - 1].x).toBe(100);
  });

  it("a reading above 100% is flagged as an exception, not silently clamped away", () => {
    const withExceedance: SparklinePoint[] = [
      { month: "June'2026", nightUtilisationPct: 183 },
    ];
    const geoms = computeSparklineGeometry(withExceedance, 100, 40);
    expect(geoms[0].exceeds).toBe(true);
    // The point is still plotted (clamped visually to the widened domain),
    // never dropped from the chart.
    expect(geoms[0].y).not.toBeNull();
  });

  it("builds a path with a break at the gap, never a line through a fabricated zero", () => {
    const geoms = computeSparklineGeometry(points, 100, 40);
    const path = buildSparklinePath(geoms);
    // One M per contiguous run: [Nov,Dec,Jan] then a gap then [Mar].
    expect(path.match(/M /g)?.length).toBe(2);
    expect(path.match(/L /g)?.length).toBe(2);
  });
});
