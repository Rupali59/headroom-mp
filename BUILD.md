# Build plan — parallel lanes

Supersedes `DESIGN.md` §Next Steps. Written 2026-09-20 after four adversarial review
lanes and the local-ingest architecture change.

## Architecture

**No compute on Vercel.** Everything that costs a token runs on the laptop that holds
the key; Vercel serves a static build.

```
LOCAL                                          VERCEL
  ingest/extract.ts   PDF -> rows      ─┐
  ingest/research.ts  the unknowns     ─┼─> MongoDB ─> build reads it ─> static site
  ingest/analyze.ts   12 factors       ─┘   (source of truth)
```

- **The repo carries no data.** Mongo holds it; the build reads Mongo and emits static
  output. Git history stays clean by construction, not by a gitignore rule.
- **The PDF never deploys.** Neither does the key.
- **Corrections are `localStorage`**, per D7, labelled `· this session`. A static site
  has nowhere else to put them. The Mongo supersession announced earlier is reversed.
- **Act 1 is a replay** of a local run that already succeeded. Button reads "Replay
  recorded extraction", labelled with capture time. It never says "Extract" while
  replaying.

### Build location and deploy — D16

**`next build` runs on the laptop. Vercel receives prebuilt output.**

```
npm run ingest          # local, reads .env.local, writes MongoDB
npm run build           # local, reads MongoDB, emits static output
vercel deploy --prebuilt --prod
```

Vercel never holds `MONGODB_URI`, never connects to Atlas, and runs no build step, so
**the Atlas allowlist stays this laptop's IP**. The alternative — Vercel building and
connecting — needs `0.0.0.0/0` because Vercel build IPs rotate, which is a database open
to the internet protected by a password alone, on a public repo, on demo day.

**Pin `output: "export"` in `next.config.ts`.** "Static" is currently an intention, not a
configuration; without the flag Next will emit server components and Vercel will run
compute, silently undoing the architecture change. With it, accidental server code fails
the build **locally**, where the output is in front of you.

Accepted cost: the deploy is no longer reproducible from the repo alone. The public repo
is code that cannot regenerate its own data without Mongo access. That is the same trade
as keeping rows out of git, taken deliberately.

### Lane 0 ships working stubs — D15

`page.tsx` imports five components that do not exist yet, so the build would be **red from
Lane 0 until the last lane lands** — and a single stalled lane means no demo at all, not a
partial one. So **Lane 0 writes all five as real files** rendering a designed placeholder
in the product's own visual language. Lanes replace their file wholesale.

The build is green at every moment. Running out of clock costs one act, not the demo. Each
lane also gets an unambiguous contract — same filename, same export, same props — which is
what stops two lanes inventing incompatible interfaces.

### Tests — D17, contract tests on the shared seams only

Vitest, ~20 assertions, seconds to run. Not coverage — the seams five parallel lanes can
disagree about:

| Seam | Assert |
|---|---|
| `Field` / confidence type | the ladder's five values, and that `field` outranks `modelled` |
| Risk arithmetic | `count(Weak) of 5`; 0 green, 1-2 amber, 3+ red; `>=2 unknown` hatches and is excluded from the count |
| `projection.ts` | `xy()` and `dist()` match the values the old app produced, verbatim |
| `worklist-store` | reset-by-default, `?keep=1` preserves, versioned key |

The risk arithmetic is the number an engineer in the room will recompute by hand. Pinning
it is worth more than its size suggests.

Not tested, deliberately: component rendering, the ingest pipeline, interaction states,
and any end-to-end path.

What this dissolved: Vercel body caps, `maxDuration`, Node-vs-Edge, streaming timeouts,
heartbeats, unauthenticated `/api` spending the key, and `ANTHROPIC_API_KEY` in Vercel
(Open Question 1's blocker). Deployment Protection stays ON — rows are baked into the
static bundle, which is recoverable by redeploy where git history is not.

---

## Lane 0 — serial. Nobody starts until this lands. ~60 min, one agent.

Owns the entire collision surface. **No other lane may run `npm install` or
`shadcn add`** — concurrent installs corrupt the lockfile.

**First, unblock the machine.** `~/.npmrc` line 1 is `allow-scripts=true`; npm 11
rejects it on project-scoped installs and it fails `create-next-app` *and*
`shadcn init`, the latter after writing `components.json` so a rerun fails identically.
Comment it out, or prefix every scaffold command with `npm_config_userconfig=`.

Then, exclusively owns:

| | |
|---|---|
| Scaffold | `create-next-app` (TS, Tailwind v4, App Router), then `shadcn init -d --base radix` — **the flag is load-bearing**, the default is Base UI |
| Components | **one** `shadcn add -y` with all 15, including `dropdown-menu` |
| Shared files | `package.json`, lockfile, `components.json`, `next.config.ts`, `.env.local`, `src/app/{globals.css,layout.tsx,page.tsx}` |
| `next.config.ts` | the `/legacy` rewrite — **`/legacy` 404s without it**; only `/legacy/index.html` resolves |
| `globals.css` | every `@theme` token from `MASTER.md` §2, **literal font family names** — the generated file really does contain a `--font-sans: var(--font-sans)` self-reference |
| `layout.tsx` | fonts on `<html>` not `<body>`, `TooltipProvider`, `RoleProvider`, ARIA landmarks, skip link |
| `page.tsx` | **the final shape** — three `<Tabs>`, each `TabsContent` holding one stub import. After this, **no lane edits `page.tsx`** |
| `src/lib/role-context.tsx` | ten lines. **Highest-leverage decision in the plan** — without it, step 5 becomes a refactor across three lanes' files; with it, each lane calls `useRole()` in its own file |
| `src/lib/types.ts` | `Substation`, `Field`, `Confidence`, `RiskFactor`. Without it five lanes define five versions |
| `src/components/value.tsx` | the provenance primitive every number routes through. Must exist before any lane renders a number, or three lanes invent three versions |
| `src/components/ui/*` | the target-size sweep, once. AA needs 24px and shadcn already clears it; 44px is AAA and a deliberate choice — the slider thumb ships at **12px** |
| `package.json` scripts | `"type-check": "next typegen && tsc --noEmit"` — **plain `tsc` fails on a clean tree** with `Cannot find name 'LayoutProps'`, pointing at a file nobody wrote |
| Deploy | first deploy, `/legacy` verified 200 **in production** |

## Then, in parallel — disjoint file sets

| Lane | Owns exclusively | Never touches |
|---|---|---|
| **A · Map** | `src/components/map/`, `src/lib/projection.ts` (verbatim `xy()`/`dist()` port), `src/data/geometry.ts` (**positions, MP outline, city list — cartographic constants only**), `src/components/replay-chrome.tsx` | `page.tsx`, `globals.css`, anything under `src/data/` that is not geometry |
| **B · Blocked sources** | `src/components/blocked-sources.tsx`, `public/artifacts/mpptcl-{curl,robots}.txt` | everything else. **Needs no scaffold — can start immediately, before Lane 0 finishes** |
| **C · Factor cards** | `src/components/factor-card.tsx`, `src/data/factors.ts`, `ingest/analyze.ts` | `page.tsx` |
| **D · Worklist** | `src/components/worklist/`, `src/lib/worklist-store.ts` (versioned `headroom.v1.*`, read in `useEffect` after mount — reading during render is a hydration mismatch; reset-by-default unless `?keep=1`) | `page.tsx` |
| **E · Ingest** | `ingest/*.ts`, `src/lib/mongo.ts`, `src/data/loader.ts` (**margins, capacities, confidence — everything ingested**) | `page.tsx`, `src/data/geometry.ts`. **Start first** — it holds the key and the Mongo URL, so its blockers surface early rather than at 17:30 |

**Data contract, A vs E:** geometry is cartographic and static; data is ingested and
changes. The map composes them. An earlier draft had both lanes owning files that fed the
map with no stated contract, which is how two lanes ship two incompatible shapes.

**Sequential:** the role switch (a 10-min edit if Lane 0 laid down `RoleContext`), and
rehearsal.

Every lane brief must carry: *run long commands in the FOREGROUND with an explicit
`timeout`; never `run_in_background`* — the completion notification routes to the
parent, so backgrounding ends the agent's turn rather than pausing it. Measured:
`npm install` 1m48s, `next build` 12s, `shadcn add` x15 6s. All comfortably foreground.

---

## Corrections this plan carries

Findings from four review lanes, each verified independently before being accepted.

| Was | Is |
|---|---|
| Fixture sliced pages 17-20 | **23-25.** MP rows are not at the start of the Western Region section; Agar and Shajapur — the merged-cell rows the whole extraction test exists to prove — were absent from the fixture. Line numbers in extracted text are not page numbers |
| Coincidence model estimates night headroom | **Deleted.** `headroom = m*(0.765 - P/N)` is linear in capacity, so risk was a restatement of substation size. Both denominators degenerate: all-red or all-green. **CTUIL publishes solar and non-solar margins per substation** — the document answers the question the model was estimating |
| Fast mode for stage latency | **Removed.** Measured: `rate limit of 0 fast mode input tokens per minute`. A ceiling of zero is provisioning, not a burst limit; retrying loops forever. Now opt-in via `--fast`, exits 2 with a real diagnosis |
| `--base radix` is the default | **It is not.** Default is Base UI. Also `new-york` no longer exists, and `cn` is its own package |
| 44x44 targets are the AA bar | **24x24 is AA** (SC 2.5.8). 44 is AAA (SC 2.5.5) |
| `extract.ts` typechecks clean | It does — because two `as never` casts disable checking of both API calls. Strip them and it fails. **A green typecheck that cannot fail is evidence of nothing** |
| RESTRICTED on every page | **26 of 29.** Conclusion unchanged |
| "Ten factors" | **Twelve.** Two summary lines never updated when the table grew |
| "Three factors Unknown" | **Two**, and they are physical constraints, not data asks — the exact conflation the demo script warns the presenter against |
| Owner is a fourth destination | Ledger lives inside Act 2's drawer |

## Still unresolved

**Settled 2026-09-20: the agency is MPSEDC.** Measured before deciding — MPCDC appeared
0 times across the brief and dossier, MPSEDC 4, heading the brief's §03 and one of its
four asks. Applied in 9 places across DESIGN.md and this file.

- **No closing ask is written anywhere.** The script ends on a provenance table. Eight
  minutes with no ask spends the room's attention and buys nothing.
- **No offline artifact.** Screen-record the rehearsal; it is free and it is the only
  defence against dead wifi.
- **Script has zero slack** — 90+180+150+60 = 480s in an 8-minute slot. Budget six
  minutes of content. Write a 2-minute version in case the slot is halved.
- **Hindi.** The source documents are themselves bilingual, which strengthens the case.

## GSTACK REVIEW REPORT

`/gstack-plan-eng-review` · 2026-09-20 · branch `main` · target `BUILD.md` + `DESIGN.md`.

### Runs / Status / Findings

| Section | Findings | Status |
|---|---|---|
| Step 0 · Scope challenge | 35+ files, 5 lanes — threshold triggered. Scope reaffirmed by user; the trigger surfaced the partial-build gap instead | resolved D15 |
| 1 · Architecture | [P1] build location unstated, both readings break (9/10); [P1] `output: "export"` unpinned (8/10); [P2] lanes A and E own overlapping data (8/10) | resolved D16 + geometry/data split |
| 2 · Code quality | [P2] two `as never` casts disable typechecking of both API calls, verified by stripping them (10/10); [P2] no shared type module (7/10) | `src/lib/types.ts` added to Lane 0; casts are Lane E's first task |
| 3 · Tests | [P1] zero tests against a stated non-negotiable standard (9/10) | resolved D17 |
| 4 · Performance | none — 19 nodes, static output, no runtime compute | no issues found |

### Verdict

**VERDICT: PASS.** Three P1s found and resolved before dispatch, one of which
(build location) would have failed the first deploy or opened Atlas to `0.0.0.0/0`.

**OUTSIDE COVERAGE: not run** — Codex not probed. Four independent Claude review lanes
covered this plan earlier; treat cross-model coverage as absent, not clean.

**CROSS-MODEL: n/a.**

**UNRESOLVED DECISIONS:**

- **No closing ask.** The 8-minute script ends on a provenance table.
- **No offline artifact.** Screen-record the rehearsal.
- **Script has zero slack** — 480s of content in an 8-minute slot; no 2-minute version.
- **Hindi** — bilingual chrome recommended, on the cut list.
