#!/usr/bin/env python3
"""
Resolve every ingested MPPTCL monthly file to its true YYYY-MM, using the
data's own dates as the primary signal — not the filename, and not the
label MPPTCL's index page hung on the file.

WHY THIS EXISTS
----------------
`data-local/mpptcl-loading.json` (produced by `ingest/mpptcl-loading.py`)
carries one `month` string per row, scraped verbatim from MPPTCL's own
index page text next to each file's link (see that script's `discover()`).
For files the index page left unlabelled, the fallback label is the
filename stem — things like `SimJune26nn` or `MAX-LOADI-JULY-21092022`.
`src/data/loader.ts`'s `parseMonthLabel()` only accepts `^[A-Za-z]+'\\d{4}$`
(e.g. `July'2026`), so every filename-stem label fails to parse and the
whole month is silently dropped from every substation's series and from
the winter/monsoon seasonal split. That is ~9% of ingested files, thrown
away, even though the data inside them is fine.

METHOD, IN ORDER OF TRUST
--------------------------
1. PRIMARY: each row carries `peak_date`, an ISO date on ~99% of rows —
   the day that row's SIMULTANEOUS MAXIMUM was recorded. A file's true
   month is the modal year-month across its own rows' `peak_date`. This
   needs no filename guessing and is reported per file with its modal
   share, never picked silently.
2. SECONDARY, cross-check only: parse the filename for a month word and a
   nearby year. Never let a parsed filename year override the row-date
   answer — a filename can carry a PUBLICATION date (e.g. the 8-digit
   `21092022` in `MAX-LOADI-JULY-21092022` is 21/09/2022, when the file
   was uploaded, not the month it reports on).
3. Disagreements between the filename guess and the row-date answer are
   reported, never reconciled silently — row dates win, but both answers
   are recorded so a human can see whether MPPTCL mislabelled the file on
   its own site or something in this pipeline is wrong.
4. Files with no usable row dates (failed downloads, zero rows) are
   emitted as `unresolved`, with a reason. Never a bare drop.

OUTPUT
------
`data-local/month-resolution.json` — one entry per source file (matched by
`source_url`, the only stable per-file key in the ingest output), with the
resolved YYYY-MM, confidence, method, the current label the data carries
today, whether that label agrees, and the filename's own cross-check
answer. Plus a `seasonal_impact` section recomputing DATA.md's winter vs
monsoon night-utilisation figure three ways: as currently computed
(replicating DATA.md to prove this script's numbers agree before trusting
anything past that point), with only the previously-excluded files
recovered (what this lane was asked for), and with EVERY file's month
corrected to its row-date answer (the larger finding this script turned
up — see README-months.md).

Run: python3 ingest/resolve-months.py
No third-party dependencies — stdlib only, matching the rest of ingest/.
"""

from __future__ import annotations

import collections
import json
import pathlib
import re
import urllib.parse

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
INPUT_PATH = REPO_ROOT / "data-local" / "mpptcl-loading.json"
OUTPUT_PATH = REPO_ROOT / "data-local" / "month-resolution.json"

MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]
MONTH_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

CURRENT_LABEL_RE = re.compile(r"^([A-Za-z]+)'(\d{4})$")  # what loader.ts's parseMonthLabel accepts

# IMD-convention seasons, matching src/data/loader.ts WINTER_MONTHS / MONSOON_MONTHS.
WINTER_MONTHS = {12, 1, 2}
MONSOON_MONTHS = {6, 7, 8, 9}


def is_night(hour) -> bool:
    """DATA.md's night band, 19:00-06:00 inclusive both ends — matches
    ingest/mpptcl-loading.py's _shape() and src/data/loader.ts's isNightHour()."""
    if hour is None:
        return False
    return hour >= 19 or hour <= 6


def season_of_month(month_num: int | None) -> str | None:
    if month_num is None:
        return None
    if month_num in WINTER_MONTHS:
        return "winter"
    if month_num in MONSOON_MONTHS:
        return "monsoon"
    return None


def parse_current_label(label: str) -> tuple[int, int] | None:
    """Parse a `Month'YYYY` label into (year, month). None if it does not
    match — this is exactly what `src/data/loader.ts`'s `parseMonthLabel`
    accepts, reproduced here so 'does this label currently work in the
    loader' is answered the same way in both places."""
    m = CURRENT_LABEL_RE.match(label.strip())
    if not m:
        return None
    name = m.group(1).lower()
    if name not in MONTH_NAMES:
        return None
    return int(m.group(2)), MONTH_NAMES.index(name) + 1


def parse_filename(filename: str) -> dict:
    """Cross-check only. Finds a month WORD in the filename and prefers the
    year token nearest it, explicitly distrusting bare 8-digit tokens
    (DDMMYYYY publication-date stamps) as the source of the YEAR — but
    still surfaces them so a human can see what was rejected and why.
    """
    stem = pathlib.Path(urllib.parse.unquote(filename)).stem
    lower = stem.lower()

    month_word = None
    month_num = None
    month_span = None
    # Prefer full month names over abbreviations (e.g. "September" contains "sep").
    for name in MONTH_NAMES:
        idx = lower.find(name)
        if idx != -1:
            month_word = name
            month_num = MONTH_NAMES.index(name) + 1
            month_span = (idx, idx + len(name))
            break
    if month_word is None:
        for abbr, num in MONTH_ABBR.items():
            idx = lower.find(abbr)
            if idx != -1:
                month_word = abbr
                month_num = num
                month_span = (idx, idx + len(abbr))
                break

    # All digit tokens in the stem, with position, so we can prefer the one
    # nearest the month word and flag 8-digit (DDMMYYYY) ones as probable
    # publication-date stamps rather than the data year.
    tokens = [(m.start(), m.group(0)) for m in re.finditer(r"\d+", stem)]
    candidates = []
    for pos, tok in tokens:
        is_pub_date_shape = len(tok) == 8
        if len(tok) == 4 and 2015 <= int(tok) <= 2030:
            year = int(tok)
            trust = "standalone-4digit-year"
        elif len(tok) == 2 and month_span is not None:
            year = 2000 + int(tok)
            trust = "2digit-near-month" if not (2015 <= year <= 2030) else "2digit-near-month"
            if not (2015 <= year <= 2030):
                continue
        elif is_pub_date_shape:
            # DDMMYYYY (or similar) — last 4 digits as a low-confidence
            # fallback only; this is the trap the brief names explicitly.
            year = int(tok[-4:])
            trust = "publication-date-8digit-LOW-CONFIDENCE"
        else:
            continue
        dist = abs(pos - month_span[0]) if month_span is not None else 9999
        candidates.append({"token": tok, "year_guess": year, "trust": trust, "distance_from_month_word": dist})

    candidates.sort(key=lambda c: (c["trust"] == "publication-date-8digit-LOW-CONFIDENCE", c["distance_from_month_word"]))

    best_year = None
    best_trust = None
    if candidates:
        # Never let a publication-date-shaped token win if any better one exists.
        trustworthy = [c for c in candidates if c["trust"] != "publication-date-8digit-LOW-CONFIDENCE"]
        pick = trustworthy[0] if trustworthy else candidates[0]
        best_year = pick["year_guess"]
        best_trust = pick["trust"]

    guess_yyyymm = None
    if month_num is not None and best_year is not None:
        guess_yyyymm = f"{best_year:04d}-{month_num:02d}"

    return {
        "filename": stem,
        "month_word_found": month_word,
        "month_num_found": month_num,
        "year_candidates": candidates,
        "best_year_guess": best_year,
        "best_year_trust": best_trust,
        "filename_guess_yyyymm": guess_yyyymm,
    }


def modal_yearmonth(rows: list[dict]) -> dict:
    dated = [r["peak_date"] for r in rows if r.get("peak_date")]
    counts = collections.Counter(d[:7] for d in dated)
    total_dated = len(dated)
    if not counts:
        return {
            "resolved_yyyymm": None,
            "n_rows": len(rows),
            "n_dated_rows": 0,
            "modal_confidence_pct": None,
            "distribution": {},
            "confident": False,
        }
    ranked = counts.most_common()
    top_ym, top_n = ranked[0]
    share = round(100.0 * top_n / total_dated, 1)
    return {
        "resolved_yyyymm": top_ym,
        "n_rows": len(rows),
        "n_dated_rows": total_dated,
        "modal_confidence_pct": share,
        "distribution": dict(ranked[:5]),  # top 5 year-months present, for transparency
        "confident": share >= 95.0,
    }


def mean_utilisation_pct(rows: list[dict]) -> tuple[float | None, int]:
    usable = [
        r for r in rows
        if r.get("peak_mva") is not None and r.get("installed_mva")
        and r["installed_mva"] > 0
    ]
    if not usable:
        return None, 0
    total = sum(r["peak_mva"] / r["installed_mva"] for r in usable)
    return round(100.0 * total / len(usable), 1), len(usable)


def main() -> None:
    with open(INPUT_PATH) as f:
        data = json.load(f)

    rows = data["rows"]
    failures = data.get("failures", [])
    months_ok_reported = data.get("months_ok")

    by_url: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        by_url[r["source_url"]].append(r)

    print(f"loaded {len(rows)} rows across {len(by_url)} distinct source files "
          f"(ingest reported months_ok={months_ok_reported}, months_failed={data.get('months_failed')})\n")

    resolved: list[dict] = []
    disagreements: list[dict] = []

    for url, rs in sorted(by_url.items()):
        filename = urllib.parse.unquote(pathlib.Path(url).name)
        current_label = collections.Counter(r["month"] for r in rs).most_common(1)[0][0]
        current_parsed = parse_current_label(current_label)
        current_label_parses = current_parsed is not None
        current_yyyymm = (
            f"{current_parsed[0]:04d}-{current_parsed[1]:02d}" if current_parsed else None
        )

        rowdate = modal_yearmonth(rs)
        fname_parse = parse_filename(filename)

        resolved_yyyymm = rowdate["resolved_yyyymm"]
        method = "row-dates" if resolved_yyyymm and rowdate["confident"] else (
            "row-dates-low-confidence" if resolved_yyyymm else "filename"
        )
        if resolved_yyyymm is None and fname_parse["filename_guess_yyyymm"] is not None:
            resolved_yyyymm = fname_parse["filename_guess_yyyymm"]
            method = "filename"
        if resolved_yyyymm is None:
            method = "unresolved"

        current_vs_resolved_agree = (
            current_yyyymm == resolved_yyyymm if current_yyyymm and resolved_yyyymm else None
        )
        filename_vs_resolved_agree = (
            fname_parse["filename_guess_yyyymm"] == resolved_yyyymm
            if fname_parse["filename_guess_yyyymm"] and resolved_yyyymm else None
        )

        entry = {
            "source_url": url,
            "filename": filename,
            "n_rows": len(rs),
            "currently_excluded_by_loader": not current_label_parses,
            "current_label": current_label,
            "current_label_parses": current_label_parses,
            "current_label_yyyymm": current_yyyymm,
            "row_date_signal": rowdate,
            "filename_cross_check": fname_parse,
            "resolved_yyyymm": resolved_yyyymm,
            "resolution_method": method,
            "current_label_agrees_with_resolved": current_vs_resolved_agree,
            "filename_agrees_with_resolved": filename_vs_resolved_agree,
        }
        resolved.append(entry)

        if current_vs_resolved_agree is False:
            offset = None
            if current_yyyymm and resolved_yyyymm:
                cy, cm = int(current_yyyymm[:4]), int(current_yyyymm[5:7])
                ry, rm = int(resolved_yyyymm[:4]), int(resolved_yyyymm[5:7])
                offset = (ry - cy) * 12 + (rm - cm)
            disagreements.append({
                "filename": filename,
                "current_label": current_label,
                "current_label_yyyymm": current_yyyymm,
                "resolved_yyyymm": resolved_yyyymm,
                "resolved_confidence_pct": rowdate["modal_confidence_pct"],
                "offset_months": offset,
                "note": "current label was already 'readable' (parses as Month'YYYY) but "
                        "disagrees with the modal row date" if current_label_parses
                        else "current label is a bare filename stem — this file is currently "
                             "EXCLUDED from every substation's series",
            })

    # ---- unresolved: files that failed to download/parse entirely -------
    unresolved: list[dict] = []
    for fail in failures:
        unresolved.append({
            "label_on_index_page": fail["month"],
            "filename": None,
            "reason": f"download/parse failure ({fail['error']}) — zero rows ingested, "
                      "no peak_date signal and no row data of any kind to resolve from",
            "resolution_method": "unresolved",
        })

    # The ingest summary says months_ok=55 but only 54 distinct source_url
    # values appear in `rows` — one "ok" file contributed zero data rows.
    # Its identity is not recoverable from this JSON: only FAILED months are
    # named anywhere in the ingest output (`failures`); a month that
    # downloaded, parsed as a valid zip/xlsx, and produced an empty sheet
    # leaves no trace of its label or URL. Reported here rather than
    # silently absorbed into "55 resolved" — see README-months.md.
    count_caveat = None
    if isinstance(months_ok_reported, int) and months_ok_reported != len(by_url):
        count_caveat = {
            "months_ok_reported_by_ingest": months_ok_reported,
            "distinct_source_files_with_rows": len(by_url),
            "gap": months_ok_reported - len(by_url),
            "reason": "ingest reported this many months as successfully downloaded+parsed, but "
                      "this many fewer distinct source_url values actually appear in `rows` — at "
                      "least one 'ok' file produced zero data rows. Its filename/label cannot be "
                      "recovered from mpptcl-loading.json: the ingest script only records identity "
                      "for FAILED months (`failures`), not for empty-but-technically-ok ones. "
                      "Flagged for whoever owns ingest/mpptcl-loading.py to log every attempted "
                      "file's row count, not just failures.",
        }

    # ---------------------------------------------------------------------
    # Seasonal impact: DATA.md's headline (winter 50.8% vs monsoon 43.7%,
    # n=1,875 night-peak observations, winter n=115).
    #
    # Three variants, computed identically except for which YYYY-MM each
    # row is assigned to:
    #   A) "as currently computed" — parse each row's CURRENT `month` label
    #      the way loader.ts does; unparseable labels drop out. This must
    #      reproduce DATA.md's published numbers, or this script's method
    #      does not match production and nothing past this point can be
    #      trusted.
    #   B) "recovered" — same as (A), but for files this script resolved
    #      that were previously excluded (bare filename-stem labels), use
    #      the resolved YYYY-MM instead of dropping them. This is the
    #      literal ask: what changes when the ~9% comes back.
    #   C) "fully corrected" — use THIS SCRIPT's resolved YYYY-MM (the
    #      row-date modal answer) for every file, including the ~40 files
    #      whose current label already "looks read able" (parses as
    #      Month'YYYY) but was scraped from MPPTCL's own index page and is
    #      not the same month as the data inside the file — see
    #      README-months.md for how consistent that gap is.
    # ---------------------------------------------------------------------
    resolved_by_url = {e["source_url"]: e["resolved_yyyymm"] for e in resolved}
    currently_excluded_urls = {e["source_url"] for e in resolved if e["currently_excluded_by_loader"]}

    def bucket(rows_subset: list[dict], month_of_row) -> dict:
        winter_rows, monsoon_rows = [], []
        for r in rows_subset:
            if not is_night(r.get("peak_hour")):
                continue
            ym = month_of_row(r)
            if ym is None:
                continue
            month_num = int(ym[5:7])
            season = season_of_month(month_num)
            if season == "winter":
                winter_rows.append(r)
            elif season == "monsoon":
                monsoon_rows.append(r)
        w_mean, w_n = mean_utilisation_pct(winter_rows)
        m_mean, m_n = mean_utilisation_pct(monsoon_rows)
        gap_pct = None
        if w_mean is not None and m_mean not in (None, 0):
            gap_pct = round(100.0 * (w_mean - m_mean) / m_mean, 1)
        return {
            "winter_mean_utilisation_pct": w_mean,
            "winter_n": w_n,
            "monsoon_mean_utilisation_pct": m_mean,
            "monsoon_n": m_n,
            "total_night_peak_observations": w_n + m_n,
            "winter_vs_monsoon_gap_pct": gap_pct,
        }

    def month_of_row_current(r: dict) -> str | None:
        parsed = parse_current_label(r["month"])
        return f"{parsed[0]:04d}-{parsed[1]:02d}" if parsed else None

    def month_of_row_recovered(r: dict) -> str | None:
        if r["source_url"] in currently_excluded_urls:
            return resolved_by_url.get(r["source_url"])
        return month_of_row_current(r)

    def month_of_row_fully_corrected(r: dict) -> str | None:
        return resolved_by_url.get(r["source_url"])

    variant_a = bucket(rows, month_of_row_current)
    variant_b = bucket(rows, month_of_row_recovered)
    variant_c = bucket(rows, month_of_row_fully_corrected)

    seasonal_impact = {
        "data_md_published": {
            "winter_mean_utilisation_pct": 50.8,
            "monsoon_mean_utilisation_pct": 43.7,
            "winter_n": 115,
            "monsoon_n": 1760,
            "total_night_peak_observations": 1875,
            "winter_vs_monsoon_gap_pct": 16.2,
        },
        "A_as_currently_computed_replication": variant_a,
        "B_with_recovered_months_added": variant_b,
        "C_fully_corrected_all_files": variant_c,
        "replication_matches_data_md": (
            variant_a["winter_n"] == 115
            and variant_a["monsoon_n"] == 1760
            and variant_a["winter_mean_utilisation_pct"] == 50.8
            and variant_a["monsoon_mean_utilisation_pct"] == 43.7
        ),
    }

    out = {
        "generated_by": "ingest/resolve-months.py",
        "input": str(INPUT_PATH.relative_to(REPO_ROOT)),
        "method_precedence": ["row-dates (peak_date modal year-month, >=95% share = confident)",
                               "filename (month word + nearest trustworthy year token; cross-check only)",
                               "unresolved (no usable signal of either kind)"],
        "files": resolved,
        "disagreements": disagreements,
        "unresolved": unresolved,
        "count_caveat": count_caveat,
        "seasonal_impact": seasonal_impact,
    }

    OUTPUT_PATH.write_text(json.dumps(out, indent=2))

    # ---- console report --------------------------------------------------
    print(f"{'filename':50s} {'current label':26s} {'resolved':10s} {'conf%':>6s}  {'method':10s} agree")
    print("-" * 130)
    for e in resolved:
        conf = e["row_date_signal"]["modal_confidence_pct"]
        conf_s = f"{conf:.1f}" if conf is not None else "  -"
        agree = e["current_label_agrees_with_resolved"]
        agree_s = "n/a" if agree is None else ("YES" if agree else "**NO**")
        excl = " [was EXCLUDED]" if e["currently_excluded_by_loader"] else ""
        print(f"{e['filename']:50s} {e['current_label']:26s} {e['resolved_yyyymm'] or '?':10s} "
              f"{conf_s:>6s}  {e['resolution_method']:10s} {agree_s}{excl}")

    print(f"\n{len(resolved)} files resolved. {len(disagreements)} disagree with their current label "
          f"({sum(1 for d in disagreements if d['note'].startswith('current label was already'))} of those "
          f"were NOT previously excluded — i.e. already 'readable' and still wrong).\n")

    print("DISAGREEMENTS (filename/current label vs row-date truth):")
    for d in disagreements:
        print(f"  {d['filename']:50s} current={d['current_label']:22s} -> resolved={d['resolved_yyyymm']} "
              f"(offset {d['offset_months']:+d} mo, conf {d['resolved_confidence_pct']}%)  {d['note']}")

    print("\nUNRESOLVED:")
    for u in unresolved:
        print(f"  {u['label_on_index_page']:30s} reason: {u['reason']}")

    if count_caveat:
        print(f"\nCOUNT CAVEAT: ingest reported months_ok={count_caveat['months_ok_reported_by_ingest']} "
              f"but only {count_caveat['distinct_source_files_with_rows']} distinct files have rows "
              f"(gap={count_caveat['gap']}). {count_caveat['reason']}")

    print("\nSEASONAL IMPACT (DATA.md's winter-vs-monsoon night utilisation headline):")
    print(f"  DATA.md published:        winter {seasonal_impact['data_md_published']['winter_mean_utilisation_pct']}% "
          f"(n={seasonal_impact['data_md_published']['winter_n']})  vs  "
          f"monsoon {seasonal_impact['data_md_published']['monsoon_mean_utilisation_pct']}% "
          f"(n={seasonal_impact['data_md_published']['monsoon_n']})  "
          f"gap={seasonal_impact['data_md_published']['winter_vs_monsoon_gap_pct']}%")
    for key, label in [
        ("A_as_currently_computed_replication", "A) replication (should match published)"),
        ("B_with_recovered_months_added", "B) + recovered months only      "),
        ("C_fully_corrected_all_files", "C) fully corrected, ALL files   "),
    ]:
        v = seasonal_impact[key]
        print(f"  {label}: winter {v['winter_mean_utilisation_pct']}% (n={v['winter_n']})  vs  "
              f"monsoon {v['monsoon_mean_utilisation_pct']}% (n={v['monsoon_n']})  "
              f"gap={v['winter_vs_monsoon_gap_pct']}%  total_n={v['total_night_peak_observations']}")
    print(f"\n  replication_matches_data_md = {seasonal_impact['replication_matches_data_md']}")

    print(f"\nwrote {OUTPUT_PATH.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
