"use client";

/**
 * Extraction panel — Act 1. Replaces Lane 0's stub (same export name,
 * same props: none). DATA.md / BUILD.md architecture: "No compute on
 * Vercel" — Act 1 REPLAYS a local run that already succeeded
 * (`extraction-test/extract.ts`, run 2026-09-20 against
 * `extraction-test/fixtures/ctuil-wr-mp.pdf`, MP rows of CTUIL's
 * Annex-IV(3) solar / non-solar margins). It never calls the Anthropic API
 * at runtime — there is no server to call it from in the static-export
 * architecture, and the key never deploys.
 *
 * The recorded artifact this replays lives at
 * `public/artifacts/extraction-recorded.json`, written by a successful run
 * of `extraction-test/extract.ts` (same "recorded, timestamped, never
 * re-fetched" convention Lane B uses for `mpptcl-{curl,robots}.txt`). It is
 * imported directly (not fetched) so the static export needs no extra
 * request and the row count/citations are known at build time.
 *
 * DESIGN.md Act 1 / BUILD.md: "Button reads 'Replay recorded extraction',
 * labelled with capture time. It never says 'Extract' while replaying."
 * MASTER.md §6: an aria-live="polite" region announces each row as it
 * lands, for screen-reader users who can't see the stagger.
 *
 * C3 — the merged-cell resolution — is the reason this panel exists at
 * all: the CTUIL sheet leaves the Substation cell blank on continuation
 * rows (Agar and Shajapur solar parks inherit "Neemuch PS" from the merged
 * cell above). Every row that was resolved that way carries an "inherited"
 * marker, sourced from the model's own `substation_cell_was_blank` field —
 * this panel does not re-decide it, only displays it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Value } from "@/components/value";
import type { Confidence, Field } from "@/lib/types";
import recordedExtraction from "../../public/artifacts/extraction-recorded.json";

interface RecordedRow {
  substation: string;
  substation_cell_was_blank: boolean;
  voltage_kv: number | null;
  application_id: string | null;
  applicant: string;
  project_type: string | null;
  solar_hour_access_mw: number | null;
  non_solar_hour_access_mw: number | null;
  margin_solar_hour_mw: number | null;
  margin_non_solar_hour_mw: number | null;
  page: number;
}

interface RecordedExtraction {
  capturedAt: string;
  model: string;
  sourceDocument: string;
  sourceFixture: string;
  pageRange: string;
  citationsConfirmed: boolean;
  records: RecordedRow[];
}

const recorded = recordedExtraction as RecordedExtraction;

const STAGGER_MS = 450;

function mvaField(
  v: number | null,
  page: number,
  src: string,
  asOf: string,
): Field<number> {
  const conf: Confidence = v === null ? "unknown" : "verified";
  return {
    v: v ?? 0,
    unit: "MW",
    conf,
    src,
    page,
    asOf,
    by: "ingest",
    at: Date.parse(asOf) || Date.now(),
    note:
      v === null
        ? "Cell was genuinely empty in the source table — not inferred, not carried sideways."
        : "Extracted from a cited page of the source PDF; see the citation for the exact cell.",
  };
}

function captureLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ExtractionPanel() {
  const rows = recorded.records ?? [];
  const [revealed, setRevealed] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startReplay() {
    if (isReplaying || rows.length === 0) return;
    setRevealed(0);
    setIsReplaying(true);
    setAnnouncement("Replay started.");

    let i = 0;
    timerRef.current = setInterval(() => {
      i += 1;
      setRevealed(i);
      const r = rows[i - 1];
      if (r) {
        const inherited = r.substation_cell_was_blank ? ", inherited from merged cell above" : "";
        setAnnouncement(
          `Row ${i} of ${rows.length} landed: ${r.substation}${inherited} — ${r.applicant}, page ${r.page}.`,
        );
      }
      if (i >= rows.length) {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsReplaying(false);
        setAnnouncement(`Replay complete. ${rows.length} rows landed.`);
      }
    }, STAGGER_MS);
  }

  const buttonLabel = useMemo(() => {
    if (isReplaying) return "Replaying…";
    if (revealed > 0 && revealed >= rows.length) {
      return `Replay again · captured ${captureLabel(recorded.capturedAt)}`;
    }
    return `Replay recorded extraction · captured ${captureLabel(recorded.capturedAt)}`;
  }, [isReplaying, revealed, rows.length]);

  const visibleRows = rows.slice(0, revealed);
  const inheritedCount = rows.filter((r) => r.substation_cell_was_blank).length;

  return (
    <section
      aria-labelledby="extraction-panel-heading"
      className="rounded-lg border border-line bg-panel p-6"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="extraction-panel-heading" className="font-serif text-2xl text-ink">
          Extraction
        </h2>
        <span className="font-mono text-xs tabular-nums text-ink-3">
          {revealed} of {rows.length} rows
        </span>
      </div>

      <p className="mb-4 max-w-prose text-sm text-ink-2">
        A replay of a recorded run against {recorded.sourceDocument} (pages{" "}
        {recorded.pageRange}) — not a live extraction. This panel never calls the
        Anthropic API; the static build has no server to call it from, and the key
        never deploys. {inheritedCount > 0 && (
          <>
            {inheritedCount} of {rows.length} rows had a blank Substation cell on the
            page and were resolved from the merged cell above it — those are marked{" "}
            <Badge variant="outline" className="border-line-2 bg-transparent px-1 text-[10px] uppercase tracking-wide text-ink-2">
              inherited
            </Badge>{" "}
            below.
          </>
        )}
      </p>

      <Button
        type="button"
        onClick={startReplay}
        disabled={isReplaying || rows.length === 0}
        variant="default"
      >
        {buttonLabel}
      </Button>

      {/* MASTER.md §6: announce each landed row for screen-reader users who
          can't see the stagger. Visually hidden — the visible table below
          is the sighted equivalent of the same information. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="space-y-2" aria-hidden="true">
            <p className="mb-2 text-sm text-ink-3">
              No recorded extraction is available. Run{" "}
              <code className="font-mono text-xs">bun run extract.ts</code> in{" "}
              <code className="font-mono text-xs">extraction-test/</code> to produce one.
            </p>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-5/6" />
          </div>
        ) : revealed === 0 ? (
          <p className="text-sm text-ink-3">
            {rows.length} rows recorded. Press replay to land them one at a time, with
            their page citations.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {visibleRows.map((r, i) => (
              <li key={`${r.substation}-${r.applicant}-${i}`} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{r.substation}</span>
                  {r.substation_cell_was_blank && (
                    <Badge
                      variant="outline"
                      className="border-line-2 bg-transparent px-1.5 text-[10px] uppercase tracking-wide text-ink-2"
                    >
                      inherited
                    </Badge>
                  )}
                  {r.voltage_kv !== null && (
                    <span className="font-mono text-xs text-ink-3">{r.voltage_kv} kV</span>
                  )}
                  <span className="font-mono text-xs text-ink-3">p{r.page}</span>
                </div>
                <p className="mt-0.5 text-sm text-ink-2">
                  {r.applicant}
                  {r.project_type ? ` · ${r.project_type}` : ""}
                  {r.application_id ? ` · ${r.application_id}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                  <span className="inline-flex items-center gap-1">
                    solar-hr access{" "}
                    <Value
                      field={mvaField(r.solar_hour_access_mw, r.page, recorded.sourceDocument, recorded.capturedAt)}
                      label={`${r.substation} — solar-hour access`}
                    />
                  </span>
                  <span className="inline-flex items-center gap-1">
                    non-solar-hr access{" "}
                    <Value
                      field={mvaField(r.non_solar_hour_access_mw, r.page, recorded.sourceDocument, recorded.capturedAt)}
                      label={`${r.substation} — non-solar-hour access`}
                    />
                  </span>
                  <span className="inline-flex items-center gap-1">
                    margin (solar)
                    <Value
                      field={mvaField(r.margin_solar_hour_mw, r.page, recorded.sourceDocument, recorded.capturedAt)}
                      label={`${r.substation} — solar-hour margin`}
                    />
                  </span>
                  <span className="inline-flex items-center gap-1">
                    margin (non-solar)
                    <Value
                      field={mvaField(r.margin_non_solar_hour_mw, r.page, recorded.sourceDocument, recorded.capturedAt)}
                      label={`${r.substation} — non-solar-hour margin`}
                    />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
