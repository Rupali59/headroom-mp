/**
 * MongoDB connection — Lane E, DATA.md "What we now hold" + BUILD.md D16.
 *
 * BUILD.md D16: `next build` runs LOCALLY and reads Mongo at build time; the
 * output is then deployed prebuilt. Vercel never sees `MONGODB_URI` and never
 * connects to Atlas — this module is only ever invoked on this laptop, by
 * `npm run ingest` and by `npm run build` (via `src/data/loader.ts`).
 *
 * `MONGODB_URI` carries NO database path by design (registry convention
 * `db-in-var`, see the project brief): the database is selected by NAME via
 * `MONGODB_DB`, so rotating a credential or pointing at a different
 * environment (`Headroom_MP_local` / `_dev` / `_preview` / `_prod`, per
 * `.env.example`) is one env-var edit, never a URI edit.
 *
 * BLOCKER, reported rather than fixed here: the `mongodb` driver is not a
 * dependency of this package (`node_modules/mongodb` absent, 0 hits in
 * package-lock.json). This file is written against the standard `mongodb`
 * v6 API and will not typecheck or run until `npm install mongodb` lands —
 * see the Lane E report for the exact command. Per the lane brief, this repo
 * does not run its own `npm install`.
 */

import { MongoClient, type Db } from "mongodb";

/**
 * Reads and validates the two required env vars. Throws loudly — this
 * product would rather fail the build than silently fall back to a default
 * database name, which is exactly the mistake `db-in-var` exists to make
 * structurally impossible (a missing MONGODB_DB can never resolve to some
 * other environment's data).
 */
function requireEnv(): { uri: string; dbName: string } {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  const missing: string[] = [];
  if (!uri || uri.trim() === "") missing.push("MONGODB_URI");
  if (!dbName || dbName.trim() === "") missing.push("MONGODB_DB");

  if (missing.length > 0) {
    throw new Error(
      `mongo.ts: missing required env var(s): ${missing.join(", ")}. ` +
        "Both MONGODB_URI and MONGODB_DB must be set (see .env.example) — " +
        "there is no default database name to fall back to by design.",
    );
  }

  return { uri: uri as string, dbName: dbName as string };
}

// Module-level cache. `next build` is a single process, so a plain module
// singleton is enough; the extra `globalThis` layer only matters for
// `next dev`'s hot-reload, which would otherwise re-import this module and
// open a fresh connection on every edit. Same pattern the ingest script
// benefits from too when it's re-run in the same process (it isn't, today,
// but this makes `getDb()` safe to call more than once regardless).
interface MongoCache {
  client: MongoClient | null;
  promise: Promise<MongoClient> | null;
}

const globalForMongo = globalThis as unknown as { __headroomMongo?: MongoCache };
const cache: MongoCache = globalForMongo.__headroomMongo ?? { client: null, promise: null };
globalForMongo.__headroomMongo = cache;

async function getClient(): Promise<MongoClient> {
  if (cache.client) return cache.client;
  if (!cache.promise) {
    const { uri } = requireEnv();
    cache.promise = new MongoClient(uri).connect();
  }
  cache.client = await cache.promise;
  return cache.client;
}

/** The database selected by `MONGODB_DB` — never a hardcoded name. */
export async function getDb(): Promise<Db> {
  const client = await getClient();
  const { dbName } = requireEnv();
  return client.db(dbName);
}

/**
 * Closes the cached connection. Build-time reads (`src/data/loader.ts`) and
 * `next dev` deliberately never call this — the process either exits on its
 * own (`next build`) or wants the connection kept warm across hot reloads.
 * Only the one-shot `ingest/index.ts` CLI calls this, so the process can
 * exit instead of hanging on an open socket.
 */
export async function closeMongo(): Promise<void> {
  if (cache.client) {
    await cache.client.close();
    cache.client = null;
    cache.promise = null;
  }
}
