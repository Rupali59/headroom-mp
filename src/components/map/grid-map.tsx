"use client";

/**
 * Lane A — MP grid map. Replaces Lane 0's stub wholesale (BUILD.md D15);
 * same export name (`GridMap`), same props (none — `page.tsx` is frozen
 * and calls `<GridMap />` bare, per BUILD.md "Then, in parallel" table).
 *
 * Composes, declaratively, the whole of DESIGN.md's "Act 2 layout":
 *   - `FindingsBand` — full width, the anchor (D8)
 *   - a context rail — `ReplayChrome` + `RiskLegend`
 *   - the map itself — MP outline + city labels + 19 focusable nodes
 *
 * `page.tsx`'s own grid puts `<GridMap />` beside `<Worklist />` in a
 * `[1fr_330px]` layout, so this component owns everything left of the
 * worklist column — the band, context rail and map all live inside it.
 *
 * DATA CONTRACT (DATA.md "Lane assignments against this file", Lane A):
 * "Node colour comes from `src/lib/risk.ts` over loader data. Do not
 * hardcode headroom." `src/data/loader.ts` (Lane E) does not exist yet —
 * this file therefore accepts substation data via an OPTIONAL prop rather
 * than importing Lane E's module directly (which nothing in `page.tsx`
 * could supply anyway, since that file is frozen and calls `<GridMap />`
 * with no arguments). Until something wires a loader result through,
 * every node merges with `NODE_GEOMETRY` and renders `riskFactors: null`
 * -> hatched, "not assessed". That is not a placeholder trick — it is the
 * product's own correct behaviour for "we have positions but no ingested
 * data yet," per DESIGN.md's "nodes that refuse to answer" principle.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { NODE_GEOMETRY, MP_OUTLINE_PATH, MAP_VIEWBOX, CITIES } from "@/data/geometry";
import { xy } from "@/lib/projection";
import { riskLevel, countWeak, type RiskLevel } from "@/lib/risk";
import type { Substation, RiskFactorName } from "@/lib/types";
import { MapNode } from "./node";
import { RiskLegend } from "./legend";
import { FindingsBand, findingRowId, type FindingNode } from "./findings-band";
import { ReplayChrome, type LoadCondition } from "@/components/replay-chrome";

export interface GridMapProps {
  /**
   * Ingested substation data, keyed by the same `id`s as
   * `src/data/geometry.ts`'s `NODE_GEOMETRY`. Optional and unused by
   * `page.tsx` today — see the file header. A node whose id has no entry
   * here (or none at all, the default) renders hatched: `riskFactors`
   * unassessed rather than guessed.
   */
  substations?: Substation[];
}

type MergedNode = {
  id: string;
  name: string;
  voltageKv: number;
  lat: number;
  lon: number;
  level: RiskLevel;
  weakCount: number | null;
  weakFactors: RiskFactorName[];
};

function mergeNode(
  geo: (typeof NODE_GEOMETRY)[number],
  substations: Substation[] | undefined
): MergedNode {
  const match = substations?.find((s) => s.id === geo.id);
  const factors = match?.riskFactors ?? null;
  const level = factors ? riskLevel(factors) : "hatched";
  return {
    id: geo.id,
    name: geo.name,
    voltageKv: geo.voltageKv,
    lat: geo.lat,
    lon: geo.lon,
    level,
    weakCount: factors ? countWeak(factors) : null,
    weakFactors: factors
      ? factors.filter((f) => f.score === "weak").map((f) => f.name)
      : [],
  };
}

export function GridMap({ substations }: GridMapProps) {
  const [condition, setCondition] = useState<LoadCondition>("winter");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const nodeRefs = useRef<(SVGGElement | null)[]>([]);

  // `condition` selects which of the two replayed months is in view
  // (DESIGN.md "Act 2" / the Lane A brief's replay-chrome requirement).
  // Wiring it to change which risk figures `substations` carries per
  // month is Lane E's loader job, not this file's — see the header note.

  const nodes = useMemo<MergedNode[]>(
    () =>
      NODE_GEOMETRY.map((g) => mergeNode(g, substations))
        // Same z-order as the legacy app's draw(): smaller voltage classes
        // first, so 765 kV nodes sit on top. Reused as tab order too.
        .sort((a, b) => a.voltageKv - b.voltageKv),
    [substations]
  );

  const counts = useMemo(() => {
    const c = { green: 0, amber: 0, red: 0, hatched: 0 };
    for (const n of nodes) c[n.level]++;
    return c;
  }, [nodes]);

  const findingNodes = useMemo<FindingNode[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        name: n.name,
        voltageKv: n.voltageKv,
        level: n.level,
        weakFactors: n.weakFactors,
      })),
    [nodes]
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    document
      .getElementById(findingRowId(id))
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const idx = nodeRefs.current.findIndex((el) => el?.dataset.nodeId === id);
    if (idx >= 0) {
      setFocusIndex(idx);
      nodeRefs.current[idx]?.focus();
    }
  }, []);

  const moveFocus = useCallback(
    (delta: number) => {
      setFocusIndex((prev) => {
        const next = (prev + delta + nodes.length) % nodes.length;
        nodeRefs.current[next]?.focus();
        return next;
      });
    },
    [nodes.length]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGGElement>) => {
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          moveFocus(1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          moveFocus(-1);
          break;
        case "Home":
          e.preventDefault();
          setFocusIndex(0);
          nodeRefs.current[0]?.focus();
          break;
        case "End":
          e.preventDefault();
          setFocusIndex(nodes.length - 1);
          nodeRefs.current[nodes.length - 1]?.focus();
          break;
      }
    },
    [moveFocus, nodes.length]
  );

  return (
    <div className="space-y-4">
      <FindingsBand nodes={findingNodes} selectedId={selectedId} onSelect={handleSelect} />

      <div className="grid gap-4 sm:grid-cols-[230px_1fr]">
        <aside role="complementary" aria-label="Context" className="space-y-4">
          <div className="space-y-1">
            <p className="font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
              Live state load
            </p>
            <p className="text-xs text-ink-3">
              Live state load: source available, not reachable now.
            </p>
          </div>
          <ReplayChrome condition={condition} onChange={setCondition} />
          <RiskLegend counts={counts} />
        </aside>

        <div
          role="img"
          aria-label={`MP grid map, ${nodes.length} substations — ${counts.hatched} not assessed, ${counts.red} at high risk, ${counts.amber} at risk, ${counts.green} healthy`}
          className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-map-fill"
        >
          <svg
            viewBox={MAP_VIEWBOX}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full"
          >
            <path d={MP_OUTLINE_PATH} className="fill-map-fill stroke-map-stroke" strokeWidth={1.3} />

            <g aria-hidden="true">
              {CITIES.map((c) => {
                const [x, y] = xy(c.lat, c.lon);
                return (
                  <g key={c.name}>
                    <circle cx={x} cy={y} r={2} className="fill-ink-3" />
                    <text x={x + 6} y={y - 6} className="fill-ink-3 font-mono text-[11px]">
                      {c.name}
                    </text>
                  </g>
                );
              })}
            </g>

            <g aria-label="Substations">
              {nodes.map((n, i) => {
                const [x, y] = xy(n.lat, n.lon);
                return (
                  <MapNode
                    key={n.id}
                    ref={(el) => {
                      nodeRefs.current[i] = el;
                      if (el) el.dataset.nodeId = n.id;
                    }}
                    id={n.id}
                    name={n.name}
                    voltageKv={n.voltageKv}
                    x={x}
                    y={y}
                    level={n.level}
                    weakCount={n.weakCount}
                    selected={n.id === selectedId}
                    tabIndex={i === focusIndex ? 0 : -1}
                    onSelect={handleSelect}
                    onKeyDown={handleKeyDown}
                  />
                );
              })}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
