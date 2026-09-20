"use client";

/**
 * Filters — Lane J, "Analysis controls". Task 3: voltage class, minimum
 * spare MVA at night, maximum night utilisation, data-quality. Wired
 * against `src/lib/analysis.ts`'s `filterSubstations()` (this file's only
 * logic dependency — everything else here is presentation).
 *
 * THE REGRESSION THIS FIXES: the rebuild had ZERO controls in its map
 * components (see `src/lib/analysis.ts`'s file header). The legacy app's
 * voltage chips and minimum-headroom slider are the direct ancestors of
 * this component.
 *
 * DATA-QUALITY CONTROL, resolved mid-session: task brief item 3 said "if
 * that field is not in types.ts yet, build the control and leave it
 * disabled ... do not invent the field." It was not in `types.ts` when
 * this lane started; `DataQuality` + `SubstationLoad.quality` landed
 * while this file was being written (see `src/lib/analysis.ts`'s "LIVE
 * UPDATE" note). So the control below is fully wired, not disabled —
 * disabling a control against data that now genuinely exists would be
 * the more dishonest state, not the safer one.
 *
 * shadcn primitives per design-system/MASTER.md §4 ("Minimum-headroom
 * filter" -> `slider`) — no raw `button`/`input`/`select`. Live result
 * count per task 3: "Show the live result count: 'showing 84 of 432'."
 *
 * ACCESSIBILITY (MASTER.md §6): every control has a visible `<Label>`,
 * never a placeholder standing in for one. The voltage chips are real
 * `<button>`s with `aria-pressed`, reachable by Tab, not `<div onClick>`.
 */

import { useMemo } from "react";
import { cn } from "cn";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  filterSubstations,
  type AnalysisSubstation,
  type SubstationFilters,
} from "@/lib/analysis";

/** Every voltage class actually present across the FULL unfiltered set
 * passed in — computed once, so a chip never disappears just because the
 * current filter selection has temporarily emptied the visible list. */
function voltageClassesIn(subs: readonly AnalysisSubstation[]): string[] {
  const set = new Set(subs.map((s) => s.voltageClass));
  // Numeric-descending by the leading kV number when parseable (matches
  // the legacy chip order 765/400/220), then alphabetical fallback.
  return Array.from(set).sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return nb - na;
    return a.localeCompare(b);
  });
}

const SPARE_SLIDER_MAX = 300; // MVA — matches the legacy minH slider's 0-300 range.
const SPARE_SLIDER_STEP = 10;
const UTIL_SLIDER_MAX = 150; // % — wide enough to show over-100% exceptions moving in range.
const UTIL_SLIDER_STEP = 5;

export interface FiltersState {
  /** `null` = every voltage class (the pristine default — matches the
   * legacy app's all-chips-on start state). A `Set` is an explicit
   * selection; an EMPTY `Set` would mean "show none", which the UI below
   * never actually produces — see `toggleVoltage()`'s guard. */
  voltageClasses: Set<string> | null;
  minSpareMva: number; // 0 = "show all", matches legacy `minH` semantics.
  maxNightUtilisation: number; // UTIL_SLIDER_MAX = "show all".
  quality: "all" | "exclude-exceptions";
}

/** `FiltersState` with every constraint at its "show all" default. */
export const DEFAULT_FILTERS_STATE: FiltersState = {
  voltageClasses: null,
  minSpareMva: 0,
  maxNightUtilisation: UTIL_SLIDER_MAX,
  quality: "all",
};

export interface FiltersProps {
  /** The full, unfiltered candidate set — used both to compute the "of
   * N" count and to derive which voltage-class chips exist. */
  substations: readonly AnalysisSubstation[];
  /** Current filter state, lifted so `scenario.tsx`'s `AnalysisPanel` can
   * apply the same filters to the ranked result, not just the raw list. */
  value: FiltersState;
  onChange: (next: FiltersState) => void;
  className?: string;
}

/** Builds the `SubstationFilters` `filterSubstations()` expects from this
 * component's simpler UI state. Exported so `scenario.tsx` can apply the
 * identical filter to ranked candidates without duplicating the mapping. */
export function toSubstationFilters(state: FiltersState): SubstationFilters {
  return {
    voltageClasses: state.voltageClasses,
    minSpareMva: state.minSpareMva > 0 ? state.minSpareMva : null,
    maxNightUtilisation:
      state.maxNightUtilisation < UTIL_SLIDER_MAX
        ? state.maxNightUtilisation
        : null,
    quality: state.quality,
  };
}

export function Filters({
  substations,
  value,
  onChange,
  className,
}: FiltersProps) {
  const voltageOptions = useMemo(
    () => voltageClassesIn(substations),
    [substations]
  );

  const filtered = useMemo(
    () => filterSubstations(substations, toSubstationFilters(value)),
    [substations, value]
  );

  function toggleVoltage(v: string) {
    // `null` means "every class" — expand to an explicit set first so a
    // single click has something concrete to remove from.
    const current = value.voltageClasses ?? new Set(voltageOptions);
    const next = new Set(current);
    if (next.has(v)) {
      // Mirrors the legacy app's guard (`if(set.size===1)return`) — never
      // let the operator filter every class away by mis-click; deselecting
      // the last chip is a no-op, not an empty result.
      if (next.size === 1) return;
      next.delete(v);
    } else {
      next.add(v);
    }
    // Normalise "every option selected again" back to `null`, so the
    // pristine and the manually-reselected-everything states read as the
    // same thing rather than diverging quietly.
    const isEverything =
      next.size === voltageOptions.length &&
      voltageOptions.every((o) => next.has(o));
    onChange({
      ...value,
      voltageClasses: isEverything ? null : next,
    });
  }

  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-lg text-ink">Filters</h3>
        <p
          className="font-mono text-xs tabular-nums text-ink-3"
          aria-live="polite"
        >
          Showing {filtered.length} of {substations.length}
        </p>
      </div>

      <div className="space-y-2">
        <Label id="filter-voltage-label">Voltage class</Label>
        <div
          role="group"
          aria-labelledby="filter-voltage-label"
          className="flex flex-wrap gap-2"
        >
          {voltageOptions.map((v) => {
            const on = value.voltageClasses
              ? value.voltageClasses.has(v)
              : true;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => toggleVoltage(v)}
                className={cn(
                  "min-h-8 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-ink-2 bg-panel-2 text-ink"
                    : "border-line bg-panel text-ink-2 hover:text-ink"
                )}
              >
                {v}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="filter-min-spare">Minimum spare MVA at night</Label>
          <span className="font-mono text-xs tabular-nums text-ink-3">
            {value.minSpareMva === 0
              ? "show all"
              : `>= ${value.minSpareMva} MVA`}
          </span>
        </div>
        <Slider
          id="filter-min-spare"
          aria-label="Minimum spare MVA at night"
          min={0}
          max={SPARE_SLIDER_MAX}
          step={SPARE_SLIDER_STEP}
          value={[value.minSpareMva]}
          onValueChange={([v]) => onChange({ ...value, minSpareMva: v })}
        />
        <div className="flex justify-between font-mono text-[10px] text-ink-3">
          <span>0 MVA</span>
          <span>{SPARE_SLIDER_MAX} MVA</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="filter-max-util">Maximum night utilisation</Label>
          <span className="font-mono text-xs tabular-nums text-ink-3">
            {value.maxNightUtilisation >= UTIL_SLIDER_MAX
              ? "show all"
              : `<= ${value.maxNightUtilisation}%`}
          </span>
        </div>
        <Slider
          id="filter-max-util"
          aria-label="Maximum night utilisation, percent"
          min={0}
          max={UTIL_SLIDER_MAX}
          step={UTIL_SLIDER_STEP}
          value={[value.maxNightUtilisation]}
          onValueChange={([v]) =>
            onChange({ ...value, maxNightUtilisation: v })
          }
        />
        <div className="flex justify-between font-mono text-[10px] text-ink-3">
          <span>0%</span>
          <span>{UTIL_SLIDER_MAX}%</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-quality">Data quality</Label>
        <Select
          value={value.quality}
          onValueChange={(v) =>
            onChange({
              ...value,
              quality: v as FiltersState["quality"],
            })
          }
        >
          <SelectTrigger id="filter-quality" aria-label="Data quality">
            <SelectValue>
              {value.quality === "all"
                ? "All readings"
                : "Exclude data-quality exceptions"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All readings</SelectItem>
            <SelectItem value="exclude-exceptions">
              Exclude data-quality exceptions
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-ink-3">
          DATA.md caveat 5: some readings exceed 100% of installed capacity
          (e.g. 132KV Salamatpur, 183%) — likely a sheet error, not real
          operation. Excluding them removes the row rather than showing a
          confident but untrustworthy number.
        </p>
      </div>
    </div>
  );
}
