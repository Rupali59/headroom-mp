/**
 * Build-time loader — Lane E, DATA.md "What we now hold" / "Lane
 * assignments against this file". Reads the `loading` collection MongoDB
 * (loaded by `ingest/mongo-load.ts` from `data-local/mpptcl-loading.json`,
 * 27,680 rows / 55 months / 432 substations) and aggregates it into one
 * record per substation for the map and risk arithmetic to consume.
 *
 * BUILD.md D16: this only ever runs on the laptop that holds `MONGODB_URI`
 * — at `npm run ingest` / `npm run build` time, never on Vercel. Callers
 * (Lane A's map, ultimately) should call `loadSubstations()` from a
 * build-time context and bake the result into the static export; this file
 * does not itself decide how that wiring happens, since `page.tsx` is
 * frozen and `src/components/map/grid-map.tsx` is Lane A's.
 *
 * DATA CONTRACT WITH LANE A (DATA.md): geometry (lat/lon, the MP outline,
 * city positions — `src/data/geometry.ts`) is cartographic and static; this
 * file is the ingested, changing half. The two are composed by id — see
 * `slugifySubstation()` below for how that id is derived. That composition
 * key is NOT specified anywhere in DATA.md/BUILD.md beyond "the map
 * composes them"; it is asserted here and flagged in the Lane E report as
 * something the integrator should confirm against whatever key
 * `geometry.ts` actually uses.
 *
 * ============================================================================
 * AGGREGATION CHOICE — DATA.md caveat 2: "Rows are per voltage class.
 * `400KV KATNI` has separate 400/220/132 kV rows. Aggregate or class-select
 * deliberately, never silently." This is the deliberate choice, and why:
 * ============================================================================
 *
 * Measured directly against `data-local/mpptcl-loading.json` while writing
 * this file: the raw `substation` label is NOT a unique (station, class)
 * key by itself. A single label like "400KV KATNI" carries THREE rows per
 * month under that exact string — one per transformer voltage class (400KV,
 * 220KV, 132KV) — because the sheet's SUBSTATION column names the site, not
 * the transformer. Grouping by the raw label alone and taking, say, the max
 * peak across those three rows silently mixes three electrically distinct
 * transformer sets into one series.
 *
 * The choice made here: for each raw substation label, and independently
 * for each month, select the ONE voltage-class row with the largest
 * `installed_mva` — the site's primary/EHV transformer for that month — and
 * build that label's time series from those primary-class rows only. Then,
 * across that series:
 *
 *   - installedMva / nightPeakMva / spareAtNightMva all come from the SAME
 *     row: the one with the highest peak_mva among rows where
 *     peak_is_night is true. Reporting all three from one row keeps
 *     spare = installed - peak internally consistent — pairing installed
 *     capacity from one month with a peak from a different month (capacity
 *     changes: Bhopal's installed_mva takes three different values across
 *     its 55 months, 1260 -> 1445 -> 1630, i.e. an augmentation happened)
 *     would silently misstate spare capacity.
 *   - minMva is the minimum min_mva across the WHOLE series (DATA.md caveat
 *     3: "min_mva is the floor" — the lowest ever recorded, not tied to the
 *     peak month).
 *   - observationCount is the number of months contributing to the primary
 *     series (one per month, after class-selection).
 *
 * VALIDATION: this method was checked by hand against all 15 rows of
 * DATA.md's own worked table before being written into this file. 14 of 15
 * reproduce DATA.md's installed/night-peak/spare numbers exactly (to its
 * stated rounding). The one exception — Sendhwa — is reported honestly in
 * the Lane E report rather than adjusted to fit: this pipeline finds no
 * night-time peak at all for "220KV SENDHWA" (every recorded peak across
 * its 54 months falls in daytime hours), where DATA.md's table shows a
 * night peak of 93 MVA. Per rule:discernment-checks — a surprising mismatch
 * is a finding to report, never something to quietly tune toward.
 */

import { getDb } from "@/lib/mongo";
import type { Confidence, Field } from "@/lib/types";

/** Mirrors `ingest/mongo-load.ts`'s `RawLoadingRow` — the shape of one
 * document in the `loading` collection. Duplicated rather than imported:
 * `ingest/` and `src/` are built by different toolchains (tsx vs Next's
 * bundler) and this keeps `src/data/loader.ts` self-contained for the
 * Next build. */
interface LoadingDoc {
  substation: string;
  voltage_class: string;
  zone: string;
  district: string;
  circle: string;
  installed_mva: number | null;
  peak_mva: number | null;
  peak_hour: number | null;
  peak_is_night: boolean | null;
  min_mva: number | null;
  avg_mva: number | null;
  spare_at_peak_mva: number | null;
  month: string;
  source_url: string;
}

const SOURCE_ID = "mpptcl-loading";

/**
 * Strips a leading voltage-class token ("400KV ", "220/33KV ", …) from a raw
 * sheet label and returns a lowercase, hyphenated id. Exported so a
 * consuming lane can derive the same key from a plain city name without
 * importing the rest of this module's Mongo dependency.
 */
export function slugifySubstation(rawLabel: string): string {
  const withoutVoltage = rawLabel.replace(/^\d+(?:\/\d+)?\s*KV\s+/i, "");
  return withoutVoltage
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Best-effort Title Case for a display name. The sheet is ALL CAPS; this
 * is cosmetic, not a data-quality claim. */
function titleCase(withoutVoltage: string): string {
  return withoutVoltage
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function displayName(rawLabel: string): string {
  const withoutVoltage = rawLabel.replace(/^\d+(?:\/\d+)?\s*KV\s+/i, "");
  return titleCase(withoutVoltage || rawLabel);
}

/**
 * Best-effort chronological key for a raw month label. Most labels are the
 * clean "MonthName'Year" the Python parser's discovery emits (e.g.
 * "July'2026"); a minority are bare filename stems (e.g.
 * "MAX-LOADI-JULY-21092022") that this does not attempt to parse. Returns
 * null when unparseable — callers must treat that as "no ordering
 * information", never as epoch 0, which would sort a mystery label as the
 * oldest possible month.
 */
function parseMonthLabel(label: string): number | null {
  const m = /^([A-Za-z]+)'(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const monthIdx = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ].indexOf(m[1].toLowerCase());
  if (monthIdx < 0) return null;
  return Date.UTC(Number(m[2]), monthIdx, 1);
}

/** One sourced fact, tagged `verified` per DATA.md's revised confidence
 * ladder: "verified: MPPTCL loading sheet or a cited PDF, with month and
 * source URL — solid." */
function verifiedField(
  v: number,
  unit: string,
  row: LoadingDoc,
  note: string,
): Field<number> {
  const conf: Confidence = "verified";
  return {
    v,
    unit,
    conf,
    src: row.source_url,
    page: null, // spreadsheet row, not a paginated document
    asOf: row.month,
    by: "ingest",
    at: Date.now(),
    note,
  };
}

export interface SubstationLoad {
  /** Derived, hyphenated key — see `slugifySubstation()`. */
  id: string;
  /** Best-effort Title Case display name, voltage-class prefix stripped. */
  name: string;
  /** The voltage class selected as this label's primary/EHV transformer
   * ("400KV", "220KV", …) — see the file-header aggregation note. */
  voltageClass: string;
  /** The raw sheet label this was read from, e.g. "400KV KATNI". Kept for
   * traceability back to the source rows. */
  rawLabel: string;
  zone: string;
  district: string;
  circle: string;
  installedMva: Field<number>;
  /** Null when no night-time (19:00-06:00) peak was ever recorded for this
   * substation's primary class across the 55 months — see the Sendhwa
   * caveat in the file header. A null here means "no night data", never 0. */
  nightPeakMva: Field<number> | null;
  spareAtNightMva: Field<number> | null;
  /** Null under the same condition as nightPeakMva. */
  minMva: Field<number> | null;
  /** Percent (0-100), `peakMva / installedMva` from the same worst-night
   * row as nightPeakMva. Null under the same condition. */
  nightUtilisation: Field<number> | null;
  /** Count of months contributing to this label's primary-class series
   * (after class-selection — see file header). */
  observationCount: number;
}

/**
 * Reads the `loading` collection and returns one record per distinct raw
 * substation label (432 in the current data — DATA.md "distinct
 * substations 432"). Call at build time only (`npm run build`, or
 * `npm run ingest`'s verification step) — this opens a MongoDB connection
 * and will throw per `src/lib/mongo.ts` if MONGODB_URI/MONGODB_DB are
 * unset, which is correct on Vercel (BUILD.md D16: Vercel never runs this).
 */
export async function loadSubstations(): Promise<SubstationLoad[]> {
  const db = await getDb();
  const rows = await db
    .collection<LoadingDoc>("loading")
    .find({}, { projection: { _id: 0 } })
    .toArray();

  // Group by raw label, then by month, selecting the max-installed_mva row
  // per month as that month's primary/EHV class — the class-selection this
  // file's header documents.
  const byLabel = new Map<string, Map<string, LoadingDoc>>();
  for (const r of rows) {
    if (r.installed_mva === null) continue;
    let byMonth = byLabel.get(r.substation);
    if (!byMonth) {
      byMonth = new Map();
      byLabel.set(r.substation, byMonth);
    }
    const existing = byMonth.get(r.month);
    if (!existing || (r.installed_mva ?? -Infinity) > (existing.installed_mva ?? -Infinity)) {
      byMonth.set(r.month, r);
    }
  }

  const out: SubstationLoad[] = [];

  for (const [rawLabel, byMonth] of byLabel) {
    const series = Array.from(byMonth.values());
    if (series.length === 0) continue;

    // installedMva / nightPeakMva / spareAtNightMva / nightUtilisation all
    // come from the single row with the largest night-time peak — see
    // "AGGREGATION CHOICE" above for why they must be paired, not mixed
    // across months.
    const nightRows = series.filter((r) => r.peak_is_night && r.peak_mva !== null);
    const worstNight =
      nightRows.length > 0
        ? nightRows.reduce((a, b) => ((b.peak_mva ?? -Infinity) > (a.peak_mva ?? -Infinity) ? b : a))
        : null;

    // installedMva always needs a value even when there's no night peak —
    // fall back to the most recently parseable month, or the first row in
    // iteration order when no label in the series parses (documented
    // limitation: parseMonthLabel() only handles the clean "Month'Year"
    // form, ~91% of labels in the current data).
    const referenceRow =
      worstNight ??
      series.reduce((latest, r) => {
        const rDate = parseMonthLabel(r.month);
        const latestDate = parseMonthLabel(latest.month);
        if (rDate === null) return latest;
        if (latestDate === null) return r;
        return rDate > latestDate ? r : latest;
      }, series[0]);

    const installedMva = verifiedField(
      referenceRow.installed_mva as number,
      "MVA",
      referenceRow,
      worstNight
        ? "Installed capacity as of this substation's worst recorded night-time peak."
        : "Installed capacity — no night-time peak recorded for this substation in 55 months; best-effort most-recent month used.",
    );

    let nightPeakMva: Field<number> | null = null;
    let spareAtNightMva: Field<number> | null = null;
    let nightUtilisation: Field<number> | null = null;

    if (worstNight && worstNight.peak_mva !== null && worstNight.installed_mva !== null) {
      nightPeakMva = verifiedField(
        worstNight.peak_mva,
        "MVA",
        worstNight,
        "Worst (highest) recorded night-time (19:00-06:00) simultaneous maximum across 55 months.",
      );
      const spare = Math.round((worstNight.installed_mva - worstNight.peak_mva) * 100) / 100;
      spareAtNightMva = verifiedField(
        spare,
        "MVA",
        worstNight,
        "installed_mva - night peak_mva, from the same observation.",
      );
      const utilPct = Math.round((worstNight.peak_mva / worstNight.installed_mva) * 1000) / 10;
      nightUtilisation = verifiedField(
        utilPct,
        "%",
        worstNight,
        "night peak_mva / installed_mva from the same observation, as a percent.",
      );
    }

    // minMva: the floor across the WHOLE series, not tied to the peak month
    // (DATA.md caveat 3).
    const minRows = series.filter((r) => r.min_mva !== null);
    let minMva: Field<number> | null = null;
    if (minRows.length > 0) {
      const lowest = minRows.reduce((a, b) => ((b.min_mva as number) < (a.min_mva as number) ? b : a));
      minMva = verifiedField(
        lowest.min_mva as number,
        "MVA",
        lowest,
        "Lowest MIN MVA recorded across all months — a floor, not a guaranteed current value (DATA.md caveat 3).",
      );
    }

    out.push({
      id: slugifySubstation(rawLabel),
      name: displayName(rawLabel),
      voltageClass: referenceRow.voltage_class,
      rawLabel,
      zone: referenceRow.zone,
      district: referenceRow.district,
      circle: referenceRow.circle,
      installedMva,
      nightPeakMva,
      spareAtNightMva,
      minMva,
      nightUtilisation,
      observationCount: series.length,
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Retrieval metadata for the whole ingest run — the `sources` collection's
 * one doc. Exposed separately so a component can cite "as of <date>"
 * without pulling in the full substation list. */
export interface IngestSource {
  source: string;
  indexUrl: string;
  retrieved: string;
  monthsOk: number;
  monthsFailed: number;
}

/** Mongo's default `Document` schema types `_id` as `ObjectId`; this
 * collection's `_id` is deliberately the plain string "mpptcl-loading"
 * (`ingest/mongo-load.ts`), so the generic must say so explicitly. */
interface SourceDoc extends IngestSource {
  _id: string;
}

export async function loadSource(): Promise<IngestSource | null> {
  const db = await getDb();
  const doc = await db.collection<SourceDoc>("sources").findOne({ _id: SOURCE_ID });
  if (!doc) return null;
  return {
    source: doc.source,
    indexUrl: doc.indexUrl,
    retrieved: doc.retrieved,
    monthsOk: doc.monthsOk,
    monthsFailed: doc.monthsFailed,
  };
}
