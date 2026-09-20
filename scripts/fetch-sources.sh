#!/usr/bin/env bash
# Fetch the public source documents this project reads.
#
# They are deliberately NOT committed. See .gitignore for why.
# Re-run whenever you need them; CTUIL republishes monthly, so a copy
# older than a month is describing a grid that has moved.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/extraction-test/fixtures"
mkdir -p "$DIR"

CTUIL_MARGINS="https://www.ctuil.in/uploads/assets/176011721061Website%20sheet_solar%20non%20solar%20margins_all.pdf"

echo "Fetching CTUIL solar/non-solar margins (Annex-IV(3))..."
curl -fsSL --max-time 60 -A "Mozilla/5.0" -o "$DIR/ctuil-margins-full.pdf" "$CTUIL_MARGINS"

pages=$(pdfinfo "$DIR/ctuil-margins-full.pdf" 2>/dev/null | awk '/^Pages:/{print $2}')
echo "  -> $DIR/ctuil-margins-full.pdf  (${pages:-?} pages, $(du -h "$DIR/ctuil-margins-full.pdf" | cut -f1))"

# Pages 23-25 carry the Madhya Pradesh rows AND the merged-cell continuation rows
# (Agar, Shajapur) that the extraction probe exists to test. Verified 2026-09-20:
# the Western Region section starts on p17, but the MP rows do NOT - slicing 17-20
# yields one usable row and tests nothing. Slicing keeps the
# extraction probe fast and cheap; the full document still works.
if command -v qpdf >/dev/null 2>&1; then
  qpdf "$DIR/ctuil-margins-full.pdf" --pages . 23-25 -- "$DIR/ctuil-wr-mp.pdf" 2>/dev/null || true
  [ -f "$DIR/ctuil-wr-mp.pdf" ] && echo "  -> $DIR/ctuil-wr-mp.pdf  (Madhya Pradesh rows, pp23-25)"
else
  echo "  note: qpdf not installed — extraction will use the full document"
fi

cat <<'NOTE'

  These documents carry a RESTRICTED data-classification marking. They are
  publicly posted by CTUIL, and this script only retrieves them for local
  analysis. Do not commit them, and do not republish their contents without
  checking with the publisher first.
NOTE
