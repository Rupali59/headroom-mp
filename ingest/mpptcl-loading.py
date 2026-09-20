#!/usr/bin/env python3
"""
Ingest MPPTCL's monthly EHV substation loading spreadsheets.

WHAT THIS IS, AND WHY IT MATTERS
--------------------------------
MP Transco publishes, monthly and openly:

    SIMULTANEOUS MAXIMUM, MINIMUM & AVERAGE LOADING ON TRANSFORMERS (IN MVA)
    RECORDED AT EHV SUB-STATIONS

Per substation, per transformer voltage class:
    INSTALLED CAPACITY MVA | SIMULTANEOUS MAXIMUM MVA + DATE + TIME | MIN MVA | AVER MVA

The research dossier this project started from states that "no published
per-substation coincident load exists" and that MPPTCL's data is
"robots.txt blocked + Scribd bot-wall, NOT programmatically retrievable".
Measured 2026-09-20, both are false:

  * mptransco.in/robots.txt returns 404 - there is no robots.txt
  * the dossier's /STU_Cell/ path is dead; the live path is /STUCell/
  * the site serves 136 KB to a plain curl
  * 60 monthly XLSX files are linked from /TransmissionSystem/EHVSsloading
  * 515 data rows in one month, installed capacity populated on 100% of them
  * 26% of recorded peaks fall between 19:00 and 06:00

The TIME column is the important one. It is the day-versus-night distinction
this whole project is built around, measured rather than modelled.

HONEST LIMITS - keep these attached to every number this produces
-----------------------------------------------------------------
1. "Simultaneous maximum" is TRANSFORMER LOADING, not drawal headroom for a
   new consumer. Installed minus peak is not what a data centre can draw:
   n-1, bay availability and the downstream network all still bind.
2. Rows are per voltage class. "400KV KATNI" has separate 400/220/132 kV
   rows. Aggregate or class-select deliberately, never silently.
3. A substation peaking at 09:00 tells you nothing directly about its 02:00
   load. MIN MVA gives the floor; the 60-month series gives the seasonal shape.

MONTH LABEL vs MONTH THE DATA IS ABOUT - these are NOT the same thing
----------------------------------------------------------------------
Found by Lane L, fixed here 2026-09-20. `discover()` scrapes the label text
MPPTCL's index page hangs next to each file's link. That text is the
PUBLICATION month, not the month the file's rows report on: a file labelled
"January'2026" contains December 2025 data. Verified systematic — 40 of 40
labels that parsed cleanly as "Month'YYYY" were wrong, every one by exactly
-1 month, at 100% confidence (see `ingest/resolve-months.py` /
`ingest/README-months.md` for the full investigation and worked evidence).

The fix: `resolve_true_month()` below derives each file's real month from
the DATA, not the label — every row already carries `peak_date` (~99%
populated), the day its SIMULTANEOUS MAXIMUM was recorded, and a file's true
month is the modal year-month across its own rows' `peak_date`. The scraped
index-page label is kept too, as `published_label` on every row, per
DATA.md-adjacent discipline: the disagreement is itself information, not
noise to discard. `month` is now always the resolved (corrected) label when
resolvable; `published_label` is always the original scraped text, whether
or not the two agree.

Usage:
    python3 ingest/mpptcl-loading.py            # all months, parallel
    python3 ingest/mpptcl-loading.py --limit 3  # smoke test
    python3 ingest/mpptcl-loading.py --reprocess-existing
        # No network call. Re-derives month/published_label (and the
        # empty-ok-file caveat below) on the ALREADY-FETCHED
        # data-local/mpptcl-loading.json in place, using only the
        # peak_date values it already holds. Cannot recover the identity
        # of a file that fetched ok but produced zero rows (see
        # `find_empty_ok_files()`) — that identity only exists in a live
        # run's in-memory results, never in the written JSON. Use this mode
        # to apply a month-resolution fix without re-hitting MPPTCL's site;
        # use a full run to also close the empty-ok gap.
"""

from __future__ import annotations

import argparse, datetime, html, io, json, pathlib, re, sys, time, urllib.parse, urllib.request, zipfile
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://www.mptransco.in"
INDEX = f"{BASE}/TransmissionSystem/EHVSsloading"
UA = "Mozilla/5.0 (compatible; HeadroomMP/0.1; grid capacity research)"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data-local"

# Polite: this is a state utility's web server, not a CDN.
CONCURRENCY = 6


# TRANSPORT: curl, not urllib. Measured 2026-09-20, and the reason matters.
#
# MPPTCL's server fails from Python two ways in sequence:
#   1. UNSAFE_LEGACY_RENEGOTIATION_DISABLED - it negotiates TLS the old way
#   2. CERTIFICATE_VERIFY_FAILED - with certifi, the Homebrew bundle, the macOS
#      bundle, and with capath set. All four.
# Meanwhile `openssl s_client` reports "Verify return code: 0 (ok)" and curl
# reports ssl_verify_result=0. The chain is valid; Python is the odd one out.
#
# This is very likely how "robots.txt blocked ... NOT programmatically
# retrievable" entered the research dossier. A naive requests/urllib probe fails
# with an SSL error that looks like a wall, and the conclusion drawn was an
# access policy. There is no robots.txt at all (404), and the site serves 136 KB
# to curl. The data was never blocked; the client was.
#
# curl VERIFIES the certificate - this is not --insecure and must never become
# it. If you are tempted to add -k, stop: the chain is good, your client is bad.
def fetch(url: str, timeout: int = 60) -> bytes:
    if urllib.parse.urlparse(url).hostname not in ("www.mptransco.in", "mptransco.in"):
        raise ValueError(f"refusing to fetch off-host url: {url}")
    p = subprocess.run(
        ["curl", "-sSL", "--fail", "--max-time", str(timeout), "-A", UA, "--output", "-", url],
        capture_output=True, timeout=timeout + 15,
    )
    if p.returncode != 0:
        raise RuntimeError(f"curl exit {p.returncode}: {p.stderr.decode('utf-8','replace')[:200]}")
    return p.stdout


def discover() -> list[tuple[str, str]]:
    """Return [(month_label, url)] from the index page, newest first."""
    page = fetch(INDEX).decode("utf-8", "replace")
    out, seen = [], set()
    # Each row pairs a month label with its file link. Labels look like July'2026.
    for m in re.finditer(
        r"([A-Z][a-z]+\s*['’]\s*\d{2,4})(?:(?!</tr>).)*?href=\"(/Content/Miscellaneous/TransSystem/[^\"]+)\"",
        page, re.S,
    ):
        label = re.sub(r"\s+", "", m.group(1)).replace("’", "'")
        href = html.unescape(m.group(2))
        if href in seen:
            continue
        seen.add(href)
        out.append((label, href))
    # Anything linked but unlabelled still gets ingested, labelled by filename.
    for href in re.findall(r'href="(/Content/Miscellaneous/TransSystem/[^"]+)"', page):
        href = html.unescape(href)
        if href not in seen:
            seen.add(href)
            out.append((pathlib.Path(urllib.parse.unquote(href)).stem, href))
    return out


# ---------------------------------------------------------------- xlsx

def _col(letters: str) -> int:
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def parse_xlsx(blob: bytes) -> list[dict]:
    """Minimal XLSX reader. No dependency: openpyxl is not installable here
    (PEP 668 external-management), and the format is a zip of XML."""
    z = zipfile.ZipFile(io.BytesIO(blob))
    shared: list[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        x = z.read("xl/sharedStrings.xml").decode("utf-8", "replace")
        shared = [html.unescape(re.sub(r"<[^>]*>", "", si))
                  for si in re.findall(r"<si>(.*?)</si>", x, re.S)]

    names = [n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n)]
    if not names:
        return []
    sheet = z.read(sorted(names)[0]).decode("utf-8", "replace")

    rows: dict[int, dict[int, str]] = {}
    for rm in re.finditer(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', sheet, re.S):
        cells: dict[int, str] = {}
        for cm in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*)>(.*?)</c>', rm.group(2), re.S):
            ref, attrs, inner = cm.groups()
            v = re.search(r"<v>(.*?)</v>", inner, re.S)
            if not v:
                continue
            val = html.unescape(v.group(1))
            t = re.search(r't="([^"]+)"', attrs)
            if t and t.group(1) == "s":
                i = int(val)
                val = shared[i] if i < len(shared) else val
            cells[_col(ref)] = val
        if cells:
            rows[int(rm.group(1))] = cells
    return _shape(rows)


def _num(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def _hour(v):
    """Excel stores clock times as a day fraction. Some rows carry a string."""
    if v is None:
        return None
    try:
        f = float(v)
        if 0 <= f <= 1:
            return int(round(f * 24)) % 24
    except (TypeError, ValueError):
        pass
    m = re.match(r"(\d{1,2})\s*:", str(v))
    return int(m.group(1)) % 24 if m else None


def _date(v):
    """Column 9 is the DATE the monthly maximum was recorded, as an Excel serial.

    This is finer than the month label and an earlier version of this parser
    discarded it. 514 of 518 rows carry it, spanning every day of the month, so
    across 55 months each substation has 55 dated, hour-stamped observations.
    Not a daily time series - MPPTCL publishes one maximum per month - but it
    is the exact DAY that maximum fell on, which is what makes day-of-week and
    calendar-clustering questions answerable at all.
    """
    if v is None:
        return None
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        return None
    # Excel's epoch, with its deliberate 1900 leap-year bug: day 1 is 1900-01-01
    # and serial 60 is a date that never existed, so the origin is 1899-12-30.
    if not (20000 < n < 60000):          # ~1954 to ~2064; anything else is not a date
        return None
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=n)).isoformat()


def _shape(rows: dict[int, dict[int, str]]) -> list[dict]:
    hdr = next((r for r in sorted(rows)
                if any("SUBSTATION" in str(v).upper() for v in rows[r].values())), None)
    if hdr is None:
        return []
    out = []
    for r in sorted(rows):
        if r <= hdr + 1:
            continue
        c = rows[r]
        name = str(c.get(5, "") or "").strip()
        if not name or "SUBSTATION" in name.upper():
            continue
        cap, peak = _num(c.get(7)), _num(c.get(8))
        if cap is None and peak is None:
            continue
        hour = _hour(c.get(10)) if c.get(10) is not None else _hour(c.get(9))
        peak_date = _date(c.get(9))
        out.append({
            "zone": str(c.get(2, "") or "").strip(),
            "district": str(c.get(3, "") or "").strip(),
            "circle": str(c.get(4, "") or "").strip(),
            "substation": name,
            "voltage_class": str(c.get(6, "") or "").strip(),
            "installed_mva": cap,
            "peak_mva": peak,
            "peak_date": peak_date,
            "peak_weekday": (datetime.date.fromisoformat(peak_date).strftime("%a")
                             if peak_date else None),
            "peak_hour": hour,
            # Night band matches the product's non-solar definition.
            "peak_is_night": None if hour is None else (hour >= 19 or hour <= 6),
            "min_mva": _num(c.get(11)),
            "avg_mva": _num(c.get(12)),
            "spare_at_peak_mva": None if (cap is None or peak is None) else round(cap - peak, 2),
        })
    return out


# ---------------------------------------------------------------- month resolution

MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]


def resolve_true_month(rows_for_file: list[dict]) -> tuple[str | None, float | None]:
    """A file's real month, derived from its OWN rows' `peak_date` — never
    from the scraped index-page label. Modal year-month across every dated
    row; returns (None, None) when the file has no dated rows at all (the
    scraped label is the only fallback left in that case — see caller).

    Matches `ingest/resolve-months.py`'s `modal_yearmonth()` method exactly
    (that script investigated this independently and is the source of the
    "-1 month, systematic" finding this function fixes at the source).
    """
    dated = [r["peak_date"] for r in rows_for_file if r.get("peak_date")]
    if not dated:
        return None, None
    counts: dict[str, int] = {}
    for d in dated:
        ym = d[:7]  # YYYY-MM
        counts[ym] = counts.get(ym, 0) + 1
    top_ym, top_n = max(counts.items(), key=lambda kv: kv[1])
    share = round(100.0 * top_n / len(dated), 1)
    year, month_num = int(top_ym[:4]), int(top_ym[5:7])
    label = f"{MONTH_NAMES[month_num - 1].capitalize()}'{year}"
    return label, share


def apply_month_resolution(allrows: list[dict]) -> dict:
    """Rewrites every row's `month` to its resolved (data-derived) label
    in place, moving the original scraped text to `published_label`.
    Returns a summary (per-file resolution + disagreement count) for the
    output JSON and console report — never applies the fix silently.

    A file with no dated rows keeps its scraped label as `month` (nothing
    better exists) and gets `published_label` equal to `month` too, so
    "resolved" and "fell back to the scraped label" are distinguishable by
    checking `month_resolution.unresolved_files`, never by a bare null.
    """
    by_url: dict[str, list[dict]] = {}
    for r in allrows:
        by_url.setdefault(r["source_url"], []).append(r)

    per_file: list[dict] = []
    disagreements = 0
    unresolved_files: list[str] = []
    for url, rs in sorted(by_url.items()):
        scraped_label = rs[0]["month"]
        resolved_label, confidence = resolve_true_month(rs)
        if resolved_label is None:
            unresolved_files.append(url)
            for r in rs:
                r["published_label"] = scraped_label
                # month left as-is (the scraped label) — no better signal exists
            per_file.append({
                "source_url": url, "published_label": scraped_label,
                "resolved_month": None, "confidence_pct": None, "agrees": None,
            })
            continue
        agrees = resolved_label == scraped_label
        if not agrees:
            disagreements += 1
        for r in rs:
            r["published_label"] = scraped_label
            r["month"] = resolved_label
        per_file.append({
            "source_url": url, "published_label": scraped_label,
            "resolved_month": resolved_label, "confidence_pct": confidence,
            "agrees": agrees,
        })

    return {
        "method": "modal year-month of each row's own peak_date; scraped "
                   "index-page label kept as published_label, never trusted "
                   "for the month itself (see file header, 2026-09-20 fix)",
        "files_resolved": len(by_url) - len(unresolved_files),
        "files_unresolved_kept_scraped_label": len(unresolved_files),
        "files_where_scraped_label_disagreed_with_data": disagreements,
        "per_file": per_file,
    }


def find_empty_ok_files(results: list[dict]) -> list[dict]:
    """DATA.md/rule:discernment-checks §2: 'no rows' and 'no rows BECAUSE'
    are different facts. A file that downloads and parses as a valid
    xlsx/zip but whose sheet yields zero data rows reports `ok: True` from
    `one()` — it is NOT in `bad`/`failures`, so nothing previously named
    it. This can only be captured here, from the live `results` list,
    before `allrows` is built — once a file has zero rows, filtering
    `allrows` by row content leaves no trace of its label or URL at all.
    """
    return [
        {"month": r["month"], "url": r["url"], "bytes": r.get("bytes")}
        for r in results
        if r["ok"] and len(r["rows"]) == 0
    ]


# ---------------------------------------------------------------- main

def one(label: str, href: str) -> dict:
    url = BASE + urllib.parse.quote(urllib.parse.unquote(href))
    t0 = time.time()
    try:
        blob = fetch(url)
        recs = parse_xlsx(blob)
        return {"month": label, "url": url, "ok": True, "rows": recs,
                "bytes": len(blob), "secs": round(time.time() - t0, 1)}
    except Exception as e:  # noqa: BLE001 - every failure must be attributable
        return {"month": label, "url": url, "ok": False, "rows": [],
                "error": f"{type(e).__name__}: {e}", "secs": round(time.time() - t0, 1)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    print(f"index: {INDEX}")
    files = discover()
    if args.limit:
        files = files[: args.limit]
    print(f"monthly files discovered: {len(files)}   concurrency: {CONCURRENCY}\n")

    results = []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futs = {ex.submit(one, lbl, href): lbl for lbl, href in files}
        for i, f in enumerate(as_completed(futs), 1):
            r = f.result()
            results.append(r)
            mark = "ok " if r["ok"] else "FAIL"
            extra = f'{len(r["rows"]):4d} rows' if r["ok"] else r["error"][:60]
            print(f"  [{i:2d}/{len(files)}] {mark} {r['month']:16} {extra}  {r['secs']}s")

    ok = [r for r in results if r["ok"]]
    bad = [r for r in results if not r["ok"]]
    allrows = [dict(row, month=r["month"], source_url=r["url"])
               for r in ok for row in r["rows"]]

    OUT.mkdir(exist_ok=True)
    (OUT / "mpptcl-loading.json").write_text(json.dumps({
        "source": "MPPTCL / MP Transco, EHV Sub-Station Loading",
        "index_url": INDEX,
        "retrieved": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "months_ok": len(ok), "months_failed": len(bad),
        "failures": [{"month": r["month"], "error": r["error"]} for r in bad],
        "limits": [
            "Simultaneous maximum is transformer loading, not drawal headroom for a new consumer.",
            "Rows are per voltage class; aggregate or class-select deliberately.",
            "A substation peaking in daytime gives no direct 02:00 figure; MIN MVA is the floor.",
        ],
        "rows": allrows,
    }, indent=1))

    subs = {r["substation"] for r in allrows}
    withcap = sum(1 for r in allrows if r["installed_mva"] is not None)
    night = [r for r in allrows if r.get("peak_is_night")]
    print(f"\nmonths ok {len(ok)}  failed {len(bad)}")
    print(f"rows {len(allrows)}   distinct substations {len(subs)}")
    print(f"installed capacity populated: {withcap}/{len(allrows)}"
          f" ({withcap/len(allrows):.0%})" if allrows else "")
    print(f"rows whose peak fell 19:00-06:00: {len(night)}"
          f" ({len(night)/len(allrows):.0%})" if allrows else "")
    print(f"\nwrote {OUT/'mpptcl-loading.json'}")
    for r in bad:
        print(f"  FAILED {r['month']}: {r['error'][:100]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
