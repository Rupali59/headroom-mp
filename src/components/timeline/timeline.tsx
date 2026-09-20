"use client";

/**
 * Timeline scrubber + the single mountable entry point for this lane —
 * `TimelineSimulator` at the bottom of this file, per the brief: "Export
 * one mountable component for Lane F to wire. DO NOT edit page.tsx."
 *
 * THE FEATURE (brief): "a timeline across the 55 ingested months. At any
 * point on it, every substation shows its load-balancing state." That
 * state is computed with `simulateAt(sub, month, loadMw)` — the SAME
 * verdict arithmetic the what-if panel uses, not a second set of
 * thresholds invented for "today's view". With `loadMw` at its default of
 * 0, this literally IS "today's state, no hypothetical load" (required
 * MVA collapses to 0, new peak collapses to the station's own recorded
 * peak_mva) — see `simulate.ts`'s doc comment on `simulateAt` for why that
 * reuse was chosen over a second bespoke threshold set. Once a load is
 * placed in the what-if panel below, the SAME timeline shows how the
 * network would look with that load already sitting on its chosen node's
 * peak, month by month — the two components share one arithmetic seam,
 * not two.
 *
 * Keyboard: the month scrub is a Radix `Slider` (design-system/MASTER.md
 * §4: "Radix ships keyboard navigation... free") — Left/Right/Up/Down
 * step one month, Home/End jump to the first/last ingested month,
 * Page Up/Down move by a larger step. Not mouse-only.
 */

import { useId, useMemo, useState } from "react";
import { cn } from "cn";
import { Slider } from "@/components/ui/slider";
import { allMonths, isWinterMonth, simulateAt, type Verdict } from "@/lib/simulate";
import type { Substation } from "@/lib/types";
import { Backtest } from "./backtest";
import { WhatIf } from "./what-if";

export interface TimelineProps {
  subs: Substation[];
  /** Controlled month — one of `allMonths(subs)`. */
  month: string;
  onMonthChange: (month: string) => void;
  /** Hypothetical load applied at every node for the purpose of the
   * verdict counts below. 0 (the default) means "no hypothetical load —
   * show each node's own baseline state". */
  loadMw?: number;
  className?: string;
}

const VERDICT_ORDER: Verdict[] = ["FITS", "MARGINAL", "FAILED", "DATA-QUALITY", "NO-DATA"];

const VERDICT_LABEL: Record<Verdict, string> = {
  FITS: "fits",
  MARGINAL: "marginal",
  FAILED: "failed",
  "DATA-QUALITY": "flagged",
  "NO-DATA": "no data",
};

const VERDICT_DOT_CLASS: Record<Verdict, string> = {
  FITS: "bg-good",
  MARGINAL: "bg-mid",
  FAILED: "bg-bad",
  "DATA-QUALITY": "bg-ink-2",
  "NO-DATA": "bg-line-2",
};

export function Timeline({ subs, month, onMonthChange, loadMw = 0, className }: TimelineProps) {
  const sliderId = useId();
  const months = useMemo(() => allMonths(subs), [subs]);
  const index = Math.max(0, months.indexOf(month));
  const winter = month ? isWinterMonth(month) : false;

  const counts = useMemo(() => {
    const tally: Record<Verdict, number> = {
      FITS: 0,
      MARGINAL: 0,
      FAILED: 0,
      "DATA-QUALITY": 0,
      "NO-DATA": 0,
    };
    if (!month) return tally;
    for (const sub of subs) {
      const v = simulateAt(sub, month, loadMw).verdict;
      tally[v] += 1;
    }
    return tally;
  }, [subs, month, loadMw]);

  if (months.length === 0) {
    return (
      <div className={cn("font-sans text-sm text-ink-3", className)}>
        No ingested months available to scrub — no substation in this set carries a series yet.
      </div>
    );
  }

  return (
    <section className={cn("space-y-3", className)} aria-label="Timeline">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span id={`${sliderId}-label`} className="font-sans text-xs uppercase tracking-wide text-ink-3">
            Month
          </span>
          <span className="font-mono text-lg tabular-nums text-ink">{month || "—"}</span>
          {winter && (
            <span className="rounded-sm border border-night/40 bg-night/15 px-1.5 py-0.5 font-sans text-[10px] uppercase tracking-wide text-ink">
              winter night — mean utilisation runs +16% over monsoon (DATA.md, n=115)
            </span>
          )}
        </div>
        <span className="font-mono text-xs tabular-nums text-ink-3">
          {index + 1} of {months.length} months
        </span>
      </div>

      <Slider
        aria-labelledby={`${sliderId}-label`}
        aria-valuetext={month}
        min={0}
        max={months.length - 1}
        step={1}
        value={[index]}
        onValueChange={([i]) => {
          if (typeof i === "number" && months[i]) onMonthChange(months[i]);
        }}
      />

      <dl
        className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs tabular-nums text-ink-2"
        aria-label={`Substation states at ${month}${loadMw > 0 ? `, with ${loadMw} MW placed` : ""}`}
      >
        {VERDICT_ORDER.map((v) => (
          <div key={v} className="flex items-center gap-1.5">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", VERDICT_DOT_CLASS[v])} />
            <dt className="sr-only">{VERDICT_LABEL[v]}</dt>
            <dd>
              {counts[v]} {VERDICT_LABEL[v]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * TimelineSimulator — the one component this lane exports for Lane F to
 * mount. Owns its own state (scrub position, selected substation,
 * hypothetical load) so `page.tsx` only needs `<TimelineSimulator subs={...} />`.
 * See the Lane K report for the exact import path and the one prop it needs.
 */
export interface TimelineSimulatorProps {
  subs: Substation[];
  /** Starting hypothetical load, MW. Defaults to 100 — DATA.md's own
   * worked scenario ("100 MW at Birsinghpur / Indore") — so the panel
   * opens on a number that already means something rather than 0. */
  initialLoadMw?: number;
  className?: string;
}

export function TimelineSimulator({ subs, initialLoadMw = 100, className }: TimelineSimulatorProps) {
  const months = useMemo(() => allMonths(subs), [subs]);
  const [month, setMonth] = useState(() => months[months.length - 1] ?? "");
  const [selectedSubId, setSelectedSubId] = useState(() => subs[0]?.id ?? "");
  const [loadMw, setLoadMw] = useState(initialLoadMw);

  const selectedSub = subs.find((s) => s.id === selectedSubId) ?? subs[0] ?? null;

  if (subs.length === 0) {
    return (
      <div className={cn("font-sans text-sm text-ink-3", className)}>
        No substation data loaded yet — the timeline and what-if simulator need at least one
        substation with an ingested monthly series.
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <Timeline subs={subs} month={month} onMonthChange={setMonth} loadMw={loadMw} />
      <WhatIf
        subs={subs}
        selectedSubId={selectedSub?.id ?? ""}
        onSelectedSubIdChange={setSelectedSubId}
        month={month}
        loadMw={loadMw}
        onLoadMwChange={setLoadMw}
      />
      <Backtest sub={selectedSub} loadMw={loadMw} highlightMonth={month} />
    </div>
  );
}
