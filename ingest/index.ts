/**
 * `npm run ingest` entry point — BUILD.md D16's first step:
 *
 *   npm run ingest    # local, reads .env.local, writes MongoDB
 *   npm run build     # local, reads MongoDB, emits static output
 *   vercel deploy --prebuilt --prod
 *
 * DATA.md, Lane E assignment: "package.json's 'ingest' script assumes a TS
 * entry point that does not exist. Either add ingest/index.ts that shells
 * the Python, or change the script." This is that entry point.
 *
 * Two steps, always run in order:
 *
 *   1. Shell `python3 ingest/mpptcl-loading.py` — the working Python
 *      fetch+parse pipeline (ingest/mpptcl-loading.py; DO NOT rewrite it,
 *      see DATA.md "Why the dossier got it wrong" for why it must stay on
 *      curl rather than urllib). Writes data-local/mpptcl-loading.json.
 *   2. Load that JSON into MongoDB (ingest/mongo-load.ts), idempotently.
 *
 * `--skip-fetch` skips step 1 and loads whatever JSON is already on disk —
 * useful while iterating on the Mongo load/loader logic without re-hitting
 * MPPTCL's server 60 times per run. Not in BUILD.md; a dev convenience that
 * costs nothing and changes no default behaviour.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeMongo } from "../src/lib/mongo";
import { loadIntoMongo } from "./mongo-load";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const PY_SCRIPT = join(here, "mpptcl-loading.py");
const JSON_PATH = join(repoRoot, "data-local", "mpptcl-loading.json");

async function main(): Promise<void> {
  const skipFetch = process.argv.includes("--skip-fetch");

  if (skipFetch) {
    if (!existsSync(JSON_PATH)) {
      console.error(
        `--skip-fetch given but ${JSON_PATH} does not exist. Run without ` +
          "--skip-fetch at least once.",
      );
      process.exit(1);
    }
    console.log(`--skip-fetch: reusing existing ${JSON_PATH}`);
  } else {
    console.log(`\n=== step 1/2: python3 ingest/mpptcl-loading.py ===`);
    const py = spawnSync("python3", [PY_SCRIPT], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    if (py.error) {
      console.error("Failed to spawn python3:", py.error.message);
      process.exit(1);
    }
    if (py.status !== 0) {
      console.error(`\npython3 ingest/mpptcl-loading.py exited ${py.status}`);
      process.exit(py.status ?? 1);
    }
  }

  console.log(`\n=== step 2/2: load data-local/mpptcl-loading.json into MongoDB ===`);
  try {
    const counts = await loadIntoMongo();
    console.log("\nMongoDB document counts (counts only, per rule: never log contents or the URI):");
    console.log(`  sources     : ${counts.sources}`);
    console.log(`  substations : ${counts.substations}`);
    console.log(`  loading     : ${counts.loading}`);
  } finally {
    await closeMongo();
  }
}

main().catch((err) => {
  console.error("\ningest FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
