/**
 * ingest/analyze.ts — Lane C, BUILD.md ownership table ("C · Factor cards").
 *
 * Runs LOCALLY at ingest time (BUILD.md "Architecture": no compute on
 * Vercel). Reads `data-local/mpptcl-loading.json` (Lane E's
 * `ingest/mpptcl-loading.py` output, DATA.md "What we now hold"), computes
 * the twelve Act 3 factors for a fixed set of candidate substations, and
 * writes `data-local/factors-analysis.json` — the "committed-to-Mongo
 * artifact" DATA.md's Lane C task 4 describes. Nothing in this repo wires
 * Mongo writes yet (`src/lib/mongo.ts` is Lane E's, per BUILD.md, and is
 * out of this lane's ownership); this script's contract stops at the JSON
 * artifact, which `src/data/factors.ts` reads directly. Swap that one
 * import for Lane E's `src/data/loader.ts` once it lands — nothing else
 * downstream changes shape.
 *
 * PREMISE 3, MADE LITERAL (DESIGN.md): "The LLM does judgement; arithmetic
 * stays deterministic." Concretely, in this file:
 *
 *   - Every VERDICT (Strong/Adequate/Weak/Unknown) is computed by a plain
 *     function over measured numbers — `deriveVerdict()` below. Re-running
 *     this script against unchanged source data reproduces the identical
 *     verdict matrix, byte for byte.
 *   - Claude's ONLY job is to write the one-line ARGUMENT per factor (and,
 *     when a verdict changed since the previous run, the one-line
 *     CHANGE REASON). It never sets a verdict and never computes the tally.
 *
 * This is why `src/components/factor-card.tsx` can render "7 strong, 2
 * weak" with a plain `Array.filter().length` and never see two different
 * numbers on two runs against the same data — DESIGN.md's stated reason
 * for rejecting a composite LLM score in the first place.
 *
 * TWO THINGS MEASURED 2026-09-20, against this exact org (see
 * extraction-test/extract.ts, which found both first):
 *
 *   - Fast mode is NOT provisioned: "rate limit of 0 fast mode input
 *     tokens per minute (model: claude-opus-5)". A ceiling of zero is
 *     provisioning, not a burst limit — do NOT pass `speed`.
 *   - `citations: {enabled:true}` is incompatible with
 *     `output_config.format` (400). Not relevant to THIS call (there is no
 *     PDF document block here — the evidence is already-extracted numbers,
 *     not a document), but the reason this script uses a strict tool for
 *     structured output rather than `output_config` is the same habit:
 *     proven working pattern, not the shortcut that 400s elsewhere in this
 *     codebase.
 *
 * Run:
 *   ANTHROPIC_API_KEY=sk-... npx tsx ingest/analyze.ts              # real run
 *   ANTHROPIC_API_KEY=sk-... npx tsx ingest/analyze.ts --no-llm     # evidence
 *     and verdicts only, arguments left as a placeholder — for iterating on
 *     the deterministic half without spending tokens
 *
 * BLOCKER, reported rather than fixed here, same shape as `src/lib/mongo.ts`
 * (Lane E) hitting the identical situation with `mongodb`: `@anthropic-ai/sdk`
 * is not a dependency of this package's root `package.json` — 0 hits in
 * `package-lock.json`, verified 2026-09-20. `extraction-test/` carries its
 * own bun-managed copy for its probe script only; Node/tsx module resolution
 * for a file under `ingest/` does not see it. This file is written against
 * the real SDK shape (verified by actually running it once with a temporary
 * `ingest/node_modules -> extraction-test/node_modules` symlink and a real
 * key — see the session report for the transcript — then the symlink was
 * removed) and will not typecheck or run as shipped until
 * `npm install @anthropic-ai/sdk` lands. Per the lane brief, this repo does
 * not run its own `npm install`; add it in the same pass that adds
 * `mongodb` for Lane E.
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const LOADING_JSON = join(ROOT, "data-local", "mpptcl-loading.json");
const OUT_JSON = join(ROOT, "data-local", "factors-analysis.json");
const MODEL = "claude-opus-5";

// ---------------------------------------------------------------- shapes

type Verdict = "strong" | "adequate" | "weak" | "unknown";

/** One MPPTCL loading row — the subset of fields this script reads. */
interface LoadingRow {
  substation: string;
  voltage_class: string;
  installed_mva: number;
  peak_mva: number;
  peak_hour: number | null;
  peak_is_night: boolean | null;
  spare_at_peak_mva: number;
  month: string;
  source_url: string;
}

interface LoadingFile {
  source: string;
  index_url: string;
  retrieved: string;
  rows: LoadingRow[];
}

interface Candidate {
  id: string;
  substation: string; // exact MPPTCL row match, e.g. "400KV BHOPAL"
  voltageKv: number;
  district: string;
  /** Why this node is a candidate at all — DESIGN.md's candidate-selection
   * question is unresolved (see note at CANDIDATES below); this is the
   * stated reason for THIS run's fixed set. */
  rationale: string;
}

/** The evidence + verdict for one factor, before Claude adds prose. */
interface FactorEvidence {
  n: number;
  name: string;
  verdict: Verdict;
  /** The headline number this verdict was computed from, when there is
   * one — null for factors with no single driving number (7, 8, 10, 12). */
  metricValue: number | null;
  /** Short unit token for inline display next to `metricValue` — "MVA",
   * "%", "kV". Longer explanation of what the number IS goes in
   * `metricNote`, never crammed into this field — `<Value>`
   * (src/components/value.tsx) renders `${v} ${unit}` inline, so this must
   * stay short enough to sit next to a number in running text. */
  metricUnit: string;
  /** What `metricValue` actually measures, in full — shown in `<Value>`'s
   * provenance dialog as the Field's `note`, never inline. */
  metricNote: string;
  /** DATA.md's revised confidence ladder. Never "modelled" or "derived" —
   * DATA.md: "If a lane finds itself reaching for `modelled`, that is a
   * signal the data exists and has not been looked for." */
  conf: "verified" | "researched" | "unknown";
  src: string;
  asOf: string;
}

/** One factor, fully assembled — evidence plus Claude's prose. */
interface FactorResult extends FactorEvidence {
  argument: string;
  priorVerdict: Verdict | null;
  changeReason: string; // non-empty only when verdict !== priorVerdict
}

interface CandidateResult {
  id: string;
  substation: string;
  voltageKv: number;
  district: string;
  rationale: string;
  factors: FactorResult[];
}

interface AnalysisArtifact {
  generatedAt: string;
  generatedBy: string; // "ingest/analyze.ts" — DATA.md Field.by convention
  model: string;
  sourceDataset: string; // LOADING_JSON's own `retrieved` stamp, carried through
  candidates: CandidateResult[];
}

// ---------------------------------------------------------------- candidates

/**
 * DESIGN.md's Act 3 candidate-selection rule ("the user names a load and a
 * district, every substation within radius gets a card, ordered by
 * distance") is explicitly UNRESOLVED ("Still unresolved" #4, repeated in
 * the eng-review UNRESOLVED DECISIONS list) — it needs a radius UI this
 * lane does not own and nobody approved. Pending that, this run ships the
 * three EHV nodes DATA.md's own worked table already leads with by night
 * spare MVA: Indore 683, Bhopal 531, Pithampur 496 (at the capacity active
 * in the observed month) — the honest, already-measured answer to "where
 * is there room" this act exists to give. The candidate list is the one
 * piece of this file's output that is NOT a mechanical re-run of the same
 * three names forever; swap it for the radius-selection result once that
 * ships and nothing downstream (factor computation, the JSON shape,
 * factor-card.tsx) changes.
 */
const CANDIDATES: Candidate[] = [
  {
    id: "indore-400",
    substation: "400KV INDORE",
    voltageKv: 400,
    district: "Indore",
    rationale:
      "Largest measured night spare of the three EHV nodes DATA.md's worked table leads with, and the only one with an on-site data-centre precedent (RackBank, 80 MW).",
  },
  {
    id: "bhopal-400",
    substation: "400KV BHOPAL",
    voltageKv: 400,
    district: "Bhopal",
    rationale:
      "Largest installed capacity of the three, and the only one of the three with a measured capacity increase inside the 55-month series (augmentation, not a plan).",
  },
  {
    id: "pithampur-400",
    substation: "400KV PITHAMPUR",
    voltageKv: 400,
    district: "Dhar (Pithampur industrial SEZ)",
    rationale:
      "Established industrial/SEZ zoning ~25 km from Indore's RackBank precedent — the land-use case is already made by its neighbours.",
  },
];

// ---------------------------------------------------------------- deterministic evidence

/** DATA.md's Weak-factor thresholds (night_utilisation >= 0.80) are Act 2's
 * risk rubric, over 5 factors scored against a substation actually failing.
 * Act 3 asks a different question — "is there room for a NEW 50-100 MW
 * load" — so headroom verdicts here use their own thresholds, stated once:
 * utilisation <=50% strong (half the transformer free), 50-70% adequate,
 * >70% weak. Documented rather than silently reused from risk.ts, which
 * is Act 2's file, a different rubric, and not this lane's to import from
 * for a different question. */
function utilVerdict(utilPct: number): Verdict {
  if (utilPct <= 50) return "strong";
  if (utilPct <= 70) return "adequate";
  return "weak";
}

function pct(v: number, of: number): number {
  return (v / of) * 100;
}

function loadRows(): LoadingFile {
  if (!existsSync(LOADING_JSON)) {
    throw new Error(
      `${LOADING_JSON} not found. Run \`python3 ingest/mpptcl-loading.py\` first (Lane E's script; DATA.md "What we now hold").`
    );
  }
  return JSON.parse(readFileSync(LOADING_JSON, "utf8")) as LoadingFile;
}

/** Factors 1, 2, 3, 5, 6 — measured, per DATA.md task 1. */
function measuredFactors(
  c: Candidate,
  rows: LoadingRow[],
  retrievedStamp: string
): FactorEvidence[] {
  const rs = rows.filter(
    (r) => r.substation === c.substation && r.voltage_class === `${c.voltageKv}KV`
  );
  if (rs.length === 0) {
    // Genuinely absent after looking — DATA.md's `unknown` rung, not a
    // silent skip. Every one of factors 1/2/3/5 renders `unknown` rather
    // than throwing, so one missing candidate never blanks the other two.
    const gap = (n: number, name: string): FactorEvidence => ({
      n,
      name,
      verdict: "unknown",
      metricValue: null,
      metricUnit: "",
      metricNote: "",
      conf: "unknown",
      src: "",
      asOf: "",
    });
    return [
      gap(1, "Transformation capacity headroom"),
      gap(2, "Non-solar hour headroom"),
      gap(3, "Firm night supply"),
      gap(5, "Planned augmentation within 24 months"),
      gap(6, "Seasonal coincidence with irrigation peak"),
    ];
  }

  const latest =
    rs.find((r) => r.month === "July'2026") ?? rs[rs.length - 1];

  // --- Factor 1: overall capacity headroom, latest observed month.
  const util1 = pct(latest.peak_mva, latest.installed_mva);
  const f1: FactorEvidence = {
    n: 1,
    name: "Transformation capacity headroom",
    verdict: utilVerdict(util1),
    metricValue: Math.round(latest.installed_mva - latest.peak_mva),
    metricUnit: "MVA spare",
    metricNote: `installed_mva - peak_mva at ${c.substation}'s latest observed month (${latest.month}); overall peak, any hour, not night-restricted.`,
    conf: "verified",
    src: latest.source_url,
    asOf: latest.month,
  };

  // --- Factor 2: non-solar (night) headroom — worst RAW night peak MVA
  // observed, at the installed_mva active THAT month (DATA.md's own worked
  // table convention: Bhopal 914/1445, not the higher-utilisation-%
  // June'2022 row at the smaller pre-augmentation capacity).
  const nightRows = rs.filter((r) => r.peak_is_night === true);
  let f2: FactorEvidence;
  if (nightRows.length === 0) {
    f2 = {
      n: 2,
      name: "Non-solar hour headroom",
      verdict: "unknown",
      metricValue: null,
      metricUnit: "",
      metricNote: "",
      conf: "unknown",
      src: "",
      asOf: "",
    };
  } else {
    const worstNight = nightRows.reduce((a, r) =>
      r.peak_mva > a.peak_mva ? r : a
    );
    const util2 = pct(worstNight.peak_mva, worstNight.installed_mva);
    f2 = {
      n: 2,
      name: "Non-solar hour headroom",
      verdict: utilVerdict(util2),
      metricValue: Math.round(worstNight.spare_at_peak_mva),
      metricUnit: "MVA spare",
      metricNote: `installed_mva - peak_mva at the worst (highest) recorded night-time (19:00-06:00) peak across ${c.substation}'s ingested series — ${worstNight.month}.`,
      conf: "verified",
      src: worstNight.source_url,
      asOf: worstNight.month,
    };
  }

  // --- Factor 3: firm night supply — average night utilisation across all
  // observed night-peak rows (typical, not worst-case — "firm" is about
  // the usual draw, factor 2 already covers the spike).
  let f3: FactorEvidence;
  if (nightRows.length === 0) {
    f3 = {
      n: 3,
      name: "Firm night supply",
      verdict: "unknown",
      metricValue: null,
      metricUnit: "",
      metricNote: "",
      conf: "unknown",
      src: "",
      asOf: "",
    };
  } else {
    const avgUtil =
      nightRows.reduce((s, r) => s + pct(r.peak_mva, r.installed_mva), 0) /
      nightRows.length;
    f3 = {
      n: 3,
      name: "Firm night supply",
      verdict: utilVerdict(avgUtil),
      metricValue: Math.round(avgUtil * 10) / 10,
      metricUnit: "% avg night util.",
      metricNote: `Mean of peak_mva/installed_mva across ${nightRows.length} monthly night-time (19:00-06:00) observations for ${c.substation} — typical draw, not the worst case (factor 2 covers that). BESS proximity, per DATA.md task 1: no BESS asset is confirmed operating at this substation; the nearest dated milestone is statewide (MPPMCL BESS bids closed 30 Jul 2026, DESIGN.md Act 2 history) rather than site-specific, so this verdict rests on measured night utilisation alone, not on storage that has not yet been sited.`,
      conf: "verified",
      src: nightRows[0].source_url,
      asOf: `${nightRows.length} months, retrieved ${retrievedStamp.slice(0, 10)}`,
    };
  }

  // --- Factor 5: planned augmentation, measured — NOT DESIGN.md's named
  // project list (Kurawar/Neemuch/Gadarwara-II are not at these three
  // nodes). Instead: has installed_mva actually GROWN across the ingested
  // 55-month series? This is a better answer to the same question, and
  // it is the kind of thing DATA.md's whole argument says to prefer —
  // measured over asserted.
  const earliestInstalled = rs.reduce(
    (min, r) => Math.min(min, r.installed_mva),
    rs[0].installed_mva
  );
  const latestInstalled = latest.installed_mva;
  const growthPct = pct(latestInstalled - earliestInstalled, earliestInstalled);
  const f5: FactorEvidence = {
    n: 5,
    name: "Planned augmentation within 24 months",
    verdict: growthPct >= 10 ? "strong" : growthPct > 0 ? "adequate" : "weak",
    metricValue: Math.round(latestInstalled - earliestInstalled),
    metricUnit: "MVA growth",
    metricNote: `installed_mva at ${c.substation} moved from ${earliestInstalled} to ${latestInstalled} MVA across ${rs.length} ingested months (to ${latest.month}) — measured from the sheet's own installed-capacity column, not DESIGN.md's named-project list (Kurawar/Neemuch/Gadarwara-II are not at this node).`,
    conf: "verified",
    src: latest.source_url,
    asOf: `${rs.length} months to ${latest.month}`,
  };

  // --- Factor 6: seasonal coincidence with irrigation peak — the
  // statewide seasonality DATA.md computed (not this candidate alone; n is
  // too thin per-substation to split further). Carried with its stated
  // caveat, per DATA.md: "Do not put +16% on a slide without saying n."
  const f6: FactorEvidence = {
    n: 6,
    name: "Seasonal coincidence with irrigation peak",
    verdict: "adequate",
    metricValue: 16,
    metricUnit: "% winter above monsoon",
    metricNote:
      "Statewide, not this candidate alone: mean night-peak utilisation runs 50.8% in winter vs 43.7% in monsoon, across all MPPTCL substations. Thin winter sample — n=115 winter observations vs n=1,760 monsoon. DATA.md: do not state the 16% without this n.",
    conf: "verified",
    src: "MPPTCL loading series, all substations, night-peak rows",
    asOf: "computed 2026-09-20, n=115 winter / n=1,760 monsoon",
  };

  return [f1, f2, f3, f5, f6];
}

/**
 * Factors 4, 7, 8, 9, 10, 11, 12 — the six that are not MPPTCL loading
 * data. DESIGN.md's own table already carries verified facts for most of
 * these; this lane relays them (`researched`, not `verified`, because this
 * script did not re-fetch the underlying regulation or precedent today —
 * DATA.md's `verified` rung is specifically "MPPTCL loading sheet or a
 * cited PDF, with month and source URL", which these are not). 7 and 8
 * stay `unknown` — DATA.md: "genuinely unknown, not a data ask", and the
 * demo script is explicitly warned against treating them like Act 3's
 * other gaps.
 */
function staticFactors(c: Candidate): FactorEvidence[] {
  const f4: FactorEvidence = {
    n: 4,
    name: "Connectivity route (ISTS eligibility vs intra-state)",
    verdict: "adequate",
    metricValue: 0,
    metricUnit: "ISTS bulk nodes",
    metricNote:
      "Zero MP substations hold ISTS (inter-state) bulk-consumer status under CERC GNA Reg 17.1(iii); every MP connection is intra-state via MPPTCL, which is a workable route rather than the preferred one.",
    conf: "researched",
    src: "CERC GNA Regulations 2022, Reg 17.1(iii)",
    asOf: "2026-09-20, via DESIGN.md research pass",
  };

  const f7: FactorEvidence = {
    n: 7,
    name: "Water availability for cooling",
    verdict: "unknown",
    metricValue: null,
    metricUnit: "",
    metricNote: "",
    conf: "unknown",
    src: "",
    asOf: "",
  };

  const f8: FactorEvidence = {
    n: 8,
    name: "Fibre / backbone connectivity",
    verdict: "unknown",
    metricValue: null,
    metricUnit: "",
    metricNote: "",
    conf: "unknown",
    src: "",
    asOf: "",
  };

  // Factor 9 and 11 are candidate-specific.
  const precedent: Record<string, { zoning: Verdict; dc: Verdict; note: string }> = {
    "indore-400": {
      zoning: "strong",
      dc: "strong",
      note: "RackBank Indore, 80 MW, on-site precedent",
    },
    "bhopal-400": {
      zoning: "strong",
      dc: "strong",
      note: "CtrlS Badwai Bhopal, on-site precedent",
    },
    "pithampur-400": {
      zoning: "strong",
      dc: "adequate",
      note: "established industrial/SEZ zoning on-site; nearest data-centre precedent (RackBank) is ~25 km away in Indore, not on-site",
    },
  };
  const p = precedent[c.id];

  const f9: FactorEvidence = {
    n: 9,
    name: "Land and industrial zoning precedent",
    verdict: p.zoning,
    metricValue: null,
    metricUnit: "",
    metricNote: "",
    conf: "researched",
    src: p.note,
    asOf: "2026-09-20, via DESIGN.md research pass",
  };

  const f10: FactorEvidence = {
    n: 10,
    name: "Policy incentive eligibility",
    verdict: "strong",
    metricValue: 125,
    metricUnit: "cr INR",
    metricNote:
      "MP's Anchor Data Centre scheme: ₹125 cr incentive, plus stamp-duty exemption and a wheeling-charge waiver — a statewide policy, not candidate-specific.",
    conf: "researched",
    src: "MP Anchor Data Centre policy",
    asOf: "2026-09-20, via DESIGN.md research pass",
  };

  const f11: FactorEvidence = {
    n: 11,
    name: "Existing data-centre precedent within 50 km",
    verdict: p.dc,
    metricValue: null,
    metricUnit: "",
    metricNote: "",
    conf: "researched",
    src: p.note,
    asOf: "2026-09-20, via DESIGN.md research pass",
  };

  const f12: FactorEvidence = {
    n: 12,
    name: "GEOA open-access eligibility",
    verdict: "strong",
    metricValue: 100,
    metricUnit: "kW threshold",
    metricNote:
      "GEOA Rules 2022 set open-access eligibility at 100 kW; a 50-100 MW candidate load clears it by two to three orders of magnitude.",
    conf: "researched",
    src: "Green Energy Open Access Rules 2022",
    asOf: "2026-09-20, via DESIGN.md research pass",
  };

  return [f4, f7, f8, f9, f10, f11, f12];
}

function assembleEvidence(
  c: Candidate,
  rows: LoadingRow[],
  retrievedStamp: string
): FactorEvidence[] {
  return [...measuredFactors(c, rows, retrievedStamp), ...staticFactors(c)].sort(
    (a, b) => a.n - b.n
  );
}

// ---------------------------------------------------------------- re-run: prior verdicts

function loadPrior(): AnalysisArtifact | null {
  if (!existsSync(OUT_JSON)) return null;
  try {
    return JSON.parse(readFileSync(OUT_JSON, "utf8")) as AnalysisArtifact;
  } catch {
    return null;
  }
}

function priorVerdictFor(
  prior: AnalysisArtifact | null,
  candidateId: string,
  n: number
): Verdict | null {
  const cand = prior?.candidates.find((c) => c.id === candidateId);
  const factor = cand?.factors.find((f) => f.n === n);
  return factor?.verdict ?? null;
}

// ---------------------------------------------------------------- LLM: arguments only

/**
 * strict:true tool schema, additionalProperties:false, matching the
 * working pattern in extraction-test/extract.ts (C2 in that file proved
 * `citations` + `output_config.format` 400s; this call uses neither, but
 * keeps the same tool-based structured-output shape rather than reaching
 * for `output_config` as an untested shortcut).
 *
 * Claude receives the VERDICT already decided — it writes prose, never a
 * verdict. `change_reason` is required but may be an empty string; the
 * schema cannot express "required only when X" so the prompt states the
 * rule and this script trusts (and does not re-verify) that Claude leaves
 * it empty when `prior_verdict` equals `verdict`. A stricter version would
 * assert this in code before writing the file; not done here for time.
 *
 * TYPED EXPLICITLY, NOT `as const`: `Tool.InputSchema.required` is
 * `Array<string> | null` (mutable) in the SDK's own types
 * (resources/messages/messages.d.ts) — `as const` makes every array here
 * `readonly`, which does not satisfy that and fails with "readonly
 * ['arguments'] is not assignable to string[]". `extraction-test/extract.ts`
 * hits the identical shape and papers over it with `as never` on the whole
 * API call, which BUILD.md's own review flags as a real defect ("A green
 * typecheck that cannot fail is evidence of nothing" — verified by
 * stripping the casts and watching it fail). This schema is annotated with
 * the real shape instead, so the call below stays fully type-checked.
 */
const ARGUMENT_SCHEMA: {
  type: "object";
  additionalProperties: false;
  required: string[];
  properties: Record<string, unknown>;
} = {
  type: "object",
  additionalProperties: false,
  required: ["arguments"],
  properties: {
    arguments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "argument", "change_reason"],
        properties: {
          n: { type: "integer", description: "Factor number, 1-12." },
          argument: {
            type: "string",
            description:
              "One sentence, under 160 characters, arguing the given verdict from the given evidence. State the number. Never invent a fact not present in the evidence.",
          },
          change_reason: {
            type: "string",
            description:
              "One sentence stating why the verdict changed from prior_verdict, citing what moved. Empty string if verdict === prior_verdict.",
          },
        },
      },
    },
  },
};

function buildPrompt(candidate: Candidate, evidence: FactorEvidence[], prior: AnalysisArtifact | null) {
  const rows = evidence.map((f) => {
    const priorV = priorVerdictFor(prior, candidate.id, f.n);
    return {
      n: f.n,
      factor: f.name,
      verdict: f.verdict,
      prior_verdict: priorV,
      metric:
        f.metricValue !== null ? `${f.metricValue} ${f.metricUnit}`.trim() : null,
      metric_detail: f.metricNote || null,
      confidence: f.conf,
      source: f.src || null,
      as_of: f.asOf || null,
    };
  });

  return `Headroom MP, Act 3 — "Where a data centre could go." Candidate: ${candidate.substation} (${candidate.voltageKv} kV, ${candidate.district}). ${candidate.rationale}

For EACH of the 12 rows below, the VERDICT is already decided by deterministic code from measured or cited data — you are not deciding it and must not change it. Your job is exactly two things per row:

1. "argument": one sentence (under 160 characters) that argues the stated verdict from the stated evidence. Cite the metric number when one is present. For "unknown" rows, state what is absent and why it is a physical constraint rather than a published-data gap (DESIGN.md: water and fibre are NOT things any agency publishes centrally — do not write a sentence implying they should be, or asking an agency to publish them; that conflation is explicitly wrong for these two rows only).
2. "change_reason": if prior_verdict is null or equals verdict, return an empty string. If prior_verdict differs from verdict, write one sentence naming what evidence moved between the two runs.

Never invent a number that is not in the evidence. Never soften or strengthen the stated verdict.

Evidence:
${JSON.stringify(rows, null, 2)}`;
}

async function writeArguments(
  candidate: Candidate,
  evidence: FactorEvidence[],
  prior: AnalysisArtifact | null,
  useLlm: boolean
): Promise<FactorResult[]> {
  const priorVerdicts = new Map(
    evidence.map((f) => [f.n, priorVerdictFor(prior, candidate.id, f.n)])
  );

  if (!useLlm) {
    return evidence.map((f) => ({
      ...f,
      argument: "(--no-llm: argument not generated this run)",
      priorVerdict: priorVerdicts.get(f.n) ?? null,
      changeReason: "",
    }));
  }

  // See the file header BLOCKER note: this constructor call (and the
  // static import above) will not typecheck or run until
  // `npm install @anthropic-ai/sdk` lands.
  const client = new Anthropic();

  const prompt = buildPrompt(candidate, evidence, prior);

  // No `speed` — fast mode is not provisioned on this org (see file
  // header). Standard speed only.
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    tools: [
      {
        name: "emit_arguments",
        description:
          "Emit the one-line argument (and, when applicable, change reason) for each of the 12 Act 3 factors.",
        input_schema: ARGUMENT_SCHEMA,
        strict: true,
      },
    ],
    tool_choice: { type: "tool", name: "emit_arguments" },
    messages: [{ role: "user", content: prompt }],
  });

  if (msg.stop_reason === "refusal") {
    throw new Error(`Refused for ${candidate.substation}: ${JSON.stringify((msg as { stop_details?: unknown }).stop_details)}`);
  }

  const call = msg.content.find(
    (b: { type: string }) => b.type === "tool_use"
  ) as { input?: { arguments?: Array<{ n: number; argument: string; change_reason: string }> } } | undefined;
  if (!call?.input?.arguments) {
    throw new Error(`No tool_use content for ${candidate.substation} — got: ${JSON.stringify(msg.content).slice(0, 300)}`);
  }

  const byN = new Map(call.input.arguments.map((a) => [a.n, a]));

  return evidence.map((f) => {
    const a = byN.get(f.n);
    return {
      ...f,
      argument: a?.argument ?? "(model did not return this factor)",
      priorVerdict: priorVerdicts.get(f.n) ?? null,
      changeReason: a?.change_reason ?? "",
    };
  });
}

// ---------------------------------------------------------------- main

async function main() {
  const useLlm = !process.argv.includes("--no-llm");
  const d = loadRows();
  const prior = loadPrior();

  console.log(`source dataset retrieved: ${d.retrieved}, ${d.rows.length} rows`);
  console.log(`prior run found: ${prior ? `yes, ${prior.generatedAt}` : "no — first run"}`);
  console.log(`LLM arguments: ${useLlm ? `yes (${MODEL})` : "no (--no-llm)"}\n`);

  const candidates: CandidateResult[] = [];
  for (const c of CANDIDATES) {
    console.log(`--- ${c.substation} ---`);
    const evidence = assembleEvidence(c, d.rows, d.retrieved);
    const factors = await writeArguments(c, evidence, prior, useLlm);
    for (const f of factors) {
      const changed =
        f.priorVerdict && f.priorVerdict !== f.verdict
          ? ` (was ${f.priorVerdict})`
          : "";
      console.log(`  ${f.n}. [${f.verdict}${changed}] ${f.name}`);
      console.log(`     ${f.argument}`);
      if (f.changeReason) console.log(`     changed: ${f.changeReason}`);
    }
    candidates.push({
      id: c.id,
      substation: c.substation,
      voltageKv: c.voltageKv,
      district: c.district,
      rationale: c.rationale,
      factors,
    });
  }

  const artifact: AnalysisArtifact = {
    generatedAt: new Date().toISOString(),
    generatedBy: "ingest/analyze.ts",
    model: useLlm ? MODEL : "none (--no-llm)",
    sourceDataset: d.retrieved,
    candidates,
  };

  writeFileSync(OUT_JSON, JSON.stringify(artifact, null, 1));
  console.log(`\nwrote ${OUT_JSON}`);
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
