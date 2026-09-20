/**
 * Load `data-local/mpptcl-loading.json` (produced by the working
 * `ingest/mpptcl-loading.py` — do not rewrite that script) into MongoDB.
 *
 * Three collections, per the Lane E brief:
 *
 *   sources      one doc: retrieval metadata for the whole ingest run
 *                (index URL, retrieved timestamp, per-month failures, the
 *                honest-limits text the Python script already carries).
 *   substations  the dimension table — one doc per distinct
 *                (raw substation label, voltage class) pair as printed on
 *                the sheet, e.g. "400KV KATNI" / "400KV". ~450 docs.
 *   loading      the fact table — all 27,680 monthly observation rows.
 *
 * IDEMPOTENT BY CONSTRUCTION: every doc's `_id` is a deterministic string
 * built from its natural key, and every write is an upsert
 * (`replaceOne(..., { upsert: true })` / `bulkWrite` of the same). Re-running
 * this against the same JSON overwrites in place — it never inserts a
 * duplicate, so `npm run ingest` is safe to run repeatedly.
 *
 * INDEXES: created on `loading` for the two ways `src/data/loader.ts`
 * actually queries this collection — grouping by (substation, voltageClass)
 * to build per-node series, and filtering to night-time peaks. `substations`
 * gets an index on the same compound key for symmetry, even though its
 * primary lookup is already the `_id`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/lib/mongo";

const here = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(here, "..", "data-local", "mpptcl-loading.json");

/** Shape of one row in mpptcl-loading.json's `rows` array — see the Python
 * script's `_shape()` for the source of truth. Kept local to this file
 * rather than in `src/lib/types.ts`: this is the RAW sheet row, one level
 * below the `Field`-wrapped, per-node shape `src/data/loader.ts` emits to
 * the rest of the app. */
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

/** Mongo `_id`s must not contain certain characters in the worst case, but
 * these labels are plain ASCII from an XLSX sheet — `::` is a safe,
 * human-readable separator that doesn't collide with anything in the data
 * (substation names and month labels never contain it). */
function loadingRowId(r: RawLoadingRow): string {
  return `${r.substation}::${r.voltage_class}::${r.month}`;
}

function substationDimId(substation: string, voltageClass: string): string {
  return `${substation}::${voltageClass}`;
}

const BATCH_SIZE = 500;

export interface MongoLoadResult {
  sources: number;
  substations: number;
  loading: number;
}

/** Counts only — never call this with anything that logs `data`. */
export async function docCounts(): Promise<MongoLoadResult> {
  const db = await getDb();
  const [sources, substations, loading] = await Promise.all([
    db.collection("sources").countDocuments(),
    db.collection("substations").countDocuments(),
    db.collection("loading").countDocuments(),
  ]);
  return { sources, substations, loading };
}

export async function loadIntoMongo(): Promise<MongoLoadResult> {
  const raw = readFileSync(JSON_PATH, "utf-8");
  const data = JSON.parse(raw) as LoadingJson;

  const db = await getDb();
  const sourcesCol = db.collection("sources");
  const substationsCol = db.collection("substations");
  const loadingCol = db.collection("loading");

  await Promise.all([
    loadingCol.createIndex({ substation: 1, voltage_class: 1 }),
    loadingCol.createIndex({ peak_is_night: 1 }),
    substationsCol.createIndex({ substation: 1, voltage_class: 1 }),
  ]);

  // --- sources: one metadata doc, upserted whole ---------------------------
  await sourcesCol.replaceOne(
    { _id: "mpptcl-loading" },
    {
      _id: "mpptcl-loading",
      source: data.source,
      indexUrl: data.index_url,
      retrieved: data.retrieved,
      monthsOk: data.months_ok,
      monthsFailed: data.months_failed,
      failures: data.failures,
      limits: data.limits,
      loadedAt: new Date().toISOString(),
    },
    { upsert: true },
  );

  // --- substations: dimension table, one per (label, voltage_class) --------
  const dims = new Map<string, RawLoadingRow>();
  for (const r of data.rows) {
    dims.set(substationDimId(r.substation, r.voltage_class), r);
  }
  {
    const ops = Array.from(dims.entries()).map(([id, r]) => ({
      replaceOne: {
        filter: { _id: id },
        replacement: {
          _id: id,
          substation: r.substation,
          voltageClass: r.voltage_class,
          zone: r.zone,
          district: r.district,
          circle: r.circle,
        },
        upsert: true,
      },
    }));
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      await substationsCol.bulkWrite(ops.slice(i, i + BATCH_SIZE), { ordered: false });
    }
  }

  // --- loading: fact table, all rows ----------------------------------------
  {
    const ops = data.rows.map((r) => ({
      replaceOne: {
        filter: { _id: loadingRowId(r) },
        replacement: { _id: loadingRowId(r), ...r },
        upsert: true,
      },
    }));
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      await loadingCol.bulkWrite(ops.slice(i, i + BATCH_SIZE), { ordered: false });
    }
  }

  return docCounts();
}
