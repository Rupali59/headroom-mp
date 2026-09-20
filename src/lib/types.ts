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
