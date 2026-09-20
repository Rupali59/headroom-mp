"use client";

/**
 * What-if panel — Lane K. Place a hypothetical load (MW) at a substation,
 * for the month currently scrubbed on the timeline, and see the verdict.
 * DESIGN.md/MASTER.md: "the power factor must be visible on the result,
 * not buried in code" — every number here shows the arithmetic that
 * produced it, not just the answer.
 *
 * Rules and typography (MASTER.md §4 "no cards"). Figures in IBM Plex Mono
 * with tabular-nums so they don't jitter while the timeline scrubs.
 */

import { useId } from "react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MARGINAL_BAND, POWER_FACTOR, simulateAt, type Verdict } from "@/lib/simulate";
import type { Substation } from "@/lib/types";

export interface WhatIfProps {
  subs: Substation[];
  selectedSubId: string;
  onSelectedSubIdChange: (id: string) => void;
  /** The month to evaluate against — normally the timeline's current
   * scrub position, passed down so what-if and the timeline always agree
   * on "when". */
  month: string;
  loadMw: number;
  onLoadMwChange: (mw: number) => void;
  className?: string;
}

const VERDICT_WORD: Record<Verdict, string> = {
  FITS: "Fits",
  MARGINAL: "Marginal",
  FAILED: "Failed",
  "DATA-QUALITY": "Data-quality exception",
  "NO-DATA": "No reading this month",
};

const VERDICT_CLASS: Record<Verdict, string> = {
  FITS: "text-good",
  MARGINAL: "text-mid",
  FAILED: "text-bad",
  "DATA-QUALITY": "text-ink-2",
  "NO-DATA": "text-ink-3",
};

export function WhatIf({
  subs,
  selectedSubId,
  onSelectedSubIdChange,
  month,
  loadMw,
  onLoadMwChange,
  className,
}: WhatIfProps) {
  const loadInputId = useId();
  const sub = subs.find((s) => s.id === selectedSubId) ?? null;
  const result = sub && month ? simulateAt(sub, month, loadMw) : null;

  return (
    <section className={cn("space-y-4", className)} aria-label="What-if: place a hypothetical load">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${loadInputId}-sub`}>Substation</Label>
          <Select value={selectedSubId} onValueChange={onSelectedSubIdChange}>
            <SelectTrigger id={`${loadInputId}-sub`} className="w-full">
              <SelectValue placeholder="Choose a substation" />
            </SelectTrigger>
            <SelectContent>
              {subs.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.voltageKv} kV)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={loadInputId}>Hypothetical load (MW)</Label>
          <Input
            id={loadInputId}
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={loadMw}
            onChange={(e) => {
              const v = Number(e.target.value);
              onLoadMwChange(Number.isFinite(v) && v >= 0 ? v : 0);
            }}
            className="font-mono tabular-nums"
          />
        </div>
      </div>

      {!sub && <p className="font-sans text-sm text-ink-3">No substation available.</p>}

      {sub && result && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-3 font-mono text-sm tabular-nums text-ink sm:grid-cols-4">
          <div>
            <dt className="font-sans text-xs uppercase tracking-wide text-ink-3">Month</dt>
            <dd>{month || "—"}</dd>
          </div>
          <div>
            <dt className="font-sans text-xs uppercase tracking-wide text-ink-3">
              Required MVA <span className="normal-case text-ink-3">(÷{POWER_FACTOR} power factor)</span>
            </dt>
            <dd>{result.requiredMva} MVA</dd>
          </div>
          <div>
            <dt className="font-sans text-xs uppercase tracking-wide text-ink-3">Resulting peak</dt>
            <dd>{result.newPeakMva !== null ? `${result.newPeakMva} MVA` : "—"}</dd>
          </div>
          <div>
            <dt className="font-sans text-xs uppercase tracking-wide text-ink-3">Headroom after</dt>
            <dd>{result.headroomAfterMva !== null ? `${result.headroomAfterMva} MVA` : "—"}</dd>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <dt className="font-sans text-xs uppercase tracking-wide text-ink-3">Verdict</dt>
            <dd className={cn("text-base font-medium", VERDICT_CLASS[result.verdict])}>
              {VERDICT_WORD[result.verdict]}
              {result.verdict === "MARGINAL" && ` — above ${Math.round(MARGINAL_BAND * 100)}% of installed capacity`}
              {result.verdict === "DATA-QUALITY" &&
                ` — this month's own reading (${result.quality}) is flagged in the source; no confident verdict is shown`}
              {result.verdict === "NO-DATA" && " — no reading for this substation this month"}
            </dd>
          </div>
        </dl>
      )}

      <p className="max-w-prose font-sans text-xs text-ink-3">
        Spare MVA is transformer headroom, not drawal capacity for a new consumer — n-1, bay
        availability and the downstream network still bind. This is a first-order screen, not a
        connection study. Verdict is computed on{" "}
        {sub ? `${sub.name}'s primary voltage class` : "the selected substation's primary voltage class"} —
        rows are per voltage class in the source.
      </p>
    </section>
  );
}
