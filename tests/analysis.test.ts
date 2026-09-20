import { describe, expect, it } from "vitest";
import {
  filterSubstations,
  hasQualityException,
  rankForLoad,
  resolveCity,
  toAnalysisSubstation,
  type AnalysisSubstation,
} from "@/lib/analysis";
import { dist } from "@/lib/projection";
import { CITIES } from "@/data/geometry";
import type { Field } from "@/lib/types";
import type { SubstationLoad } from "@/data/loader";

/**
 * Lane J, task 6: "Pure functions, so this is cheap and there is no
 * excuse." Fixtures below are hand-built rather than loaded from
 * `data-local/mpptcl-loading.json` so every boundary is exact and
 * independent of the live data (which can change with a re-ingest).
 */

function field(v: number, note = ""): Field<number> {
  return {
    v,
    unit: "MVA",
    conf: "verified",
    src: "test-fixture",
    page: null,
    asOf: "2026-09",
    by: "ingest",
    at: 0,
    note,
  };
}

const BHOPAL = CITIES.find((c) => c.name === "Bhopal")!;
const INDORE = CITIES.find((c) => c.name === "Indore")!;

function node(overrides: Partial<AnalysisSubstation>): AnalysisSubstation {
  return {
    id: "test-node",
    name: "Test Node",
    voltageClass: "400KV",
    lat: BHOPAL.lat,
    lon: BHOPAL.lon,
    installedMva: field(1000),
    nightPeakMva: field(500),
    spareAtNightMva: field(500),
    nightUtilisation: field(50),
    minMva: field(400),
    observationCount: 55,
    quality: "ok",
    ...overrides,
  };
}

describe("filterSubstations", () => {
  it("keeps only the requested voltage classes", () => {
    const subs = [
      node({ id: "a", voltageClass: "400KV" }),
      node({ id: "b", voltageClass: "220KV" }),
      node({ id: "c", voltageClass: "132KV" }),
    ];
    const out = filterSubstations(subs, {
      voltageClasses: new Set(["400KV", "220KV"]),
    });
    expect(out.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("an explicitly empty voltageClasses set filters everything out", () => {
    const subs = [node({ id: "a" }), node({ id: "b" })];
    const out = filterSubstations(subs, { voltageClasses: new Set() });
    expect(out).toEqual([]);
  });

  it("undefined voltageClasses imposes no constraint", () => {
    const subs = [node({ id: "a" }), node({ id: "b" })];
    expect(filterSubstations(subs, {}).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("minSpareMva is inclusive at the boundary", () => {
    const subs = [
      node({ id: "at", spareAtNightMva: field(100) }),
      node({ id: "below", spareAtNightMva: field(99.9) }),
      node({ id: "above", spareAtNightMva: field(100.1) }),
    ];
    const out = filterSubstations(subs, { minSpareMva: 100 });
    expect(out.map((s) => s.id).sort()).toEqual(["above", "at"]);
  });

  it("excludes null spareAtNightMva when minSpareMva is set (unknown never passes)", () => {
    const subs = [
      node({ id: "known", spareAtNightMva: field(500) }),
      node({ id: "unknown", spareAtNightMva: null }),
    ];
    const out = filterSubstations(subs, { minSpareMva: 1 });
    expect(out.map((s) => s.id)).toEqual(["known"]);
  });

  it("null spareAtNightMva is NOT excluded when minSpareMva is unset", () => {
    const subs = [node({ id: "unknown", spareAtNightMva: null })];
    expect(filterSubstations(subs, {}).map((s) => s.id)).toEqual(["unknown"]);
  });

  it("maxNightUtilisation is inclusive at the boundary", () => {
    const subs = [
      node({ id: "at", nightUtilisation: field(80) }),
      node({ id: "below", nightUtilisation: field(79.9) }),
      node({ id: "above", nightUtilisation: field(80.1) }),
    ];
    const out = filterSubstations(subs, { maxNightUtilisation: 80 });
    expect(out.map((s) => s.id).sort()).toEqual(["at", "below"]);
  });

  it("excludes null nightUtilisation when maxNightUtilisation is set", () => {
    const subs = [
      node({ id: "known", nightUtilisation: field(50) }),
      node({ id: "unknown", nightUtilisation: null }),
    ];
    expect(
      filterSubstations(subs, { maxNightUtilisation: 100 }).map((s) => s.id)
    ).toEqual(["known"]);
  });

  it("quality: 'exclude-exceptions' removes flagged rows; 'all' and unset do not", () => {
    const subs = [
      node({ id: "clean", nightUtilisation: field(50) }),
      node({ id: "flagged", nightUtilisation: field(183), quality: "implausible" }),
    ];
    expect(
      filterSubstations(subs, { quality: "exclude-exceptions" }).map(
        (s) => s.id
      )
    ).toEqual(["clean"]);
    expect(
      filterSubstations(subs, { quality: "all" }).map((s) => s.id)
    ).toEqual(["clean", "flagged"]);
    expect(filterSubstations(subs, {}).map((s) => s.id)).toEqual([
      "clean",
      "flagged",
    ]);
  });

  it("combines constraints (AND, not OR)", () => {
    const subs = [
      node({ id: "pass", voltageClass: "400KV", spareAtNightMva: field(200), nightUtilisation: field(50) }),
      node({ id: "wrong-class", voltageClass: "220KV", spareAtNightMva: field(200), nightUtilisation: field(50) }),
      node({ id: "too-little-spare", voltageClass: "400KV", spareAtNightMva: field(1), nightUtilisation: field(50) }),
      node({ id: "too-hot", voltageClass: "400KV", spareAtNightMva: field(200), nightUtilisation: field(99) }),
    ];
    const out = filterSubstations(subs, {
      voltageClasses: new Set(["400KV"]),
      minSpareMva: 100,
      maxNightUtilisation: 80,
    });
    expect(out.map((s) => s.id)).toEqual(["pass"]);
  });
});

describe("hasQualityException — DATA.md caveat 5", () => {
  it('flags "over-capacity" (e.g. 400KV KIRNAPUR at 101%)', () => {
    expect(hasQualityException(node({ quality: "over-capacity" }))).toBe(
      true
    );
  });

  it('flags "implausible" (e.g. 132KV SALAMATPUR at 183%)', () => {
    expect(hasQualityException(node({ quality: "implausible" }))).toBe(true);
  });

  it('does not flag "ok"', () => {
    expect(hasQualityException(node({ quality: "ok" }))).toBe(false);
  });

  it("goes strictly off the quality field, not the utilisation number", () => {
    // Contradictory fixtures on purpose, to prove `quality` — not
    // `nightUtilisation` — is what this function reads.
    expect(
      hasQualityException(
        node({ nightUtilisation: field(50), quality: "over-capacity" })
      )
    ).toBe(true);
    expect(
      hasQualityException(
        node({ nightUtilisation: field(150), quality: "ok" })
      )
    ).toBe(false);
  });
});

describe("resolveCity", () => {
  it("resolves an exact, case-insensitive name from CITIES", () => {
    expect(resolveCity("bhopal")).toEqual({
      name: "Bhopal",
      lat: BHOPAL.lat,
      lon: BHOPAL.lon,
    });
  });

  it("returns null for a city not in CITIES, rather than guessing", () => {
    expect(resolveCity("Timbuktu")).toBeNull();
  });
});

describe("rankForLoad", () => {
  it("returns [] for an unresolvable city rather than throwing", () => {
    const out = rankForLoad([node({})], {
      loadMw: 100,
      nearCity: "Nowhere",
      radiusKm: 250,
      needsNight: true,
    });
    expect(out).toEqual([]);
  });

  it("excludes candidates outside the radius", () => {
    const near = node({ id: "near", lat: BHOPAL.lat, lon: BHOPAL.lon });
    const far = node({ id: "far", lat: INDORE.lat, lon: INDORE.lon });
    const farDistance = dist(BHOPAL.lat, BHOPAL.lon, INDORE.lat, INDORE.lon);
    expect(farDistance).toBeGreaterThan(100); // sanity: Indore really is far from Bhopal

    const out = rankForLoad([near, far], {
      loadMw: 100,
      nearCity: "Bhopal",
      radiusKm: 50,
      needsNight: true,
    });
    expect(out.map((r) => r.substation.id)).toEqual(["near"]);
  });

  it("orders by meetsLoad first, then spare MVA descending", () => {
    const subs = [
      // Fails the load, but has more spare than the other failure.
      node({ id: "fails-more-spare", spareAtNightMva: field(80) }),
      // Meets the load, with less spare than the other pass.
      node({ id: "meets-less-spare", spareAtNightMva: field(120) }),
      // Meets the load, with the most spare of anyone — should rank #1.
      node({ id: "meets-most-spare", spareAtNightMva: field(150) }),
      // Fails the load, less spare — should rank last among the two failures.
      node({ id: "fails-less-spare", spareAtNightMva: field(10) }),
    ];
    const out = rankForLoad(subs, {
      loadMw: 100,
      nearCity: "Bhopal",
      radiusKm: 250,
      needsNight: true,
    });
    expect(out.map((r) => r.substation.id)).toEqual([
      "meets-most-spare",
      "meets-less-spare",
      "fails-more-spare",
      "fails-less-spare",
    ]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("uses distance as the tiebreak only when spare MVA is equal", () => {
    const subs = [
      node({
        id: "far-equal-spare",
        spareAtNightMva: field(150),
        lat: BHOPAL.lat + 0.5,
        lon: BHOPAL.lon,
      }),
      node({ id: "near-equal-spare", spareAtNightMva: field(150) }),
    ];
    const out = rankForLoad(subs, {
      loadMw: 100,
      nearCity: "Bhopal",
      radiusKm: 250,
      needsNight: true,
    });
    expect(out.map((r) => r.substation.id)).toEqual([
      "near-equal-spare",
      "far-equal-spare",
    ]);
  });

  it("ranks a node with no night data below one with known-but-insufficient data", () => {
    const subs = [
      node({ id: "known-insufficient", spareAtNightMva: field(1) }),
      node({ id: "unknown", spareAtNightMva: null }),
    ];
    const out = rankForLoad(subs, {
      loadMw: 100,
      nearCity: "Bhopal",
      radiusKm: 250,
      needsNight: true,
    });
    expect(out.map((r) => r.substation.id)).toEqual([
      "known-insufficient",
      "unknown",
    ]);
  });

  it("every candidate carries the four named criteria with correct met/failed and real numbers in the label", () => {
    const subs = [node({ id: "x", spareAtNightMva: field(150), nightUtilisation: field(50) })];
    const [row] = rankForLoad(subs, {
      loadMw: 100,
      nearCity: "Bhopal",
      radiusKm: 250,
      needsNight: true,
    });
    expect(row.criteria.map((c) => c.key)).toEqual([
      "within-radius",
      "has-night-data",
      "meets-load",
      "data-quality",
    ]);
    const meetsLoad = row.criteria.find((c) => c.key === "meets-load")!;
    expect(meetsLoad.met).toBe(true);
    expect(meetsLoad.label).toContain("150");
    expect(meetsLoad.label).toContain("100");
  });

  it("flags the meets-load and data-quality criteria as failed/exceptional together for a >100% reading", () => {
    // 400KV KIRNAPUR-like case: reads over capacity, so spare is negative.
    const subs = [
      node({
        id: "over-capacity",
        installedMva: field(40),
        spareAtNightMva: field(-33.25),
        nightUtilisation: field(183),
        quality: "implausible",
      }),
    ];
    const [row] = rankForLoad(subs, {
      loadMw: 10,
      nearCity: "Bhopal",
      radiusKm: 250,
      needsNight: true,
    });
    expect(row.meetsLoad).toBe(false);
    const quality = row.criteria.find((c) => c.key === "data-quality")!;
    expect(quality.met).toBe(false);
    expect(quality.label).toContain("183");
  });
});

describe("toAnalysisSubstation", () => {
  it("merges a SubstationLoad record with a position, field-for-field", () => {
    const load: SubstationLoad = {
      id: "bina",
      name: "Bina",
      voltageClass: "400KV",
      rawLabel: "400KV BINA",
      zone: "Bhopal",
      district: "Sagar",
      circle: "Bina",
      installedMva: field(945),
      nightPeakMva: field(743),
      spareAtNightMva: field(202),
      minMva: field(300),
      nightUtilisation: field(78.6),
      winterNightUtilisation: field(85),
      monsoonNightUtilisation: field(70),
      observationCount: 55,
      quality: "ok",
      series: [],
    };
    const merged = toAnalysisSubstation(load, { lat: 24.18, lon: 78.2 });
    expect(merged).toEqual({
      id: "bina",
      name: "Bina",
      voltageClass: "400KV",
      lat: 24.18,
      lon: 78.2,
      installedMva: field(945),
      nightPeakMva: field(743),
      spareAtNightMva: field(202),
      nightUtilisation: field(78.6),
      minMva: field(300),
      observationCount: 55,
      quality: "ok",
    });
  });
});
