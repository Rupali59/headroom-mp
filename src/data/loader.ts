/**
 * Build-time loader — Lane E, DATA.md "What we now hold" / "Lane
 * assignments against this file"; data-quality, voltage-class and series
 * work by Lane H (DATA.md "Caveats that ride with every number" 5 & 6, and
 * the voltage-class-mismatch task). Reads the `loading` collection MongoDB
 * (loaded by `ingest/mongo-load.ts` from `data-local/mpptcl-loading.json`,
 * 27,680 rows / 55 months / 432 substations) and aggregates it into one
 * record per substation for the map and risk arithmetic to consume.
 *
 * BUILD.md D16: this only ever runs on the laptop that holds `MONGODB_URI`
 * — at `npm run ingest` / `npm run build` time, never on Vercel. Callers
 * (Lane A's map, ultimately) should call `loadSubstations()` from a
 * build-time context and bake the result into the static export; this file
 * does not itself decide how that wiring happens, since `page.tsx` is
 * frozen and `src/components/map/grid-map.tsx` is Lane A's.
 *
 * The Mongo-fetching shell (`loadSubstations()`) is deliberately thin: all
 * the real work is `aggregateSubstations()`, a pure function over an array
 * of `LoadingDoc`. That split exists so `tests/loader.test.ts` can pin the
 * night-band boundary, the voltage-class rule and the data-quality
 * threshold without opening a MongoDB connection.
 *
 * DATA CONTRACT WITH LANE A (DATA.md): geometry (lat/lon, the MP outline,
 * city positions — `src/data/geometry.ts`) is cartographic and static; this
 * file is the ingested, changing half. The two are composed by id — see
 * `slugifySubstation()` below for how that id is derived. That composition
 * key is NOT specified anywhere in DATA.md/BUILD.md beyond "the map
 * composes them"; it is asserted here and flagged in the Lane E report as
 * something the integrator should confirm against whatever key
 * `geometry.ts` actually uses.
 *
 * ============================================================================
 * AGGREGATION CHOICE #1 — which VOLTAGE CLASS represents a substation.
 * DATA.md's voltage-class-mismatch task: "Lane A ported the legacy demo's
 * hardcoded classes verbatim into geometry.ts; the measured data disagrees
 * for [8 named nodes]. Choosing which voltage class a node represents is a
 * DATA decision ... Decide the rule and implement it, state it, justify it."
 * ============================================================================
 *
 * Restated from DATA.md caveat 2: a single raw sheet label like
 * "400KV KATNI" carries THREE rows per month under that exact string — one
 * per transformer voltage class (400KV, 220KV, 132KV) colocated at that
 * site — because the SUBSTATION column names the site, not the transformer.
 * Of the three candidate rules DATA.md itself names ("the highest class
 * present? the class carrying most capacity? the class a 100 MW load would
 * connect at?"), this file picks the second — THE CLASS CARRYING THE MOST
 * INSTALLED CAPACITY, taken as the MEDIAN across every month that class was
 * reported — and gives it precedence over the label's own embedded
 * voltage-class prefix or over "highest kV number present". Justification:
 *
 *   - A 100 MW load connects where there is a transformer big enough to
 *     carry it; installed MVA is the direct, measured proxy for that, where
 *     "highest kV number present" is once removed from it (usually, but not
 *     always, correlated — see below).
 *   - Measured directly against all 432 raw labels while writing this file:
 *     "highest kV class present" and "highest-capacity class" agree for
 *     431 of 432 labels (99.8%). The one disagreement, "400KV CHHEGAON",
 *     has a HIGHER median installed MVA on its 220KV rows (680.0) than its
 *     own 400KV rows (630.0) — i.e. the site's name and its nameplate
 *     400kV transformer are not where the capacity actually sits. Capacity
 *     is the more honest signal exactly because this file is a DATA
 *     decision, not a naming one.
 *   - The MEDIAN, not the mean, across months (and not one month's max
 *     either) is robust to a single bad `installed_mva` reading skewing the
 *     class choice — DATA.md caveat 5 already establishes the sheet
 *     contains wrong readings, so the class-selection rule should not be
 *     fragile to the same class of error. This is not theoretical: an
 *     earlier version of this file used the mean, and `tests/loader.test.ts`
 *     caught it failing exactly this way — see `pickPrimaryClass()`'s own
 *     docstring for the worked failure.
 *
 * Ties (equal median installed MVA) break toward the higher kV number,
 * then alphabetically, for full determinism — see `pickPrimaryClass()`.
 *
 * Once the primary class is chosen for a label, ALL of that label's other
 * derived figures (series, worst-night peak, min, spare, quality) are built
 * from ONLY that class's rows. This is a genuine behaviour change from an
 * earlier version of this file, which picked "whichever class had the
 * largest installed_mva in this specific month" independently per month —
 * an emergent, unstable choice that could flip the reported class between
 * one month and the next for a station mid-augmentation. The class is now
 * a single, stable, whole-series decision per label.
 *
 * VALIDATION: checked by hand against DATA.md's own 15-row worked table.
 * All 15 reproduce DATA.md's class AND its worst-night installed/peak/spare
 * figures exactly (Seoni, Itarsi and Bhopal match DATA.md's specific
 * worst-night-row installed_mva — 520, 320, 1445 — rather than the
 * whole-series average quoted in this file's own comments above, which is
 * expected: DATA.md's table reports the worst-night row, same as this
 * loader's `nightPeakMva`/`installedMva` fields do).
 *
 * Lane H's re-check of DATA.md's own 8-node mismatch list against the
 * CURRENT `geometry.ts` (not the version DATA.md was written against):
 * 7 of 8 are still genuinely mismatched (Jabalpur, Neemuch, Satna, Seoni,
 * Gwalior, Itarsi, Birsinghpur all disagree with the measured primary
 * class). Sendhwa does NOT — `geometry.ts` already has `voltageKv: 220`,
 * and the measured primary class is also 220KV. This is reported rather
 * than silently reconciled, per rule:discernment-checks — DATA.md's prose
 * is stale on this one point, most likely written against an earlier
 * `geometry.ts`. A 9th, previously unnamed mismatch was found in the same
 * pass: `geometry.ts` has Sagar at 220kV; the measured primary class is
 * 400KV (630.0 avg, the same figure DATA.md's own table already quotes for
 * Sagar's *installed* capacity — DATA.md quotes the right number under the
 * wrong voltage label). Full detail in the Lane H report.
 *
 * ============================================================================
 * AGGREGATION CHOICE #2 — DATA QUALITY. DATA.md caveat 5: "Readings above
 * 100% of installed capacity exist in the source ... 132KV SALAMATPUR reads
 * 183% ... 400KV KIRNAPUR 101% ... Clamp or flag anything over 100% as a
 * data-quality exception — never render it as a confident red node."
 * ============================================================================
 *
 * See `classifyLoadQuality()` below for the threshold and its
 * justification (IEC 60076-7 / IEEE C57.91 short-term overload guidance).
 * Swept the full 27,680-row dataset while writing this file (not just the
 * top 8 DATA.md had seen): of 27,554 rows with both `installed_mva` and
 * `peak_mva` populated, 27,545 are "ok", 8 are "over-capacity" (100–150% of
 * installed capacity — a plausible short-term overload), and exactly 1 is
 * "implausible" (132KV SALAMATPUR, May'2022, 183.1%). The remaining 126
 * rows (27,680 - 27,554) are missing one of the two inputs and are not
 * classified at all — treated as "ok" by `classifyLoadQuality()`, since a
 * reading that does not exist cannot be over capacity, and they never
 * participate in a substation's primary-class series selection either way
 * (both the old and new aggregation already drop rows with a null
 * `installed_mva`). Full bucket table in the Lane H report.
 *
 * A substation's aggregate `quality` is the WORST classification found
 * anywhere in its primary-class series (all months, not just the
 * worst-night row) — deliberately conservative: even one implausible
 * historical reading is reason enough not to trust that class's
 * capacity/peak pairing without an operator's correction, per DATA.md's
 * "never render it as a confident red node." `src/lib/risk.ts`'s
 * `riskLevel()` takes this as a second argument and returns a distinct
 * `"flagged"` state — never a scored green/amber/red — for anything other
 * than "ok".
 *
 * ============================================================================
 * AGGREGATION CHOICE #3 — the per-month SERIES Lane G's sparkline needs.
 * ============================================================================
 *
 * `SubstationLoad.series` carries one `MonthlyObservation` (`src/lib/
 * types.ts`) per parseable month in the label's primary-class series,
 * ascending chronological order (`parseMonthLabel()` — about 9% of raw
 * month labels are unparseable filename stems, e.g. "R-Max-Loading-Nov-22-1",
 * and are DROPPED from `series` rather than guessed at a position; a
 * sparkline silently rendering a month out of order is a wrong chart with
 * no error, and "excluded" is a safer failure than "wrong"). Those dropped
 * rows still count toward `observationCount` and are still eligible for
 * `worstNight`/`minMva` — those aggregates don't need calendar order.
 *
 * SCOPE: populating a full ~55-month series for all 432 substations would
 * add roughly 3+ MB of JSON to a static export (`output: "export"`) where
 * only the ~19 nodes in `geometry.ts` are ever rendered — see this
 * session's Lane H report for the size estimate. So `series` is populated
 * ONLY for the subset of labels this file can confidently match to a
 * `geometry.ts` id — `GEOMETRY_LABEL_ALIAS` below. Every other substation
 * gets `series: []`, identical in shape to "no data for this node at all";
 * that is a deliberate, documented truncation, not a silent one. Two
 * geometry ids (`manglia`, `suky`) have NO confident match and are
 * deliberately absent from the alias table rather than guessed — see the
 * comment above it.
 */

import { getDb } from "@/lib/mongo";
import { NODE_GEOMETRY } from "@/data/geometry";
import type { Confidence, DataQuality, Field, MonthlyObservation } from "@/lib/types";

/** Mirrors `ingest/mongo-load.ts`'s `RawLoadingRow` — the shape of one
 * document in the `loading` collection. Duplicated rather than imported:
 * `ingest/` and `src/` are built by different toolchains (tsx vs Next's
 * bundler) and this keeps `src/data/loader.ts` self-contained for the
 * Next build.
 *
 * `peak_date` is declared here even though `ingest/mongo-load.ts`'s own
 * `RawLoadingRow` type does not: that file's Mongo write spreads `...r`
 * over the parsed JSON row, which DOES carry `peak_date` at runtime
 * (`ingest/mpptcl-loading.py`'s `_shape()` always sets it) — the field
 * reaches Mongo regardless of the gap in that file's TS type. Reported to
 * Lane E rather than fixed there: `ingest/mongo-load.ts` is not this
 * lane's file to edit. */
interface LoadingDoc {
  substation: string;
  voltage_class: string;
  zone: string;
  district: string;
  circle: string;
  installed_mva: number | null;
  peak_mva: number | null;
  peak_hour: number | null;
  peak_is_night: boolean | null;
  peak_date: string | null;
  min_mva: number | null;
  avg_mva: number | null;
  spare_at_peak_mva: number | null;
  month: string;
  source_url: string;
}

const SOURCE_ID = "mpptcl-loading";

/**
 * Strips a leading voltage-class token ("400KV ", "220/33KV ", …) from a raw
 * sheet label and returns a lowercase, hyphenated id. Exported so a
 * consuming lane can derive the same key from a plain city name without
 * importing the rest of this module's Mongo dependency.
 */
export function slugifySubstation(rawLabel: string): string {
  const withoutVoltage = rawLabel.replace(/^\d+(?:\/\d+)?\s*KV\s+/i, "");
  return withoutVoltage
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Best-effort Title Case for a display name. The sheet is ALL CAPS; this
 * is cosmetic, not a data-quality claim. */
function titleCase(withoutVoltage: string): string {
  return withoutVoltage
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function displayName(rawLabel: string): string {
  const withoutVoltage = rawLabel.replace(/^\d+(?:\/\d+)?\s*KV\s+/i, "");
  return titleCase(withoutVoltage || rawLabel);
}

/**
 * Best-effort chronological key for a raw month label. Most labels are the
 * clean "MonthName'Year" the Python parser's discovery emits (e.g.
 * "July'2026"); a minority are bare filename stems (e.g.
 * "MAX-LOADI-JULY-21092022") that this does not attempt to parse. Returns
 * null when unparseable — callers must treat that as "no ordering
 * information", never as epoch 0, which would sort a mystery label as the
 * oldest possible month.
 */
function parseMonthLabel(label: string): number | null {
  const m = /^([A-Za-z]+)'(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const monthIdx = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ].indexOf(m[1].toLowerCase());
  if (monthIdx < 0) return null;
  return Date.UTC(Number(m[2]), monthIdx, 1);
}

/**
 * DATA.md's night band: 19:00-06:00, both ends inclusive
 * (`ingest/mpptcl-loading.py`'s `_shape()`: `hour >= 19 or hour <= 6`).
 *
 * Recomputed here from `peak_hour` rather than trusted from the Mongo
 * `peak_is_night` boolean the Python ingest stage already computed: this
 * loader owns the "which reading counts as night" decision the whole risk
 * model depends on, and a boundary this consequential is worth pinning
 * with its own TS-side test (`tests/loader.test.ts`) rather than trusting
 * an opaque flag from a pipeline stage in a different language that this
 * file has no visibility into at build time.
 *
 * Investigated as part of the Sendhwa discrepancy (DATA.md caveat 6): this
 * boundary is NOT the bug. `ingest/mpptcl-loading.py`'s hour computation
 * and this recomputation agree on every row checked, including Sendhwa's
 * two genuine night readings (132KV class, hour 5 and hour 6 — both
 * correctly night under the inclusive `<= 6`). See this file's header and
 * the Lane H report for the actual explanation.
 *
 * Returns false (not "unknown") for a null hour — callers needing to tell
 * "known day" apart from "no hour recorded" should check `peak_hour !==
 * null` themselves.
 */
export function isNightHour(hour: number | null): boolean {
  if (hour === null) return false;
  return hour >= 19 || hour <= 6;
}

/**
 * Ratio, in percent-as-fraction, above which a reading is a data-quality
 * exception at all — 100% of installed capacity (DATA.md caveat 5).
 */
const OVER_CAPACITY_RATIO = 1.0;

/**
 * Ratio above which a reading stops being a plausible short-term
 * transformer overload and is more likely a sheet error than real
 * operation.
 *
 * Justified: IEC 60076-7 / IEEE C57.91 planned-and-emergency loading
 * guidance for oil-filled power transformers tops out in the 130–150%
 * range for a bounded duration even under favourable ambient and
 * loss-of-life trade-offs; the sheet's "SIMULTANEOUS MAXIMUM" is a single
 * dated, timed reading (not a sustained load), so a transient reading in
 * that range is physically defensible. 150% is picked as the line because
 * it is where this dataset's own top readings actually cluster: measured
 * against the full 27,680-row sweep, only ONE row anywhere in the dataset
 * exceeds it (132KV SALAMATPUR at 183.1%) while the next-highest readings
 * — 131.4% and 130.4% — sit well inside the range engineering guidance
 * treats as plausible. It also reproduces DATA.md's own two worked
 * examples exactly: 400KV KIRNAPUR at ~101% (and 105.7% elsewhere in its
 * series) stays "over-capacity"; 132KV SALAMATPUR at 183% is the sole
 * "implausible" row DATA.md's caveat calls out by name.
 */
const IMPLAUSIBLE_RATIO = 1.5;

/**
 * Classifies one reading against installed capacity — DATA.md caveat 5.
 * A row with a missing input classifies as "ok": there is no reading to be
 * suspicious of, and both the old and new aggregation already drop rows
 * with a null `installed_mva` from primary-class selection regardless.
 */
export function classifyLoadQuality(
  installedMva: number | null,
  peakMva: number | null,
): DataQuality {
  if (installedMva === null || peakMva === null || installedMva <= 0) return "ok";
  const ratio = peakMva / installedMva;
  if (ratio > IMPLAUSIBLE_RATIO) return "implausible";
  if (ratio > OVER_CAPACITY_RATIO) return "over-capacity";
  return "ok";
}

/** Severity order for combining per-reading quality into one aggregate —
 * "implausible" anywhere outranks "over-capacity" anywhere outranks "ok"
 * everywhere. Exported so `tests/loader.test.ts` can assert the ordering
 * directly rather than only through `aggregateSubstations()`'s output. */
const QUALITY_SEVERITY: Readonly<Record<DataQuality, number>> = {
  ok: 0,
  "over-capacity": 1,
  implausible: 2,
};

function worstQuality(a: DataQuality, b: DataQuality): DataQuality {
  return QUALITY_SEVERITY[b] > QUALITY_SEVERITY[a] ? b : a;
}

/** Leading numeric kV token of a voltage-class string ("220KV" -> 220,
 * "220/33KV" -> 220, malformed -> -1 so it always loses a tie-break). */
function kvNumber(voltageClass: string): number {
  const m = /^(\d+)/.exec(voltageClass);
  return m ? Number(m[1]) : -1;
}

/** Middle value of a sorted numeric array (mean of the two middle values on
 * an even count). Used by `pickPrimaryClass()` — see that function's
 * docstring for why the median, not the mean, is the robust choice here. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * AGGREGATION CHOICE #1 (see file header) — picks the single voltage class
 * that represents a raw substation label across its WHOLE series: the
 * class with the highest MEDIAN `installed_mva`, ties broken by higher kV
 * number, then lexicographically for full determinism.
 *
 * Median, not mean: caught by this file's own test suite. A first version
 * used the mean, and `tests/loader.test.ts`'s outlier-robustness case
 * failed against it — a single wrongly-recorded month in an otherwise
 * consistent class's series was enough to swing that class's MEAN past a
 * genuinely larger class, because a mean has no resistance to one bad
 * value. The median does: with 4 normal readings and 1 outlier, the
 * outlier is never the middle value. (A class with only one or two
 * observations total still has no protection — there is nothing to take a
 * median OF — but that is a data-sparsity limit, not a flaw a statistic
 * can fix, and does not occur in the real dataset's one genuine
 * class-choice disagreement, "400KV CHHEGAON": both its 400KV and 220KV
 * rows have 54 observations each, and the 220KV median (680) still beats
 * the 400KV median (630) exactly as the mean did.)
 */
export function pickPrimaryClass(rows: readonly LoadingDoc[]): string {
  const byClass = new Map<string, number[]>();
  for (const r of rows) {
    if (r.installed_mva === null) continue;
    const values = byClass.get(r.voltage_class) ?? [];
    values.push(r.installed_mva);
    byClass.set(r.voltage_class, values);
  }
  let best: string | null = null;
  let bestMedian = -Infinity;
  for (const [cls, values] of byClass) {
    const med = median(values);
    if (
      best === null ||
      med > bestMedian ||
      (med === bestMedian && kvNumber(cls) > kvNumber(best)) ||
      (med === bestMedian && kvNumber(cls) === kvNumber(best) && cls < best)
    ) {
      best = cls;
      bestMedian = med;
    }
  }
  // Rows with no installed_mva anywhere for this label: fall back to
  // whatever class the first row carries rather than throwing — this can
  // only happen for a label already excluded upstream (aggregateSubstations
  // skips rows with installed_mva === null when grouping), so it is
  // unreachable in practice; kept as a safe default, not a silent guess
  // that matters.
  return best ?? rows[0]?.voltage_class ?? "";
}

/**
 * Best-effort map from `src/data/geometry.ts`'s NODE_GEOMETRY ids to the
 * exact raw substation label this loader groups by — see file header
 * "AGGREGATION CHOICE #3". Verified by hand against DATA.md's own worked
 * table: every value below reproduces that table's installed-MVA (or, for
 * Seoni/Itarsi/Bhopal, worst-night-row installed-MVA) to the exact MVA.
 *
 * `manglia` and `suky` are deliberately NOT in this map: `manglia` has no
 * raw label containing "MANGLIA" anywhere in the 432, and Indore has four
 * other candidate labels (S/Z INDORE, NORTH ZONE INDORE, INDORE-II
 * JAITPURA, INDORE EAST (BICHOLI)) with no basis to prefer one; `suky` has
 * no raw label containing "SUKY" or "SEWANIYA" at all. Guessing either
 * would silently attach a sparkline to the wrong physical transformer.
 */
const GEOMETRY_LABEL_ALIAS: Readonly<Record<string, string>> = {
  bdtcl: "400KV BHOPAL",
  bina: "400KV BINA",
  pgIndore: "400KV INDORE",
  pitham: "400KV PITHAMPUR",
  ujjain: "400KV UJJAIN",
  katni: "400KV KATNI",
  sagar: "400KV SAGAR",
  jabalpur: "220KV JABALPUR",
  neemuch: "220KV NEEMUCH",
  satna: "220KV SATNA",
  seoni: "220KV SEONI",
  itarsi: "220KV ITARSI",
  birsing: "220KV BIRSINGHPUR",
  sendhwa: "220KV SENDHWA",
  gwalior: "220KV GWALIOR-II",
  // Present in the sheet only at 132KV, though geometry.ts claims a much
  // higher class for both (400kV, 765kV respectively) — likely because
  // MPPTCL's own EHV loading sheet doesn't carry the higher-voltage side
  // of these sites at all (a POWERGRID/PGCIL asset boundary, not an MPPTCL
  // one). Included anyway because real data exists; the class mismatch is
  // reported separately (Lane H report), not resolved here.
  mandsaur: "132KV MANDSAUR",
  kurawar: "132KV KURAWAR",
};

const SERIES_SCOPED_LABELS: ReadonlySet<string> = new Set(
  Object.values(GEOMETRY_LABEL_ALIAS),
);

/**
 * Season windows for DATA.md's revised risk factor 3 ("winter night
 * utilisation > monsoon by more than 20%") — IMD-convention winter
 * (Dec/Jan/Feb) and monsoon (Jun-Sep), 0-indexed UTC month.
 *
 * DATA.md's own seasonality figure (winter nights 50.8% mean utilisation,
 * monsoon 43.7%, "Seasonality, computed not asserted") is a WHOLE-DATASET
 * number, computed once across every substation. Nothing in this codebase
 * computed the same quantity PER SUBSTATION before this change — risk
 * factor 3 needs exactly that, one node at a time, to compare against its
 * own >20% threshold. `winterNightUtilisation` / `monsoonNightUtilisation`
 * below supply it.
 */
const WINTER_MONTHS = new Set([11, 0, 1]); // Dec, Jan, Feb
const MONSOON_MONTHS = new Set([5, 6, 7, 8]); // Jun, Jul, Aug, Sep

function seasonOf(monthLabel: string): "winter" | "monsoon" | null {
  const key = parseMonthLabel(monthLabel);
  if (key === null) return null;
  const monthIdx = new Date(key).getUTCMonth();
  if (WINTER_MONTHS.has(monthIdx)) return "winter";
  if (MONSOON_MONTHS.has(monthIdx)) return "monsoon";
  return null;
}

/**
 * Mean night-time utilisation (%) across a set of rows already filtered to
 * one season. Only night-time rows (`isNightHour`) with both inputs
 * present count — a daytime reading says nothing about "winter night
 * utilisation". Null when the season has zero usable night observations
 * for this substation, which callers (risk factor 3) must treat as
 * unscoreable, never as 0% utilisation.
 */
function meanNightUtilisation(rows: readonly LoadingDoc[]): Field<number> | null {
  const usable = rows.filter(
    (r): r is LoadingDoc & { peak_mva: number; installed_mva: number } =>
      isNightHour(r.peak_hour) && r.peak_mva !== null && r.installed_mva !== null && r.installed_mva > 0,
  );
  if (usable.length === 0) return null;
  const meanRatio =
    usable.reduce((sum, r) => sum + r.peak_mva / r.installed_mva, 0) / usable.length;
  // Anchor row for src/asOf is arbitrary (this is a multi-month mean, not a
  // single observation) but deterministic: the chronologically-last
  // parseable row, falling back to the last row seen when none parse.
  const anchor =
    usable
      .filter((r) => parseMonthLabel(r.month) !== null)
      .sort((a, b) => (parseMonthLabel(a.month) as number) - (parseMonthLabel(b.month) as number))
      .at(-1) ?? usable[usable.length - 1];
  return verifiedField(
    Math.round(meanRatio * 1000) / 10,
    "%",
    anchor,
    `Mean night-time (19:00-06:00) utilisation across ${usable.length} observation(s) in this season, this substation's primary class only.`,
  );
}

/** One sourced fact, tagged `verified` per DATA.md's revised confidence
 * ladder: "verified: MPPTCL loading sheet or a cited PDF, with month and
 * source URL — solid." */
function verifiedField(
  v: number,
  unit: string,
  row: LoadingDoc,
  note: string,
): Field<number> {
  const conf: Confidence = "verified";
  return {
    v,
    unit,
    conf,
    src: row.source_url,
    page: null, // spreadsheet row, not a paginated document
    asOf: row.month,
    by: "ingest",
    at: Date.now(),
    note,
  };
}

export interface SubstationLoad {
  /** Derived, hyphenated key — see `slugifySubstation()`. */
  id: string;
  /** Best-effort Title Case display name, voltage-class prefix stripped. */
  name: string;
  /** The voltage class chosen as this label's primary transformer class,
   * by `pickPrimaryClass()` — see file header "AGGREGATION CHOICE #1". */
  voltageClass: string;
  /** The raw sheet label this was read from, e.g. "400KV KATNI". Kept for
   * traceability back to the source rows. */
  rawLabel: string;
  zone: string;
  district: string;
  circle: string;
  installedMva: Field<number>;
  /** Null when no night-time (19:00-06:00) peak was ever recorded for this
   * substation's primary class across the 55 months. A null here means
   * "no night data", never 0. */
  nightPeakMva: Field<number> | null;
  spareAtNightMva: Field<number> | null;
  /** Null under the same condition as nightPeakMva. */
  minMva: Field<number> | null;
  /** Percent (0-100), `peakMva / installedMva` from the same worst-night
   * row as nightPeakMva. Null under the same condition. */
  nightUtilisation: Field<number> | null;
  /** Mean night-time utilisation (%) across this node's own Dec/Jan/Feb
   * observations — feeds DESIGN.md risk factor 3 (DATA.md "Risk, revised":
   * "winter night utilisation > monsoon by more than 20%"). Null when this
   * substation has zero winter night observations across the 55 months —
   * unscoreable, not 0%. */
  winterNightUtilisation: Field<number> | null;
  /** Same as `winterNightUtilisation`, for this node's own Jun-Sep
   * observations. */
  monsoonNightUtilisation: Field<number> | null;
  /** Count of months contributing to this label's primary-class series
   * (after class-selection — see file header). */
  observationCount: number;
  /** Worst data-quality classification found anywhere in this label's
   * primary-class series — see file header "AGGREGATION CHOICE #2" and
   * `classifyLoadQuality()`. A node whose quality is not "ok" must not
   * receive a confident risk verdict — `src/lib/risk.ts`'s `riskLevel()`
   * enforces this. */
  quality: DataQuality;
  /** Chronologically ordered monthly series for this label's primary
   * class — see file header "AGGREGATION CHOICE #3". Populated only for
   * the subset of labels `GEOMETRY_LABEL_ALIAS` resolves; `[]` otherwise. */
  series: MonthlyObservation[];
}

/**
 * Pure aggregation over an already-fetched row set — split out from
 * `loadSubstations()` so `tests/loader.test.ts` can exercise the night-band
 * boundary, the voltage-class rule and the data-quality threshold without a
 * MongoDB connection. `loadSubstations()` below is the only caller in
 * production; it does no aggregation logic of its own.
 */
export function aggregateSubstations(rows: readonly LoadingDoc[]): SubstationLoad[] {
  // Group by raw label first (not by (label, class) — the class is a
  // whole-series decision made per label by pickPrimaryClass()).
  const byLabel = new Map<string, LoadingDoc[]>();
  for (const r of rows) {
    if (r.installed_mva === null) continue;
    let list = byLabel.get(r.substation);
    if (!list) {
      list = [];
      byLabel.set(r.substation, list);
    }
    list.push(r);
  }

  const out: SubstationLoad[] = [];

  for (const [rawLabel, allRows] of byLabel) {
    const primaryClass = pickPrimaryClass(allRows);
    const classRows = allRows.filter((r) => r.voltage_class === primaryClass);
    if (classRows.length === 0) continue;

    // One row per month within the chosen class — guards against an exact
    // duplicate (label, class, month) row in the source by keeping the
    // larger installed_mva, same defensiveness the old per-month selection
    // had, just scoped to a single pre-chosen class now.
    const byMonth = new Map<string, LoadingDoc>();
    for (const r of classRows) {
      const existing = byMonth.get(r.month);
      if (!existing || (r.installed_mva ?? -Infinity) > (existing.installed_mva ?? -Infinity)) {
        byMonth.set(r.month, r);
      }
    }
    const series = Array.from(byMonth.values());

    // installedMva / nightPeakMva / spareAtNightMva / nightUtilisation all
    // come from the single row with the largest night-time peak — see
    // "AGGREGATION CHOICE" above for why they must be paired, not mixed
    // across months.
    const nightRows = series.filter((r) => isNightHour(r.peak_hour) && r.peak_mva !== null);
    const worstNight =
      nightRows.length > 0
        ? nightRows.reduce((a, b) => ((b.peak_mva ?? -Infinity) > (a.peak_mva ?? -Infinity) ? b : a))
        : null;

    // installedMva always needs a value even when there's no night peak —
    // fall back to the most recently parseable month, or the first row in
    // iteration order when no label in the series parses (documented
    // limitation: parseMonthLabel() only handles the clean "Month'Year"
    // form, ~91% of labels in the current data).
    const referenceRow =
      worstNight ??
      series.reduce((latest, r) => {
        const rDate = parseMonthLabel(r.month);
        const latestDate = parseMonthLabel(latest.month);
        if (rDate === null) return latest;
        if (latestDate === null) return r;
        return rDate > latestDate ? r : latest;
      }, series[0]);

    const installedMva = verifiedField(
      referenceRow.installed_mva as number,
      "MVA",
      referenceRow,
      worstNight
        ? "Installed capacity as of this substation's worst recorded night-time peak."
        : "Installed capacity — no night-time peak recorded for this substation in 55 months; best-effort most-recent month used.",
    );

    let nightPeakMva: Field<number> | null = null;
    let spareAtNightMva: Field<number> | null = null;
    let nightUtilisation: Field<number> | null = null;

    if (worstNight && worstNight.peak_mva !== null && worstNight.installed_mva !== null) {
      nightPeakMva = verifiedField(
        worstNight.peak_mva,
        "MVA",
        worstNight,
        "Worst (highest) recorded night-time (19:00-06:00) simultaneous maximum across 55 months.",
      );
      const spare = Math.round((worstNight.installed_mva - worstNight.peak_mva) * 100) / 100;
      spareAtNightMva = verifiedField(
        spare,
        "MVA",
        worstNight,
        "installed_mva - night peak_mva, from the same observation.",
      );
      const utilPct = Math.round((worstNight.peak_mva / worstNight.installed_mva) * 1000) / 10;
      nightUtilisation = verifiedField(
        utilPct,
        "%",
        worstNight,
        "night peak_mva / installed_mva from the same observation, as a percent.",
      );
    }

    // minMva: the floor across the WHOLE series, not tied to the peak month
    // (DATA.md caveat 3).
    const minRows = series.filter((r) => r.min_mva !== null);
    let minMva: Field<number> | null = null;
    if (minRows.length > 0) {
      const lowest = minRows.reduce((a, b) => ((b.min_mva as number) < (a.min_mva as number) ? b : a));
      minMva = verifiedField(
        lowest.min_mva as number,
        "MVA",
        lowest,
        "Lowest MIN MVA recorded across all months — a floor, not a guaranteed current value (DATA.md caveat 3).",
      );
    }

    // AGGREGATION CHOICE #2 — worst data-quality classification anywhere in
    // this label's primary-class series (all months, conservatively).
    let quality: DataQuality = "ok";
    for (const r of series) {
      quality = worstQuality(quality, classifyLoadQuality(r.installed_mva, r.peak_mva));
    }

    // Risk factor 3's seasonal split — see `meanNightUtilisation()` above.
    const winterNightUtilisation = meanNightUtilisation(
      series.filter((r) => seasonOf(r.month) === "winter"),
    );
    const monsoonNightUtilisation = meanNightUtilisation(
      series.filter((r) => seasonOf(r.month) === "monsoon"),
    );

    // AGGREGATION CHOICE #3 — the per-month series, scoped to labels
    // GEOMETRY_LABEL_ALIAS resolves, chronologically ordered, unparseable
    // months dropped (see file header for why).
    let monthlySeries: MonthlyObservation[] = [];
    if (SERIES_SCOPED_LABELS.has(rawLabel)) {
      monthlySeries = series
        .map((r) => ({ row: r, key: parseMonthLabel(r.month) }))
        .filter((x): x is { row: LoadingDoc; key: number } => x.key !== null)
        .sort((a, b) => a.key - b.key)
        .map(({ row: r }): MonthlyObservation => ({
          month: r.month,
          peakMva: r.peak_mva,
          peakIsNight: isNightHour(r.peak_hour),
          peakHour: r.peak_hour,
          peakDate: r.peak_date ?? null,
          installedMva: r.installed_mva,
          utilisationPct:
            r.peak_mva !== null && r.installed_mva !== null && r.installed_mva > 0
              ? Math.round((r.peak_mva / r.installed_mva) * 1000) / 10
              : null,
          quality: classifyLoadQuality(r.installed_mva, r.peak_mva),
        }));
    }

    out.push({
      id: slugifySubstation(rawLabel),
      name: displayName(rawLabel),
      voltageClass: primaryClass,
      rawLabel,
      zone: referenceRow.zone,
      district: referenceRow.district,
      circle: referenceRow.circle,
      installedMva,
      nightPeakMva,
      spareAtNightMva,
      minMva,
      nightUtilisation,
      winterNightUtilisation,
      monsoonNightUtilisation,
      observationCount: series.length,
      quality,
      series: monthlySeries,
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Reads the `loading` collection and returns one record per distinct raw
 * substation label (432 in the current data — DATA.md "distinct
 * substations 432"). Call at build time only (`npm run build`, or
 * `npm run ingest`'s verification step) — this opens a MongoDB connection
 * and will throw per `src/lib/mongo.ts` if MONGODB_URI/MONGODB_DB are
 * unset, which is correct on Vercel (BUILD.md D16: Vercel never runs this).
 */
export async function loadSubstations(): Promise<SubstationLoad[]> {
  const db = await getDb();
  const rows = await db
    .collection<LoadingDoc>("loading")
    .find({}, { projection: { _id: 0 } })
    .toArray();
  return aggregateSubstations(rows);
}

/** Referenced so `NODE_GEOMETRY`'s import above is provably used for more
 * than typechecking-by-side-effect — exposes exactly the ids this file's
 * `series` scoping recognises, so a caller (or a test) can tell "no series
 * because out of scope" apart from "no series because no match". Kept in
 * sync with `GEOMETRY_LABEL_ALIAS` and `NODE_GEOMETRY` by construction:
 * this is the intersection of the two, not a third hand-maintained list. */
export const SERIES_SCOPED_GEOMETRY_IDS: readonly string[] = NODE_GEOMETRY.filter(
  (g) => g.id in GEOMETRY_LABEL_ALIAS,
).map((g) => g.id);

/** Retrieval metadata for the whole ingest run — the `sources` collection's
 * one doc. Exposed separately so a component can cite "as of <date>"
 * without pulling in the full substation list. */
export interface IngestSource {
  source: string;
  indexUrl: string;
  retrieved: string;
  monthsOk: number;
  monthsFailed: number;
}

/** Mongo's default `Document` schema types `_id` as `ObjectId`; this
 * collection's `_id` is deliberately the plain string "mpptcl-loading"
 * (`ingest/mongo-load.ts`), so the generic must say so explicitly. */
interface SourceDoc extends IngestSource {
  _id: string;
}

export async function loadSource(): Promise<IngestSource | null> {
  const db = await getDb();
  const doc = await db.collection<SourceDoc>("sources").findOne({ _id: SOURCE_ID });
  if (!doc) return null;
  return {
    source: doc.source,
    indexUrl: doc.indexUrl,
    retrieved: doc.retrieved,
    monthsOk: doc.monthsOk,
    monthsFailed: doc.monthsFailed,
  };
}
