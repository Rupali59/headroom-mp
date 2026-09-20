"use client";

/**
 * Load panel — Lane G, DATA.md "THE GAP YOU CLOSE": the map shows RISK, a
 * verdict, never the quantity behind it. This is the detail view for a
 * selected node — capacity, night peak, the day/night pair, 55 months of
 * history, and the three caveats DATA.md requires visible, not footnoted.
 * Mounted by `grid-map.tsx` when a node is selected.
 *
 * DATA GAP, flagged rather than invented (per the Lane G brief: "if a
 * field you need is absent, say so rather than inventing it").
 * `src/lib/types.ts`'s `Substation` — the shape the brief names as this
 * lane's contract — carries only
 * `{ id, name, voltageKv, lat, lon, capacity, riskFactors }`. None of
 * DATA.md's measured load fields (installed_mva, peak_mva, peak_is_night,
 * min_mva, avg_mva, spare_at_peak_mva, the 55-month series) are on it.
 * `src/data/loader.ts`'s `SubstationLoad` (Lane E, not owned by this lane)
 * carries most of them, but even that shape has:
 *   - no day-time figure at all — only `nightPeakMva` is ever selected;
 *     there is no `dayPeakMva` counterpart for task 2's day/night pair;
 *   - no `avgMva` — `avg_mva` exists per-row in the source but the
 *     loader's aggregation does not surface it;
 *   - no per-month series — only `observationCount`, a count of months,
 *     not the 55 months of values task 3 needs.
 * `SubstationLoadDetail` below is this lane's own contract for what a
 * load panel needs to render honestly: a superset of `SubstationLoad`
 * with those gaps made explicit as optional/nullable fields. Until
 * Lane 0/F extend `Substation` (or wire an equivalent bridge) and Lane E's
 * loader adds day figures, `avgMva` and the raw series, this panel
 * receives `null`/`undefined` for those fields and renders the honest gap
 * state — never a guess. See each sub-component's empty-state branch and
 * the lane report for the integration ask this implies.
 */

import { Sparkline, type SparklinePoint } from "./sparkline";
import { LoadBar } from "./load-bar";
import type { Field } from "@/lib/types";
import { cn } from "cn";

export interface SubstationLoadDetail {
  id: string;
  name: string;
  voltageKv: number;
  /** Which voltage-class row this is, e.g. "400KV" — DATA.md caveat 2:
   * "Rows are per voltage class ... say which class is shown." Null means
   * the upstream data does not state one, which itself must be said, not
   * silently dropped. */
  voltageClass: string | null;
  installedMva: Field<number> | null;
  nightPeakMva: Field<number> | null;
  spareAtNightMva: Field<number> | null;
  minMva: Field<number> | null;
  /** GAP — see file header: not produced by `src/data/loader.ts` today. */
  avgMva?: Field<number> | null;
  /** GAP — see file header: no day-time equivalent of `nightPeakMva`
   * exists in the loader's output today. */
  dayPeakMva?: Field<number> | null;
  spareAtDayMva?: Field<number> | null;
  /** GAP — see file header: the loader aggregates to one record per
   * substation and does not return the 55-month series. */
  monthlySeries?: SparklinePoint[] | null;
  observationCount: number;
  sourceUrl: string | null;
  asOf: string | null;
}

export interface LoadPanelProps {
  detail: SubstationLoadDetail | null;
  onClose?: () => void;
  className?: string;
}

export function LoadPanel({ detail, onClose, className }: LoadPanelProps) {
  if (!detail) return null;

  const hasAnyLoadData =
    (detail.installedMva && detail.installedMva.conf !== "unknown") ||
    (detail.nightPeakMva && detail.nightPeakMva.conf !== "unknown");

  return (
    <section
      aria-labelledby="load-panel-heading"
      className={cn(
        "space-y-4 rounded-lg border border-line bg-panel px-4 py-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="load-panel-heading" className="font-serif text-xl text-ink">
            {detail.name}
          </h3>
          <p className="font-mono text-xs text-ink-3">
            {detail.voltageKv} kV
            {detail.voltageClass
              ? ` · ${detail.voltageClass} row shown`
              : " · voltage class not stated in the source"}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-6 min-w-6 items-center justify-center rounded-sm text-lg leading-none text-ink-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Close load detail for ${detail.name}`}
          >
            ×
          </button>
        )}
      </div>

      {!hasAnyLoadData ? (
        <p className="text-sm text-ink-3">
          Load figures not published for {detail.name}. MPPTCL holds this
          figure. With it, {detail.name} joins the assessable set on this
          panel.
        </p>
      ) : (
        <>
          <div>
            <p className="mb-1 font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
              Peak against installed capacity
            </p>
            <LoadBar
              installedMva={detail.installedMva}
              peakMva={detail.nightPeakMva}
              peakLabel="Night peak"
              minMva={detail.minMva}
              avgMva={detail.avgMva ?? null}
              spareMva={detail.spareAtNightMva}
              accentClass="bg-night"
            />
          </div>

          <div>
            <p className="mb-1 font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
              Day vs. night
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs text-sun">
                  <span
                    aria-hidden="true"
                    className="inline-block size-2 rounded-full bg-sun"
                  />
                  Day (solar hours)
                </p>
                {detail.dayPeakMva && detail.dayPeakMva.conf !== "unknown" ? (
                  <LoadBar
                    installedMva={detail.installedMva}
                    peakMva={detail.dayPeakMva}
                    peakLabel="Day peak"
                    spareMva={detail.spareAtDayMva ?? null}
                    accentClass="bg-sun"
                  />
                ) : (
                  <p className="text-xs text-ink-3">
                    Day-time peak not published for {detail.name}. The
                    source carries a peak hour and a night flag per row; a
                    day-side aggregate would unlock this pane.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs text-night">
                  <span
                    aria-hidden="true"
                    className="inline-block size-2 rounded-full bg-night"
                  />
                  Night (non-solar hours)
                </p>
                <LoadBar
                  installedMva={detail.installedMva}
                  peakMva={detail.nightPeakMva}
                  peakLabel="Night peak"
                  spareMva={detail.spareAtNightMva}
                  accentClass="bg-night"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1 font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
              55-month night utilisation
            </p>
            <Sparkline points={detail.monthlySeries ?? null} nodeName={detail.name} />
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line pt-3 font-mono text-xs text-ink-3">
            <dt>Months observed</dt>
            <dd className="tabular-nums text-ink-2">{detail.observationCount || "—"}</dd>
            <dt>As of</dt>
            <dd className="text-ink-2">{detail.asOf ?? "—"}</dd>
            <dt>Source</dt>
            <dd className="break-all text-ink-2">
              {detail.sourceUrl ? (
                <a
                  href={detail.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted underline-offset-4 hover:text-ink"
                >
                  {detail.sourceUrl}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </dl>
        </>
      )}

      <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-ink-3">
        Spare MVA is transformer headroom, not drawal capacity for a new
        consumer — n-1, bay availability and the downstream network all
        still bind. Rows are per voltage class; this panel shows{" "}
        {detail.voltageClass ?? "an unstated"} class only. Any reading above
        100% of installed capacity is a data-quality exception in the
        source sheet, flagged above where it occurs, never rendered as a
        confident figure.
      </p>
    </section>
  );
}
