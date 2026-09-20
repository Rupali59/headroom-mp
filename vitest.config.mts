import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * BUILD.md D17: contract tests on the shared seams only — ~20 assertions,
 * seconds to run. Node environment is enough; nothing here renders a
 * component (deliberately not tested, per D17).
 *
 * `resolve.alias` added by Lane G (load visualisation): `load-bar.tsx`'s
 * pure `computeLoadBarGeometry` lives in the same module as the
 * `"use client"` component, which imports `@/components/value` — so even
 * importing just the function pulls that module graph in. Mirrors
 * `tsconfig.json`'s `"@/*": ["./src/*"]`. This does not relax D17: the
 * tests still only call plain functions, never render anything; nothing
 * in the imported graph touches the DOM at module-evaluation time, so it
 * resolves fine under the `node` environment above.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
