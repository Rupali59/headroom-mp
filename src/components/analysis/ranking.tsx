"use client";

/**
 * Ranking — Lane J. Task 5: "the ordered answer." Renders
 * `src/lib/analysis.ts`'s `rankForLoad()` output.
 *
 * TASK 2, ON SCREEN: "The ranking must return, per node, WHICH criteria
 * it met and which it failed, and the UI must show that. A ranked list
 * whose ordering cannot be interrogated is exactly what DESIGN.md
 * rejected when the user said 'ranking alone doesnt help'." Every
 * criterion from `rankForLoad()` is rendered, met or not, with its own
 * stated numbers — never collapsed to a single score.
 *
 * LAYOUT: rules and typography, NOT stacked cards —
 * design-system/MASTER.md §4 / DESIGN.md D8, hard-rejection #7 ("app UI
 * made of stacked cards"): "Card chrome survives in exactly one place: a
 * worklist row, because acting on it is the interaction." Nothing here is
 * acted on the way a worklist row is, so this follows `factor-card.tsx`'s
 * precedent (Lane C, same constraint) — a divided list, `<Separator>`
 * between rows, never a bordered/shadowed box per row.
 *
 * ACCESSIBILITY (MASTER.md §6): met/not-met is never colour alone — the
 * word ("Met"/"Not met") is always rendered next to the badge's colour,
 * matching `factor-card.tsx`'s `VerdictBadge` precedent.
 */

import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Value } from "@/components/value";
import type { RankCriterion, RankedSubstation } from "@/lib/analysis";

function CriterionRow({ c }: { c: RankCriterion }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      <Badge
        variant="outline"
        className={cn(
          "mt-0.5 shrink-0 border-transparent px-1.5 text-[10px] uppercase tracking-wide",
          c.met ? "bg-good/20 text-good" : "bg-bad/20 text-bad"
        )}
      >
        {c.met ? "Met" : "Not met"}
      </Badge>
      <span className="text-ink-2">{c.label}</span>
    </li>
  );
}

function RankingRow({ row }: { row: RankedSubstation }) {
  const s = row.substation;
  return (
    <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-ink-3">
            #{row.rank}
          </span>
          <span className="font-medium text-ink">{s.name}</span>
          <Badge
            variant="outline"
            className="border-line-2 bg-transparent px-1.5 text-[10px] uppercase tracking-wide text-ink-3"
          >
            {s.voltageClass}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "border-transparent px-1.5 text-[10px] uppercase tracking-wide",
              row.meetsLoad ? "bg-good/20 text-good" : "bg-bad/20 text-bad"
            )}
          >
            {row.meetsLoad ? "Fits the load" : "Falls short"}
          </Badge>
        </div>
        <ul className="mt-2 space-y-1">
          {row.criteria.map((c) => (
            <CriterionRow key={c.key} c={c} />
          ))}
        </ul>
      </div>
      <div className="shrink-0 text-right sm:text-right">
        {s.spareAtNightMva ? (
          <Value
            field={s.spareAtNightMva}
            label={`${s.name} — spare MVA at night`}
            className="font-mono text-sm"
          />
        ) : (
          <span className="font-mono text-sm text-ink-3">—</span>
        )}
        <p className="mt-1 font-mono text-[10px] text-ink-3">
          {Math.round(row.distanceKm)} km away
        </p>
      </div>
    </div>
  );
}

export interface RankingProps {
  /** Output of `rankForLoad()` — already sorted, already reasoned. */
  results: readonly RankedSubstation[];
  className?: string;
}

export function Ranking({ results, className }: RankingProps) {
  if (results.length === 0) {
    return (
      <p className={cn("text-sm text-ink-3", className)}>
        No substations in range. Try a larger radius or a different city.
      </p>
    );
  }

  return (
    <div className={cn("divide-y divide-line", className)}>
      {results.map((row) => (
        <RankingRow key={row.substation.id} row={row} />
      ))}
    </div>
  );
}
