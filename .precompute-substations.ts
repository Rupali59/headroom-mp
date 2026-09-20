/**
 * ONE-TIME PRECOMPUTE SCRIPT — not part of the Next.js app, not committed
 * to the repo. Run manually via tsx from the Grid project root:
 *
 *   npx tsx --tsconfig tsconfig.json <this file>
 *
 * WHY THIS EXISTS (Lane F report, see also src/app/data.ts's header):
 * `src/data/loader.ts`'s `loadSubstations()` requires a live MongoDB
 * connection (`src/lib/mongo.ts`'s `getDb()`), and Mongo is unreachable
 * from this machine (Atlas TLS handshake rejected — a real infra block,
 * not a code bug). `loader.ts` is Lane H's exclusive file and this lane
 * may not add a JSON-reading path to it. But `loader.ts` DOES export a
 * pure function, `aggregateSubstations(rows)`, that never touches Mongo —
 * it just reduces an array of raw rows. This script supplies that
 * function with rows read directly from `data-local/mpptcl-loading.json`
 * instead of from Mongo, producing the exact same shape Lane H's own
 * pipeline would if Mongo were reachable.
 *
 * The output, `data-local/substations.json`, is a SMALL derived artifact
 * (~17-19 entries) that `src/app/data.ts` statically imports. This is
 * deliberate, not a shortcut: `page.tsx` is a "use client" file (Lane 0's
 * frozen shape, D2's role switch), and anything it imports — even
 * transitively — gets bundled for the BROWSER by Next's client webpack
 * compiler. `loader.ts` imports `src/lib/mongo.ts`, which imports the
 * `mongodb` npm driver (uses many Node-only built-ins: net, tls, dns,
 * crypto, kerberos). Importing that chain from a client-bundled file
 * would either fail the client build outright or ship a driver that can
 * never run in a browser. Precomputing here, once, on this laptop (the
 * one that also runs `npm run build`, per BUILD.md D16's own "no compute
 * on Vercel" architecture) and shipping only the tiny reduced JSON keeps
 * Next's client bundle exactly as small as the 19-node map needs it to
 * be, and avoids a hydration mismatch: a bare `fs.readFileSync` inside a
 * module reachable from page.tsx would compute real data at build time
 * (Node, server-side prerender) and an EMPTY result at hydration time
 * (browser, no `fs`) — React would then detect the mismatch and could
 * blank the map back out the instant JS loads.
 *
 * NEVER FABRICATE, per the Lane F brief: if `data-local/mpptcl-loading.json`
 * is missing, this script writes an EMPTY `{ substations: [], loadDetails: [] }`
 * rather than inventing rows — `src/app/data.ts`'s static import always
 * succeeds either way, and an empty array is exactly what makes every
 * `GridMap` node render hatched (see that file's own verification note).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { aggregateSubstations, type SubstationLoad } from "./src/data/loader";
import { NODE_GEOMETRY, type NodeGeometry } from "./src/data/geometry";
import { GEOMETRY_TO_RAW_LABEL } from "./src/lib/substation-key";
import type {
  Substation,
  RiskFactor,
  RiskFactorName,
  Field,
  MonthlyObservation,
} from "./src/lib/types";

const GRID_ROOT = "/Users/rupali.b/Documents/GitHub/Rupali/Experiments/ClaudeBuild/Grid";
const SOURCE_JSON = join(GRID_ROOT, "data-local", "mpptcl-loading.json");
const OUT_JSON = join(GRID_ROOT, "data-local", "substations.json");

// Mirrors loader.ts's private LoadingDoc shape — duplicated for the same
// reason that file duplicates ingest/mongo-load.ts's: this script and the
// Next app are different toolchains, this keeps it self-contained.
interface RawLoadingRow {
  zone: string;
  district: string;
  circle: string;
  substation: string;
  voltage_class: string;
  installed_mva: number | null;
  peak_mva: number | null;
  peak_hour: number | null;
  peak_is_night: boolean | null;
  peak_date: string | null;
  min_mva: number | null;
  avg_mva: number | null;
  spare_at_peak_mva: number | null;
  month: string;
  source_url: string;
}

interface LoadingJson {
  source: string;
  index_url: string;
  retrieved: string;
  months_ok: number;
  months_failed: number;
  failures: Array<{ month: string; error: string }>;
  limits: string[];
  rows: RawLoadingRow[];
}

/**
 * SubstationLoadDetail — restated from src/components/map/load-panel.tsx
 * (Lane G's file, not importable cleanly from a standalone script without
 * pulling in "use client" React component code). Kept in sync by hand;
 * see the Lane F report for the same "two copies of one fact" note this
 * script's header already flags for GEOMETRY_LABEL_ALIAS.
 */
interface SparklinePoint {
  month: string;
  nightUtilisationPct: number | null;
}

interface SubstationLoadDetail {
  id: string;
  name: string;
  voltageKv: number;
  voltageClass: string | null;
  installedMva: Field<number> | null;
  nightPeakMva: Field<number> | null;
  spareAtNightMva: Field<number> | null;
  minMva: Field<number> | null;
  avgMva?: Field<number> | null;
  dayPeakMva?: Field<number> | null;
  spareAtDayMva?: Field<number> | null;
  monthlySeries?: SparklinePoint[] | null;
  observationCount: number;
  sourceUrl: string | null;
  asOf: string | null;
}

// ---------------------------------------------------------------------
// Risk-factor computation — DATA.md "Risk, revised". No lane in BUILD.md's
// ownership table, DATA.md's "Lane assignments" section, or the current
// Lane F/G/H/I split names an explicit owner for turning SubstationLoad
// into RiskFactor[]; src/lib/risk.ts (Lane H) holds only the ARITHMETIC
// over an already-built RiskFactor[] (countWeak/countUnknown/riskLevel),
// not the factor-scoring itself. This script does it because GridMap
// cannot render anything but hatched nodes without it, and DATA.md
// explicitly wants that collapse: "Hatching collapses from 15 nodes to
// near zero." FINDING for the report: this logic has no clear owner in
// the lane split and should get one on the next pass — flagged, not
// buried.
//
// DATA.md's five factors, and what's actually computable from the
// currently-ingested loading JSON:
//   1  night_utilisation >= 0.80                    COMPUTABLE (verified)
//   2  spare_at_night < requested_load               COMPUTABLE, using the
//      product's own named candidate load size (README.md / DESIGN.md:
//      "a 50-100 MW AI data centre" — 100 MW is the documented upper
//      bound, used here rather than invented)
//   3  winter night utilisation > monsoon by >20%     COMPUTABLE from the
//      per-node monthly series, for nodes with series coverage
//   4  single transformer at this voltage class        COMPUTABLE from the
//      raw sheet structure: does this raw label carry more than one
//      distinct voltage_class across its rows? (see AGGREGATION CHOICE #1
//      in loader.ts — the same rows this script also reads)
//   5  no augmentation scheduled within 24 months       NOT COMPUTABLE from
//      this data. DESIGN.md line 408 names three sites with a *researched*
//      answer (Kurawar, Neemuch pooling, Gadarwara-II) from the dossier,
//      but that fact is not ingested anywhere in this pipeline — using it
//      here would mean reaching into prose Lane F was not asked to parse.
//      Always "unknown", honestly, per rule:discernment-checks ("report
//      the mismatch rather than tuning until it agrees").
//
// With only factor 5 ever "unknown" for a node with real night data, the
// >=2-unknown hatch threshold (src/lib/risk.ts) is never hit by that
// alone — real measured nodes get real green/amber/red verdicts. A node
// with NO night data (nightPeakMva null) has factors 1-3 all unknown at
// once (4 total incl. factor 5), correctly hatching it — this is the
// Sendhwa case DATA.md caveat 6 already documents.

const CANDIDATE_LOAD_MW = 100; // README.md: "a 50-100 MW AI data centre" — the upper bound of the product's own named scenario, used as requested_load.

function riskField(v: number, unit: string, src: string, asOf: string, note: string): Field<string> {
  return { v: String(v), unit, conf: "verified", src, page: null, asOf, by: "ingest", at: Date.now(), note };
}

function computeLoadingRatioFactor(load: SubstationLoad): RiskFactor {
  if (!load.nightUtilisation) {
    return {
      name: "loading-ratio",
      score: "unknown",
      argument: `No night-time (19:00-06:00) peak recorded for ${load.rawLabel} across ${load.observationCount} months.`,
      source: null,
    };
  }
  const pct = load.nightUtilisation.v;
  const score = pct >= 80 ? "weak" : pct >= 65 ? "adequate" : "strong";
  return {
    name: "loading-ratio",
    score,
    argument: `Night peak is ${pct}% of installed capacity (worst recorded night, ${load.nightUtilisation.asOf}). DATA.md factor 1 threshold: >=80% is weak.`,
    source: riskField(pct, "%", load.nightUtilisation.src, load.nightUtilisation.asOf, "night peak_mva / installed_mva, worst recorded night."),
  };
}

function computeNightSupplyFactor(load: SubstationLoad): RiskFactor {
  if (!load.spareAtNightMva) {
    return {
      name: "night-supply-dependence",
      score: "unknown",
      argument: `No night-time peak recorded for ${load.rawLabel}, so spare-at-night is not computable.`,
      source: null,
    };
  }
  const spare = load.spareAtNightMva.v;
  const score = spare < CANDIDATE_LOAD_MW ? "weak" : spare < CANDIDATE_LOAD_MW * 1.5 ? "adequate" : "strong";
  return {
    name: "night-supply-dependence",
    score,
    argument: `${spare} MVA spare at worst recorded night peak, against a ${CANDIDATE_LOAD_MW} MW candidate load (README.md's own "50-100 MW AI data centre" framing, upper bound used).`,
    source: riskField(spare, "MVA", load.spareAtNightMva.src, load.spareAtNightMva.asOf, "installed_mva - night peak_mva, worst recorded night."),
  };
}

const WINTER_MONTHS = new Set(["december", "january", "february"]);
const MONSOON_MONTHS = new Set(["june", "july", "august", "september"]);

function seasonOf(monthLabel: string): "winter" | "monsoon" | null {
  const m = /^([A-Za-z]+)'\d{4}$/.exec(monthLabel.trim());
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (WINTER_MONTHS.has(name)) return "winter";
  if (MONSOON_MONTHS.has(name)) return "monsoon";
  return null;
}

function computeSeasonalFactor(load: SubstationLoad): RiskFactor {
  const winterPts = load.series.filter((m) => seasonOf(m.month) === "winter" && m.peakIsNight && m.utilisationPct !== null);
  const monsoonPts = load.series.filter((m) => seasonOf(m.month) === "monsoon" && m.peakIsNight && m.utilisationPct !== null);
  if (winterPts.length === 0 || monsoonPts.length === 0) {
    return {
      name: "seasonal-coincidence",
      score: "unknown",
      argument: `Winter n=${winterPts.length}, monsoon n=${monsoonPts.length} night observations — insufficient seasonal coverage to compare (DATA.md: "winter sample is thin", n=115 across the whole dataset).`,
      source: null,
    };
  }
  const winterAvg = winterPts.reduce((s, m) => s + (m.utilisationPct as number), 0) / winterPts.length;
  const monsoonAvg = monsoonPts.reduce((s, m) => s + (m.utilisationPct as number), 0) / monsoonPts.length;
  const relDiff = monsoonAvg > 0 ? (winterAvg - monsoonAvg) / monsoonAvg : 0;
  const score = relDiff > 0.2 ? "weak" : relDiff > 0.05 ? "adequate" : "strong";
  return {
    name: "seasonal-coincidence",
    score,
    argument: `Winter night utilisation ${winterAvg.toFixed(1)}% (n=${winterPts.length}) vs. monsoon ${monsoonAvg.toFixed(1)}% (n=${monsoonPts.length}) — ${(relDiff * 100).toFixed(0)}% relative difference. DATA.md factor 3 threshold: >20% is weak.`,
    source: riskField(relDiff * 100, "%", load.rawLabel, "multi-month", "Winter-vs-monsoon night utilisation, this node's own series only (not the whole-dataset 16% figure)."),
  };
}

function computeSingleTransformerFactor(load: SubstationLoad, distinctClassCount: number): RiskFactor {
  const score = distinctClassCount <= 1 ? "weak" : "strong";
  return {
    name: "single-transformer-exposure",
    score,
    argument:
      distinctClassCount <= 1
        ? `Only one voltage class ("${load.voltageClass}") published for "${load.rawLabel}" across the sheet — no redundant transformer class recorded at this site.`
        : `${distinctClassCount} distinct voltage classes published for "${load.rawLabel}" (primary: "${load.voltageClass}") — multiple parallel transformer classes at this site.`,
    source: riskField(distinctClassCount, "classes", load.rawLabel, "multi-month", "Count of distinct voltage_class values for this raw substation label across the 27,680-row sheet."),
  };
}

function plannedOutageFactor(): RiskFactor {
  return {
    name: "planned-outage",
    score: "unknown",
    argument:
      "Augmentation-schedule data is not ingested by this pipeline. DESIGN.md line 408 names three researched sites (Kurawar, Neemuch pooling, Gadarwara-II) from the dossier, but that fact lives in prose, not in data-local/mpptcl-loading.json — using it here would be reaching past what this lane was asked to wire.",
    source: null,
  };
}

function computeRiskFactors(load: SubstationLoad, distinctClassCount: number): RiskFactor[] {
  return [
    computeLoadingRatioFactor(load),
    computeNightSupplyFactor(load),
    computeSeasonalFactor(load),
    computeSingleTransformerFactor(load, distinctClassCount),
    plannedOutageFactor(),
  ];
}

// ---------------------------------------------------------------------

function main() {
  let raw: LoadingJson | null = null;
  if (existsSync(SOURCE_JSON)) {
    try {
      raw = JSON.parse(readFileSync(SOURCE_JSON, "utf-8")) as LoadingJson;
    } catch (err) {
      console.error(`[precompute] Failed to parse ${SOURCE_JSON}:`, err);
      raw = null;
    }
  } else {
    console.warn(`[precompute] ${SOURCE_JSON} does not exist. Writing an empty dataset — never fabricating rows.`);
  }

  if (!raw || !Array.isArray(raw.rows) || raw.rows.length === 0) {
    writeFileSync(OUT_JSON, JSON.stringify({ substations: [], loadDetails: [] }, null, 2));
    console.log(`[precompute] Wrote empty dataset to ${OUT_JSON} (source missing or empty).`);
    return;
  }

  const loads = aggregateSubstations(raw.rows);
  const byRawLabel = new Map<string, SubstationLoad>(loads.map((l) => [l.rawLabel, l]));

  // Distinct voltage_class count per raw label, from the FULL raw rows
  // (not the class-filtered aggregate) — factor 4 needs to see every
  // class recorded at a site, not just the one aggregateSubstations()
  // picked as primary.
  const classesByLabel = new Map<string, Set<string>>();
  for (const r of raw.rows) {
    if (r.installed_mva === null) continue;
    let set = classesByLabel.get(r.substation);
    if (!set) {
      set = new Set();
      classesByLabel.set(r.substation, set);
    }
    set.add(r.voltage_class);
  }

  const substations: Substation[] = [];
  const loadDetails: SubstationLoadDetail[] = [];

  for (const geo of NODE_GEOMETRY as readonly NodeGeometry[]) {
    const rawLabel = GEOMETRY_TO_RAW_LABEL[geo.id];
    if (!rawLabel) continue; // suky, manglia — no entry emitted, renders hatched by GridMap's own default.

    const load = byRawLabel.get(rawLabel);
    if (!load) {
      console.warn(`[precompute] FINDING: geometry id "${geo.id}" maps to raw label "${rawLabel}", but that label is not present in aggregateSubstations()'s output. Skipping — renders hatched.`);
      continue;
    }

    const distinctClasses = classesByLabel.get(rawLabel)?.size ?? 1;
    const riskFactors = computeRiskFactors(load, distinctClasses);

    substations.push({
      id: geo.id,
      name: geo.name,
      voltageKv: geo.voltageKv,
      lat: geo.lat,
      lon: geo.lon,
      capacity: load.installedMva,
      riskFactors,
      quality: load.quality,
      series: load.series as MonthlyObservation[],
    });

    const monthlySeries: SparklinePoint[] = load.series.map((m) => ({
      month: m.month,
      nightUtilisationPct: m.peakIsNight ? m.utilisationPct : null,
    }));

    loadDetails.push({
      id: geo.id,
      name: geo.name,
      voltageKv: geo.voltageKv,
      voltageClass: load.voltageClass,
      installedMva: load.installedMva,
      nightPeakMva: load.nightPeakMva,
      spareAtNightMva: load.spareAtNightMva,
      minMva: load.minMva,
      avgMva: null, // GAP — avg_mva not surfaced by loader.ts's SubstationLoad; load-panel.tsx already documents this as an open gap.
      dayPeakMva: null, // GAP — no day-side aggregate in loader.ts today; load-panel.tsx already documents this.
      spareAtDayMva: null,
      monthlySeries: monthlySeries.length > 0 ? monthlySeries : null,
      observationCount: load.observationCount,
      sourceUrl: load.installedMva.src,
      asOf: load.installedMva.asOf,
    });
  }

  writeFileSync(OUT_JSON, JSON.stringify({ substations, loadDetails }, null, 2));
  console.log(`[precompute] Wrote ${substations.length} substations, ${loadDetails.length} load details to ${OUT_JSON}.`);
  console.log(`[precompute] Unmatched geometry ids (expected: suky, manglia): ${NODE_GEOMETRY.filter((g) => !(g.id in GEOMETRY_TO_RAW_LABEL)).map((g) => g.id).join(", ")}`);
}

main();
