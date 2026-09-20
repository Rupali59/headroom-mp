/**
 * BUILD.md D17 — "projection.ts: xy() and dist() match the values the old
 * app produced, verbatim."
 *
 * `src/lib/projection.ts` is Lane A's exclusive file (BUILD.md "Then, in
 * parallel" table) and does not exist yet — this import fails until Lane A
 * lands, which is the expected, meaningful failure D17/D15 describe:
 * "they should FAIL meaningfully now and pass as lanes land."
 *
 * Expected values below were computed directly from `mp-headroom-app.html`
 * lines 285-286 (`var P={...}`, `function xy`, `function dist`) against
 * real node coordinates from that file's NODES array (Bhopal BDTCL,
 * Mandsaur, Neemuch), so Lane A's port has a verbatim target to match —
 * not "close enough", per the confidence-ladder principle that a stated
 * model beats an unstated guess.
 */

import { describe, expect, it } from "vitest";
import { xy, dist } from "../src/lib/projection";

describe("projection (verbatim port of mp-headroom-app.html)", () => {
  it("xy() matches the legacy app for Bhopal BDTCL (23.40, 77.45)", () => {
    const [x, y] = xy(23.4, 77.45);
    expect(x).toBeCloseTo(392.7941101730841, 9);
    expect(y).toBeCloseTo(436.7158626332984, 9);
  });

  it("xy() matches the legacy app for Mandsaur (24.07, 75.07)", () => {
    const [x, y] = xy(24.07, 75.07);
    expect(x).toBeCloseTo(130.41057180759387, 9);
    expect(y).toBeCloseTo(355.86134927824617, 9);
  });

  it("xy() matches the legacy app for Neemuch (24.47, 74.87)", () => {
    const [x, y] = xy(24.47, 74.87);
    expect(x).toBeCloseTo(108.36153497015906, 9);
    expect(y).toBeCloseTo(307.58999802149884, 9);
  });

  it("dist() matches the legacy app, Bhopal BDTCL -> Mandsaur", () => {
    expect(dist(23.4, 77.45, 24.07, 75.07)).toBeCloseTo(
      253.45135547730126,
      9
    );
  });

  it("dist() of a point to itself is 0", () => {
    expect(dist(23.4, 77.45, 23.4, 77.45)).toBe(0);
  });
});
