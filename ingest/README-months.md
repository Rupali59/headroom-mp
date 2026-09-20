# Month resolution — findings for whoever wires this in

Lane L. Owns `ingest/resolve-months.py` and `data-local/month-resolution.json`
(its output). Does not touch `ingest/mpptcl-loading.py`, `src/data/loader.ts`,
`src/lib/types.ts` or anything under `src/` — those are Lane H's, edited
concurrently with this lane's run. Nothing here has been wired into the
loader; that integration is explicitly not this lane's job.

Run: `python3 ingest/resolve-months.py`. Stdlib only. Output:
`data-local/month-resolution.json`.

## The brief, and what was actually found

The brief asked to recover ~12 named files whose `month` label is a bare
filename stem (`SimJune26nn`, `MAX-LOADI-JULY-21092022`, etc.) — currently
excluded from every substation's series because `src/data/loader.ts`'s
`parseMonthLabel()` only accepts `^[A-Za-z]+'\d{4}$` (e.g. `July'2026`), and
a filename stem never matches that.

That part of the brief is done: **14 files** currently carry an unparseable
label (not the ~12 named — see "Headcount mismatch" below), all 14 resolve
at **100% modal confidence** from their own row dates, and one (`EHV_Ss_
Loading_2020`) is genuinely unresolvable and is reported as such, with a
reason, not dropped silently.

But the same method — modal year-month from each row's own `peak_date` —
applied to every ingested file, not just the excluded ones, surfaces a much
bigger problem: **every one of the other 40 files, all of which already
carry a "readable" label that parses fine today, is ALSO wrong, by exactly
one month, 100% of the time.** That is not a filename-parsing bug in this
script or in the excluded 14 — it is in the label MPPTCL's own index page
hangs on the file, which `ingest/mpptcl-loading.py`'s `discover()` scrapes
verbatim (see that file's `discover()`, ~line 89: labels come from text next
to each file's link on the index page, not from the file's own content or
filename). This script does not fix that — it is not this lane's file to
edit — but it is the single most important thing this run found, because it
means the "9% excluded" framing undersells the actual gap: **100% of the 55
successfully-ingested files carry a month label that disagrees with their
own data**, 14 by being unparseable and dropped, 40 by being wrong and kept.

## Method (per the brief, in order of trust)

1. **Row dates, primary.** Every row carries `peak_date` (ISO, ~99% of
   rows). A file's true month is the modal year-month across its own rows.
   Reported per file with the modal share — every one of the 54 files with
   any rows resolved at **100.0%** share (all its dated rows agree on one
   calendar month). No file needed the "95%+ = confident, otherwise flag
   the split" fallback the brief anticipated; the real data turned out to
   be cleaner than expected on this axis.
2. **Filename, cross-check only.** `parse_filename()` finds a month WORD
   in the filename and prefers the nearest YEAR token, explicitly
   distrusting bare 8-digit `DDMMYYYY` tokens as a source of the year (the
   brief's named trap: `MAX-LOADI-JULY-21092022`'s `21092022` is a
   publication date, 21/09/2022, not the data month/year). Every
   8-digit-derived year candidate is tagged
   `publication-date-8digit-LOW-CONFIDENCE` in the output and is never
   preferred over a standalone 4-digit year or a 2-digit year adjacent to
   the month word, when either exists.
3. **Disagreements reported, never reconciled silently.** `files[].
   current_label_agrees_with_resolved` is `true`/`false`/`null` (never a
   bare drop), and every `false` is duplicated into the top-level
   `disagreements[]` array with both answers, the offset in months, and
   which case it is (previously-excluded stem vs. already-readable-but-
   wrong).
4. **Unresolvable, named as such.** 5 files failed to download/parse at
   all (`BadZipFile`, from the ingest run's own `failures[]`) and
   contribute zero rows — no `peak_date` signal exists for them, so they
   are `unresolved` with a reason, not silently absent. `EHV_Ss_
   Loading_2020` is one of the 5, matching the brief's expectation.

## Per-file table (actual script output, `data-local/month-resolution.json`)

All 54 files resolved at 100.0% row-date confidence. The 14 previously
excluded (bare filename-stem label) are marked `[was EXCLUDED]`; every one
of the other 40 disagrees with its current label by exactly **-1 month**
(current label = true month + 1):

```
filename                                           current label              resolved    conf%  method     agree
----------------------------------------------------------------------------------------------------------------------------------
Loading September-22 (Web).xlsx                    October'2022               2022-09     100.0  row-dates  **NO**
MAX-LOADI-JULY-21092022.xlsx                       MAX-LOADI-JULY-21092022    2022-07     100.0  row-dates  n/a [was EXCLUDED]
MAX-LOADING-DEC-22.xlsx                            January'2023               2022-12     100.0  row-dates  **NO**
MAX-LOADING-JUNE-27072022.xlsx                     July'2022                  2022-06     100.0  row-dates  **NO**
MAX-LOADING-MAY-27072022.xlsx                      June'2022                  2022-05     100.0  row-dates  **NO**
MAXIMUM-feb-10052023.xlsx                          March'2023                 2023-02     100.0  row-dates  **NO**
MAX_LOAD_mo_Aug_2024.xlsx                          September'2024             2024-08     100.0  row-dates  **NO**
MAX_LOAD_mo_Oct_2024.xlsx                          November'2024              2024-10     100.0  row-dates  **NO**
MAX_LOAD_mo_Sep_2024.xlsx                          October'2024               2024-09     100.0  row-dates  **NO**
MAX_Loading_Dec23.xlsx                             January'2024               2023-12     100.0  row-dates  **NO**
MAx-Loadig-Apri-23-24052023.xlsx                   May'2023                   2023-04     100.0  row-dates  **NO**
Max Loading-March-23.xlsx                          Max Loading-March-23       2023-03     100.0  row-dates  n/a [was EXCLUDED]
Max-Loa-Aug-22-21092022.xlsx                       September'2022             2022-08     100.0  row-dates  **NO**
Max-Loa-Jan-03032023.xlsx                          February'2023              2023-01     100.0  row-dates  **NO**
Max-Loading-April-27052022.xlsx                    May'2022                   2022-04     100.0  row-dates  **NO**
Max-Loading-May24-8072024.xlsx                     June'2024                  2024-05     100.0  row-dates  **NO**
MaxLoading-Feb-2022.xlsx                           March'2022                 2022-02     100.0  row-dates  **NO**
MaxLoading-Mar-2022.xlsx                           MaxLoading-Mar-2022        2022-03     100.0  row-dates  n/a [was EXCLUDED]
Max_Load_Dec_2024.xlsx                             January'2025               2024-12     100.0  row-dates  **NO**
Max_Load_Jan_2025.xlsx                             February'2025              2025-01     100.0  row-dates  **NO**
Max_Load_Nov_2024.xlsx                             Max_Load_Nov_2024          2024-11     100.0  row-dates  n/a [was EXCLUDED]
Maximum-April-2-2024.xlsx                          May'2024                   2024-04     100.0  row-dates  **NO**
Maximum-Ave-Min-loading-May-23.xlsx                June'2023                  2023-05     100.0  row-dates  **NO**
Maximum-Ave-MinLoad-July-24-14082024.xlsx          Maximum-Ave-MinLoad-July-24-14082024 2024-07 100.0 row-dates n/a [was EXCLUDED]
Maximum-June24-06082024.xlsx                       July'2024                  2024-06     100.0  row-dates  **NO**
Maximum-Nov-23-0312024.xlsx                        Maximum-Nov-23-0312024     2023-11     100.0  row-dates  n/a [was EXCLUDED]
Maximum-Oct-23-30112023.xlsx                       November'2023              2023-10     100.0  row-dates  **NO**
Maxumum-Min-Average-Load-24062025.xlsx             June'2025                  2025-05     100.0  row-dates  **NO**
R-Max-Loading-Nov-22-1.xlsx                        R-Max-Loading-Nov-22-1     2022-11     100.0  row-dates  n/a [was EXCLUDED]
Revised-Max-Sep-23.xlsx                            October'2023               2023-09     100.0  row-dates  **NO**
S-Maximum-June23.xlsx                              July'2023                  2023-06     100.0  row-dates  **NO**
SIM-AUG25-24092025.xlsx                            September'2025             2025-08     100.0  row-dates  **NO**
SIM-JAN-26-17022026.xlsx                           February'2026              2026-01     100.0  row-dates  **NO**
SIM-JULY-25-21082025.xlsx                          SIM-JULY-25-21082025       2025-07     100.0  row-dates  n/a [was EXCLUDED]
SIM-OCT-25-01122025.xlsx                           November'2025              2025-10     100.0  row-dates  **NO**
SIM-SEP-25-n.xlsx                                  October'2025               2025-09     100.0  row-dates  **NO**
SIM-jULY21082029.xlsx                              SIM-jULY21082029           2026-07     100.0  row-dates  n/a [was EXCLUDED]
Sim-April2602.xlsx                                 May'2026                   2026-04     100.0  row-dates  **NO**
Sim-M-Dec-25-28012026.xlsx                         January'2026               2025-12     100.0  row-dates  **NO**
Sim-MAximum-Feb25-22042025.xlsx                    March'2025                 2025-02     100.0  row-dates  **NO**
Sim-Ma-Load-May06072026.xlsx                       June'2026                  2026-05     100.0  row-dates  **NO**
Sim-Mar-27042026.xlsx                              Sim-Mar-27042026           2026-03     100.0  row-dates  n/a [was EXCLUDED]
Sim-Max-April-25-21052025.xlsx                     May'2025                   2025-04     100.0  row-dates  **NO**
Sim-Max-Ave-march-02052025.xlsx                    Sim-Max-Ave-march-02052025 2025-03     100.0  row-dates  n/a [was EXCLUDED]
Sim-Maximum-Load-January-24-22022024.xlsx          February'2024              2024-01     100.0  row-dates  **NO**
Sim-Maximum-March-22042024.xlsx                    Sim-Maximum-March-22042024 2024-03     100.0  row-dates  n/a [was EXCLUDED]
Sim-Mo-June-25-28072025.xlsx                       July'2025                  2025-06     100.0  row-dates  **NO**
Sim-Nov-25-28012026.xlsx                           Sim-Nov-25-28012026        2025-11     100.0  row-dates  n/a [was EXCLUDED]
Sim-feb-15042026.xlsx                              March'2026                 2026-02     100.0  row-dates  **NO**
SimJune26nn.xlsx                                   July'2026                  2026-06     100.0  row-dates  **NO**
WEB-LOAD-OCT-22.xlsx                               November'2022              2022-10     100.0  row-dates  **NO**
Web-Loading-Aug-23.xlsx                            September'2023             2023-08     100.0  row-dates  **NO**
Web-loading -July-23.xlsx                          Web-loading -July-23       2023-07     100.0  row-dates  n/a [was EXCLUDED]
load-February-2024.xlsx                            March'2024                 2024-02     100.0  row-dates  **NO**
```

54 files, 40 disagreements (all -1 month, all in the "already readable"
group), 14 previously-excluded files recovered.

## Headcount mismatch vs. the brief

The brief expected "~55 files total, of which roughly 5-6 currently carry
unparseable labels." Actual: **55 files ingested successfully** (per the
ingest run's own `months_ok`), but **only 54 have any rows at all** (see
"Count caveat" below), and of those 54, **14 carry an unparseable label**,
not 5-6. The brief's list of 12 named filenames conflated two different
failure modes that turned out to need separating:

- **6 of the 12 named files** (`MAX-LOADI-JULY-21092022`,
  `R-Max-Loading-Nov-22-1`, `MaxLoading-Mar-2022`,
  `Maximum-Nov-23-0312024`, `Max Loading-March-23`,
  `Web-loading -July-23`) genuinely still carry a raw filename-stem label
  in today's data and are genuinely excluded — as expected.
- **5 of the 12 named files** (`SimJune26nn`, `WEB-LOAD-OCT-22`,
  `load-February-2024`, `Sim-feb-15042026`, `MAXIMUM-feb-10052023`)
  already carry a "readable" `Month'YYYY` label in today's data — MPPTCL's
  index page evidently supplied one for these — so they are **not**
  currently excluded. They are, however, all wrong by the same -1-month
  offset as every other "readable" file (see above), so recovering them
  correctly is still worth doing, just via a different code path than the
  brief assumed (correcting a wrong label, not un-excluding a missing one).
- **1 of the 12** (`EHV_Ss_Loading_2020`) failed to download/parse
  entirely and has zero rows, confirmed unresolvable, exactly as the brief
  predicted.
- **8 more files not named in the brief** (`Max_Load_Nov_2024`,
  `Maximum-Ave-MinLoad-July-24-14082024`, `SIM-JULY-25-21082025`,
  `SIM-jULY21082029`, `Sim-Mar-27042026`, `Sim-Max-Ave-march-02052025`,
  `Sim-Maximum-March-22042024`, `Sim-Nov-25-28012026`) also carry raw
  filename-stem labels today and are also excluded. These were not in the
  brief's list but are resolved here at 100% confidence like the rest.

Net: 14 files unparseable-and-excluded (not 12, not 5-6), all recovered;
6 more disagreements the brief didn't anticipate on files that were never
excluded to begin with.

## Disagreements: all -1 month, all one direction, all 100% confident

Every disagreement (40 of them, full list in `disagreements[]` in the JSON
output) has `offset_months: -1` — the current label is always exactly one
calendar month ahead of the row-date truth, never behind, never off by more
than one. That is not consistent with individually-mistyped filenames (the
brief's `MAX-LOADI-JULY-21092022` trap): it is consistent with MPPTCL's
index page systematically labelling each report by the month it was
**published**, not the month its data **covers** — e.g. a report titled
"Loading September-22" on the file itself, containing September 2022 data,
sits on the index page next to the text `October'2022`, presumably because
it was uploaded in October. `ingest/mpptcl-loading.py`'s `discover()`
(~line 89-99) scrapes that index-page text as the label; it has no way to
know it is a publication date, and this script's evidence — 100% row-date
agreement on every single file, no split, no ambiguity — says the row
dates, not the index-page label, are the report's real month.

**This is a finding about MPPTCL's site and/or `ingest/mpptcl-loading.py`'s
`discover()`, not about this script.** Fixing it is out of this lane's
scope (that file belongs to Lane H, being edited concurrently) — flagging
it here because it changes what "recovering the excluded months" means:
the 14 excluded files were never the only mislabeled ones.

## Unresolved

```
December'2019         reason: download/parse failure (BadZipFile: File is not a zip file) — zero rows ingested
December'2020         reason: download/parse failure (BadZipFile: File is not a zip file) — zero rows ingested
January'2022          reason: download/parse failure (BadZipFile: File is not a zip file) — zero rows ingested
December'2018         reason: download/parse failure (BadZipFile: File is not a zip file) — zero rows ingested
EHV_Ss_Loading_2020    reason: download/parse failure (BadZipFile: File is not a zip file) — zero rows ingested
```

All 5 are from the ingest run's own `failures[]` — these files never
produced a single row, so there is no `peak_date` signal to resolve from
and nothing to cross-check a filename guess against. `EHV_Ss_Loading_2020`
is confirmed unresolvable, matching the brief's expectation, but for a
blunter reason than "names a year and no month": it has **zero rows of any
kind**, so the question of what its rows' dates say never arises. All 5 are
pre-2022 or early-2022 files; likely legacy `.xls` (not `.xlsx`/zip)
formats MPPTCL later migrated away from — consistent with
`ingest/mpptcl-loading.py`'s own comment ("5 failed: pre-2022 legacy .xls,
not .xlsx", `DATA.md:36`).

## Count caveat: 55 reported ok, only 54 have rows

The ingest run's own summary says `months_ok: 55`, but only **54 distinct
`source_url` values appear anywhere in `rows`**. At least one file
downloaded and parsed without error (so it does not appear in `failures[]`
either) and still contributed zero data rows — an empty or unrecognisable
sheet, most likely. Its identity is **not recoverable from
`mpptcl-loading.json`**: the ingest output only records a label/URL for
FAILED months; a month that "succeeded" but produced nothing leaves no
trace of which one it was anywhere in this file. Reported in
`month-resolution.json`'s top-level `count_caveat` rather than silently
absorbed into "55 resolved" — flagged for whoever owns
`ingest/mpptcl-loading.py` to log every attempted file's row count, not
just failures, so this becomes identifiable next run.

## Seasonal impact — DATA.md's winter-vs-monsoon headline

DATA.md (line ~70): *"winter nights run mean utilisation 50.8%, monsoon
nights 43.7% — winter nights are +16% hotter... measured over 1,875
night-peak observations at substation level. Caveat: n=115 winter against
n=1,760 monsoon."*

This script recomputes the same quantity three ways, all using the same
definitions `src/data/loader.ts` uses (IMD winter = Dec/Jan/Feb, monsoon =
Jun-Sep; night = `peak_hour >= 19 or peak_hour <= 6`; utilisation =
`peak_mva / installed_mva`):

| Variant | Winter mean | Winter n | Monsoon mean | Monsoon n | Gap | Total n |
|---|---|---|---|---|---|---|
| **DATA.md published** | 50.8% | 115 | 43.7% | 1,760 | +16.2% | 1,875 |
| **A — replication** (current labels, row-level) | 50.8% | 115 | 44.3% | 1,788 | +14.7% | 1,903 |
| **B — + recovered months only** (the literal ask) | 50.8% | 115 | 44.4% | 2,389 | +14.4% | 2,504 |
| **C — fully corrected, all 54 files** | **51.4%** | **230** | 44.2% | 2,274 | **+16.3%** | 2,504 |

### Reading this table honestly

**Variant A does not exactly reproduce DATA.md's published numbers** (winter
matches exactly; monsoon is 44.3%/n=1,788 here vs. published 43.7%/n=1,760
— a gap of 28 observations and 0.6 points). The most likely reason: DATA.md
and `loader.ts`'s `winterNightUtilisation`/`monsoonNightUtilisation` are
computed **per substation label, on that label's single "primary" voltage
class** (`aggregateSubstations()`'s `pickPrimaryClass()`,
`src/data/loader.ts` "AGGREGATION CHOICE #2"), not across every row —
substations with more than one voltage class (roughly 71 of the 432, by row
count) contribute one primary-class row per month there, and every row here.
Reproducing `pickPrimaryClass()` faithfully in Python would duplicate
Lane H's aggregation logic, which is out of this lane's scope and risks
introducing a second, independently-wrong implementation of the same
decision. **This is flagged, not swept under "close enough."** It does not
undermine variants B and C relative to A, though, because all three use the
identical row-level method — only which month each row is assigned to
changes between them — so the *direction and size of the change* from
recovering/correcting months is trustworthy even where the absolute
baseline is not pinned to DATA.md's exact published figure.

**B — the literal ask — barely moves the gap** (16.2% → roughly 14.4%,
against this script's own 14.7% baseline, i.e. -0.3 points from adding just
the 14 recovered files): the 14 previously-excluded files' resolved months
are `2022-07`, `2022-11`, `2022-03`, `2023-03`, `2023-07`, `2023-11`,
`2024-03`, `2024-07`, `2024-11`, `2025-03`, `2025-07`, `2025-11`, `2026-03`,
`2026-07` — heavy on July and November, **none in Dec/Jan/Feb**, so winter
is untouched (still n=115) while monsoon's `n` grows by 601 (five recovered
July files). The winter sample thinness DATA.md warns about is **not**
fixed by the literal recovery task.

**C — correcting the systematic -1-month offset on every file — is the
one that matters.** Winter's sample **essentially doubles, 115 → 230**,
because true-February files that the current pipeline mislabels "March"
(non-winter) are currently being **silently dropped from the winter
bucket entirely**, not merely dropped from the dataset. DATA.md's own
caveat — *"Winter sample is thin (n=115)... most published months are
non-winter"* — is not simply a fact about MPPTCL's publication cadence:
it is at least partly an **artifact of the labelling bug**, which
mislabels real winter (February) data out of the winter window before
anyone gets to compute a mean from it. Correcting it does not overturn the
headline — the gap ends up **+16.3%, statistically the same "+16% hotter"
claim** — but it rests on a winter sample twice the size DATA.md reports,
which is a materially stronger claim to put in front of MP government
officials than the one currently on slide 6.

### What to tell slide 6

- The **"+16% hotter" headline survives correction** — do not retract it.
- The **n=115 caveat is overstated**: the true winter sample, once months
  are labelled correctly, is closer to **n≈230**, roughly double. State the
  corrected n, not the current one, once this is wired in — n=115 is worse
  than the data actually is.
- **Do not ship variant B's number (14.4%) as "the corrected figure."**
  It reflects only this lane's literal task (recovering 14 previously-
  excluded files) and is *not* what happens once the underlying labelling
  bug is fixed — variant C is the one that answers "what does this look
  like once the data is actually right."
- This script's absolute figures (A/B/C) are **row-level**, not the
  published per-substation-primary-class figure DATA.md uses — treat the
  *changes* (A→B→C) as reliable and the *absolute baseline* as
  approximate until someone reproduces `pickPrimaryClass()` in whichever
  pipeline recomputes DATA.md's number for real.

## What `data-local/month-resolution.json` contains

- `files[]` — one entry per of the 54 files with any rows: `source_url`,
  `filename`, `n_rows`, `currently_excluded_by_loader`, `current_label`,
  `current_label_parses`, `current_label_yyyymm`, `row_date_signal`
  (modal `resolved_yyyymm`, `n_dated_rows`, `modal_confidence_pct`, top-5
  `distribution`), `filename_cross_check` (month word found, all year
  candidates with their trust level, best guess), `resolved_yyyymm`,
  `resolution_method`, and both agreement booleans.
- `disagreements[]` — the 40 entries above, flattened with the offset and a
  human-readable note distinguishing "previously excluded" from "already
  readable but wrong."
- `unresolved[]` — the 5 failed-download files, each with a reason.
- `count_caveat` — the 55-vs-54 gap, explained.
- `seasonal_impact` — the table above, plus the raw published figures it
  is compared against, plus `replication_matches_data_md: false` (honest —
  see above, do not treat replication as validated).

## For whoever wires this in (not this lane)

1. `ingest/mpptcl-loading.py`'s `discover()` should prefer a month
   derived from the file's own content/data (or this script's row-date
   method, applied to *every* file, not just the 14 that fail to parse a
   label at all) over the index-page text label, which this run shows is
   wrong 100% of the time it's checkable.
2. `src/data/loader.ts`'s `parseMonthLabel()` / `SERIES_SCOPED_LABELS`
   consumer should be able to take an out-of-band resolved month (from
   `month-resolution.json`) for the 14 currently-excluded files, rather
   than continuing to drop them.
3. Whatever recomputes DATA.md's headline for real should reproduce
   variant C's row-to-month mapping, not variant A's or B's, and should do
   it at the same per-substation-primary-class level DATA.md uses so the
   figure is exactly right, not merely directionally right.
4. Log every attempted file's row count during ingest (not just
   failures), so the 55-vs-54 gap's file becomes identifiable.
