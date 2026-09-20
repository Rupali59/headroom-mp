/**
 * Lane G — `load-bar.tsx`'s geometry arithmetic. DATA.md caveat 5: any
 * reading above 100% of installed capacity is a data-quality exception,
 * never a confident bar — pinned here the way `risk.test.ts` pins
 * `risk.ts`.
 */

import { describe, expect, it } from "vitest";
import { computeLoadBarGeometry } from "../src/components/map/load-bar";

describe("computeLoadBarGeometry", () => {
  it("a normal reading (below installed) does not flag an exception", () => {
    const geo = computeLoadBarGeometry({ installedMva: 1445, peakMva: 914 });
    expect(geo.exceedsInstalled).toBe(false);
    expect(geo.utilisationPct).toBeCloseTo((914 / 1445) * 100, 5);
    expect(geo.domainMax).toBe(1445);
    expect(geo.installedPct).toBe(100);
    expect(geo.peakPct).toBeCloseTo((914 / 1445) * 100, 5);
  });

  it("132KV SALAMATPUR-shaped reading (183%) flags the exception and leaves headroom in the domain", () => {
    const geo = computeLoadBarGeometry({ installedMva: 40, peakMva: 73.25 });
    expect(geo.exceedsInstalled).toBe(true);
    expect(geo.utilisationPct).toBeCloseTo(183.125, 2);
    // Domain is widened past the peak, so the fill never reaches 100% of
    // the track — "never a confident bar."
    expect(geo.domainMax).toBeGreaterThan(73.25);
    expect(geo.peakPct).toBeLessThan(100);
    // The installed-capacity reference line sits well inside the track,
    // not at the far edge, because the peak blew past it.
    expect(geo.installedPct).toBeLessThan(geo.peakPct);
  });

  it("a 101% reading (400KV KIRNAPUR-shaped) still flags — the threshold is exactly 100, not a rounding margin", () => {
    const geo = computeLoadBarGeometry({ installedMva: 100, peakMva: 101 });
    expect(geo.exceedsInstalled).toBe(true);
  });

  it("min and average positions are proportional to the domain, and null when absent", () => {
    const geo = computeLoadBarGeometry({
      installedMva: 200,
      peakMva: 150,
      minMva: 40,
      avgMva: 90,
    });
    expect(geo.minPct).toBeCloseTo(20, 5);
    expect(geo.avgPct).toBeCloseTo(45, 5);

    const bare = computeLoadBarGeometry({ installedMva: 200, peakMva: 150 });
    expect(bare.minPct).toBeNull();
    expect(bare.avgPct).toBeNull();
  });

  it("zero installed capacity never divides by zero", () => {
    const geo = computeLoadBarGeometry({ installedMva: 0, peakMva: 10 });
    expect(Number.isFinite(geo.utilisationPct)).toBe(true);
    expect(geo.utilisationPct).toBe(0);
  });
});
