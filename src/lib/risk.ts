/**
 * Risk arithmetic — the deterministic seam DESIGN.md "Act 2 — Operations"
 * puts on screen next to the legend, and BUILD.md D17 names as a contract
 * test target. No lane in BUILD.md's ownership table names an explicit
 * owner for this file; it lives here because it is pure arithmetic over
 * `RiskFactor[]` (defined in `./types`, also Lane 0's), and because a
 * contract test needs a real module to import, not a stub.
 *
 * DESIGN.md "Risk is five factors and one line of arithmetic, both shown":
 *
 *   risk = count(factors scoring Weak)   // of 5
 *   0 -> green   1-2 -> amber   3+ -> red
 *   >= 2 of the 5 Unknown -> hatched, excluded from risk, counted in legend
 *
 * The hatching check runs first and short-circuits the colour function —
 * a node with 2+ unassessable factors never gets a green/amber/red verdict.
 *
 * DATA-QUALITY GATE (Lane H, DATA.md caveat 5): "Readings above 100% of
 * installed capacity exist in the source ... Clamp or flag anything over
 * 100% as a data-quality exception — never render it as a confident red
 * node. The most extreme thing on screen must not be the least
 * trustworthy." `riskLevel()` now takes the node's `DataQuality`
 * (`src/data/loader.ts`'s `classifyLoadQuality()` / `SubstationLoad.quality`)
 * as an optional second argument, defaulting to `"ok"` so every existing
 * call site (e.g. `src/components/map/grid-map.tsx`'s `riskLevel(factors)`)
 * keeps compiling and behaving exactly as before. A non-"ok" quality
 * short-circuits BEFORE the hatch check and returns `"flagged"` — a state
 * distinct from `"hatched"` on purpose: hatched means "not enough factor
 * data to score"; flagged means "the underlying reading is itself suspect,
 * scoring it would be confidently wrong, not just incomplete."
 */

import type { DataQuality, RiskFactor } from "./types";

export type RiskLevel = "green" | "amber" | "red" | "hatched" | "flagged";

/** DESIGN.md scopes the arithmetic to exactly these five risk factors. */
export const RISK_FACTOR_COUNT = 5;

/** Unknown-factor count at or above which a node is hatched, not scored. */
export const UNKNOWN_HATCH_THRESHOLD = 2;

export function countWeak(factors: readonly RiskFactor[]): number {
  return factors.filter((f) => f.score === "weak").length;
}

export function countUnknown(factors: readonly RiskFactor[]): number {
  return factors.filter((f) => f.score === "unknown").length;
}

export function riskLevel(
  factors: readonly RiskFactor[],
  quality: DataQuality = "ok",
): RiskLevel {
  if (quality !== "ok") return "flagged";
  if (countUnknown(factors) >= UNKNOWN_HATCH_THRESHOLD) return "hatched";
  const weak = countWeak(factors);
  if (weak === 0) return "green";
  if (weak <= 2) return "amber";
  return "red";
}
