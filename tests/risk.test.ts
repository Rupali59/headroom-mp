/**
 * BUILD.md D17 — "Risk arithmetic: count(Weak) of 5; 0 green, 1-2 amber,
 * 3+ red; >=2 unknown hatches and is excluded from the count."
 *
 * "The risk arithmetic is the number an engineer in the room will
 * recompute by hand. Pinning it is worth more than its size suggests."
 */

import { describe, expect, it } from "vitest";
import { riskLevel, countWeak, countUnknown } from "../src/lib/risk";
import type { RiskFactor, RiskFactorName, RiskFactorScore } from "../src/lib/types";

const NAMES: RiskFactorName[] = [
  "loading-ratio",
  "night-supply-dependence",
  "seasonal-coincidence",
  "planned-outage",
  "single-transformer-exposure",
];

function factors(scores: RiskFactorScore[]): RiskFactor[] {
  if (scores.length !== 5) {
    throw new Error("test fixture must supply exactly 5 scores");
  }
  return scores.map((score, i) => ({
    name: NAMES[i],
    score,
    argument: "",
    source: null,
  }));
}

describe("risk arithmetic", () => {
  it("0 weak -> green", () => {
    expect(
      riskLevel(factors(["strong", "strong", "adequate", "adequate", "strong"]))
    ).toBe("green");
  });

  it("1-2 weak -> amber", () => {
    expect(
      riskLevel(factors(["weak", "strong", "adequate", "adequate", "strong"]))
    ).toBe("amber");
    expect(
      riskLevel(factors(["weak", "weak", "adequate", "adequate", "strong"]))
    ).toBe("amber");
  });

  it("3+ weak -> red", () => {
    expect(
      riskLevel(factors(["weak", "weak", "weak", "adequate", "strong"]))
    ).toBe("red");
    expect(riskLevel(factors(["weak", "weak", "weak", "weak", "weak"]))).toBe(
      "red"
    );
  });

  it(">=2 unknown -> hatched, regardless of weak count", () => {
    expect(
      riskLevel(factors(["unknown", "unknown", "weak", "weak", "weak"]))
    ).toBe("hatched");
    expect(
      riskLevel(factors(["unknown", "unknown", "strong", "strong", "strong"]))
    ).toBe("hatched");
  });

  it("1 unknown does not hatch — only counts, does not exclude", () => {
    expect(
      riskLevel(factors(["unknown", "weak", "weak", "weak", "strong"]))
    ).toBe("red");
  });

  it("countWeak / countUnknown count independently", () => {
    const f = factors(["unknown", "weak", "weak", "strong", "adequate"]);
    expect(countWeak(f)).toBe(2);
    expect(countUnknown(f)).toBe(1);
  });
});
