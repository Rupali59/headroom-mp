"use client";

/**
 * Act 3 — "Where a data centre could go." Lane C, BUILD.md ownership table.
 * Replaces the Lane 0 stub; same export name (`FactorCard`) and same
 * zero-prop signature `page.tsx` (frozen) already calls it with.
 *
 * A card per candidate — DESIGN.md's own words — but per
 * design-system/MASTER.md §4: "Card chrome survives in exactly ONE place:
 * a worklist row, because acting on it is the interaction," and stacked
 * cards is hard-rejection #7, already caught once in design review (D8).
 * So "a card per candidate" is built as ONE full-width block per selected
 * candidate — rules and typography, no bordered/shadowed boxes, no card
 * grid — switched by a `Tabs` control (MASTER.md §4's own vocabulary for
 * "a second instance" of the tab pattern), matching the findings band's
 * own D8 treatment in Act 2 rather than inventing a third visual system.
 *
 * PREMISE 3, ON SCREEN: the tally below is `Array.filter().length` over
 * `factor.verdict` — see `src/data/factors.ts#tally()`. It is never a
 * number the LLM produced; that is `ingest/analyze.ts`'s whole point, and
 * the reason the same data never shows two different tallies on two runs.
 *
 * NO CLIENT LOADING STATE: DESIGN.md's Act 3 interaction-state table
 * describes factor slots "filling one at a time" — written against the
 * pre-BUILD.md architecture where Act 3 could be a live API call.
 * BUILD.md's local-ingest rewrite ("no compute on Vercel") made this data
 * build-time-static like everything else the static export bakes in — it
 * is present the instant this component mounts, the same way Act 1's
 * REPLAY carries no live-fetch spinner. A streaming reveal here would be
 * decorative motion over data that was never actually arriving.
 */

import { useState } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Value } from "@/components/value";
import {
  CANDIDATE_SELECTION_NOTE,
  CANDIDATES,
  FACTORS_GENERATED_AT,
  FACTORS_MODEL,
  assessedCount,
  tally,
  type Factor,
  type FactorVerdict,
} from "@/data/factors";

const VERDICT_LABEL: Record<FactorVerdict, string> = {
  strong: "Strong",
  adequate: "Adequate",
  weak: "Weak",
  unknown: "Unknown",
};

// design-system/MASTER.md §2: "Risk is never encoded by colour alone" — the
// word is what carries meaning (VERDICT_LABEL above, always rendered);
// colour is only the fast channel on top of it. `unknown` gets the same
// dashed, no-fill treatment `<Value>` already uses for an unknown Field,
// so the two vocabularies read as one system.
const VERDICT_BADGE_CLASS: Record<FactorVerdict, string> = {
  strong: "bg-good/20 text-good",
  adequate: "bg-panel-2 text-ink-2",
  weak: "bg-bad/20 text-bad",
  unknown: "border border-dashed border-line-2 bg-transparent text-ink-3",
};

function VerdictBadge({ verdict }: { verdict: FactorVerdict }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent px-1.5 text-[10px] uppercase tracking-wide", VERDICT_BADGE_CLASS[verdict])}
    >
      {VERDICT_LABEL[verdict]}
    </Badge>
  );
}

function TallyLine({ factors }: { factors: Factor[] }) {
  const t = tally(factors);
  const assessed = assessedCount(factors);
  return (
    <p className="font-mono text-xs tabular-nums text-ink-3">
      {t.strong} strong · {t.adequate} adequate · {t.weak} weak · {t.unknown} unknown
      <span className="mx-2 text-line-2">|</span>
      {assessed} of {t.total} assessed
    </p>
  );
}

function FactorRow({ factor, substation }: { factor: Factor; substation: string }) {
  const changed = factor.priorVerdict !== null && factor.priorVerdict !== factor.verdict;
  return (
    <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-ink-3">{factor.n}</span>
          <span className="font-medium text-ink">{factor.name}</span>
          <VerdictBadge verdict={factor.verdict} />
          {changed && (
            <Badge variant="outline" className="border-mid/40 px-1.5 text-[10px] uppercase tracking-wide text-mid">
              changed
            </Badge>
          )}
        </div>
        <p className="mt-1 max-w-prose text-sm text-ink-2">{factor.argument}</p>
        {/* DESIGN.md Act 3 re-run state: "Prior verdict stays visible,
            dimmed... Changed verdicts are marked, with the prior value and
            the stated reason." */}
        {changed && (
          <p className="mt-1 text-xs text-ink-3">
            was <span className="text-ink-2">{VERDICT_LABEL[factor.priorVerdict as FactorVerdict]}</span>
            {factor.changeReason ? ` — ${factor.changeReason}` : ""}
          </p>
        )}
      </div>
      {factor.metric && (
        <div className="shrink-0 sm:pt-0.5">
          <Value field={factor.metric} label={`${factor.name} — ${substation}`} />
        </div>
      )}
    </div>
  );
}

export function FactorCard() {
  const [activeId, setActiveId] = useState(CANDIDATES[0]?.id ?? "");

  if (CANDIDATES.length === 0) {
    // Absence must be attributable, never a silent blank section.
    return (
      <section aria-labelledby="factor-card-heading" className="border-t border-line pt-6">
        <h2 id="factor-card-heading" className="font-serif text-xl text-ink">
          Opportunity factors
        </h2>
        <p className="mt-2 max-w-prose text-sm text-ink-3">
          No candidates in this build. Run <code className="font-mono">npx tsx ingest/analyze.ts</code> to
          generate `data-local/factors-analysis.json`, then rebuild.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="factor-card-heading" className="border-t border-line pt-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="factor-card-heading" className="font-serif text-xl text-ink">
          Where a data centre could go
        </h2>
        <span className="font-mono text-xs text-ink-3">
          {FACTORS_MODEL} · {new Date(FACTORS_GENERATED_AT).toISOString().slice(0, 10)}
        </span>
      </div>
      <p className="mb-4 max-w-prose text-sm text-ink-3">{CANDIDATE_SELECTION_NOTE}</p>

      <Tabs value={activeId} onValueChange={setActiveId}>
        <TabsList aria-label="Candidate substation">
          {CANDIDATES.map((c) => (
            <TabsTrigger key={c.id} value={c.id}>
              {c.substation}
            </TabsTrigger>
          ))}
        </TabsList>

        {CANDIDATES.map((c) => (
          <TabsContent key={c.id} value={c.id} className="mt-4">
            <div className="mb-3">
              <p className="text-sm text-ink">
                {c.voltageKv} kV · {c.district}
              </p>
              <p className="mt-1 max-w-prose text-sm text-ink-3">{c.rationale}</p>
            </div>
            <TallyLine factors={c.factors} />
            <Separator className="my-3" />
            <div>
              {c.factors.map((f, i) => (
                <div key={f.n}>
                  {i > 0 && <Separator />}
                  <FactorRow factor={f} substation={c.substation} />
                </div>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
