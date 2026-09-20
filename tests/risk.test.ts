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

/**
 * Lane H — DATA.md caveat 5: "Clamp or flag anything over 100% as a
 * data-quality exception — never render it as a confident red node."
 * `riskLevel()`'s second argument is the node's `DataQuality`
 * (`src/data/loader.ts` `classifyLoadQuality()` / `SubstationLoad.quality`).
 */
describe("risk arithmetic — data-quality gate", () => {
  it("an implausible node never gets a confident verdict, even with all-weak factors", () => {
    // Every factor scores weak — without the gate this would be "red", the
    // most alarming state the UI has. The quality gate must intercept it
    // BEFORE the weak count is even considered.
    expect(
      riskLevel(factors(["weak", "weak", "weak", "weak", "weak"]), "implausible")
    ).toBe("flagged");
  });

  it("an over-capacity node never gets a confident verdict either, even with all-strong factors", () => {
    expect(
      riskLevel(factors(["strong", "strong", "strong", "strong", "strong"]), "over-capacity")
    ).toBe("flagged");
  });

  it("quality defaults to ok — every pre-existing call site (e.g. grid-map.tsx's riskLevel(factors)) is unaffected", () => {
    expect(
      riskLevel(factors(["weak", "weak", "weak", "weak", "weak"]))
    ).toBe("red");
  });

  it("flagged is distinct from hatched — a suspect reading is not the same fact as insufficient factor data", () => {
    const hatched = riskLevel(factors(["unknown", "unknown", "weak", "weak", "weak"]), "ok");
    const flagged = riskLevel(factors(["unknown", "unknown", "weak", "weak", "weak"]), "implausible");
    expect(hatched).toBe("hatched");
    expect(flagged).toBe("flagged");
    expect(flagged).not.toBe(hatched);
  });

  it("an explicitly-ok quality behaves exactly like omitting the argument", () => {
    const f = factors(["weak", "strong", "adequate", "adequate", "strong"]);
    expect(riskLevel(f, "ok")).toBe(riskLevel(f));
  });
});
