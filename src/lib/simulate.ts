/**
 * What-if simulation and 55-month backtest — Lane K, DATA.md "What we now
 * hold" / "Risk, revised" / "Caveats that ride with every number".
 *
 * Pure arithmetic, no React, no fetch, no MongoDB — every export here is a
 * plain function over `Substation`/`MonthlyObservation` from `./types`
 * (Lane H's shared contract) so `tests/simulate.test.ts` can pin it without
 * rendering anything, mirroring `src/lib/risk.ts`'s own D17 contract-test
 * shape.
 *
 * DEPENDENCY NOTE (brief-vs-reality, reported per instructions): the brief
 * for this lane was written before Lane H's per-month series landed on
 * `Substation`, and told this lane to define a local interface for the
 * series shape if it was still absent. By the time this file was written,
 * `src/lib/types.ts` already carried `Substation.series: MonthlyObservation[]`
 * with exactly the fields the brief predicted ("month, peak_mva, installed_mva,
 * peak_is_night, peak_hour, peak_date, night_utilisation") under their
 * camelCase names (`peakMva`, `installedMva`, `peakIsNight`, `peakHour`,
 * `peakDate`, `utilisationPct`), PLUS a per-reading `DataQuality` field this
 * lane did not anticipate but which turns out to be exactly the mechanism
 * DATA.md caveat 5 asks for — see the DATA-QUALITY verdict below, which
 * consumes it directly instead of re-deriving an exceedance check. No local
 * interface was needed; this file imports `Substation`/`MonthlyObservation`
 * straight from `./types`, per that file's own instruction not to
 * redeclare shared contracts locally.
 *
 * THE MODEL (brief, verbatim arithmetic):
 *
 *   required_mva = load_mw / POWER_FACTOR
 *   new_peak     = peak_mva + required_mva   // a flat 24x7 load adds at
 *                                             // EVERY hour, so the binding
 *                                             // case is that month's worst
 *                                             // hour — no separate "was it
 *                                             // already the peak hour"
 *                                             // check is needed
 *   verdict      = new_peak > installed_mva      -> FAILED
 *                  new_peak > 0.9 * installed    -> MARGINAL
 *                  otherwise                     -> FITS
 *
 * NO N-1 DERATE. Deliberately. n-1 at a two-ICT station is roughly a 50%
 * derate, not a flat multiplier, and single-transformer exposure is
 * ALREADY risk factor 5 (`RiskFactorName` "single-transformer-exposure" in
 * `./types`, DATA.md "Risk, revised" factor 4). Applying an n-1 haircut
 * HERE as well would double-count the same physical fact once as a hard
 * MVA penalty and again as a risk-factor score. If you are reading this
 * because you were about to add one: don't — score it as a risk factor
 * instead, where it already has a home.
 */

import type { DataQuality, MonthlyObservation, Substation } from "./types";

/** Assumed power factor converting a requested MW load to the MVA it
 * draws on the transformer. DATA.md's model names this exact constant;
 * kept as a single named export so it can be shown on screen next to the
 * result it produced — design-system/MASTER.md's what-if requirement:
 * "the power factor must be visible on the result, not buried in code." */
export const POWER_FACTOR = 0.95;

/**
 * The MARGINAL band, as a fraction of installed capacity. 0.9 rather than
 * left unstated: DATA.md's own risk arithmetic already treats
 * `night_utilisation >= 0.80` as a weak factor (factor 1), i.e. the
 * product already calls 80% "worth flagging" for a station's *existing*
 * peak. A hypothetical load is a firmer commitment than an observed peak
 * (it is proposed to run there 24x7, not just at one recorded hour), so
 * the bar for "still fine, but says so" is set tighter than the existing
 * observational flag — one ring closer to the hard limit, at 90% of
 * installed capacity, rather than reusing 80% verbatim. If this number is
 * ever revisited, revisit it together with `risk.ts`'s 0.80, since they
 * are answering related but not identical questions (observed vs.
 * hypothetical loading).
 */
export const MARGINAL_BAND = 0.9;

/** A verdict this module can return. Distinct from `RiskLevel` (`./risk`)
 * on purpose — that type answers "how risky is this node's own factor
 * scoring"; this one answers "does a specific hypothetical MW load fit,
 * for a specific month". `DATA-QUALITY` and `NO-DATA` are both "no
 * confident verdict", but for different reasons, and both must be
 * distinguishable from a real FITS — see `SimulateResult.verdict` below. */
export type Verdict = "FITS" | "MARGINAL" | "FAILED" | "DATA-QUALITY" | "NO-DATA";

export interface SimulateResult {
  month: string;
  /** load_mw / POWER_FACTOR, always computed — this is a property of the
   * hypothetical load itself, not of the station, so it is populated even
   * when the verdict can't be trusted. */
  requiredMva: number;
  /** peak_mva + requiredMva for this month, or null when there is no
   * trustworthy peak_mva/installed_mva to add it to (NO-DATA/DATA-QUALITY). */
  newPeakMva: number | null;
  /** installed_mva - newPeakMva, or null under the same conditions as
   * newPeakMva. Negative when the verdict is FAILED — the shortfall, not
   * clamped to zero, so "by how much" is visible on the result. */
  headroomAfterMva: number | null;
  verdict: Verdict;
  /** The reading's own data-quality classification (DATA.md caveat 5),
   * passed through so a caller/component doesn't have to re-derive why a
   * DATA-QUALITY verdict fired. "ok" for NO-DATA months too — there is
   * nothing to be suspicious of when there is no reading at all. */
  quality: DataQuality;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * simulateAt(sub, month, loadMw) — DATA.md's model, for one substation and
 * one of its own ingested months. `month` must be one of `sub.series[].month`
 * (the raw sheet label, e.g. "July'2026"); a month the substation has no
 * reading for returns a NO-DATA verdict rather than throwing, since a
 * caller driving this from a shared 55-month timeline (this lane's
 * `timeline.tsx`) will routinely scrub to a month a given node has a gap
 * in — DATA.md: "no fabricated zero," the same rule Lane G's sparkline
 * already applies to gaps.
 *
 * loadMw === 0 is a valid call and is how `timeline.tsx` renders each
 * node's OWN current state (no hypothetical load placed yet) using this
 * exact same verdict arithmetic, rather than inventing a second set of
 * thresholds for "today's state" vs. "what-if state" — with loadMw 0,
 * requiredMva is 0 and newPeakMva collapses to the station's own recorded
 * peak_mva for that month.
 */
export function simulateAt(sub: Substation, month: string, loadMw: number): SimulateResult {
  const requiredMva = round2(loadMw / POWER_FACTOR);
  const obs = sub.series.find((o) => o.month === month);

  if (!obs) {
    return { month, requiredMva, newPeakMva: null, headroomAfterMva: null, verdict: "NO-DATA", quality: "ok" };
  }

  if (obs.quality !== "ok") {
    // DATA.md caveat 5: "A node in that state must NOT return a confident
    // verdict — return an explicit data-quality state instead." The
    // reading itself (peak vs. installed, already >100% in the source) is
    // suspect, so adding a hypothetical load on top of it would compound
    // an untrustworthy number with a confident-looking one.
    return { month, requiredMva, newPeakMva: null, headroomAfterMva: null, verdict: "DATA-QUALITY", quality: obs.quality };
  }

  if (obs.peakMva === null || obs.installedMva === null) {
    return { month, requiredMva, newPeakMva: null, headroomAfterMva: null, verdict: "NO-DATA", quality: obs.quality };
  }

  const newPeakMva = round2(obs.peakMva + requiredMva);
  const headroomAfterMva = round2(obs.installedMva - newPeakMva);

  let verdict: Verdict;
  if (newPeakMva > obs.installedMva) verdict = "FAILED";
  else if (newPeakMva > MARGINAL_BAND * obs.installedMva) verdict = "MARGINAL";
  else verdict = "FITS";

  return { month, requiredMva, newPeakMva, headroomAfterMva, verdict, quality: obs.quality };
}

/**
 * Winter detection over the raw month label. `Substation.series` is typed
 * (`./types` `MonthlyObservation.month` doc comment) to contain ONLY
 * entries whose month parsed against the clean "MonthName'Year" form — "9%
 * are bare filename stems... Only rows whose month parses appear in a
 * series" — so, unlike the raw ingest JSON, every label this function will
 * ever see from a `Substation.series` is guaranteed to match this pattern.
 * Written independently of `src/components/map/sparkline.tsx`'s own
 * `isWinterMonth` (same name, same intent, Lane G's file, not imported
 * here — this lane doesn't reach into another lane's component module for
 * a five-line helper; loader.ts's own header documents the same
 * independent-duplication choice for the same reason: different lanes
 * building in parallel).
 */
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

const WINTER_MONTH_INDICES = new Set([11, 0, 1]); // Dec, Jan, Feb — DATA.md's winter-night window

function parseMonthIndex(label: string): number | null {
  const m = /^([A-Za-z]+)'(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const idx = MONTH_NAMES.indexOf(m[1].toLowerCase() as (typeof MONTH_NAMES)[number]);
  return idx < 0 ? null : idx;
}

/** Sortable integer key: year*100 + monthIndex. Used to order months
 * across substations whose series don't share the exact same set of
 * months (55 ingested, not every node has all 55). Returns null for a
 * label that doesn't parse — per the doc above this should not happen for
 * anything actually inside a `Substation.series`, but the null path is
 * kept rather than assumed away, per rule:discernment-checks §2 (absence
 * must be attributable, never silently coerced to a sort position that
 * looks meaningful). */
export function monthSortKey(label: string): number | null {
  const m = /^([A-Za-z]+)'(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const idx = parseMonthIndex(label);
  if (idx === null) return null;
  return Number(m[2]) * 100 + idx;
}

export function isWinterMonth(label: string): boolean {
  const idx = parseMonthIndex(label);
  return idx !== null && WINTER_MONTH_INDICES.has(idx);
}

/** Union of every month appearing in any of the given substations' series,
 * sorted chronologically ascending. This is "the 55 ingested months" the
 * timeline scrubs across — a union because not every node has all 55
 * (DATA.md: 55 of 60 months ingested overall; individual nodes vary
 * further, e.g. Birsinghpur's install-capacity change mid-series). A
 * label that fails to parse (should not occur — see `monthSortKey` above)
 * is sorted after every parseable month rather than dropped, so it stays
 * visible/attributable instead of silently disappearing from the strip. */
export function allMonths(subs: readonly Substation[]): string[] {
  const set = new Set<string>();
  for (const sub of subs) for (const obs of sub.series) set.add(obs.month);
  return Array.from(set).sort((a, b) => {
    const ka = monthSortKey(a);
    const kb = monthSortKey(b);
    if (ka === null && kb === null) return a.localeCompare(b);
    if (ka === null) return 1;
    if (kb === null) return -1;
    return ka - kb;
  });
}

/** How much of a backtest's failure set falls in Dec/Jan/Feb before it
 * counts as "the failures cluster in winter" rather than "failures happen
 * to include some winter months". 0.8 rather than 1.0 (literally every
 * failure) so one shoulder-season month (a November cold snap, a March
 * heatwave) doesn't erase a real seasonal thesis; 0.8 rather than a
 * majority-only 0.5 so a genuinely mixed failure set doesn't get
 * over-claimed as seasonal. Exported so a caller/test can reference the
 * exact bound rather than a magic number. */
export const WINTER_CLUSTER_THRESHOLD = 0.8;

export interface SeasonalSummary {
  winterFailedMonths: string[];
  nonWinterFailedMonths: string[];
  winterFailedCount: number;
  nonWinterFailedCount: number;
  /** winterFailedCount / failedCount, or null when there were no failures
   * at all — there is nothing to take a share OF, and 0 would read as "no
   * winter concentration" rather than "not applicable". */
  winterShareOfFailures: number | null;
  /** True only when there is at least one failure AND its winter share
   * clears WINTER_CLUSTER_THRESHOLD. DATA.md's winter-night thesis, proven
   * or disproven per node — this is the single most valuable field this
   * lane produces. */
  clustersInWinter: boolean;
}

export interface BacktestResult {
  subId: string;
  subName: string;
  loadMw: number;
  /** One verdict per month in `sub.series`, in the same (ascending)
   * chronological order — the raw material for the 55-month strip. */
  months: SimulateResult[];
  totalMonths: number;
  failedMonths: string[];
  failedCount: number;
  marginalMonths: string[];
  marginalCount: number;
  /** Months where the READING itself (not the hypothetical load) was
   * flagged — DATA.md caveat 5. Reported separately from failed/marginal
   * because it is a different kind of "not good news": the arithmetic
   * couldn't be trusted, not that it was trusted and came out bad. */
  dataQualityMonths: string[];
  dataQualityCount: number;
  seasonal: SeasonalSummary;
}

/**
 * backtest(sub, loadMw) — the 55-month pass/fail pass over one
 * substation's own ingested history, PLUS DATA.md's seasonal-clustering
 * question answered explicitly rather than left for a caller to eyeball
 * off a strip of dots.
 */
export function backtest(sub: Substation, loadMw: number): BacktestResult {
  const months = sub.series.map((obs) => simulateAt(sub, obs.month, loadMw));

  const failedMonths = months.filter((m) => m.verdict === "FAILED").map((m) => m.month);
  const marginalMonths = months.filter((m) => m.verdict === "MARGINAL").map((m) => m.month);
  const dataQualityMonths = months.filter((m) => m.verdict === "DATA-QUALITY").map((m) => m.month);

  const winterFailedMonths = failedMonths.filter(isWinterMonth);
  const nonWinterFailedMonths = failedMonths.filter((m) => !isWinterMonth(m));
  const winterShareOfFailures =
    failedMonths.length > 0 ? round2(winterFailedMonths.length / failedMonths.length) : null;
  const clustersInWinter =
    failedMonths.length > 0 && (winterShareOfFailures ?? 0) >= WINTER_CLUSTER_THRESHOLD;

  return {
    subId: sub.id,
    subName: sub.name,
    loadMw,
    months,
    totalMonths: sub.series.length,
    failedMonths,
    failedCount: failedMonths.length,
    marginalMonths,
    marginalCount: marginalMonths.length,
    dataQualityMonths,
    dataQualityCount: dataQualityMonths.length,
    seasonal: {
      winterFailedMonths,
      nonWinterFailedMonths,
      winterFailedCount: winterFailedMonths.length,
      nonWinterFailedCount: nonWinterFailedMonths.length,
      winterShareOfFailures,
      clustersInWinter,
    },
  };
}

export interface BalanceCombo {
  subIds: string[];
  subNames: string[];
  splitCount: number;
  /** loadMw / splitCount, evenly split — DESIGN.md doesn't specify an
   * uneven-split search, and an even split is the honest "if we spread it
   * flat" reading of "can the load be balanced across nodes". */
  perNodeLoadMw: number;
  /** Per node in the combo, which of ITS OWN months would fail at
   * perNodeLoadMw — always empty arrays in a surviving combo (kept rather
   * than dropped so the shape is uniform and a caller can print "0 of 55"
   * rather than infer zero from absence). */
  failedMonthsByNode: Record<string, string[]>;
  /** Per node, how many months were DATA-QUALITY rather than a confident
   * verdict. A combo can "survive" (zero FAILED months) while still
   * carrying data-quality exceptions — this is reported rather than
   * hidden, per DATA.md caveat 5. */
  dataQualityCountByNode: Record<string, number>;
}

export interface BalanceResult {
  loadMw: number;
  splitsTried: number[];
  combosEvaluated: number;
  /** Only the combinations with ZERO failed months across every node in
   * the combination, across that node's own full ingested history — "the
   * surviving combinations", per the brief's own phrasing of this
   * function's job. */
  survivors: BalanceCombo[];
}

/** Safety cap on how many (splitCount, node-combination) pairs `balance()`
 * will evaluate before refusing to run. `subs` is meant to be a short,
 * curated candidate list (a handful of worklist nodes), not the full
 * 432-substation network — at 432 choose even 3 that is tens of millions
 * of combinations, and this cap turns an accidental full-network call into
 * a clear error instead of a multi-minute hang. */
export const MAX_BALANCE_COMBINATIONS = 2000;

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
}

function* kCombinations<T>(items: readonly T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  if (k > items.length) return;
  const [first, ...rest] = items;
  for (const combo of kCombinations(rest, k - 1)) yield [first, ...combo];
  yield* kCombinations(rest, k);
}

/**
 * balance(subs, loadMw, splits) — "can the load be split across nodes so
 * that ZERO months fail?" For each split count `n` in `splits` (e.g.
 * `[1, 2, 3]` — try it unsplit, then across every pair, then every triple
 * of `subs`), every n-combination of `subs` is tried with `loadMw / n` at
 * each member node, over that node's own full ingested history. A
 * combination survives only if EVERY node in it has zero FAILED months at
 * its share of the load.
 *
 * `splits` containing 1 is what makes "a single node can't take it, but
 * splitting across two can" visible as a contrast in the same result set,
 * rather than needing a separate single-node call.
 */
export function balance(
  subs: readonly Substation[],
  loadMw: number,
  splits: readonly number[],
): BalanceResult {
  const splitsTried = Array.from(new Set(splits))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= subs.length)
    .sort((a, b) => a - b);

  const combosEvaluated = splitsTried.reduce((sum, n) => sum + binomial(subs.length, n), 0);
  if (combosEvaluated > MAX_BALANCE_COMBINATIONS) {
    throw new Error(
      `balance(): ${combosEvaluated} combinations across splits [${splitsTried.join(", ")}] over ` +
        `${subs.length} candidate substations exceeds the ${MAX_BALANCE_COMBINATIONS}-combination safety ` +
        `cap. Pass a shorter candidate list (e.g. a worklist selection, not the whole network).`,
    );
  }

  const survivors: BalanceCombo[] = [];
  for (const n of splitsTried) {
    const perNodeLoadMw = round2(loadMw / n);
    for (const combo of kCombinations(subs, n)) {
      const failedMonthsByNode: Record<string, string[]> = {};
      const dataQualityCountByNode: Record<string, number> = {};
      let allSurvive = true;
      for (const s of combo) {
        const bt = backtest(s, perNodeLoadMw);
        failedMonthsByNode[s.id] = bt.failedMonths;
        dataQualityCountByNode[s.id] = bt.dataQualityCount;
        if (bt.failedCount > 0) allSurvive = false;
      }
      if (allSurvive) {
        survivors.push({
          subIds: combo.map((s) => s.id),
          subNames: combo.map((s) => s.name),
          splitCount: n,
          perNodeLoadMw,
          failedMonthsByNode,
          dataQualityCountByNode,
        });
      }
    }
  }

  return { loadMw, splitsTried, combosEvaluated, survivors };
}

/** Per-month reading, re-exported for callers that want the raw type name
 * without importing `./types` directly. */
export type { MonthlyObservation };
