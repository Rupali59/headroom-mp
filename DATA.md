# Data model — measured, not modelled

**Supersedes** `DESIGN.md`'s confidence-ladder section, the coincidence model, the
hatching set, and the Blocked sources content. Written 2026-09-20 after the MPPTCL
loading discovery. Lanes A, C and E build against THIS file.

## What changed, and why it changes the product

`DESIGN.md` and the research dossier both assert that **"no published per-substation
coincident load exists"** and that MPPTCL's data is *"robots.txt blocked + Scribd
bot-wall, NOT programmatically retrievable."*

Both are false. Measured 2026-09-20:

| Claim | Measured |
|---|---|
| robots.txt blocks automation | `mptransco.in/robots.txt` returns **404**. There is no robots.txt |
| The document is unreachable | The dossier's `/STU_Cell/` path is dead; the live path is `/STUCell/`. The site serves 136 KB to a plain curl |
| No per-substation load is published | **60 monthly XLSX files** at `/TransmissionSystem/EHVSsloading` |
| No coincident load with a time | Every row carries **SIMULTANEOUS MAXIMUM MVA + DATE + TIME** |

**Why the dossier got it wrong, most likely:** MPPTCL's server negotiates TLS the old
way. Python fails first with `UNSAFE_LEGACY_RENEGOTIATION_DISABLED`, then with
`CERTIFICATE_VERIFY_FAILED` against certifi, the Homebrew bundle, the macOS bundle and
capath — all four — while `openssl s_client` reports `Verify return code: 0 (ok)` and
curl reports `ssl_verify_result=0`. A handshake failure read as an access policy. **The
data was never blocked; the client was.** `ingest/mpptcl-loading.py` uses curl for this
reason and that comment must not be deleted.

## What we now hold

`data-local/mpptcl-loading.json`, produced by `python3 ingest/mpptcl-loading.py`:

```
rows                          27,680
months ingested               55 of 60   (5 failed: pre-2022 legacy .xls, not .xlsx)
distinct substations          432        (MPPTCL's network is ~417 - this is all of it)
installed capacity populated  100%
night peaks (19:00-06:00)     4,471 rows across 370 substations
```

Per row: `zone · district · circle · substation · voltage_class · installed_mva ·
peak_mva · peak_hour · peak_is_night · min_mva · avg_mva · spare_at_peak_mva · month ·
source_url`.

The demo's own substations, EHV rows, worst night observation:

| node | class | installed | night peak | spare | obs |
|---|---|---|---|---|---|
| Bhopal | 400 kV | 1445 | 914 | 531 | 162 |
| Indore | 400 kV | 1260 | 577 | 683 | 270 |
| Pithampur | 400 kV | 945 | 449 | 496 | 162 |
| Ujjain | 400 kV | 630 | 304 | 326 | 162 |
| Sagar | 400 kV | 630 | 377 | 253 | 162 |
| Jabalpur | 220 kV | 640 | 397 | 243 | 54 |
| Neemuch | 220 kV | 320 | 80 | 240 | 54 |
| Bina | 400 kV | 945 | 743 | 202 | 108 |
| Katni | 400 kV | 630 | 431 | 199 | 108 |
| Seoni | 220 kV | 520 | 325 | 195 | 54 |
| Satna | 220 kV | 480 | 396 | 84 | 54 |
| Itarsi | 220 kV | 320 | 236 | 84 | 54 |
| Sendhwa | 220 kV | 160 | 93 | 67 | 54 |
| Gwalior | 220 kV | 320 | 271 | **49** | 54 |
| Birsinghpur | 220 kV | 160 | 140.5 | **20** | 54 |

15 of 16. **Birsinghpur at 88% utilised on a winter night is the news**, and it is the
node the plan already wanted flagged for BESS. Indore with 683 MVA spare sitting beside
it is the whole product.

**Seasonality, computed not asserted:** winter nights run mean utilisation 50.8%,
monsoon nights 43.7% — **winter nights are +16% hotter.** `DESIGN.md` inferred this from
two state-level monthly aggregates; it is now measured over 1,875 night-peak
observations at substation level. Caveat: n=115 winter against n=1,760 monsoon, because
most published months are non-winter. **Do not put +16% on a slide without saying n.**

## The confidence ladder, revised

`DESIGN.md`'s three-rung MVA ladder and its voltage-class `derived` tier are **obsolete**
— capacity is published for 100% of rows.

| Rung | Source | Renders |
|---|---|---|
| `verified` | MPPTCL loading sheet or a cited PDF, with month and source URL | solid |
| `researched` | web search, cited to URL + retrieval date (`ingest/research.ts`) | solid, distinct marker |
| `field` | an operator's correction, `· this session` | solid, operator marker |
| `unknown` | genuinely absent after both | hatched, excluded, counted |

`derived` and `modelled` are **removed from use**. Keep them in the `Confidence` union
so existing code compiles; nothing should emit them. If a lane finds itself reaching for
`modelled`, that is a signal the data exists and has not been looked for.

**Hatching collapses from 15 nodes to near zero.** That is a better product, and the
honest framing shifts with it: not *"here is what nobody publishes"* but *"here is your
own published data, assembled, and here is what it says about 2 a.m."*

## Risk, revised

The coincidence model is gone (it was linear in capacity, so risk restated substation
size). Replace with measured night utilisation:

```
night_utilisation = peak_mva / installed_mva        where peak_is_night
spare_at_night    = installed_mva - peak_mva

Weak factors, of 5:
  1  night_utilisation >= 0.80          Birsinghpur 0.88, Gwalior 0.85
  2  spare_at_night < requested_load
  3  winter night utilisation > monsoon by more than 20%   (seasonal exposure)
  4  single transformer at this voltage class
  5  no augmentation scheduled within 24 months

risk = count(Weak)          0 green · 1-2 amber · 3+ red
>= 2 of 5 unscoreable -> hatched, excluded, counted in the legend
```

Every one of factors 1-3 is now computable from measured data. `src/lib/risk.ts` (Lane 0)
holds the arithmetic and `tests/risk.test.ts` pins it.

## Provenance: what the page numbers actually are

**Not from the citations API.** Measured 2026-09-20, twice: `citations:{enabled:true}`
returns zero citations when the payload comes back through a strict tool, because
citations attach to `text` blocks and a tool-use response has none. The page number on
each extracted record is the **model self-reporting which page it read the row from**,
inside the tool schema.

That is still useful and it verified correct on inspection, but describe it accurately:
a model claim, checkable against the document, not a platform guarantee. Do not say
"the API cites the page" on stage.

## Caveats that ride with every number

Non-negotiable, and they go on the card, not in a footnote:

1. **Spare MVA is transformer headroom, not drawal capacity for a new consumer.** n-1,
   bay availability and the downstream network all still bind. An MPPTCL planner will
   ask this first; the honest answer is that we show what is published and name what is
   not.
2. **Rows are per voltage class.** `400KV KATNI` has separate 400/220/132 kV rows.
   Aggregate or class-select deliberately, never silently.
3. **A substation peaking at 09:00 gives no direct 02:00 figure.** `min_mva` is the
   floor; the 55-month series gives the seasonal shape.
4. **Winter sample is thin** (n=115). State it whenever the +16% is shown.
5. **Readings above 100% of installed capacity exist in the source.** `132KV SALAMATPUR`
   reads 183% (73.25 of 40 MVA) and `400KV KIRNAPUR` 101%. Short-term transformer
   overload makes 101% plausible; 183% is not, and means either the capacity or the
   reading is wrong in MPPTCL's sheet. **Clamp or flag anything over 100% as a
   data-quality exception** — never render it as a confident red node. The most extreme
   thing on screen must not be the least trustworthy.
6. **Sendhwa disagrees between pipelines.** The worked table above shows a 93 MVA night
   peak; the build-time loader finds no night peak for `220KV SENDHWA` across 54 months.
   One of the two is wrong. Recheck against the source before this node is shown.

## What the ask becomes

The old ask was *please publish this*. It is published. The new ask is better, and
smaller, which makes it more likely to be granted:

1. **A stable, dated URL.** Filenames are `SimJune26nn.xlsx`, `MAX-LOADI-JULY-21092022.xlsx`,
   `R-Max-Loading-Nov-22-1.xlsx` — no convention, so every month is a manual hunt.
2. **The 5 pre-2022 months in `.xlsx`**, not legacy `.xls`.
3. **Drawal headroom, not just transformer loading** — the figure caveat 1 names.
4. **MPSEDC: one real enquiry run end to end.** Unchanged, and still a person rather
   than a dataset.

## Lane assignments against this file

- **Lane A (map)** — `src/data/geometry.ts` is cartographic constants only. Node colour
  comes from `src/lib/risk.ts` over loader data. Do not hardcode headroom.
- **Lane C (factors)** — factors 1, 2 and 3 are no longer "blocked". Rewrite them as
  measured, with the month and source URL as the citation. Factors 7 and 8 (water,
  fibre) remain genuinely unknown and stay physical constraints, not data asks.
- **Lane E (ingest)** — `ingest/mpptcl-loading.py` exists and works. Your job is
  MongoDB load + `src/data/loader.ts`, plus wiring `extract.ts` and `research.ts`.
  **Note the language mismatch:** `package.json`'s `"ingest"` script assumes a TS entry
  point that does not exist. Either add `ingest/index.ts` that shells the Python, or
  change the script. Do not leave it broken.
