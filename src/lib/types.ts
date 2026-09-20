/**
 * Shared data contracts — Lane 0, BUILD.md "Shared contracts".
 *
 * Every fact in this product is a `Field`, never a bare value. DESIGN.md
 * "The spine: every fact is a Field, not a value" — three things fall out
 * of this for free: an unassessable value renders hatched rather than
 * guessed, an operator correction outranks a modelled one without special
 * casing, and the Owner ledger view is just a table of `by` / `at` / `src`.
 *
 * Every lane imports from here. Do not redeclare `Confidence`, `Field`,
 * `Substation` or `RiskFactor` locally — that is exactly the five-lanes,
 * five-versions failure this file exists to prevent.
 */

/**
 * The confidence ladder, lowest to highest rank. Order is load-bearing:
 * a write with a higher-ranked confidence (e.g. an operator's `"field"`
 * correction) outranks a lower-ranked one (e.g. `"modelled"`) for the same
 * fact, regardless of which arrived first. See `confidenceRank` below and
 * the D17 contract test asserting `field` outranks `modelled`.
 */
export type Confidence =
  | "unknown"
  | "modelled"
  | "derived"
  | "researched"
  | "field"
  | "verified";

/** Rank order for `Confidence`, lowest to highest. Index = rank. */
export const CONFIDENCE_LADDER: readonly Confidence[] = [
  "unknown",
  "modelled",
  "derived",
  "researched",
  "field",
  "verified",
];

/** Numeric rank of a confidence value; higher outranks lower. */
export function confidenceRank(conf: Confidence): number {
  return CONFIDENCE_LADDER.indexOf(conf);
}

/**
 * A single sourced fact. Every number, string or timestamp that reaches
 * the UI is one of these — never a bare `number` or `string`.
 */
export interface Field<T = number> {
  /** The value itself. */
  v: T;
  /** Unit of measure, e.g. "MVA", "MW", "kV". Empty string if unitless. */
  unit: string;
  /** Where this value sits on the confidence ladder. */
  conf: Confidence;
  /** Source document id, e.g. "tnd85", or a free-text source for field data. */
  src: string;
  /** Page number within `src`, from the API's citation, or null if not paginated. */
  page: number | null;
  /** The date the underlying figure is as-of, e.g. "2024-06". */
  asOf: string;
  /** Who set this field: "ingest" for the pipeline, or a person/org name. */
  by: string;
  /** When this field was written, as an epoch-ms timestamp. */
  at: number;
  /** Free-text annotation — a caveat, a correction reason, empty if none. */
  note: string;
}

/**
 * Data-quality classification for a single loading reading (DATA.md caveat
 * 5), and for the substation-level aggregate that inherits the worst
 * reading found anywhere in its primary class's series.
 *
 *   ok             peak_mva <= installed_mva, or not computable at all
 *   over-capacity  100% < peak/installed <= 150% of installed capacity —
 *                  a plausible short-term transformer overload
 *   implausible    peak/installed > 150% — beyond any defensible overload
 *                  envelope; more likely a sheet error (wrong capacity,
 *                  wrong peak, a misplaced decimal) than real operation
 *
 * See `src/data/loader.ts`'s `classifyLoadQuality()` for the threshold
 * values and the measurement that justifies them. A node whose quality is
 * not "ok" must never receive a confident green/amber/red risk verdict —
 * `src/lib/risk.ts`'s `riskLevel()` takes this as its second argument and
 * returns `"flagged"` instead, a state distinct from `"hatched"` (which
 * means "not enough factor data", not "this data is suspect").
 */
export type DataQuality = "ok" | "over-capacity" | "implausible";

/**
 * One month's raw observation for a substation's primary voltage class —
 * DATA.md "What we now hold", and the shape Lane G's sparkline needs.
 * Carries enough to plot the true day/night shape and enough provenance
 * (`month`) to explain a point on hover, without the full `Field` wrapping
 * every headline number gets: this is per-point series data, not a single
 * sourced fact, and 55 `Field`s per node is exactly the bundle-size
 * problem `src/data/loader.ts`'s header discusses.
 */
export interface MonthlyObservation {
  /** Raw month label as MPPTCL's sheet names it, e.g. "July'2026". Not
   * every raw row's label parses to a calendar date (~9% are bare filename
   * stems) — see `src/data/loader.ts` `parseMonthLabel()`. Only rows whose
   * month parses appear in a `series`, so it is safe to assume ascending
   * chronological order without re-parsing `month` again downstream. */
  month: string;
  peakMva: number | null;
  peakIsNight: boolean;
  peakHour: number | null;
  /** ISO date the month's SIMULTANEOUS MAXIMUM fell on, or null when the
   * sheet's DATE column was blank/unparseable for this row. */
  peakDate: string | null;
  installedMva: number | null;
  /** peak_mva / installed_mva as a percent, or null when either input is
   * missing. Not gated on night vs. day — a sparkline plots every month. */
  utilisationPct: number | null;
  /** Per-reading classification — see `DataQuality` above. */
  quality: DataQuality;
}

/** A point on the MP grid map, per DESIGN.md Act 2. */
export interface Substation {
  id: string;
  name: string;
  /** Voltage class in kV, e.g. 765, 400, 220. */
  voltageKv: number;
  /** Geographic position — owned by Lane A's `src/data/geometry.ts`. */
  lat: number;
  lon: number;
  /** Transformation capacity, when known. */
  capacity: Field<number> | null;
  /** The five risk factors scored for this node, when assessable. */
  riskFactors: RiskFactor[] | null;
  /** Worst data-quality classification found anywhere in this node's
   * primary-class series (DATA.md caveat 5). "ok" when never populated —
   * that is also the correct default for a node with no ingested data at
   * all, since there is nothing yet to be suspicious of. */
  quality: DataQuality;
  /** Chronologically ordered (ascending) monthly series for this node's
   * primary voltage class — see `src/data/loader.ts` "AGGREGATION CHOICE"
   * and `MonthlyObservation` above. Empty (not null) both when no loader
   * has populated this node yet, and when the loader deliberately scoped
   * series population to a subset of nodes (see that file's header) and
   * this id fell outside it — either way, "no series to plot" is the
   * correct rendering, so the two cases share a representation. */
  series: MonthlyObservation[];
}

/** One of the five risk-factor scores behind Act 2's risk arithmetic. */
export type RiskFactorScore = "strong" | "adequate" | "weak" | "unknown";

/**
 * DESIGN.md "Risk is five factors and one line of arithmetic, both shown":
 * loading ratio, night-supply dependence, seasonal coincidence, planned
 * outage / under-construction, single-transformer exposure.
 */
export type RiskFactorName =
  | "loading-ratio"
  | "night-supply-dependence"
  | "seasonal-coincidence"
  | "planned-outage"
  | "single-transformer-exposure";

export interface RiskFactor {
  name: RiskFactorName;
  score: RiskFactorScore;
  /** One-line argument for the score, with its citation. */
  argument: string;
  source: Field<string> | null;
}
