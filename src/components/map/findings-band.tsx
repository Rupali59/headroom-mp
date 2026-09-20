"use client";

/**
 * Findings band — DESIGN.md D8, "the band is the anchor, and cards are
 * gone everywhere else": a full-width band using RULES AND TYPOGRAPHY, not
 * boxes. Hard rejection #7 (app UI made of stacked cards) was a genuine
 * hit; this is the fix. Reading order: the finding, then the geography,
 * then what to do — how an operator actually thinks (DESIGN.md D3).
 *
 * Shows AT RISK nodes with which factors scored Weak, then NOT ASSESSED
 * nodes with what is missing (DESIGN.md "Act 2 layout" wireframe). Every
 * row is `id`-addressable so a map click can scroll it into view
 * (`grid-map.tsx` calls `scrollFindingIntoView`).
 */

import type { RiskFactorName } from "@/lib/types";
import type { RiskLevel } from "@/lib/risk";

export interface FindingNode {
  id: string;
  name: string;
  voltageKv: number;
  level: RiskLevel;
  weakFactors: RiskFactorName[];
}

export interface FindingsBandProps {
  nodes: FindingNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const FACTOR_LABEL: Record<RiskFactorName, string> = {
  "loading-ratio": "loading",
  "night-supply-dependence": "night",
  "seasonal-coincidence": "season",
  "planned-outage": "outage",
  "single-transformer-exposure": "single-transformer",
};

/** DOM id a map node click scrolls to — shared with `grid-map.tsx`. */
export function findingRowId(nodeId: string): string {
  return `finding-${nodeId}`;
}

function FindingRow({
  node,
  selected,
  onSelect,
  detail,
}: {
  node: FindingNode;
  selected: boolean;
  onSelect: (id: string) => void;
  detail: string;
}) {
  return (
    <li id={findingRowId(node.id)} className="border-b border-line py-2 last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={
          "flex w-full min-h-6 flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
          (selected ? "text-ink" : "text-ink-2 hover:text-ink")
        }
      >
        <span className="font-medium">
          {node.name} <span className="font-mono text-xs text-ink-3">{node.voltageKv}kV</span>
        </span>
        <span className="font-mono text-xs text-ink-3">· {detail}</span>
      </button>
    </li>
  );
}

export function FindingsBand({ nodes, selectedId, onSelect }: FindingsBandProps) {
  const atRisk = nodes.filter((n) => n.level === "amber" || n.level === "red");
  const notAssessed = nodes.filter((n) => n.level === "hatched");

  return (
    <section
      id="findings-band"
      aria-labelledby="findings-band-heading"
      className="rounded-lg border border-line bg-panel px-4 py-3"
    >
      <h2 id="findings-band-heading" className="font-serif text-xl text-ink">
        What is happening on the grid?
      </h2>

      {atRisk.length > 0 && (
        <div className="mt-3">
          <p className="font-mono text-[10.5px] uppercase tracking-wide text-bad">At risk</p>
          <ul>
            {atRisk.map((n) => (
              <FindingRow
                key={n.id}
                node={n}
                selected={n.id === selectedId}
                onSelect={onSelect}
                detail={
                  n.weakFactors.length > 0
                    ? n.weakFactors.map((f) => FACTOR_LABEL[f]).join(", ")
                    : "weak factor detail pending"
                }
              />
            ))}
          </ul>
        </div>
      )}

      {notAssessed.length > 0 && (
        <div className="mt-3">
          <p className="font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
            Not assessed
          </p>
          <ul>
            {notAssessed.map((n) => (
              <FindingRow
                key={n.id}
                node={n}
                selected={n.id === selectedId}
                onSelect={onSelect}
                detail="fewer than 3 of 5 risk factors are known — capacity and loading not yet ingested"
              />
            ))}
          </ul>
        </div>
      )}

      {atRisk.length === 0 && notAssessed.length === 0 && (
        <p className="mt-3 text-sm text-ink-3">
          No open risk findings for the current load condition.
        </p>
      )}
    </section>
  );
}
