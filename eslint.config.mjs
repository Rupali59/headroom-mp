import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // extraction-test/ is a standalone experiment with its own
    // package.json/tsconfig.json/bun.lock — not part of this Next.js app,
    // and not owned by any BUILD.md lane.
    "extraction-test/**",
  ]),
]);

export default eslintConfig;
