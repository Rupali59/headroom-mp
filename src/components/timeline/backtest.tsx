"use client";

/**
 * Backtest strip — Lane K, the brief's own "money shot": "100 MW at
 * Birsinghpur would have exceeded installed capacity in N of 55 months,
 * all of them January and February." One mark per month in `sub.series`,
 * pass/fail against `loadMw` via `src/lib/simulate.ts`'s `backtest()`.
 *
 * Rules and typography, not a card (design-system/MASTER.md §4: "no cards
 * — card chrome survives only in a worklist row"). Colour is never the
 * only channel (MASTER.md §2): every mark carries a one-letter glyph AND
 * an accessible name naming the verdict in words, never colour alone.
 */

import { useId, useMemo } from "react";
import { cn } from "cn";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { backtest, isWinterMonth, MARGINAL_BAND, POWER_FACTOR, type SimulateResult } from "@/lib/simulate";
import type { Substation } from "@/lib/types";

export interface BacktestProps {
  sub: Substation | null;
  loadMw: number;
  /** The timeline's currently scrubbed month, to draw a ring around the
   * matching mark in the strip — purely a cross-reference between the two
   * components, never load-bearing for the verdict shown. */
  highlightMonth?: string | null;
  className?: string;
}

const VERDICT_GLYPH: Record<SimulateResult["verdict"], string> = {
  FITS: "·",
  MARGINAL: "M",
  FAILED: "F",
  "DATA-QUALITY": "!",
  "NO-DATA": "—",
};

const VERDICT_CLASS: Record<SimulateResult["verdict"], string> = {
  FITS: "bg-good/20 text-good",
  MARGINAL: "bg-mid/25 text-mid",
  FAILED: "bg-bad/25 text-bad",
  "DATA-QUALITY": "bg-panel-2 text-ink-2 border border-dashed border-line-2",
  "NO-DATA": "bg-transparent text-ink-3 border border-line",
};

const VERDICT_WORD: Record<SimulateResult["verdict"], string> = {
  FITS: "fits",
  MARGINAL: "marginal",
  FAILED: "failed",
  "DATA-QUALITY": "data quality exception",
  "NO-DATA": "no reading",
};

function monthName(label: string): string {
  const m = /^([A-Za-z]+)'\d{4}$/.exec(label.trim());
  return m ? m[1] : label;
}

/** Builds the headline sentence — the single most valuable output of this
 * lane, per the brief: state the count, and name the months, not just the
 * count, and say plainly whether they cluster in winter. */
function headline(subName: string, loadMw: number, result: ReturnType<typeof backtest>): string {
  const { failedCount, totalMonths, seasonal } = result;
  if (totalMonths === 0) {
    return `${subName} has no ingested months to backtest against.`;
  }
  if (failedCount === 0) {
    return `${loadMw} MW at ${subName} would have fit in all ${totalMonths} ingested months.`;
  }
  const winterNames = Array.from(new Set(seasonal.winterFailedMonths.map(monthName)));
  const clusterClause = seasonal.clustersInWinter
    ? `, ${winterNames.length > 0 ? `all but ${seasonal.nonWinterFailedCount} of them ${winterNames.join(" and ")}` : "clustered in winter"}`
    : seasonal.winterFailedCount > 0
      ? ` (${seasonal.winterFailedCount} of them winter, ${seasonal.nonWinterFailedCount} not — not a seasonal pattern)`
      : "";
  return `${loadMw} MW at ${subName} would have exceeded installed capacity in ${failedCount} of ${totalMonths} months${clusterClause}.`;
}

export function Backtest({ sub, loadMw, highlightMonth, className }: BacktestProps) {
  const legendId = useId();
  const result = useMemo(() => (sub ? backtest(sub, loadMw) : null), [sub, loadMw]);

  if (!sub || !result) {
    return (
      <div className={cn("border-t border-line py-4 font-sans text-sm text-ink-3", className)}>
        No substation selected — place a load in the what-if panel first.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <section className={cn("border-t border-line pt-4", className)} aria-labelledby={`${legendId}-heading`}>
        <h3 id={`${legendId}-heading`} className="font-sans text-sm font-medium text-ink">
          Backtest — {result.totalMonths} ingested months
        </h3>
        <p className="mt-1 max-w-prose font-sans text-sm text-ink-2">{headline(sub.name, loadMw, result)}</p>

        <div className="mt-3 flex flex-wrap gap-1" role="list" aria-label={`Monthly verdicts for ${loadMw} MW at ${sub.name}`}>
          {result.months.map((m) => {
            const winter = isWinterMonth(m.month);
            const isHighlighted = highlightMonth === m.month;
            return (
              <Tooltip key={m.month}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="listitem"
                    aria-label={`${m.month}: ${VERDICT_WORD[m.verdict]}${winter ? ", winter" : ""}`}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-sm font-mono text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      VERDICT_CLASS[m.verdict],
                      winter && "border-b-2 border-b-night",
                      isHighlighted && "ring-2 ring-ink",
                    )}
                  >
                    {VERDICT_GLYPH[m.verdict]}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="font-mono tabular-nums">
                    {m.month} — {VERDICT_WORD[m.verdict]}
                    {m.newPeakMva !== null && ` · new peak ${m.newPeakMva} MVA`}
                    {winter && " · winter"}
                  </span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs tabular-nums text-ink-2">
          <div className="flex items-center gap-1.5">
            <span className={cn("inline-block h-3 w-3 rounded-sm", VERDICT_CLASS.FITS)} />
            <dt className="sr-only">Fits</dt>
            <dd>{result.totalMonths - result.failedCount - result.marginalCount - result.dataQualityCount} fits</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn("inline-block h-3 w-3 rounded-sm", VERDICT_CLASS.MARGINAL)} />
            <dt className="sr-only">Marginal</dt>
            <dd>{result.marginalCount} marginal (&gt;{Math.round(MARGINAL_BAND * 100)}% of installed)</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn("inline-block h-3 w-3 rounded-sm", VERDICT_CLASS.FAILED)} />
            <dt className="sr-only">Failed</dt>
            <dd>{result.failedCount} failed</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn("inline-block h-3 w-3 rounded-sm", VERDICT_CLASS["DATA-QUALITY"])} />
            <dt className="sr-only">Data quality exception</dt>
            <dd>{result.dataQualityCount} data-quality exception{result.dataQualityCount === 1 ? "" : "s"}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3 border-b-2 border-b-night" style={{ width: 12 }} />
            <dt className="sr-only">Winter month marker</dt>
            <dd>underline = Dec/Jan/Feb</dd>
          </div>
        </dl>

        <p className="mt-2 max-w-prose font-sans text-xs text-ink-3">
          Required MVA = load MW ÷ {POWER_FACTOR} power factor, added to that month&apos;s own worst
          hour. Spare MVA is transformer headroom, not drawal capacity — n-1, bay availability and the
          downstream network still bind. First-order screen, not a connection study.
        </p>
      </section>
    </TooltipProvider>
  );
}
