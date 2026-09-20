"use client";

/**
 * A single MP grid substation, drawn as a focusable SVG node.
 *
 * DATA.md "NODE RENDERING" (Lane A brief, point 4) — this is the part that
 * carries the product's credibility:
 *   - size = voltage class (765/400/220)
 *   - fill = risk colour from `src/lib/risk.ts`
 *   - CENTRE = the weak-factor digit, 0-5 (design decision D10). Colour
 *     alone is unreadable — measured, green vs amber is 1.10:1 luminance,
 *     so a colourblind viewer sees three identical nodes. The digit is the
 *     second channel and it is mandatory (design-system/MASTER.md §2).
 *   - `unknown` -> hatch fill, dashed ring, "—" instead of a digit, and it
 *     must be CLEARLY VISIBLE — the previous wireframe rendered it dark
 *     grey on dark and it vanished. Hatch lines and the dashed ring use
 *     `--ink-2`, not `--ink-3`, for that reason.
 *   - Accessible name reads STATE, not colour: design-system/MASTER.md §6's
 *     worked example — "Mandsaur 400 kV, 3 of 5 factors weak, at risk."
 *
 * Keyboard: this is one stop of the map's roving-tabindex group
 * (design-system/MASTER.md §6 "The map is a single tab stop; arrow keys
 * move between nodes") — `grid-map.tsx` owns the roving index and passes
 * `tabIndex` (0 for the active node, -1 otherwise) plus the key handler.
 *
 * OPTIONAL utilisation ring (Lane G task 4, DATA.md "THE GAP YOU CLOSE"):
 * a thin stroked ring around the node showing night utilisation as a
 * fraction of the circumference, so relative fullness reads at a glance
 * without clicking through to `load-panel.tsx`. Entirely opt-in via
 * `nightUtilisationPct` — omitted (the default, since nothing upstream of
 * `grid-map.tsx` supplies per-node MVA data today, see that file's header)
 * it renders nothing extra and this node is pixel-identical to before.
 * The weak-factor digit (D10) is NEVER removed or obscured by it — the
 * ring sits strictly between the node's fill radius and its halo, drawn
 * before both so it cannot paint over the digit.
 */

import { forwardRef } from "react";
import type { RiskLevel } from "@/lib/risk";
import { cn } from "cn";

/** SVG circle radius by voltage class, verbatim from the legacy app's
 * `draw()`: `s.v===765?9:s.v===400?7:5.5`. */
function radiusForVoltage(voltageKv: number): number {
  if (voltageKv === 765) return 9;
  if (voltageKv === 400) return 7;
  return 5.5;
}

/**
 * `flagged` is excluded alongside `hatched` because neither takes a risk fill.
 * They are DIFFERENT facts and get different marks (DATA.md caveat 5):
 *   hatched — not enough factor data to score. Centre reads "—".
 *   flagged — the underlying READING is suspect, so a verdict would be worse
 *             than none. `132KV SALAMATPUR` reports 183% of installed capacity
 *             (73.25 of 40 MVA) in MPPTCL's own sheet. Centre reads "!".
 * Collapsing the two would make the least trustworthy node on screen look
 * merely unassessed, which is the opposite of what a reader needs to know.
 */
const FILL_CLASS: Record<Exclude<RiskLevel, "hatched" | "flagged">, string> = {
  green: "fill-good",
  amber: "fill-mid",
  red: "fill-bad",
};

function statusWord(level: RiskLevel): string {
  if (level === "green") return "healthy";
  if (level === "amber") return "at risk";
  if (level === "red") return "at high risk";
  if (level === "flagged") return "reading not trusted";
  return "not assessed";
}

/** design-system/MASTER.md §6: accessible name reads state, not colour. */
export function nodeAccessibleName(
  name: string,
  voltageKv: number,
  level: RiskLevel,
  weakCount: number | null
): string {
  if (level === "flagged") {
    return `${name}, ${voltageKv} kV, reading not trusted — the published figure exceeds installed capacity`;
  }
  if (level === "hatched" || weakCount === null) {
    return `${name}, ${voltageKv} kV, not assessed — fewer than 3 of 5 risk factors are known`;
  }
  return `${name}, ${voltageKv} kV, ${weakCount} of 5 factors weak, ${statusWord(level)}`;
}

export interface MapNodeProps {
  id: string;
  name: string;
  voltageKv: number;
  x: number;
  y: number;
  level: RiskLevel;
  /** count(Weak) of 5, or null when hatched/unassessed — renders "—". */
  weakCount: number | null;
  selected: boolean;
  tabIndex: number;
  onSelect: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<SVGGElement>, id: string) => void;
  /** Optional utilisation ring (task 4) — night peak as a percent of
   * installed capacity, 0-100+ (values over 100 render in `--bad`, the
   * same data-quality-exception convention as `load-bar.tsx`). Omitted or
   * null renders no ring at all. */
  nightUtilisationPct?: number | null;
}

export const MapNode = forwardRef<SVGGElement, MapNodeProps>(function MapNode(
  {
    id,
    name,
    voltageKv,
    x,
    y,
    level,
    weakCount,
    selected,
    tabIndex,
    onSelect,
    onKeyDown,
    nightUtilisationPct,
  },
  ref
) {
  const r = radiusForVoltage(voltageKv);
  const hatched = level === "hatched";
  const flagged = level === "flagged";
  // Neither takes a risk fill, so neither may index FILL_CLASS. They differ in
  // the centre glyph only: "—" = cannot score, "!" = do not trust the number.
  const unscored = hatched || flagged;
  const label = nodeAccessibleName(name, voltageKv, level, weakCount);
  const digit = flagged ? "!" : unscored || weakCount === null ? "—" : String(weakCount);
  const fillClass = unscored ? null : FILL_CLASS[level as Exclude<RiskLevel, "hatched" | "flagged">];

  // Ring geometry — see the file header. Skipped entirely on hatched
  // nodes: an unassessed node has no reading to show as a fraction of
  // anything, and drawing a ring at 0% would read as "confidently empty"
  // rather than "not assessed" (the same failure MASTER.md §2 names for
  // colour-only encoding).
  const showRing =
    !unscored && typeof nightUtilisationPct === "number" && Number.isFinite(nightUtilisationPct);
  const ringR = r + 3;
  const ringCircumference = 2 * Math.PI * ringR;
  const ringPct = showRing ? Math.min(100, Math.max(0, nightUtilisationPct as number)) : 0;
  const ringDash = (ringPct / 100) * ringCircumference;

  return (
    <g
      ref={ref}
      role="button"
      aria-label={label}
      aria-pressed={selected}
      tabIndex={tabIndex}
      transform={`translate(${x},${y})`}
      className="cursor-pointer outline-none"
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
        onKeyDown(e, id);
      }}
    >
      {/* Halo — soft glow at rest, same colour as the core, low opacity. */}
      <circle
        r={r * 2.2}
        className={unscored ? "fill-ink-2/10" : fillClass!}
        opacity={unscored ? 1 : 0.16}
      />

      {showRing && (
        <g aria-hidden="true">
          <circle r={ringR} className="fill-none stroke-line-2" strokeWidth={1.25} />
          <circle
            r={ringR}
            className={cn("fill-none", nightUtilisationPct! > 100 ? "stroke-bad" : "stroke-night")}
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeDasharray={`${ringDash} ${ringCircumference - ringDash}`}
            transform="rotate(-90)"
          />
        </g>
      )}
      {unscored ? (
        <>
          {/* Dashed ring for both; the glyph is what tells them apart. A
              flagged node also takes a --sun stroke so "suspect reading" is
              not silently the same mark as "not enough data". */}
          <circle
            r={r}
            className={flagged ? "fill-map-fill stroke-sun" : "fill-map-fill stroke-ink-2"}
            strokeWidth={1.5}
            strokeDasharray="2.5 2.5"
          />
        </>
      ) : (
        <circle
          r={r}
          className={fillClass!}
          stroke="var(--map-fill)"
          strokeWidth={selected ? 2.5 : 1.5}
        />
      )}
      {selected && !hatched && (
        <circle r={r} className="fill-none stroke-ink" strokeWidth={2.5} />
      )}
      {/* Weak-factor digit / em-dash — D10's mandatory second channel. */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        className={
          "pointer-events-none select-none font-mono text-[9px] font-medium " +
          (hatched ? "fill-ink-2" : "fill-bg")
        }
      >
        {digit}
      </text>
    </g>
  );
});
