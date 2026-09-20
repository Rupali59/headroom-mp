/**
 * Analysis — Lane J, "Analysis controls". Pure filter/rank functions over
 * substation load data. NO React, NO imports from `src/components/**`.
 * Everything here is testable without rendering anything — see
 * `tests/analysis.test.ts`.
 *
 * THE REGRESSION THIS FILE FIXES: the legacy `mp-headroom-app.html` had
 * voltage/owner filter chips, a minimum-headroom slider, and a scenario
 * query ("where can 100 MW connect near Bhopal, 24x7?") scored by
 *
 *   score = (cap>=mw?1000:0) + cap - dk*0.1
 *
 * — one line that silently prices 100 km of distance at 10 MW of
 * headroom, with no way to see why any node ranked where it did. This
 * file replaces that with named, inspectable criteria per node (task 2)
 * and a documented, non-linear sort — see `rankForLoad()` below.
 *
 * ============================================================================
 * BRIEF-VS-REALITY MISMATCH, reported per the lane brief's own instruction
 * ("Report any brief-vs-reality mismatch"):
 * ============================================================================
 *
 * The lane brief says these functions operate over `Substation[]`
 * (`src/lib/types.ts`). They do not, and cannot: `Substation` is
 * `{ id, name, voltageKv, lat, lon, capacity: Field<number> | null,
 * riskFactors }` — a single `capacity` field, no night peak, no spare
 * MVA, no night utilisation, no voltage-class string. Every filter this
 * lane was asked to build (minimum spare MVA at night, maximum night
 * utilisation) needs fields `Substation` does not carry, and `types.ts`
 * is explicitly out of scope ("NEVER TOUCH ... Lane H").
 *
 * The real ingested shape lives in `src/data/loader.ts`'s `SubstationLoad`
 * (Lane E, also out of scope to edit) — `installedMva`, `nightPeakMva`,
 * `spareAtNightMva`, `nightUtilisation`, `minMva`, `observationCount` —
 * but that type carries no `lat`/`lon`, which `rankForLoad`'s
 * near-a-city/radius query needs (positions live in `src/data/geometry.ts`'s
 * `NODE_GEOMETRY`, composed by id — see `loader.ts`'s own file header).
 *
 * Lane G independently hit the identical gap building the map's load
 * detail panel (`src/components/map/load-panel.tsx`'s `SubstationLoadDetail`,
 * verified 2026-09-20: "`Substation` ... carries only
 * `{ id, name, voltageKv, lat, lon, capacity, riskFactors }`. None of
 * DATA.md's measured load fields ... are on it."). Two lanes converging
 * independently on the same ad-hoc composed shape is itself a finding:
 * it means the real contract is `SubstationLoad` + position, not
 * `Substation`, and that should probably become one shared type rather
 * than three near-duplicates (this file's `AnalysisSubstation`, Lane G's
 * `SubstationLoadDetail`, and whatever Lane H's `Substation` eventually
 * grows into). Not fixed here — `types.ts` is Lane H's file — but named
 * for whoever integrates.
 *
 * RESOLUTION TAKEN: `AnalysisSubstation` below is this lane's own contract
 * — `SubstationLoad`'s fields plus `lat`/`lon` — named distinctly so nobody
 * mistakes it for `types.ts`'s `Substation`. `toAnalysisSubstation()` is
 * the (pure, no I/O) merge function; whoever wires this lane's mountable
 * component into `page.tsx` supplies already-merged `AnalysisSubstation[]`
 * (see the mount instructions in `scenario.tsx`'s header).
 */

import type { DataQuality, Field } from "./types";
import { dist } from "./projection";
import { CITIES } from "@/data/geometry";
import type { SubstationLoad } from "@/data/loader";

/**
 * LIVE UPDATE, 2026-09-20, mid-session: the task brief's premise for the
 * data-quality filter was "if that field is not in types.ts yet, build the
 * control and leave it disabled" — true when this lane started. While this
 * file was being written, Lane H landed `DataQuality` + a `quality` field
 * on `types.ts`'s `Substation`, and Lane E's `src/data/loader.ts` landed
 * `classifyLoadQuality()` + a required `quality: DataQuality` field on
 * `SubstationLoad` (verified by re-reading both files after the initial
 * draft below). So the premise resolved itself mid-session: the field
 * exists and is populated. `AnalysisSubstation.quality` below is REQUIRED,
 * sourced straight from `SubstationLoad.quality`, and the filter/control
 * are fully wired rather than disabled — see `hasQualityException()` and
 * `SubstationFilters.quality`.
 */

/**
 * This lane's substation contract — see the file header's "BRIEF-VS-REALITY
 * MISMATCH" note for why this exists instead of `Substation` from
 * `src/lib/types.ts`. Field names deliberately match `SubstationLoad`
 * (`src/data/loader.ts`) and Lane G's `SubstationLoadDetail`
 * (`src/components/map/load-panel.tsx`) so the three read as one contract
 * even though none formally imports another.
 */
export interface AnalysisSubstation {
  id: string;
  name: string;
  /** e.g. "400KV" — `SubstationLoad.voltageClass`, DATA.md caveat 2. */
  voltageClass: string;
  lat: number;
  lon: number;
  installedMva: Field<number>;
  /** Null = no night-time peak recorded in 55 months (Sendhwa caveat, see
   * `loader.ts`) — never treat as 0. */
  nightPeakMva: Field<number> | null;
  spareAtNightMva: Field<number> | null;
  /** Percent (0-100+; can exceed 100, see `hasQualityException` below). */
  nightUtilisation: Field<number> | null;
  minMva: Field<number> | null;
  observationCount: number;
  /** Worst data-quality classification in this node's primary-class
   * series — `src/lib/types.ts`'s `DataQuality`, sourced from
   * `SubstationLoad.quality` (Lane E's `classifyLoadQuality()`). See
   * `hasQualityException()` below. */
  quality: DataQuality;
}

/**
 * Pure merge of Lane E's ingested load record with a cartographic position
 * (`src/data/geometry.ts`'s `NODE_GEOMETRY`, composed by id per
 * `loader.ts`'s own header note). No I/O — the caller already has both
 * halves (typically from a build-time step in `page.tsx` or a server
 * component, since `loadSubstations()` itself requires MongoDB).
 */
export function toAnalysisSubstation(
  load: SubstationLoad,
  position: { lat: number; lon: number }
): AnalysisSubstation {
  return {
    id: load.id,
    name: load.name,
    voltageClass: load.voltageClass,
    lat: position.lat,
    lon: position.lon,
    installedMva: load.installedMva,
    nightPeakMva: load.nightPeakMva,
    spareAtNightMva: load.spareAtNightMva,
    nightUtilisation: load.nightUtilisation,
    minMva: load.minMva,
    observationCount: load.observationCount,
    quality: load.quality,
  };
}

// ============================================================================
// Data quality — DATA.md caveat 5: "Readings above 100% of installed
// capacity exist in the source ... Clamp or flag anything over 100% as a
// data-quality exception — never render it as a confident red node."
// ============================================================================

/** Utilisation strictly above this is what `over-capacity`/`implausible`
 * mean in practice (DATA.md caveat 5, `src/data/loader.ts`'s
 * `classifyLoadQuality()`) — kept here, alongside `hasQualityException()`,
 * only for display copy that wants to state the threshold; the
 * classification itself always comes from `AnalysisSubstation.quality`. */
export const DATA_QUALITY_UTILISATION_THRESHOLD = 100;

/**
 * True when a substation's `quality` (`src/lib/types.ts`'s `DataQuality`,
 * sourced from `SubstationLoad.quality` / `classifyLoadQuality()`) is
 * anything other than `"ok"` — DATA.md caveat 5: `132KV SALAMATPUR` reads
 * 183% ("implausible"), `400KV KIRNAPUR` 101% ("over-capacity"). Used by
 * `filterSubstations()`'s `quality` option and by `rankForLoad()`'s
 * `"data-quality"` criterion.
 */
export function hasQualityException(s: AnalysisSubstation): boolean {
  return s.quality !== "ok";
}

// ============================================================================
// Filters — task 1/3: voltage class, minimum spare MVA at night, maximum
// night utilisation, data-quality (disabled — see comment on `quality`).
// ============================================================================

export interface SubstationFilters {
  /** Keep only these voltage classes (e.g. `new Set(["400KV", "220KV"])`).
   * `undefined`/`null` = no constraint (show every class). An explicitly
   * EMPTY set means "zero classes selected" and filters everything out —
   * see `tests/analysis.test.ts`'s boundary test. `filters.tsx`'s chip UI
   * never actually produces an empty set (it mirrors the legacy app's
   * "can't deselect the last chip" guard), but the pure function is
   * honest about what an empty set means rather than silently treating it
   * as "no filter". */
  voltageClasses?: ReadonlySet<string> | null;
  /** Minimum `spareAtNightMva` required, inclusive (`>=`). A substation
   * with no night data (`spareAtNightMva === null`) is excluded whenever
   * this is set — "unknown" is never treated as "passes". */
  minSpareMva?: number | null;
  /** Maximum `nightUtilisation` allowed, inclusive (`<=`), as a percent.
   * Same null-handling as `minSpareMva`. */
  maxNightUtilisation?: number | null;
  /**
   * Data-quality filter — task brief, item 3. Originally written against
   * "if that field is not in types.ts yet" (it was not, at the start of
   * this lane's work); see the file header's "LIVE UPDATE" note for how
   * that resolved mid-session. Fully wired against the real
   * `AnalysisSubstation.quality` via `hasQualityException()`:
   * `"exclude-exceptions"` removes rows whose quality is not `"ok"`;
   * `"all"` (or omitting `quality` entirely) applies no constraint.
   */
  quality?: "all" | "exclude-exceptions";
}

/**
 * Returns the subset of `subs` matching every set constraint in
 * `filters`. Constraints left `undefined`/`null` impose no restriction.
 * Order is preserved from `subs`.
 */
export function filterSubstations(
  subs: readonly AnalysisSubstation[],
  filters: SubstationFilters = {}
): AnalysisSubstation[] {
  const { voltageClasses, minSpareMva, maxNightUtilisation, quality } =
    filters;

  return subs.filter((s) => {
    if (voltageClasses && !voltageClasses.has(s.voltageClass)) return false;

    if (minSpareMva != null) {
      if (s.spareAtNightMva === null || s.spareAtNightMva.v < minSpareMva) {
        return false;
      }
    }

    if (maxNightUtilisation != null) {
      if (
        s.nightUtilisation === null ||
        s.nightUtilisation.v > maxNightUtilisation
      ) {
        return false;
      }
    }

    if (quality === "exclude-exceptions" && hasQualityException(s)) {
      return false;
    }

    return true;
  });
}

// ============================================================================
// The scenario query — task 4/2: "where can N MW connect near <city>,
// [24x7]?" — and the ranking that answers it, with named reasons.
// ============================================================================

export interface City {
  name: string;
  lat: number;
  lon: number;
}

/** Resolves a city name (as offered by `scenario.tsx`'s `<Select>`,
 * populated from `CITIES`) to its coordinates. Exact, case-insensitive
 * match; returns `null` for anything not in `CITIES` rather than
 * guessing or throwing, so a caller can render an honest "unknown city"
 * state instead of an empty-looking result list. */
export function resolveCity(name: string): City | null {
  const found = CITIES.find(
    (c) => c.name.toLowerCase() === name.trim().toLowerCase()
  );
  return found ? { name: found.name, lat: found.lat, lon: found.lon } : null;
}

export interface LoadScenario {
  /** Requested load, in MW. */
  loadMw: number;
  /** A city name from `CITIES` (`src/data/geometry.ts`) — resolved via
   * `resolveCity()` internally. An unresolvable name yields `[]`. */
  nearCity: string;
  /** Search radius, in km, from `nearCity`. */
  radiusKm: number;
  /** Whether the load needs power at night (24x7) as opposed to daytime
   * only. NOTE: the measured dataset (DATA.md) carries ONLY night-time
   * figures — there is no day-time peak/spare anywhere in
   * `SubstationLoad`. So this flag does not change which field is read
   * (there is only one to read); it changes the CAVEAT `scenario.tsx`
   * must show alongside the answer — see that file's header. Kept as an
   * explicit option here (rather than silently ignored) so the caller's
   * intent is visible in the return value's `scenario` echo, and so a
   * future day-time dataset has somewhere to plug in without a signature
   * change. */
  needsNight: boolean;
}

export type RankCriterionKey =
  | "within-radius"
  | "has-night-data"
  | "meets-load"
  | "data-quality";

/** One named, inspectable reason behind a node's rank — task 2: "The
 * ranking must return, per node, WHICH criteria it met and which it
 * failed, and the UI must show that." */
export interface RankCriterion {
  key: RankCriterionKey;
  met: boolean;
  /** Human-readable argument for this criterion, e.g. "215 MVA spare at
   * night >= 100 MW requested" — always states the actual numbers, never
   * just pass/fail. */
  label: string;
}

export interface RankedSubstation {
  substation: AnalysisSubstation;
  /** 1-based position in the returned, already-sorted array. Exposed so
   * `ranking.tsx` never has to recompute or trust array index alone. */
  rank: number;
  distanceKm: number;
  /** `spareAtNightMva.v`, or `null` when no night data exists for this
   * node — the value `meets-load` and the sort are computed from. */
  spareMva: number | null;
  meetsLoad: boolean;
  criteria: RankCriterion[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Answers "where can `loadMw` MW connect near `nearCity`, within
 * `radiusKm`?" over `subs`, ordered with a REASON, not a hidden score.
 *
 * Replaces the legacy one-line score `(cap>=mw?1000:0)+cap-dk*0.1` (see
 * file header) with an explicit, three-key sort — each key is also one of
 * the named criteria shown on screen, so "why is X above Y" is always
 * answerable by pointing at a criterion instead of reverse-engineering an
 * arithmetic constant:
 *
 *   1. `meetsLoad` (true before false)
 *   2. `spareMva` descending, treating "no data" as the lowest possible
 *      value — more headroom ranks higher whether or not it clears the
 *      requested load, and a node with no data ranks below one that has
 *      data but falls short, since "unknown" is strictly worse than "known
 *      and insufficient"
 *   3. `distanceKm` ascending, as the final tiebreak only
 *
 * Only substations within `radiusKm` of the resolved city are returned —
 * matching the legacy app's own radius pre-filter — with `nearCity`
 * unresolvable (not in `CITIES`) yielding `[]`. Callers that need to tell
 * "unknown city" apart from "no candidates in this radius" should call
 * `resolveCity()` themselves first (see `scenario.tsx`).
 */
export function rankForLoad(
  subs: readonly AnalysisSubstation[],
  scenario: LoadScenario
): RankedSubstation[] {
  const city = resolveCity(scenario.nearCity);
  if (!city) return [];

  const withinRadius = subs
    .map((s) => ({ s, distanceKm: dist(city.lat, city.lon, s.lat, s.lon) }))
    .filter(({ distanceKm }) => distanceKm <= scenario.radiusKm);

  const scored = withinRadius.map(({ s, distanceKm }) => {
    const spareMva = s.spareAtNightMva !== null ? s.spareAtNightMva.v : null;
    const meetsLoad = spareMva !== null && spareMva >= scenario.loadMw;
    const quality = !hasQualityException(s);

    const criteria: RankCriterion[] = [
      {
        key: "within-radius",
        met: true,
        label: `Within ${scenario.radiusKm} km of ${city.name} (${round1(distanceKm)} km away)`,
      },
      {
        key: "has-night-data",
        met: spareMva !== null,
        label:
          spareMva !== null
            ? `Night-time peak measured (${s.installedMva.v} MVA installed)`
            : "No night-time peak recorded across 55 months of data",
      },
      {
        key: "meets-load",
        met: meetsLoad,
        label:
          spareMva !== null
            ? `${round1(spareMva)} MVA spare at night ${meetsLoad ? ">=" : "<"} ${scenario.loadMw} MW requested`
            : `Cannot assess against ${scenario.loadMw} MW requested — no measured spare capacity`,
      },
      {
        key: "data-quality",
        met: quality,
        label: quality
          ? "Night utilisation within plausible range (<=100% of installed capacity)"
          : `Night utilisation reads ${s.nightUtilisation ? round1(s.nightUtilisation.v) : "?"}% of installed capacity — classified "${s.quality}", verify against source (DATA.md caveat 5) before trusting this row`,
      },
    ];

    return { s, distanceKm, spareMva, meetsLoad, criteria };
  });

  scored.sort((a, b) => {
    if (a.meetsLoad !== b.meetsLoad) return a.meetsLoad ? -1 : 1;
    const spareA = a.spareMva ?? -Infinity;
    const spareB = b.spareMva ?? -Infinity;
    if (spareA !== spareB) return spareB - spareA;
    return a.distanceKm - b.distanceKm;
  });

  return scored.map((x, i) => ({
    substation: x.s,
    rank: i + 1,
    distanceKm: x.distanceKm,
    spareMva: x.spareMva,
    meetsLoad: x.meetsLoad,
    criteria: x.criteria,
  }));
}
