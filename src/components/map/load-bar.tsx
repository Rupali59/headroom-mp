"use client";

/**
 * Load bar — Lane G, DATA.md "THE GAP": the map shows RISK, never the
 * quantity behind it. This is the quantity. A horizontal bar charting a
 * peak reading against installed transformation capacity, with min and
 * average marked on the same track, so "how full is this, and how much
 * room is left" reads in under a second.
 *
 * Every number that reaches the page is a `<Value>` (BUILD.md "Shared
 * contracts": "EVERY number in the app routes through this") — never a
 * bare figure, never a bar rendered without its labels.
 *
 * DATA.md "Caveats" #5 — "any reading above 100% of installed capacity is
 * a DATA-QUALITY EXCEPTION, never a confident bar" (`132KV SALAMATPUR`
 * reads 183%). When the peak exceeds installed capacity this renders a
 * hatched red overflow and a distinct exception line, not a solid fill —
 * "the most extreme thing on screen must not be the least trustworthy."
 */

import { Value } from "@/components/value";
import type { Field } from "@/lib/types";
import { cn } from "cn";

export interface LoadBarGeometry {
  /** Width of the charted domain, in MVA — widened past both figures when
   * the reading exceeds installed capacity, so the overflow has room to
   * render distinctly instead of clipping at 100%. */
  domainMax: number;
  /** Position (0-100) of the peak fill's right edge within the domain. */
  peakPct: number;
  /** Position (0-100) of the installed-capacity reference line within the
   * domain — under 100 only when the reading exceeds installed capacity. */
  installedPct: number;
  minPct: number | null;
  avgPct: number | null;
  /** peak / installed * 100, unclamped — the real ratio, for the exception
   * line's own text. */
  utilisationPct: number;
  exceedsInstalled: boolean;
}

/** Pure geometry, exported for `tests/load-bar.test.ts` — no DOM, no
 * `Field` wrapping, so the arithmetic can be pinned the way `risk.ts` is. */
export function computeLoadBarGeometry(opts: {
  installedMva: number;
  peakMva: number;
  minMva?: number | null;
  avgMva?: number | null;
}): LoadBarGeometry {
  const { installedMva, peakMva, minMva = null, avgMva = null } = opts;
  const utilisationPct = installedMva > 0 ? (peakMva / installedMva) * 100 : 0;
  const exceedsInstalled = utilisationPct > 100;
  // 8% headroom past the larger figure so an overflow bar visibly does not
  // fill the track — a full track would itself read as "confident."
  const domainMax = Math.max(installedMva, peakMva) * (exceedsInstalled ? 1.08 : 1);
  const toPct = (v: number) =>
    domainMax > 0 ? Math.min(100, Math.max(0, (v / domainMax) * 100)) : 0;
  return {
    domainMax,
    peakPct: toPct(peakMva),
    installedPct: toPct(installedMva),
    minPct: minMva !== null ? toPct(minMva) : null,
    avgPct: avgMva !== null ? toPct(avgMva) : null,
    utilisationPct,
    exceedsInstalled,
  };
}

export interface LoadBarProps {
  /** Total transformation capacity at the shown voltage class. */
  installedMva: Field<number> | null;
  /** The reading this bar charts — night or day peak; the caller decides
   * which and names it via `peakLabel`. */
  peakMva: Field<number> | null;
  peakLabel: string;
  minMva?: Field<number> | null;
  avgMva?: Field<number> | null;
  spareMva?: Field<number> | null;
  /** Tailwind fill class for the peak marker — `bg-sun` or `bg-night` per
   * design-system/MASTER.md §2's day/night pair. Never colour alone: the
   * fill is always paired with the `<Value>` labels below it. */
  accentClass?: string;
  className?: string;
}

export function LoadBar({
  installedMva,
  peakMva,
  peakLabel,
  minMva,
  avgMva,
  spareMva,
  accentClass = "bg-night",
  className,
}: LoadBarProps) {
  // No installed capacity at all -> nothing to chart against. Hatched
  // empty state and a named gap, never a guessed domain
  // (design-system/MASTER.md §8's "the gap sentence").
  if (!installedMva || installedMva.conf === "unknown" || installedMva.v <= 0) {
    return (
      <div className={cn("space-y-1", className)}>
        <div
          role="img"
          aria-label={`${peakLabel}: installed capacity not published`}
          className="h-8 w-full rounded-sm border border-dashed border-line-2 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,var(--line-2)_4px,var(--line-2)_5px)]"
        />
        <p className="text-xs text-ink-3">
          Installed capacity not published for this reading. With it, this
          bar renders peak against total capacity.
        </p>
      </div>
    );
  }

  // We know the tank size but not this reading — show the capacity line
  // with no fill rather than fabricate a peak.
  if (!peakMva || peakMva.conf === "unknown") {
    return (
      <div className={cn("space-y-1", className)}>
        <div className="relative h-8 w-full overflow-hidden rounded-sm border border-line bg-panel-2">
          <div className="absolute inset-y-0 right-0 w-px bg-line-2" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-xs text-ink-3">
          <span>{peakLabel}: not published</span>
          <Value field={installedMva} label="Installed capacity" />
        </div>
      </div>
    );
  }

  const geo = computeLoadBarGeometry({
    installedMva: installedMva.v,
    peakMva: peakMva.v,
    minMva: minMva && minMva.conf !== "unknown" ? minMva.v : null,
    avgMva: avgMva && avgMva.conf !== "unknown" ? avgMva.v : null,
  });

  return (
    <div className={cn("space-y-1.5", className)}>
      {geo.exceedsInstalled && (
        <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-bad">
          <span aria-hidden="true">⚠</span>
          Data-quality exception — reads {geo.utilisationPct.toFixed(0)}% of
          installed capacity, source figure not confidently rendered
        </p>
      )}

      <div
        role="img"
        aria-label={`${peakLabel} ${peakMva.v} MVA against ${installedMva.v} MVA installed — ${geo.utilisationPct.toFixed(0)} percent${
          geo.exceedsInstalled
            ? ", exceeds installed capacity, data-quality exception"
            : ""
        }`}
        className="relative h-8 w-full overflow-hidden rounded-sm border border-line bg-panel-2"
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-[width]",
            geo.exceedsInstalled
              ? "bg-[repeating-linear-gradient(135deg,var(--bad),var(--bad)_4px,transparent_4px,transparent_8px)]"
              : accentClass
          )}
          style={{ width: `${geo.peakPct}%` }}
        />
        {/* Installed-capacity reference line — where 100% sits inside the
            (possibly widened) domain. */}
        <div
          className="absolute inset-y-0 w-px bg-ink"
          style={{ left: `${geo.installedPct}%` }}
          aria-hidden="true"
        />
        {geo.avgPct !== null && (
          <div
            className="absolute top-0 h-2.5 w-px bg-ink-2"
            style={{ left: `${geo.avgPct}%` }}
            aria-hidden="true"
          />
        )}
        {geo.minPct !== null && (
          <div
            className="absolute bottom-0 h-2.5 w-px bg-ink-2"
            style={{ left: `${geo.minPct}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-mono text-xs text-ink-2">
        <span className="flex items-baseline gap-1">
          {peakLabel}
          <Value field={peakMva} label={peakLabel} />
        </span>
        <span className="flex items-baseline gap-1 text-ink-3">
          of
          <Value field={installedMva} label="Installed capacity" />
        </span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-ink-3">
        {spareMva && spareMva.conf !== "unknown" && (
          <span className="flex items-baseline gap-1">
            spare
            <Value field={spareMva} label="Spare capacity (transformer headroom)" />
          </span>
        )}
        {avgMva && avgMva.conf !== "unknown" && (
          <span className="flex items-baseline gap-1">
            avg
            <Value field={avgMva} label="Average MVA" />
          </span>
        )}
        {minMva && minMva.conf !== "unknown" && (
          <span className="flex items-baseline gap-1">
            min
            <Value field={minMva} label="Minimum MVA (floor, not a current value)" />
          </span>
        )}
      </div>
    </div>
  );
}
