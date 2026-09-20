/**
 * Blocked sources — DESIGN.md: "Blocked sources lives inside Act 1" and is
 * generated from the data (brief §05), not asserted on a slide; every gap
 * names absence, holder and consequence (D6), zero accusation
 * (MASTER.md §8).
 *
 * REWRITTEN PER DATA.md 2026-09-20, which supersedes this panel's original
 * content entirely. The old story — "MPPTCL's data is robots.txt-blocked
 * and not programmatically retrievable" — is false, measured:
 *
 *   - mptransco.in/robots.txt returns 404. There is no robots.txt.
 *   - the site serves 136 KB to a plain curl.
 *   - 60 monthly XLSX files of per-substation loading are published.
 *
 * Do NOT tell a room containing MPPTCL people that they block automation —
 * it is checkable in ten seconds. This panel now carries the real asks
 * from DATA.md's "What the ask becomes": a stable dated URL, the 5
 * pre-2022 months republished as .xlsx, drawal headroom rather than
 * transformer loading, and one real MPSEDC enquiry run end to end.
 *
 * The two recorded artifacts (`public/artifacts/mpptcl-{robots,fetch}.txt`)
 * are what the dossier's "blocked" claim actually rests on: a 404'd
 * robots.txt (i.e. no block at all) and a 404 on the dossier's own dead
 * `/STU_Cell/` link (a moved path, not a wall). Both are RECORDED evidence,
 * captured once and timestamped — never re-fetched at demo time, per
 * DESIGN.md Act 1: "a live third-party fetch ... in the opening 90 seconds
 * is a non-deterministic dependency that may simply not fail."
 */

import type { Field } from "@/lib/types";
import { Value } from "@/components/value";

const CAPTURED_AT = Date.parse("2026-09-20T09:45:14Z");
const MEASURED_AT = Date.parse("2026-09-20T10:00:06Z"); // data-local/mpptcl-loading.json "retrieved"

const DATA_MD_SRC = "DATA.md, measured against mptransco.in";
const INGEST_LOG_SRC = "ingest/mpptcl-loading.py output (data-local/mpptcl-loading.json)";

function verifiedField<T extends number | string>(
  v: T,
  unit: string,
  src: string,
  note: string,
  at = MEASURED_AT
): Field<T> {
  return { v, unit, conf: "verified", src, page: null, asOf: "2026-09-20", by: "ingest", at, note };
}

const ROBOTS_STATUS = verifiedField(
  "404",
  "",
  "public/artifacts/mpptcl-robots.txt",
  "mptransco.in/robots.txt — there is no robots.txt on this site.",
  CAPTURED_AT
);

const OLD_LINK_STATUS = verifiedField(
  "404",
  "",
  "public/artifacts/mpptcl-fetch.txt",
  "The research dossier's /STU_Cell/ path is dead — a moved link, not a bot-wall. The live path is /STUCell/.",
  CAPTURED_AT
);

const SITE_SIZE = verifiedField(136, "KB", DATA_MD_SRC, "Served to a plain curl, no auth, no headless browser.");
const MONTHLY_FILES = verifiedField(60, "", DATA_MD_SRC, "Linked from /TransmissionSystem/EHVSsloading.");
const MONTHS_INGESTED = verifiedField(55, "of 60 months", INGEST_LOG_SRC, "5 failed: pre-2022 legacy .xls, not .xlsx.");
const ROWS_INGESTED = verifiedField(27680, "rows", INGEST_LOG_SRC, "432 distinct substations, ~417 in MPPTCL's network — this is effectively all of it.");

const EXAMPLE_FILENAMES = [
  "SimJune26nn.xlsx",
  "Sim-Ma-Load-May06072026.xlsx",
  "Sim-M-Dec-25-28012026.xlsx",
  "Sim-April2602.xlsx",
];

interface Ask {
  id: string;
  gap: string;
  holder: string;
  unlocks: string;
}

const ASKS: Ask[] = [
  {
    id: "stable-url",
    gap: "A stable, dated URL for each month's loading sheet is not published — filenames carry no convention across months.",
    holder: "MPPTCL",
    unlocks: "each month stops being a manual hunt through the index page.",
  },
  {
    id: "pre-2022-xlsx",
    gap: "5 months before 2022 are published only as legacy .xls, which this build's ingest cannot parse.",
    holder: "MPPTCL",
    unlocks: "the series extends back before 2022 with no gap in the seasonal shape.",
  },
  {
    id: "drawal-headroom",
    gap: "What is published is transformer loading, not drawal headroom for a new consumer — n-1, bay availability and the downstream network still bind.",
    holder: "MPPTCL",
    unlocks: "spare MVA becomes a figure a data-centre siting decision can actually use.",
  },
  {
    id: "mpsedc-enquiry",
    gap: "No enquiry has been run end to end with MPSEDC.",
    holder: "MPSEDC",
    unlocks: "the siting question gets tested against a real process, not just a dataset.",
  },
];

export function BlockedSources() {
  return (
    <section
      aria-labelledby="blocked-sources-heading"
      className="space-y-4 rounded-lg border border-line bg-panel-2 p-6"
    >
      <h2 id="blocked-sources-heading" className="font-serif text-xl text-ink">
        Blocked sources
      </h2>

      <p className="max-w-prose text-sm text-ink">
        This panel used to say MPPTCL&apos;s per-substation margin data was robots.txt-blocked
        and not programmatically retrievable. Measured against the live site, that is false:
        robots.txt itself returns <Value field={ROBOTS_STATUS} label="mptransco.in/robots.txt" /> —
        there is no robots.txt — and a plain curl is served{" "}
        <Value field={SITE_SIZE} label="mptransco.in response size" format={(v) => `${v} KB`} />. The
        dossier&apos;s link was dead, not the site.
      </p>

      <p className="max-w-prose text-sm text-ink-2">
        <Value field={MONTHLY_FILES} label="Monthly loading spreadsheets published" format={(v) => `${v}`} />{" "}
        monthly spreadsheets of per-substation loading are published openly, with a date and a time on
        every recorded peak.{" "}
        <Value field={MONTHS_INGESTED} label="Months this build ingested" /> feed this build —{" "}
        <Value field={ROWS_INGESTED} label="Rows ingested" format={(v) => `${v.toLocaleString()}`} />{" "}
        across every EHV substation MPPTCL operates.
      </p>

      <div className="space-y-2 rounded-md border border-dashed border-line-2 p-3">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-3">
          Recorded evidence · captured 2026-09-20 · not fetched at demo time
        </p>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-ink-2">
              <Value field={ROBOTS_STATUS} label="robots.txt status" format={(v) => `robots.txt → ${v}`} />
            </dt>
            <dd className="mt-0.5 text-xs text-ink-3">
              {ROBOTS_STATUS.note}{" "}
              <a
                href="/artifacts/mpptcl-robots.txt"
                className="underline decoration-line-2 decoration-dotted underline-offset-4 hover:decoration-ink-2"
              >
                view recorded transcript
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-ink-2">
              <Value
                field={OLD_LINK_STATUS}
                label="Dossier's STU_Cell link status"
                format={(v) => `/STU_Cell/ link → ${v}`}
              />
            </dt>
            <dd className="mt-0.5 text-xs text-ink-3">
              {OLD_LINK_STATUS.note}{" "}
              <a
                href="/artifacts/mpptcl-fetch.txt"
                className="underline decoration-line-2 decoration-dotted underline-offset-4 hover:decoration-ink-2"
              >
                view recorded transcript
              </a>
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-ink-3">Example filenames — no naming convention across months:</p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-ink-2">
          {EXAMPLE_FILENAMES.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-serif text-lg text-ink">What the ask becomes</h3>
        <ul className="divide-y divide-line">
          {ASKS.map((ask) => (
            <li key={ask.id} className="py-2 text-sm leading-relaxed text-ink-2">
              {ask.gap} <span className="text-ink">{ask.holder}</span> holds this. With it,{" "}
              {ask.unlocks}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
