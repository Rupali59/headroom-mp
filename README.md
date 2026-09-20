# Headroom MP

**Where can a 50–100 MW AI data centre connect in Madhya Pradesh, and will it have power at 2 a.m.?**

A grid situational-awareness tool built from Madhya Pradesh's own published documents.
It shows where the state's EHV network is under strain, where it has capacity, where an
AI data centre could land — and, deliberately, **where it does not know**.

Built for Claude Build Day, September 2026.

---

## The problem

Madhya Pradesh wants AI data centres. A 1 GW MoU is signed and one purpose-built 80 MW
site exists in Indore. An AI data centre is a **flat 24×7 load**. The MP grid is shaped
around two things that are neither flat nor 24×7: winter irrigation, which drove an
all-time peak of **19,902 MW in January 2026**, and midday solar, which produces nothing
after sunset. By July 2026 peak demand was **13,818 MW** — a seasonal swing of roughly
6 GW that a flat load could sit inside.

Night supply today is thermal. The state's first grid-scale battery tenders
(625 MW / 1,250 MWh at Bina, Sendhwa and Birsinghpur) only closed bids in July 2026.

So the question is not "where is there capacity" but **"where is there capacity at
night"** — and answering it currently means reading transmission PDFs, regulator orders
and tender notices by hand.

## What this actually is

Three views over one record:

| | |
|---|---|
| **Where this comes from** | Claude reads the published PDFs and turns messy multi-row tables into structured records, each carrying its source document and page number |
| **What is happening** | The network under two real load conditions, coloured by risk, with a rectification worklist and preventive actions |
| **Where it could go** | Twelve siting factors per candidate substation, each a verdict with an argument and a source — not a single score |

## What is real and what is not

This matters more than the features, so it is here rather than in a footnote.

| | |
|---|---|
| **Verified** | Installed capacity and peak loading, per substation, per transformer class, **with the date and hour the peak was recorded** — for 432 substations across 55 months. Populated on 100% of 27,680 rows. Plus connectivity rules from the CERC GNA Regulations 2022 and peak demand from CEA |
| **Researched** | Values found by web search, each carrying its URL and retrieval date |
| **Field** | An operator's own correction, stamped with who and when |
| **Not known** | Anything absent after both. Renders hatched, receives **no verdict at all**, and names who holds the missing figure |
| **Flagged** | A reading the source itself contradicts — `132KV SALAMATPUR` reports **183% of installed capacity**. Never given a confident verdict; marked `!` and set apart |

**Nothing here is invented, and almost nothing is modelled.** An earlier version of this
file said night headroom had to be modelled because *"no per-substation coincident load
is published anywhere in India."* **That was wrong.** MPPTCL publishes it monthly. The
modelling was deleted; the measurement replaced it.

## What we got wrong, and what it changed

This project began from research asserting that MPPTCL's data was *"robots.txt blocked
and not programmatically retrievable"* and that no per-substation coincident load is
published in India. **Both are false**, measured 2026-09-20:

- `mptransco.in/robots.txt` returns **404**. There is no robots.txt.
- The site serves 136 KB to a plain `curl`.
- **60 monthly spreadsheets** are published at `/TransmissionSystem/EHVSsloading`.
- Every row carries installed capacity, peak MVA, **and the date and hour it fell on**.

The likely cause of the original error: MPPTCL's server negotiates TLS the old way, so a
naive Python fetch fails with an SSL error that looks like a wall. **The data was never
blocked; the client was.**

A second systematic error, found by cross-checking two signals: **every month label was
off by exactly one month** — 40 of 40 parseable labels, 100% confidence. MPPTCL's index
page labels each file by its *publication* month. A file labelled `January'2026` contains
December 2025. Fixed at source; the original label is kept as `published_label`.

## What would make this a real tool

The ask is now smaller, which makes it more likely to be granted:

1. **A stable, dated URL** for the monthly loading data. Filenames are
   `SimJune26nn.xlsx`, `MAX-LOADI-JULY-21092022.xlsx` — no convention, so every month is
   a manual hunt.
2. **The 5 pre-2022 months as `.xlsx`**, not legacy `.xls` which cannot be read.
3. **Drawal headroom, not just transformer loading** — spare MVA is not what a new
   consumer can draw; n-1, bay availability and the downstream network still bind.
4. **One real MPSEDC enquiry**, run end to end. A person, not a dataset.

## Running it

```bash
npm install
npm run dev                    # http://localhost:3205 — builds immediately
```

**A fresh clone builds and runs straight away, showing every substation as "not
assessed".** That is correct, not broken: the repo carries code, never data. To
populate it with the real measured figures:

```bash
cp .env.example .env.local        # then fill it in
bash scripts/fetch-sources.sh     # the published source documents, not committed
python3 ingest/mpptcl-loading.py  # 55 months, 432 substations, ~27,680 rows
npm run ingest                    # aggregate into MongoDB and the local dataset
npm run dev
```

### Environment

| Variable | What | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | PDF extraction and factor analysis | **Server-side only.** Never prefix with `NEXT_PUBLIC_` — that inlines it into the client bundle |
| `MONGODB_URI` | Cluster connection, **no database path** | One URI serves every environment |
| `MONGODB_DB` | `Headroom_MP_local` \| `_dev` \| `_preview` \| `_prod` | The database name is what separates environments |
| `PORT` | `3205` | |

Database assignment follows the workspace convention: the URI carries no path and
`MONGODB_DB` selects the environment, so rotating a credential is one edit rather than
one per environment.

### Testing the extraction path

`extraction-test/` probes the API behaviours the ingest depends on before any of it is
wired up. Two of the three results were not what we expected, which is the point of
probing rather than assuming:

- **Page citations do NOT work through a strict tool.** Ran twice, zero citations both
  times. The reason is structural: citations attach to `text` blocks, and a response
  returning its payload through a `tool_use` block has none. The page numbers we do have
  come from the model self-reporting them in the schema — a checkable claim, not a
  platform guarantee.
- **Merged table cells resolve correctly**, and better than the brief assumed. Rows whose
  substation column is blank inherit from a merged cell above; the model attributed them
  to `Pachora PS (Sec-I)` where we had guessed `Neemuch PS`. Checked against the page by
  eye: **the model was right and the assumption was wrong.**

```bash
cd extraction-test
ANTHROPIC_API_KEY=... bun run extract.ts
```

## Source documents

**Not committed to this repository.** `scripts/fetch-sources.sh` retrieves them.

They are published publicly by CTUIL but carry a **RESTRICTED** data-classification
marking, they are republished monthly (so any pinned copy is stale by design), and they
are not ours to redistribute. The script fetches them for local analysis only.

| Source | What it gives |
|---|---|
| CTUIL — solar/non-solar margins, Annex-IV(3) | Per-substation solar and non-solar hour access and margins |
| CTUIL — ISTS substations for bulk consumers | Load-side connectivity. **No MP substation appears on this list** |
| CEA / CEIC | Monthly peak demand for Madhya Pradesh |
| MPERC | Status of the MP power sector, network totals |
| MP SLDC | Real-time state load |
| OpenStreetMap | Substation geometry |

## Status

A demo. It has not been validated by MPPTCL, MP SLDC, MPPMCL or MPSEDC, and no figure
here should be used for an investment or planning decision without checking it against
the primary document it cites.

If you work at any of those organisations and something here is wrong, that is the most
useful possible outcome — please open an issue.

## Licence

Code is MIT. See [LICENSE](LICENSE).

The source documents are **not** covered by that licence and are not redistributed here.
They remain the property of their publishers. Figures extracted from them are reproduced
under fair-dealing for analysis and carry their citations.
