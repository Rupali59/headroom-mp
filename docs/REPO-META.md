# Repository and site metadata

Two different things both called "meta tags". Both are here.

---

## 1. GitHub repository metadata

Nothing below has been applied — the repo has no remote yet. Run these when you create it.

**Description** (350 char limit, this is ~170):

> Grid situational awareness for Madhya Pradesh, built from the state's own published
> documents. Where can a 50–100 MW AI data centre connect, and will it have power at 2 a.m.?

**Topics** — GitHub allows up to 20, lowercase, hyphenated:

```
madhya-pradesh  india  electricity-grid  power-systems  energy
data-centers  grid-capacity  transmission  open-data  govtech
civic-tech  nextjs  typescript  anthropic  claude
pdf-extraction  mongodb  vercel  energy-transition  bess
```

**Apply:**

```bash
gh repo edit --description "Grid situational awareness for Madhya Pradesh, built from the state's own published documents. Where can a 50-100 MW AI data centre connect, and will it have power at 2 a.m.?"
gh repo edit --add-topic madhya-pradesh,india,electricity-grid,power-systems,energy
gh repo edit --add-topic data-centers,grid-capacity,transmission,open-data,govtech
gh repo edit --add-topic civic-tech,nextjs,typescript,anthropic,claude
gh repo edit --add-topic pdf-extraction,mongodb,vercel,energy-transition,bess
gh repo edit --homepage "https://<vercel-domain>"
```

**Before making it public, confirm:**

- [ ] `git log --all --name-only | grep -i '\.pdf'` returns nothing. The source documents
      carry a RESTRICTED marking and must never enter history — removing them later needs
      a history rewrite and does not un-publish anything already cloned.
- [ ] `git log -p | grep -iE 'sk-ant|mongodb\+srv://'` returns nothing.
- [ ] `.env.local` is absent from history. `.env.example` is present and has empty values.

---

## 2. Site metadata (Next.js App Router)

Goes in `app/layout.tsx` as a `metadata` export. Open Graph and Twitter cards matter here
because the link will be shared into WhatsApp and email inside government departments,
where an unfurled card is the first impression the tool makes.

```ts
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://<vercel-domain>"),
  title: {
    default: "Headroom MP — grid capacity for AI data centres",
    template: "%s · Headroom MP",
  },
  description:
    "Where can a 50-100 MW AI data centre connect in Madhya Pradesh, and will it have " +
    "power at 2 a.m.? Built from the state's own published documents.",
  applicationName: "Headroom MP",
  authors: [{ name: "Rupali Bhatnagar" }],
  keywords: [
    "Madhya Pradesh", "electricity grid", "data centre siting",
    "grid capacity", "MPPTCL", "CTUIL", "night headroom",
  ],
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "Headroom MP",
    title: "Headroom MP — grid capacity for AI data centres",
    description:
      "19,902 MW in January. 13,818 MW in July. A flat 24x7 AI load has to fit " +
      "somewhere in between, and the binding constraint is night.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Headroom MP" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Headroom MP — grid capacity for AI data centres",
    description:
      "Where a 50-100 MW AI data centre can connect in Madhya Pradesh, and whether " +
      "it has power at 2 a.m.",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};
```

**`/og.png` — 1200x630.** Do not use a screenshot of the dashboard; at card size the
nodes and labels are illegible. Use the two numbers, large, on the dark ground:
`19,902 MW January` over `13,818 MW July`, with the product name. The gap between those
figures is the entire argument and it survives being shrunk to a thumbnail.

**`themeColor`** goes in a separate `viewport` export in App Router, not in `metadata`:

```ts
export const viewport = { themeColor: "#0a0b0d" };
```

---

## 3. Registry entries — the workspace expects these

Neither is applied yet. Both are authored files, not derived.

**`~/Documents/GitHub/scripts/execution/ports.yml`** — 3205 verified free (3204 is the
last claimed slot in the 3200-3299 specialty-apps band):

```yaml
  headroom-mp:
    port: 3205
    repo: Rupali/Experiments/ClaudeBuild/Grid
    surface: .env.local
    notes: >
      Claude Build Day demo, Sept 2026. Next.js 16, via scripts/next-dev.sh.
```

**`~/Documents/GitHub/scripts/execution/mongo.yml`** — `env-suffixed-db` naming with the
`db-in-var` mechanism, which the registry marks PREFERRED because one URI then serves
every environment and rotating a credential is one edit rather than four. Preview is
`_preview`, not `_staging`, per `rule:environment-vocabulary`:

```yaml
  headroom-mp:
    local:       { cluster: <alias>, db: Headroom_MP_local,   via: var }
    development: { cluster: <alias>, db: Headroom_MP_dev,     via: var }
    preview:     { cluster: <alias>, db: Headroom_MP_preview, via: var }
    production:  { cluster: <alias>, db: Headroom_MP_prod,    via: var }
    notes: >
      env-suffixed-db naming via the preferred db-in-var mechanism. Collections:
      substations, margins, sources, corrections, worklist.
```

Cluster alias is unset pending the choice of an existing Atlas cluster or a new one.
Reconcile both with `scripts/ports-check.sh` and `scripts/mongo-check.sh`.
