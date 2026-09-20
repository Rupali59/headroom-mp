"use client";

/**
 * Replay chrome — DESIGN.md "Act 2": "Two labelled buttons, not a
 * scrubber." Point 6 of the Lane A brief, verbatim on why:
 *
 *   "Winter peak · Jan 2026 · 19,902 MW (CEA via CEIC)" and
 *   "Monsoon trough · Jul 2026 · 13,818 MW". THE SOURCES ARE MONTHLY.
 *   There is no day and no clock time — an earlier draft invented
 *   "15 Jan 2026 19:30", which appears in none of the source documents,
 *   and put it next to a citation. A two-stop slider pretending to be
 *   continuous is the same failure wearing different clothes.
 *
 * So: exactly two buttons, each a `Field`-backed `<Value>` for its MW
 * figure (every number routes through it), never a `Slider`. Substation
 * detail beneath is modelled and says so elsewhere (DESIGN.md); this
 * component only renders the state-level load condition switch itself.
 */

import { Value } from "@/components/value";
import type { Field } from "@/lib/types";

export type LoadCondition = "winter" | "monsoon";

interface ConditionSpec {
  condition: LoadCondition;
  label: string;
  field: Field<number>;
}

/**
 * DESIGN.md "Demand context": "MP's all-time peak came in January 2026 at
 * 19,902 MW... By July 2026 peak demand was 13,818 MW," cited to CEA via
 * CEIC (`mp-headroom-app.html`'s `SRC.ceic`). These are state-level
 * monthly peaks, not substation figures — the honest rung for a monthly,
 * cited, web-sourced number is `researched`, per DATA.md's confidence
 * ladder ("web search, cited to URL + retrieval date").
 */
const CONDITIONS: ConditionSpec[] = [
  {
    condition: "winter",
    label: "Winter peak",
    field: {
      v: 19902,
      unit: "MW",
      conf: "researched",
      src: "CEA via CEIC",
      page: null,
      asOf: "2026-01",
      by: "ingest",
      at: 0,
      note: "MP's all-time peak, driven by rabi irrigation. State-level monthly figure, not a substation reading.",
    },
  },
  {
    condition: "monsoon",
    label: "Monsoon trough",
    field: {
      v: 13818,
      unit: "MW",
      conf: "researched",
      src: "CEA via CEIC",
      page: null,
      asOf: "2026-07",
      by: "ingest",
      at: 0,
      note: "State-level monthly figure, not a substation reading.",
    },
  },
];

export interface ReplayChromeProps {
  condition: LoadCondition;
  onChange: (condition: LoadCondition) => void;
}

export function ReplayChrome({ condition, onChange }: ReplayChromeProps) {
  return (
    <section aria-labelledby="replay-chrome-heading" className="space-y-2">
      <p
        id="replay-chrome-heading"
        className="font-mono text-[10.5px] uppercase tracking-wide text-ink-3"
      >
        Load condition
      </p>
      <div role="radiogroup" aria-labelledby="replay-chrome-heading" className="space-y-1.5">
        {CONDITIONS.map((c) => {
          const active = c.condition === condition;
          return (
            <button
              key={c.condition}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(c.condition)}
              className={
                "flex w-full min-h-11 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (active
                  ? "border-line-2 bg-panel-2 text-ink"
                  : "border-line bg-panel text-ink-2 hover:border-line-2")
              }
            >
              <span className="text-sm">{c.label}</span>
              <span className="font-mono text-xs text-ink-3">
                {c.field.asOf === "2026-01" ? "Jan 2026" : "Jul 2026"} ·{" "}
                <Value
                  field={c.field}
                  label={`${c.label} — MP state peak demand`}
                  className="text-inherit"
                />
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-ink-3">
        Sources are monthly. There is no day and no clock time — substation
        detail beneath is modelled from these two months, not telemetry.
      </p>
    </section>
  );
}
