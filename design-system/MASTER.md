# Headroom MP — Design System

Canonical source for tokens, type, components, states and accessibility.
Created 2026-09-20 from `/gstack-plan-design-review` decisions D9-D12, plus the
shadcn/Radix direction set mid-review.

**Naming note.** This project's *plan* occupies `DESIGN.md`, so the design **system**
lives here. `gstack-design-layer` reads `design-system/MASTER.md` natively. Do not
create a second `DESIGN.md`.

**Implementation:** these tokens are emitted once into the Next.js `globals.css`
`@theme` block. Tailwind v4 has no JS config — a `tailwind.config.js` is ignored
silently. `mp-headroom-app.html` at `/legacy` keeps its own frozen copy and is not
maintained against this file.

---

## 1. Why this file exists

Measured 2026-09-20: **13 tokens already differed between `mp-headroom-app.html` and
`mp-headroom-brief.html`**, two of them by *name* rather than value — `--ok` vs
`--good`, `--warn` vs `--bad`. Naming divergence is the dangerous kind, because a
shared stylesheet silently resolves to nothing rather than to the wrong colour. A third
surface was about to be created. Settled here: **`--good` / `--mid` / `--bad`**.

## 2. Colour tokens

Dark is the primary scene: a control room, and a projector in a dimmed hall.

```css
:root {
  --bg:#0a0b0d;  --bg2:#0f1115;  --panel:#13161b;  --panel2:#181b21;
  --line:#23272f; --line2:#2f343e;
  --ink:#eceae4;  --ink2:#a6a5a0; --ink3:#6b6b68;
  --good:#5fd4a0; --mid:#f2c14e;  --bad:#ff7a6b;
  --sun:#f2a541;  --night:#8b9cff;
  --map-fill:#12151a; --map-stroke:#3a404b;
}
```

### Light theme — corrected, three tokens were failing

The previous light values were measured against `--bg:#f3f1ec` and **failed even the
3:1 non-text threshold**: `--mid` 1.49:1, `--bad` 2.26:1, `--sun` 2.99:1. Those are the
risk colours. Replaced with values that clear 4.5:1:

| Token | Was | Now | Contrast on `#f3f1ec` |
|---|---|---|---|
| `--good` | `#1f9d6b` (3.05:1, UI only) | **`#0f6b42`** | 5.81:1 |
| `--mid` | `#c28a00` (1.49:1, fail) | **`#7a5600`** | 5.89:1 |
| `--bad` | `#d4483a` (2.26:1, fail) | **`#b3261e`** | 5.79:1 |
| `--sun` | `#c77a12` (2.99:1, fail) | **`#8a5200`** | 5.66:1 |
| `--ink3` | `#8b8a86` (3.06:1, UI only) | **`#6f6e6a`** | 4.52:1 |

Dark theme was already sound: every text and risk token measures 7.7:1 to 11.7:1.
Only `--line` (1.32:1) and `--line2` (1.58:1) fall below 3:1, which is correct — they
are decorative rules, never text or a state boundary.

### The rule colour alone cannot satisfy

**Measured, and it is why D10 exists.** The three risk colours are near-identical in
luminance — dark theme good/mid **1.10:1**; corrected light theme good/mid **1.01:1**.
Optimising each hue for background contrast *worsens* their separation from each other,
because it forces them to the same luminance band. So:

> **Risk is never encoded by colour alone.** Every node carries its weak-factor count
> as a digit, 0-5, with `—` for not-assessed. Colour is the fast channel; the digit is
> the accurate one. This is also where the deterministic arithmetic becomes visible.

Same rule applies to every future status: colour plus one of shape, digit, or text.

## 3. Type

| Role | Face | Notes |
|---|---|---|
| Display | **Instrument Serif** 400 | Screen questions, node names in the drawer. Never below 20px |
| UI / body | **IBM Plex Sans** 300/400/500 | Minimum 16px for body. 13px floor for chrome labels only |
| Data | **IBM Plex Mono** 400/500 | Every MW, MVA, kV, count and timestamp. **`font-variant-numeric: tabular-nums`** so figures align in columns and do not jitter when they update |

Loaded via `next/font/google`, self-hosted. No external stylesheet, no FOUT.
No `system-ui` as a display or body voice.

More space above a heading than below it. Read the computed values.

## 4. Components — shadcn/ui on Radix

**Standard primitives, not hand-rolled.** shadcn copies Radix-based source into the repo,
so we own the code and restyle it to this palette. Radix ships keyboard navigation, focus
management and ARIA correct by default, which is the expensive half of the WCAG 2.2 AA
commitment in §6 — building Tabs, Dialog and Select to AA by hand is the work this avoids.

```bash
# 1. ~/.npmrc line 1 is `allow-scripts=true`, which npm 11 rejects on any
#    project-scoped install. It fails BOTH commands below with EALLOWSCRIPTS,
#    and shadcn fails AFTER writing components.json, so a rerun fails identically.
#    It must be =/dev/null, NOT an empty value. Measured 2026-09-20:
#      npm_config_userconfig=          npm config get allow-scripts  -> true   (no effect)
#      npm_config_userconfig=/dev/null npm config get allow-scripts  -> (empty)
#    An earlier draft of this file said the empty form worked. It does not.
# 2. --base radix is NOT the default. Omit it and you get Base UI.
npm_config_userconfig=/dev/null npx shadcn@latest init -d --base radix
npm_config_userconfig=/dev/null npx shadcn@latest add -y tabs dialog alert-dialog select \
  slider table badge scroll-area label input separator skeleton tooltip dropdown-menu
```

**Three corrections, all measured 2026-09-20 against a real scaffold** (an earlier draft
of this file asserted the opposite of each):

- **`--base radix` is not the default.** `init -d` with no flags produces
  `"style": "base-nova"` and installs `@base-ui/react`, whose imports are
  `from "@base-ui/react/button"`. D12's cost argument rests on **Radix's** ARIA, so the
  flag is load-bearing, not cosmetic. With it: `"style": "radix-nova"`, `radix-ui@1.6.7`,
  imports `from "radix-ui"`.
- **`new-york` no longer exists.** The styles are `base-nova` and `radix-nova`.
- **`cn` is now its own npm package.** Generated components `import { cn } from "cn"`,
  not from `@/lib/utils`, even though `components.json` still declares the alias.

`dropdown-menu` is in the command above because the table below requires it; an earlier
draft listed it as needed and omitted it from the install. All 15 install in one command
in ~6s. `npx shadcn@latest docs <component>` returns API reference inline.

| Need | Component | Radix gives us free |
|---|---|---|
| Three acts | `tabs` | Arrow-key navigation, `aria-selected`, roving tabindex |
| Role switch | `tabs` (second instance) or `select` | Same |
| Load condition | `tabs`, two items | Keyboard, correct roles |
| Worklist row actions | `dropdown-menu` | Focus trap, escape, typeahead |
| Correct-a-value form | `dialog` + `label` + `input` | Focus trap, restore on close, labelled by title |
| Destructive close | **`alert-dialog`**, never `dialog` | Correct role, forced acknowledgement |
| Confidence chip, status pill | `badge` | Styling only |
| Provenance ledger | `table` | Semantics |
| Minimum-headroom filter | `slider` | Arrow keys, `aria-valuenow` |
| Findings band overflow | `scroll-area` | Keyboard scrolling |
| Loading | `skeleton` | — |

**Not covered by shadcn, and these are the custom parts:**

- **The map.** SVG nodes as focusable `button`s with accessible names, one tab stop with
  arrow-key traversal between nodes. Hand-built against §6.
- **The findings band.** Rules and typography, not a component. It is the anchor (§7).
- **Act 1's `aria-live` stream.** A polite live region announcing rows as they land.
- **The confidence chip's semantics.** `badge` styles it; the ladder in §2 is ours.

### Deliberate deviations from shadcn's defaults

shadcn's house direction is Geist Sans and a zinc/neutral/slate base. **We override both**
— Instrument Serif plus IBM Plex on the warm palette in §2. Owning the source is the point;
this is restyling, not fighting a theme. Keep `new-york` style and the `--radius` scale.

### Two traps in this exact stack

1. **`shadcn init` rewrites `globals.css` and can emit `--font-sans: var(--font-sans)`** —
   a circular self-reference that silently breaks font loading. Tailwind v4's
   `@theme inline` resolves custom properties at **parse time**, so even
   `var(--font-instrument-serif)` from `next/font` resolves to nothing. Use **literal
   family names**:

   ```css
   @theme inline {
     --font-serif: "Instrument Serif", Georgia, serif;
     --font-sans:  "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
     --font-mono:  "IBM Plex Mono", ui-monospace, monospace;
   }
   ```

2. **Font variable classNames go on `<html>`, not `<body>`** in `layout.tsx`. Re-check
   both of these *after* running `init`, because `init` is what introduces them.

### Anti-patterns, inherited and enforced

No raw `button`/`input`/`select` where a primitive exists. No repeated
`div rounded-xl border p-6` standing in for `Tabs`/`Table`/`Dialog`. **No nested cards** —
and per §4's card rule, exactly one card use exists at all. No multiple accents fighting.
No empty, loading or error state without a designed treatment (§ the state table in the
plan). `AlertDialog` for destructive confirmation, never `Dialog`.

## 5. Motion

**One authored moment: Act 1's extraction stream.** Rows land one at a time with their
citations; the filling *is* the demo. Exponential ease-out from an already-visible
default. Content never hides behind animation timing.

No pulsing status dots, no bounce easing, no blinking cursors, no entrance animation on
every section. The live SLDC indicator is a static dot.

## 6. Accessibility — WCAG 2.2 AA, committed (D12)

A public-sector tool. Full AA, not a subset.

**Colour and contrast**
- Body text ≥ 4.5:1, non-text UI and state boundaries ≥ 3:1, both themes. Values above.
- Never colour alone for meaning. See §2.

**Keyboard**
- Every interactive element reachable and operable, in a visible logical order.
- Focus ring themed from the palette, never the browser default, never removed.
- No traps. The map is a single tab stop; arrow keys move between nodes.
- Skip link to the findings band.

**Screen readers**
- Landmarks: `banner`, `navigation` (tabs), `main`, `complementary` (context, action).
- Each map node is a `button` with an accessible name reading state, not colour:
  `"Mandsaur 400 kV, 3 of 5 factors weak, at risk"`.
- **Act 1's stream is an `aria-live="polite"` region** announcing rows as they land.
  This is a better experience for everyone, not only screen-reader users.
- Hatched nodes announce `"not assessed, transformation capacity not published"`.

**Forms — the write path**
- Visible label on every field. **Placeholder is never the only label.**
- Errors named in text next to the field, not by colour or border alone.
- The correction form is reachable and completable by keyboard alone.

**Targets and motion**
- **24x24px minimum on every control — that is the AA bar** (WCAG 2.2 SC 2.5.8, Target
  Size (Minimum)). Every shadcn primitive already clears it.
- **44x44 is SC 2.5.5, Target Size (Enhanced), which is AAA.** Raising to 44 is a
  deliberate choice above the committed bar, justified here by a projector and a
  possible handed-over phone — but it is a per-component override sweep, not something
  Radix absorbs. Measured on the generated `radix-nova` components: `button` 36px,
  `tabs` trigger 32px, `input` 32px, **`slider` thumb 12px**. The slider is a 3.7x miss.
  Do the sweep once in the shared component pass, or drop to 24 and lose nothing against
  the stated standard.
- Honour `prefers-reduced-motion`: the extraction stream resolves instantly, no fade.

## 7. Responsive (D11)

One breakpoint at **1280px**, plus a presenter-controlled override.

| Width | Layout |
|---|---|
| ≥ 1280 | Findings band, then three columns: context 230 / map / action 330 |
| < 1280 | **Presentation density.** Findings band stays full width and *grows*. Map and action stack beneath. Context rail collapses into the band header |
| any | **Keyboard toggle forces presentation density at any width**, so the density is chosen deliberately on an unknown projector rather than inferred from a reported resolution |

The collapse order is load-bearing: **findings and action must never both disappear.**
The findings band is what must be readable from the back row.

## 8. Copy

Utility language: orientation, status, action. Not mood, not brand, not aspiration.

**The gap sentence, and it is not optional.** Every unassessable value names absence,
holder and consequence, carrying zero accusation:

> *Transformation capacity not published for Katni. MPPTCL holds this figure. With it,
> Katni joins 17 assessable substations.*

State what is not published and what it would unlock. **Never why it is missing.** In a
government room the difference between those two sentences is the difference between a
pilot and a closed door. This holds in Hindi and English both.

**Session scope is stated, not implied.** Corrections read `· this session`, and the
ledger header says corrections are held in this browser for the demo. The interface
claims exactly what it can keep.
