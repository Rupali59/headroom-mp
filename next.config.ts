import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BUILD.md D16: build runs locally, Vercel receives prebuilt static
  // output. Pins the static architecture — without this Next emits server
  // components and Vercel runs compute, silently undoing the change.
  output: "export",

  // Next 16's dev server auto-writes AGENTS.md/CLAUDE.md on every `next dev`
  // (node_modules/next/dist/server/lib/generate-agent-files.js). This repo
  // already carries BUILD.md/DESIGN.md as the canonical guidance; disable
  // the auto-generation rather than fight it on every dev-server start.
  agentRules: false,

  // FINDING (BUILD.md step 5): `rewrites()` and `output: "export"` DO
  // conflict, but not by hard build failure — `next build` succeeds and
  // just warns "Specified rewrites will not automatically work with
  // output: export" (verified: exit 0, warning printed twice). The rewrite
  // below is a genuine no-op in the exported `out/` bundle; it only fires
  // under `next dev`, which is why it is kept — it documents intent and
  // gives lanes working locally a working /legacy while iterating.
  //
  // The static export does NOT need this rewrite to make /legacy resolve:
  // public/legacy/index.html is copied to out/legacy/index.html, and every
  // conventional static host (Vercel's static/prebuilt serving included —
  // it is the same mechanism that already resolves "/" to out/index.html
  // with zero config) serves a bare directory path from its index.html.
  // Verified locally with `npx serve out`: GET /legacy -> 200, identical
  // to GET /. No vercel.json rewrite or renamed legacy.html is needed.
  async rewrites() {
    return [
      {
        source: "/legacy",
        destination: "/legacy/index.html",
      },
    ];
  },
};

export default nextConfig;
