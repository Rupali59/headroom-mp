/**
 * Resolves the precomputed dataset, with a committed empty fallback.
 *
 * `data-local/substations.json` is produced locally by the precompute and is
 * gitignored — it is derived data and the repo deliberately carries none
 * (DATA.md, decision D14). But `src/app/data.ts` statically imports it, so a
 * fresh clone of the public repo previously failed to build outright:
 *
 *     Error: Module not found: Can't resolve '../../data-local/substations.json'
 *
 * The README tells people to `npm install && npm run dev`, so that was a real
 * defect, not a nuance. `substations.placeholder.json` is committed with empty
 * arrays purely so the module graph always resolves. Every node then renders
 * hatched — the correct "not assessed" state, and the honest one. It is never
 * populated with invented rows to make a clone look alive.
 */
import placeholder from "../../data-local/substations.placeholder.json";

let dataset: unknown = placeholder;
try {
  // Optional: present only after the precompute has run locally.
  dataset = require("../../data-local/substations.json");
} catch {
  // Placeholder stands. Intentional, not a swallowed error.
}
export default dataset;
