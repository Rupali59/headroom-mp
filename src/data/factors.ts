/**
 * Act 3 factor data — Lane C, BUILD.md ownership table ("C · Factor cards").
 *
 * Reads `data-local/factors-analysis.json` — the artifact
 * `ingest/analyze.ts` writes locally (DATA.md task 4) — and shapes it into
 * the typed `Candidate[]` `src/components/factor-card.tsx` renders.
 *
 * WHY A DIRECT JSON IMPORT, NOT `src/data/loader.ts`: Lane E's loader reads
 * MongoDB (`loadSubstations()` in that file), which is the architecturally
 * correct long-term source (BUILD.md "no compute on Vercel... build reads
 * Mongo"). As of this lane's work, that path is not yet usable end to end —
 * `src/lib/mongo.ts` cannot typecheck or run until `npm install mongodb`
 * lands (see that file's own header), and nothing has loaded this session's
 * `data-local/mpptcl-loading.json` into an actual Atlas cluster yet. Rather
 * than block Act 3 on that, this file reads the same local JSON artifact
 * the rest of this build already depends on for the identical reason
 * (`ingest/mpptcl-loading.py` -> `data-local/mpptcl-loading.json` is the
 * one dataset every lane is working against today). `resolveJsonModule` is
 * already on in `tsconfig.json`, so this is a build-time-only static
 * import — Next bakes the resulting data into the static export exactly
 * once, no runtime fetch, no Mongo dependency, no server code (consistent
 * with `output: "export"`).
 *
 * THIS IS A TEMPORARY WIRING CHOICE, STATED SO IT DOESN'T LOOK ACCIDENTAL:
 * once `src/data/loader.ts` has a populated Mongo collection to read (a
 * `factors` collection this lane never created, since it isn't this lane's
 * file to add collections to), swap the import below for a call into that
 * loader. Nothing downstream — `Candidate`, `Factor`, `tally()`,
 * `factor-card.tsx` — needs to change shape when that happens.
 *
 * `data-local/` is gitignored (BUILD.md: "the repo carries no data"), which
 * is fine here because this whole pipeline — Python ingest, `analyze.ts`,
 * and this file — runs on the one laptop that also runs `next build`
 * (BUILD.md D16). It is NOT fine to ship this pattern to a teammate's
 * machine or CI without also shipping `data-local/`; that is exactly the
 * trade D16 already accepted for Mongo and this file inherits it.
 */

import type { Confidence, Field } from "@/lib/types";
// `resolveJsonModule` is on in tsconfig.json — this resolves and types
// cleanly at build time, no loader needed. See the file header for why a
// direct JSON import rather than Lane E's `src/data/loader.ts`.
import rawArtifact from "../../data-local/factors-analysis.json";

// ---------------------------------------------------------------- types

/** Act 3's own verdict scale. DESIGN.md: "each carrying a verdict (Strong /
 * Adequate / Weak / Unknown)". Deliberately NOT `RiskFactorScore`
 * (`src/lib/types.ts`) even though the four options read the same —
 * DESIGN.md draws these as two different rubrics over a different number
 * of factors (5 for Act 2's risk, 12 here), and importing one as the other
 * would silently couple two things DESIGN.md keeps apart. */
export type FactorVerdict = "strong" | "adequate" | "weak" | "unknown";

/** One of the twelve Act 3 factors for one candidate. */
export interface Factor {
  /** 1-12, DESIGN.md's Act 3 table order. */
  n: number;
  name: string;
  verdict: FactorVerdict;
  /** One-line argument. DESIGN.md: "a one-line argument Claude wrote" —
   * `ingest/analyze.ts` is the only writer of this string; the VERDICT
   * above is decided by that script's own deterministic code, never by
   * Claude (premise 3: judgement in prose, arithmetic in code). */
  argument: string;
  /** The headline number behind the verdict, wrapped as a `Field` so it
   * routes through `<Value>` (`src/components/value.tsx`) — "every number
   * in this app goes through this." Null for factors with no single
   * driving number (7, 8, 9, 11 today). */
  metric: Field<number> | null;
  /** Verdict from the previous `ingest/analyze.ts` run against this same
   * candidate/factor, or null on a factor's first run. */
  priorVerdict: FactorVerdict | null;
  /** Non-empty only when `verdict !== priorVerdict` — DESIGN.md's re-run
   * rule: "may change a verdict with a stated reason; it never silently
   * changes a number." */
  changeReason: string;
}

export interface Candidate {
  id: string;
  substation: string;
  voltageKv: number;
  district: string;
  /** Why this candidate appears at all — see CANDIDATE_SELECTION_NOTE. */
  rationale: string;
  factors: Factor[];
}

export interface FactorTally {
  strong: number;
  adequate: number;
  weak: number;
  unknown: number;
  /** Always 12 today; not hardcoded, so a partial run (DESIGN.md Act 3's
   * "Partial" interaction state: "Tally reads `8 of 12 assessed`") still
   * sums correctly. */
  total: number;
}

// ---------------------------------------------------------------- raw shape

/** Mirrors `ingest/analyze.ts`'s `FactorResult` / `AnalysisArtifact`. Kept
 * local rather than imported: `ingest/` and `src/` are built by different
 * toolchains (tsx vs Next's bundler), the same reasoning `src/data/
 * loader.ts` already states for not importing `ingest/mongo-load.ts`'s
 * row type. */
interface RawFactor {
  n: number;
  name: string;
  verdict: FactorVerdict;
  metricValue: number | null;
  metricUnit: string;
  metricNote: string;
  conf: "verified" | "researched" | "unknown";
  src: string;
  asOf: string;
  argument: string;
  priorVerdict: FactorVerdict | null;
  changeReason: string;
}

interface RawCandidate {
  id: string;
  substation: string;
  voltageKv: number;
  district: string;
  rationale: string;
  factors: RawFactor[];
}

interface RawArtifact {
  generatedAt: string;
  generatedBy: string;
  model: string;
  sourceDataset: string;
  candidates: RawCandidate[];
}

const artifact = rawArtifact as RawArtifact;

// ---------------------------------------------------------------- transform

function toMetricField(f: RawFactor): Field<number> | null {
  if (f.metricValue === null) return null;
  return {
    v: f.metricValue,
    unit: f.metricUnit,
    conf: f.conf as Confidence, // "verified" | "researched" | "unknown" all valid Confidence members
    src: f.src,
    page: null, // spreadsheet row / cited regulation, never a paginated PDF page here
    asOf: f.asOf,
    by: artifact.generatedBy,
    at: Date.parse(artifact.generatedAt),
    note: f.metricNote,
  };
}

function toFactor(f: RawFactor): Factor {
  return {
    n: f.n,
    name: f.name,
    verdict: f.verdict,
    argument: f.argument,
    metric: toMetricField(f),
    priorVerdict: f.priorVerdict,
    changeReason: f.changeReason,
  };
}

/** DESIGN.md's Act 3 candidate-selection rule ("the user names a load and a
 * district, every substation within radius gets a card") is UNRESOLVED —
 * see DESIGN.md "Still unresolved" #4 and the eng-review's UNRESOLVED
 * DECISIONS list. `ingest/analyze.ts`'s header carries the full reasoning
 * for the fixed three-candidate set shipped instead (Indore, Bhopal,
 * Pithampur — DATA.md's own worked table's top three by night spare MVA).
 * Restated here, briefly, because a reader of factor-card.tsx who never
 * opens the ingest script should not conclude the selection was arbitrary. */
export const CANDIDATE_SELECTION_NOTE =
  "Radius-based selection is unresolved (DESIGN.md). These three are the largest measured night-spare EHV nodes in DATA.md's worked table.";

export const CANDIDATES: Candidate[] = artifact.candidates.map((c) => ({
  id: c.id,
  substation: c.substation,
  voltageKv: c.voltageKv,
  district: c.district,
  rationale: c.rationale,
  factors: c.factors.map(toFactor).sort((a, b) => a.n - b.n),
}));

export const FACTORS_GENERATED_AT = artifact.generatedAt;
export const FACTORS_MODEL = artifact.model;

/** DESIGN.md: "Roll-up is a tally, never a score." Plain counting — no
 * factor's verdict is re-interpreted or weighted here. This is the
 * deterministic half premise 3 requires stay deterministic; it is pure
 * arithmetic over whatever verdicts `ingest/analyze.ts` already decided. */
export function tally(factors: readonly Factor[]): FactorTally {
  const t: FactorTally = { strong: 0, adequate: 0, weak: 0, unknown: 0, total: factors.length };
  for (const f of factors) t[f.verdict]++;
  return t;
}

/** "n of 12 assessed" — DESIGN.md Act 3's Partial state: "Tally reads `8 of
 * 12 assessed` and says so rather than implying completeness." Assessed =
 * not unknown; a factor genuinely `unknown` (7, 8 today) is not a failure
 * to assess, it is the assessment (DATA.md: a physical constraint, not a
 * data gap) — but it still is not counted toward "assessed" for this line,
 * because the reader's question is "how many of these can I act on."
 */
export function assessedCount(factors: readonly Factor[]): number {
  return factors.filter((f) => f.verdict !== "unknown").length;
}
