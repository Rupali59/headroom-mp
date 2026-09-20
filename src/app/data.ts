/**
 * Build-time data read — Lane F, "the integration seam nobody owned."
 * `page.tsx` calls all five Act components with data from here.
 *
 * THE PROBLEM THIS FILE FIXES: `page.tsx` previously called `<GridMap />`
 * with zero props. `GridMap` accepts `substations?: Substation[]`, so
 * every node rendered hatched — all 27,680 measured rows in
 * `data-local/mpptcl-loading.json` reached no pixel. This file is the
 * missing wire.
 *
 * WHY A STATIC JSON IMPORT, NOT `src/data/loader.ts`'s `loadSubstations()`
 * DIRECTLY: `loadSubstations()` requires a live MongoDB connection
 * (`src/lib/mongo.ts`'s `getDb()`), and Mongo is UNREACHABLE from this
 * machine — Atlas rejects the TLS handshake outright, a real infra block,
 * not a code bug (verified by hand: `openssl s_client`/`curl` against the
 * same host also fail at the TLS layer from this network). `loader.ts`
 * and `mongo.ts` are Lane H's exclusive files; this lane may not add a
 * JSON-reading path to either.
 *
 * `loader.ts` DOES export a pure function, `aggregateSubstations(rows)`,
 * that never touches Mongo — it only reduces an array of raw rows into
 * `SubstationLoad[]`. This lane used that function (fed with rows read
 * directly from `data-local/mpptcl-loading.json`) in a ONE-TIME,
 * NOT-COMMITTED precompute script, run once on this laptop via
 * `npx tsx`, to produce `data-local/substations.json` — a small (~330 KB)
 * derived artifact holding exactly the ~17 matched substations' composed
 * `Substation[]` and `SubstationLoadDetail[]` data. That script is not
 * part of this repo (nothing here may "ingest" — see the forbidden list
 * in the lane brief); its logic and every decision it made (which risk
 * factors are computable, the key-reconciliation mapping, the seasonal
 * factor's widened definition) are recorded in the Lane F report and in
 * this file's own comments below. Regenerate the artifact by re-running
 * that script (or an equivalent) if `data-local/mpptcl-loading.json`
 * changes; this file only ever reads the already-derived result.
 *
 * WHY NOT JUST IMPORT THE RAW 13.8 MB `mpptcl-loading.json` DIRECTLY (the
 * same pattern `src/data/factors.ts` uses for its own, much smaller, JSON):
 * `page.tsx` is a "use client" file (Lane 0's frozen shape — the role
 * switch and tab chrome are inline in it). Anything it imports, even
 * transitively, is bundled for the BROWSER by Next's client webpack
 * compiler. Statically importing all 27,680 raw rows would ship ~14 MB
 * to every visitor to render 19 map nodes. The precompute step above
 * exists specifically to avoid that: only the small, already-reduced
 * result crosses into the client bundle.
 *
 * NEVER FABRICATE: if `data-local/substations.json` is absent (the
 * precompute was never run, or `data-local/mpptcl-loading.json` itself
 * was missing when it ran), this import fails to resolve at build time —
 * which is the loud, correct failure for a genuinely missing build input,
 * consistent with `src/lib/mongo.ts`'s own "throws loudly ... would
 * rather fail the build than silently fall back" philosophy. The
 * precompute script itself writes `{ substations: [], loadDetails: [] }`
 * when its OWN source (`mpptcl-loading.json`) is missing, so the common
 * "source data not present on this machine" case degrades to an empty
 * dataset (every node renders hatched — see `GridMap`'s own default
 * behaviour) rather than a build failure. Verified directly (see the
 * Lane F report): re-running the precompute against a moved-aside source
 * file produces exactly `{"substations":[],"loadDetails":[]}`, and
 * `SUBSTATIONS`/`LOAD_DETAILS` below both become `[]` from that file with
 * no code change needed here.
 */

import type { Substation } from "@/lib/types";
import type { SubstationLoadDetail } from "@/components/map/load-panel";
// `resolveJsonModule` is on in tsconfig.json (same convention
// `src/data/factors.ts` already established for Act 3's data). Next bakes
// this small, already-reduced JSON into the build exactly once — no
// runtime fetch, no Mongo dependency, no Node-only API reachable from the
// client bundle.
// The precompute writes `substations.json`; a fresh clone has only the
// committed `substations.placeholder.json` (empty arrays). Next resolves
// whichever exists, so the build never fails on a missing file — it renders
// every node hatched, which is the correct UNASSESSED state rather than a
// crash or, worse, invented numbers. README explains how to populate it.
import derived from "./derived-dataset";

interface DerivedDataset {
  substations: Substation[];
  loadDetails: SubstationLoadDetail[];
}

const dataset = derived as DerivedDataset;

/**
 * Composed substation data, keyed by `src/data/geometry.ts`'s
 * `NODE_GEOMETRY` ids — pass directly to `<GridMap substations={...} />`.
 * `[]` when the precompute ran against a missing source; every geometry
 * node then renders hatched, per `GridMap`'s own documented default.
 */
export const SUBSTATIONS: Substation[] = dataset.substations;

/**
 * Load-panel detail data for the same nodes — pass to
 * `<GridMap loadDetails={...} />`. See `src/components/map/load-panel.tsx`
 * for the gaps this shape still carries (no day-time peak, no `avgMva`) —
 * this lane populates every field the loader's data actually has and
 * leaves the rest `null`/absent, never invented.
 */
export const LOAD_DETAILS: SubstationLoadDetail[] = dataset.loadDetails;
