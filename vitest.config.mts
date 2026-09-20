import { defineConfig } from "vitest/config";

/**
 * BUILD.md D17: contract tests on the shared seams only — ~20 assertions,
 * seconds to run. Node environment is enough; nothing here renders a
 * component (deliberately not tested, per D17).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
