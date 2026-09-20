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
| **Verified** | Transformation capacity for 4 of 19 substations, from cited documents. Connectivity rules from the CERC GNA Regulations 2022. Peak demand from CEA. Planned augmentations and BESS tenders with their dates |
| **Derived** | Transformation capacity for substations with no published figure, estimated from voltage class |
| **Modelled** | All night headroom. **No per-substation coincident load is published anywhere in India**, so night headroom is computed from transformation capacity and state-level load. The method is shown on screen, including its weakness |
| **Not known** | Substations where neither a published nor a derivable capacity exists. These render hatched and receive **no verdict at all** |

**Nothing here is invented.** A modelled value with a stated method is not a guess, and
the difference is the point of the project. Where the tool cannot answer, it says so and
names which organisation holds the missing number.

## What would make this a real tool

Three datasets, and each one unblocks a specific factor:

1. **MPPTCL / STU** — per-substation available margin as CSV or an API, dated. Today it
   is an undated PDF behind a bot-wall.
2. **MP SLDC** — substation-level load profiles at 220 kV and above, even lagged a
   quarter. This replaces every modelled night figure with a measured one.
3. **MPPMCL** — BESS and round-the-clock procurement milestones by node.

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

`extraction-test/` probes the three API behaviours the ingest depends on, before any of
it is wired up: that PDF citations return page numbers, that citations and structured
outputs are mutually exclusive, and — the one that matters — whether Claude correctly
resolves **merged table cells**, where a row's substation column is blank and inherits
from the cell above. A naive parser gets those rows wrong.

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
