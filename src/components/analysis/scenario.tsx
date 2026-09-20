"use client";

/**
 * Scenario — Lane J, "Analysis controls". Task 4: "the question, in plain
 * language: load in MW, near which city, within what radius, needs power
 * at night yes/no." Also the home of task 7's single mountable export,
 * `AnalysisPanel`, which composes `Filters` (filters.tsx) + this form +
 * `Ranking` (ranking.tsx) — the whole regression fix in one component.
 *
 * THE REGRESSION THIS FIXES: "The scenario query — 'where can 100 MW
 * connect near Bhopal, 24x7?' — was the legacy app's entire reason to
 * exist and it is gone." `mp-headroom-app.html`'s `#mw`/`#city`/`#rad`/
 * `#rtc`/`#run` inputs are this form's direct ancestors.
 *
 * ============================================================================
 * MOUNT INSTRUCTIONS FOR LANE F — page.tsx is frozen to every lane but F:
 * ============================================================================
 *
 *   import { AnalysisPanel } from "@/components/analysis/scenario";
 *   <AnalysisPanel substations={ANALYSIS_SUBSTATIONS} />
 *
 * `substations: AnalysisSubstation[]` — verified 2026-09-20 against Lane
 * F's OWN just-landed `src/app/data.ts`, which is the real, already-wired
 * build-time seam (not the speculative `loadSubstations()` path an
 * earlier draft of this comment named — Mongo is unreachable from this
 * machine per that file's own header, so that path cannot run here).
 * `data.ts` already exports `SUBSTATIONS: Substation[]` (has `lat`/`lon`
 * and `quality`) and `LOAD_DETAILS: SubstationLoadDetail[]` (has
 * `voltageClass`, `installedMva`, `nightPeakMva`, `spareAtNightMva`,
 * `nightUtilisation`, `minMva`, `observationCount`) for the same ~17
 * matched nodes, keyed by the same `id`. Zip them (this lane cannot do it
 * — `data.ts` is Lane F's exclusive file):
 *
 *   import type { AnalysisSubstation } from "@/lib/analysis";
 *   import { SUBSTATIONS, LOAD_DETAILS } from "./data";
 *
 *   const loadById = new Map(LOAD_DETAILS.map((d) => [d.id, d]));
 *   const ANALYSIS_SUBSTATIONS: AnalysisSubstation[] = SUBSTATIONS
 *     .map((s): AnalysisSubstation | null => {
 *       const d = loadById.get(s.id);
 *       if (!d || !d.installedMva) return null; // no load data for this node
 *       return {
 *         id: s.id, name: s.name,
 *         voltageClass: d.voltageClass ?? String(s.voltageKv),
 *         lat: s.lat, lon: s.lon,
 *         installedMva: d.installedMva, nightPeakMva: d.nightPeakMva,
 *         spareAtNightMva: d.spareAtNightMva,
 *         nightUtilisation: d.nightUtilisation, minMva: d.minMva,
 *         observationCount: d.observationCount, quality: s.quality,
 *       };
 *     })
 *     .filter((s): s is AnalysisSubstation => s !== null);
 *
 * A node present in `SUBSTATIONS` but absent from `LOAD_DETAILS` (or with
 * `installedMva` still null) drops out rather than rendering a fake
 * "no data" row with a real position — same "never fabricate" posture
 * `data.ts`'s own header commits to.
 *
 * RECOMMENDED PLACEMENT: today's `page.tsx` Act 2 is a
 * `grid-cols-[1fr_330px]` of `<GridMap />` + `<Worklist />` only — no
 * separate context rail exists yet (`grid-map.tsx`'s own header confirms
 * this). Cleanest fit: a second `<aside>` in that same grid, stacked above
 * or below `<Worklist />` inside the 330px column (this panel's own
 * layout is a single flexible column, no fixed width baked in) — or, if
 * that column is getting crowded, a full-width row between the findings
 * band and the three-column layout.
 *
 * CAVEATS ON THE RESULT, NOT IN A FOOTNOTE (task 4, DATA.md caveat 1):
 * every result explicitly states it is TRANSFORMER headroom, not drawal
 * capacity for a new consumer — n-1, bay availability and the downstream
 * network still bind. Rendered inline, visible text, never `text-ink-3`
 * footnote grey. See the `<div>` with `border-line-2 bg-panel-2` below.
 *
 * ACCESSIBILITY (MASTER.md §6): no shadcn `Checkbox`/`Switch` is installed
 * in this project (`components.json` / `src/components/ui/` — verified;
 * only `slider`, `select`, `badge`, etc. are present, and task
 * instructions say never `npm install`). The night-power toggle below is
 * therefore a native `<input type="checkbox">` inside a `<label>` — a
 * real, keyboard-operable, screen-reader-correct control, not a styled
 * `<div>`. `min-h-11` on the label matches this design system's other
 * controls' 44px (AAA) target-size sweep.
 */

import { useMemo, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CITIES } from "@/data/geometry";
import {
  filterSubstations,
  rankForLoad,
  resolveCity,
  type AnalysisSubstation,
  type LoadScenario,
} from "@/lib/analysis";
import {
  DEFAULT_FILTERS_STATE,
  Filters,
  toSubstationFilters,
  type FiltersState,
} from "./filters";
import { Ranking } from "./ranking";

const RADIUS_OPTIONS = [150, 250, 400] as const;
const MIN_MW = 10;
const MAX_MW = 500;
const MW_STEP = 10;

export interface ScenarioFormState {
  loadMw: number;
  nearCity: string;
  radiusKm: number;
  needsNight: boolean;
}

export const DEFAULT_SCENARIO_STATE: ScenarioFormState = {
  loadMw: 100,
  nearCity: CITIES[0]?.name ?? "Bhopal",
  radiusKm: 250,
  needsNight: true,
};

export interface ScenarioFormProps {
  value: ScenarioFormState;
  onChange: (next: ScenarioFormState) => void;
  onSubmit: () => void;
  className?: string;
}

/** The question itself — task 4. A real `<form>` so Enter-to-submit
 * (legacy: `$("mw").onkeydown` handling Enter by hand) comes free and
 * correctly, rather than a bespoke keydown handler. */
export function ScenarioForm({
  value,
  onChange,
  onSubmit,
  className,
}: ScenarioFormProps) {
  return (
    <form
      className={cn("space-y-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm text-ink">
        Where can{" "}
        <strong className="font-mono font-medium text-ink">
          {value.loadMw} MW
        </strong>{" "}
        connect near <strong className="text-ink">{value.nearCity}</strong>
        {value.needsNight ? ", 24×7" : ""}?
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="scenario-mw">Load</Label>
        <div className="flex items-center gap-2">
          <Input
            id="scenario-mw"
            type="number"
            min={MIN_MW}
            max={MAX_MW}
            step={MW_STEP}
            value={value.loadMw}
            onChange={(e) =>
              onChange({
                ...value,
                loadMw: Number(e.target.value) || MIN_MW,
              })
            }
          />
          <span className="font-mono text-xs text-ink-3">MW</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="scenario-city">Near</Label>
        <Select
          value={value.nearCity}
          onValueChange={(v) => onChange({ ...value, nearCity: v })}
        >
          <SelectTrigger id="scenario-city" aria-label="City">
            <SelectValue>{value.nearCity}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CITIES.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="scenario-radius">Radius</Label>
        <Select
          value={String(value.radiusKm)}
          onValueChange={(v) => onChange({ ...value, radiusKm: Number(v) })}
        >
          <SelectTrigger id="scenario-radius" aria-label="Radius">
            <SelectValue>{value.radiusKm} km</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RADIUS_OPTIONS.map((r) => (
              <SelectItem key={r} value={String(r)}>
                {r} km
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label
        htmlFor="scenario-rtc"
        className="flex min-h-11 items-center gap-2 text-sm text-ink"
      >
        <input
          id="scenario-rtc"
          type="checkbox"
          checked={value.needsNight}
          onChange={(e) =>
            onChange({ ...value, needsNight: e.target.checked })
          }
          className="size-5 shrink-0 rounded border-line-2 accent-night focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        Needs power at night (24×7)
      </label>

      <Button type="submit" className="w-full">
        Ask Headroom
      </Button>
    </form>
  );
}

export interface AnalysisPanelProps {
  /** See this file's header "MOUNT INSTRUCTIONS" for how to build this. */
  substations: readonly AnalysisSubstation[];
  className?: string;
}

/**
 * The single mountable export for task 7 — Filters + the scenario
 * question + the ranked, self-explaining answer, composed together.
 * Filters apply to BOTH the live "showing N of M" count and to the
 * candidate set `rankForLoad()` ranks, so narrowing to (say) 400kV nodes
 * before asking the scenario question actually changes the answer.
 */
export function AnalysisPanel({ substations, className }: AnalysisPanelProps) {
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS_STATE);
  const [form, setForm] = useState<ScenarioFormState>(DEFAULT_SCENARIO_STATE);
  const [submitted, setSubmitted] = useState<ScenarioFormState | null>(null);

  const filtered = useMemo(
    () => filterSubstations(substations, toSubstationFilters(filters)),
    [substations, filters]
  );

  const city = submitted ? resolveCity(submitted.nearCity) : null;

  const results = useMemo(() => {
    if (!submitted) return null;
    const scenario: LoadScenario = {
      loadMw: submitted.loadMw,
      nearCity: submitted.nearCity,
      radiusKm: submitted.radiusKm,
      needsNight: submitted.needsNight,
    };
    return rankForLoad(filtered, scenario);
  }, [filtered, submitted]);

  const fitCount = results ? results.filter((r) => r.meetsLoad).length : 0;

  return (
    <section
      aria-labelledby="analysis-heading"
      className={cn("space-y-6", className)}
    >
      <h2 id="analysis-heading" className="font-serif text-xl text-ink">
        Where could this load connect?
      </h2>

      <ScenarioForm
        value={form}
        onChange={setForm}
        onSubmit={() => setSubmitted(form)}
      />

      <Filters substations={substations} value={filters} onChange={setFilters} />

      {submitted && (
        <div
          className="space-y-4 border-t border-line pt-4"
          aria-live="polite"
        >
          {!city ? (
            <p className="text-sm text-bad">
              &ldquo;{submitted.nearCity}&rdquo; is not a known city — pick
              one from the Near list above.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink">
                {results && results.length === 0
                  ? `No substations within ${submitted.radiusKm} km of ${submitted.nearCity} match the current filters. Try a larger radius or a different city.`
                  : `${fitCount} of ${results?.length ?? 0} substation${(results?.length ?? 0) === 1 ? "" : "s"} within ${submitted.radiusKm} km of ${submitted.nearCity} can take ${submitted.loadMw} MW${submitted.needsNight ? " round the clock" : ""}.`}
              </p>

              {/*
                DATA.md caveat 1, task 4: "Label it honestly: this answers
                from TRANSFORMER headroom ... Put that on the result, not
                in a footnote." Visible ink, not `text-ink-3` grey.
              */}
              <div className="rounded-md border border-line-2 bg-panel-2 px-3 py-2.5 text-xs text-ink-2">
                <strong className="text-ink">
                  This is transformer headroom, not drawal capacity for a
                  new consumer.
                </strong>{" "}
                n-1 protection, bay availability and the downstream network
                still bind — this shows what MPPTCL publishes, not a
                connection guarantee.
                {!submitted.needsNight && (
                  <>
                    {" "}
                    Also: the measured dataset (DATA.md) carries only
                    night-time peaks — there is no published day-time
                    figure. The numbers below are still night spare
                    capacity, the only measure available, shown as a
                    conservative stand-in for a daytime-only load.
                  </>
                )}
              </div>

              {results && results.length > 0 && <Ranking results={results} />}
            </>
          )}
        </div>
      )}
    </section>
  );
}
