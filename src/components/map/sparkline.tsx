"use client";

/**
 * Sparkline — Lane G, DATA.md "What we now hold": 55 months of night
 * utilisation per substation, and DATA.md "Seasonality, computed not
 * asserted": winter nights run mean utilisation 50.8% against monsoon's
 * 43.7% (n=115 winter, n=1,760 monsoon — thin, and DATA.md says so:
 * "Do not put +16% on a slide without saying n" — that aggregate figure is
 * deliberately NOT reprinted here; this component marks winter months on
 * ONE node's own history instead, which DATA.md calls "far more
 * persuasive" than the aggregate).
 *
 * Inline SVG, axis ends labelled only — no gridlines, no legend, no chart
 * chrome (design-system/MASTER.md's card/chrome rules). A month with no
 * recorded night peak renders as a gap in the line, never a zero
 * (DATA.md caveat 3).
 */

import { cn } from "cn";

export interface SparklinePoint {
  /** Raw month label from the source sheet, e.g. "July'2026", or a
   * filename-stem label for the minority that don't parse cleanly
   * (`src/data/loader.ts`'s `parseMonthLabel` comment). Caller supplies
   * points already in chronological order. */
  month: string;
  /** Night utilisation percent for this month, or null when no
   * night-time (19:00-06:00) peak was recorded that month — DATA.md
   * caveat 3: "min_mva is the floor," and the same absence applies here.
   * Renders as a gap in the line, never as 0. */
  nightUtilisationPct: number | null;
}

export interface SparklineGeom {
  x: number;
  y: number | null;
  value: number | null;
  isWinter: boolean;
  /** DATA.md caveat 5 — a monthly reading above 100% of installed
   * capacity is a data-quality exception, marked distinctly, never as a
   * confident data point. */
  exceeds: boolean;
}

/**
 * Best-effort winter detection over the raw month label, not a parsed
 * date — `src/data/loader.ts`'s own `parseMonthLabel` only handles the
 * clean "MonthName'Year" form (~91% of labels); the remaining labels are
 * filename stems that still embed the month name (e.g.
 * "MAX-LOADI-JANUARY-21092023"). Matching the substring works across both
 * forms without needing a full parse. False positives are possible in
 * principle (a stem containing "jan"/"dec"/"feb" for an unrelated reason)
 * and none have been observed in the ingested labels.
 */
export function isWinterMonth(monthLabel: string): boolean {
  return /jan|feb|dec/i.test(monthLabel);
}

const WIDTH = 280;
const HEIGHT = 44;

/** Pure geometry, exported for `tests/sparkline.test.ts`. Equal spacing by
 * index, not by calendar date — DATA.md records 55 of 60 months ingested,
 * so gaps in the underlying sheet are expected and equal spacing avoids
 * implying a precision (day counts between months) the source doesn't
 * carry. */
export function computeSparklineGeometry(
  points: readonly SparklinePoint[],
  width: number = WIDTH,
  height: number = HEIGHT
): SparklineGeom[] {
  const n = points.length;
  const domainMax = Math.max(
    100,
    ...points.map((p) => p.nightUtilisationPct ?? 0)
  );
  return points.map((p, i) => {
    const x = n <= 1 ? width / 2 : (i / (n - 1)) * width;
    const v = p.nightUtilisationPct;
    const y =
      v === null ? null : height - (Math.min(v, domainMax) / domainMax) * height;
    return {
      x,
      y,
      value: v,
      isWinter: isWinterMonth(p.month),
      exceeds: v !== null && v > 100,
    };
  });
}

/** Builds an SVG path `d` with a break (a fresh `M`) at every gap, so a
 * missing month never draws a line through a fabricated zero. */
export function buildSparklinePath(geoms: readonly SparklineGeom[]): string {
  let d = "";
  let drawing = false;
  for (const g of geoms) {
    if (g.y === null) {
      drawing = false;
      continue;
    }
    d += drawing ? ` L ${g.x.toFixed(1)},${g.y.toFixed(1)}` : ` M ${g.x.toFixed(1)},${g.y.toFixed(1)}`;
    drawing = true;
  }
  return d.trim();
}

export interface SparklineProps {
  /** Chronologically ordered monthly points, or null/undefined when the
   * caller has no per-month series to supply — see the empty-state
   * branch below and `load-panel.tsx`'s header comment on why that is
   * the honest default today. */
  points: SparklinePoint[] | null | undefined;
  nodeName: string;
  className?: string;
}

export function Sparkline({ points, nodeName, className }: SparklineProps) {
  if (!points || points.length === 0) {
    return (
      <div className={cn("space-y-1", className)}>
        <div
          role="img"
          aria-label={`Monthly night utilisation history not available for ${nodeName}`}
          className="h-11 w-full rounded-sm border border-dashed border-line-2 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,var(--line-2)_4px,var(--line-2)_5px)]"
        />
        <p className="text-xs text-ink-3">
          Monthly history not available for {nodeName}. The loader holds
          one aggregated night peak per substation today, not the 55-month
          series behind it — with it, this renders that history.
        </p>
      </div>
    );
  }

  const geoms = computeSparklineGeometry(points, WIDTH, HEIGHT);
  const path = buildSparklinePath(geoms);
  const first = points[0];
  const last = points[points.length - 1];
  const winterCount = geoms.filter((g) => g.isWinter && g.value !== null).length;

  return (
    <div className={cn("space-y-1", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Night utilisation for ${nodeName}, ${first.month} to ${last.month}, ${points.length} months, winter months marked`}
        className="h-11 w-full"
        preserveAspectRatio="none"
      >
        {path && <path d={path} fill="none" className="stroke-ink-2" strokeWidth={1.25} />}
        {geoms.map((g, i) =>
          g.y === null ? null : (
            <circle
              key={i}
              cx={g.x}
              cy={g.y}
              r={g.exceeds ? 2.6 : g.isWinter ? 2.2 : 1.1}
              className={
                g.exceeds ? "fill-bad" : g.isWinter ? "fill-night" : "fill-ink-3"
              }
            >
              <title>
                {points[i].month}: {g.value}% night utilisation
                {g.isWinter ? " · winter" : ""}
                {g.exceeds ? " · exceeds installed capacity, data-quality exception" : ""}
              </title>
            </circle>
          )
        )}
      </svg>
      <div className="flex items-baseline justify-between font-mono text-[10.5px] text-ink-3">
        <span>{first.month}</span>
        <span>{last.month}</span>
      </div>
      {winterCount > 0 && (
        <p className="text-[11px] text-ink-3">
          {winterCount} winter month{winterCount === 1 ? "" : "s"} marked
          (larger, cool-toned points) — winter nights measure hotter than
          the rest of the year in this node&apos;s own history.
        </p>
      )}
    </div>
  );
}
