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
 */

import { forwardRef } from "react";
import type { RiskLevel } from "@/lib/risk";

/** SVG circle radius by voltage class, verbatim from the legacy app's
 * `draw()`: `s.v===765?9:s.v===400?7:5.5`. */
function radiusForVoltage(voltageKv: number): number {
  if (voltageKv === 765) return 9;
  if (voltageKv === 400) return 7;
  return 5.5;
}

const FILL_CLASS: Record<Exclude<RiskLevel, "hatched">, string> = {
  green: "fill-good",
  amber: "fill-mid",
  red: "fill-bad",
};

function statusWord(level: RiskLevel): string {
  if (level === "green") return "healthy";
  if (level === "amber") return "at risk";
  if (level === "red") return "at high risk";
  return "not assessed";
}

/** design-system/MASTER.md §6: accessible name reads state, not colour. */
export function nodeAccessibleName(
  name: string,
  voltageKv: number,
  level: RiskLevel,
  weakCount: number | null
): string {
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
}

export const MapNode = forwardRef<SVGGElement, MapNodeProps>(function MapNode(
  { id, name, voltageKv, x, y, level, weakCount, selected, tabIndex, onSelect, onKeyDown },
  ref
) {
  const r = radiusForVoltage(voltageKv);
  const hatched = level === "hatched";
  const label = nodeAccessibleName(name, voltageKv, level, weakCount);
  const digit = hatched || weakCount === null ? "—" : String(weakCount);

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
        className={hatched ? "fill-ink-2/10" : FILL_CLASS[level]}
        opacity={hatched ? 1 : 0.16}
      />
      {hatched ? (
        <>
          <circle
            r={r}
            className="fill-map-fill stroke-ink-2"
            strokeWidth={1.5}
            strokeDasharray="2.5 2.5"
          />
        </>
      ) : (
        <circle
          r={r}
          className={FILL_CLASS[level]}
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
