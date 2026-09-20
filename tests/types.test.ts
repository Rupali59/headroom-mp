/**
 * BUILD.md D17 — "Field / confidence type: the ladder's five values, and
 * that field outranks modelled."
 *
 * FINDING, reported rather than silently resolved: the shared contract as
 * BUILD.md's own "Shared contracts" section states it — `Confidence =
 * "verified" | "researched" | "derived" | "field" | "modelled" |
 * "unknown"` — has SIX values, not five. DESIGN.md's spine example has a
 * fifth, different set (no "researched"). `src/lib/types.ts` implements
 * BUILD.md's six-value list verbatim, so this test asserts six — see the
 * Lane 0 report for the full discrepancy.
 */

import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_LADDER,
  confidenceRank,
  type Confidence,
} from "../src/lib/types";

describe("Confidence ladder", () => {
  it("has exactly the values named in BUILD.md's shared contract", () => {
    const expected: Confidence[] = [
      "unknown",
      "modelled",
      "derived",
      "researched",
      "field",
      "verified",
    ];
    expect([...CONFIDENCE_LADDER].sort()).toEqual([...expected].sort());
    expect(CONFIDENCE_LADDER.length).toBe(6);
  });

  it("ranks field above modelled — an operator correction outranks a modelled value", () => {
    expect(confidenceRank("field")).toBeGreaterThan(confidenceRank("modelled"));
  });

  it("ranks unknown lowest and verified highest", () => {
    for (const c of CONFIDENCE_LADDER) {
      if (c === "unknown") continue;
      expect(confidenceRank(c)).toBeGreaterThan(confidenceRank("unknown"));
    }
    for (const c of CONFIDENCE_LADDER) {
      if (c === "verified") continue;
      expect(confidenceRank("verified")).toBeGreaterThan(confidenceRank(c));
    }
  });
});
