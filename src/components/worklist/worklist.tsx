"use client";

/**
 * Worklist — the operator's screen, DESIGN.md Act 2. Replaces the Lane 0
 * stub wholesale; `page.tsx` (frozen) imports only `Worklist` from this
 * file, so `Preventive` (preventive.tsx) is composed here rather than
 * given its own slot in the layout.
 *
 * "This is the ONE place in the entire product where card chrome is
 * allowed (MASTER.md §4) because acting on the row IS the interaction.
 * Everywhere else uses rules and typography." Each row: the flag, its
 * evidence, a suggested action, a status (Open → Acknowledged → Acted →
 * Closed), an assignee.
 *
 * Roles (DESIGN.md "Roles"): Operator can write (flags, corrections,
 * worklist status). Manager is read-only on facts, sees aggregates.
 * Owner's ledger view is a drawer inside Act 2's map detail (Lane A's
 * surface, not this one) — here Owner gets the same read-only treatment
 * as Manager, since nothing in this file is the ledger.
 */

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/role-context";
import { Value } from "@/components/value";
import { AddFlagDialog, type NewFlagInput } from "./add-flag-dialog";
import { CloseNoteDialog } from "./close-note-dialog";
import { Preventive } from "./preventive";
import {
  loadWorklist,
  saveWorklist,
  seedWorklist,
  STATUS_ORDER,
  type WorklistEntry,
  type WorklistStatus,
} from "@/lib/worklist-store";

const STATUS_LABEL: Record<WorklistStatus, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  acted: "Acted",
  closed: "Closed",
};

const STATUS_BADGE_CLASS: Record<WorklistStatus, string> = {
  open: "bg-bad/15 text-bad",
  acknowledged: "bg-sun/15 text-sun",
  acted: "bg-night/20 text-ink",
  closed: "bg-good/15 text-good",
};

/** The next status a click on "Advance" moves a row to; `closed` has none
 * — closing goes through `CloseNoteDialog` instead, since it requires a
 * note. */
const NEXT_STATUS: Partial<Record<WorklistStatus, WorklistStatus>> = {
  open: "acknowledged",
  acknowledged: "acted",
};

function newId(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** DESIGN.md D7: "a correction reads `by R. Sharma, MPPTCL Bhopal · 20 Sep
 * 14:31 · this session`." Applied here to every operator-written row —
 * `by !== "ingest"` is this lane's stand-in for "a person wrote this". */
function formatProvenance(by: string, at: number): string {
  const stamp = new Date(at).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return by === "ingest" ? `by ingest · ${stamp}` : `by ${by} · ${stamp} · this session`;
}

const TOTAL_SUBSTATIONS_ASSESSED = 19;

export function Worklist() {
  const { role } = useRole();
  const canWrite = role === "operator";

  const [entries, setEntries] = useState<WorklistEntry[]>(() => seedWorklist());
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<WorklistEntry | null>(null);

  // Read persisted state AFTER mount, never during render — the server has
  // no `window` at all in this statically-exported app, so doing this in a
  // useState initializer or during render is a hydration mismatch. This is
  // the canonical "synchronize with an external system" effect the
  // `react-hooks/set-state-in-effect` rule's own message carves out
  // ("Subscribe for updates from some external system, calling setState in
  // a callback function when external state changes") — localStorage is
  // exactly that external system, not derived-from-props state, so the
  // setState calls below are intentional, not an anti-pattern the rule is
  // built to catch.
  useEffect(() => {
    try {
      const loaded = loadWorklist(window.localStorage, window.location.search, seedWorklist());
      // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting an external system (localStorage) on mount, not deriving state from props.
      setEntries(loaded);
    } catch {
      // Private window / blocked site data: the seeded default already
      // rendered, which is the correct fallback.
    }
    setCheckedAt(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
  }, []);

  function persist(next: WorklistEntry[], writtenId?: string) {
    let ok = true;
    try {
      ok = saveWorklist(window.localStorage, next);
    } catch {
      ok = false;
    }
    setEntries(
      writtenId && !ok
        ? next.map((e) => (e.id === writtenId ? { ...e, saved: false } : e))
        : next
    );
  }

  function handleAddFlag(input: NewFlagInput) {
    const entry: WorklistEntry = {
      id: newId(),
      flag: input.flag,
      evidence: input.evidence,
      suggestedAction: input.suggestedAction,
      assignee: input.assignee,
      by: input.by,
      status: "open",
      at: Date.now(),
      note: "",
      saved: true,
      nightUtilisation: null,
      spareMva: null,
    };
    persist([entry, ...entries], entry.id);
    setJustAddedId(entry.id);
    window.setTimeout(() => setJustAddedId((cur) => (cur === entry.id ? null : cur)), 500);
  }

  function advanceStatus(id: string) {
    const target = entries.find((e) => e.id === id);
    const next = target && NEXT_STATUS[target.status];
    if (!next) return;
    persist(
      entries.map((e) => (e.id === id ? { ...e, status: next, at: Date.now(), saved: true } : e)),
      id
    );
  }

  function handleClose(id: string, note: string) {
    persist(
      entries.map((e) =>
        e.id === id ? { ...e, status: "closed" as const, note, at: Date.now(), saved: true } : e
      ),
      id
    );
    setCloseTarget(null);
  }

  const openCount = entries.filter((e) => e.status !== "closed").length;
  const counts = useMemo(() => {
    const c: Record<WorklistStatus, number> = { open: 0, acknowledged: 0, acted: 0, closed: 0 };
    for (const e of entries) c[e.status]++;
    return c;
  }, [entries]);

  return (
    <section aria-labelledby="worklist-heading" className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="worklist-heading" className="font-serif text-xl text-ink">
          Worklist
        </h2>
        {canWrite && <AddFlagDialog onSubmit={handleAddFlag} />}
      </div>

      <p className="text-xs text-ink-3">
        Flags and status changes are held in this browser for this session. A pilot writes them
        to the shared record.
      </p>

      {!canWrite && (
        <p className="font-mono text-xs tabular-nums text-ink-3">
          {counts.open} open · {counts.acknowledged} acknowledged · {counts.acted} acted ·{" "}
          {counts.closed} closed
        </p>
      )}

      {openCount === 0 ? (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-line bg-panel p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" aria-hidden="true" />
          <p className="text-sm text-ink">
            No open flags at Jan 2026 winter peak ·{" "}
            <span className="font-mono tabular-nums">{TOTAL_SUBSTATIONS_ASSESSED}</span>{" "}
            substations assessed · checked{" "}
            <span className="font-mono tabular-nums">{checkedAt ?? "—:—"}</span>
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                "rounded-lg border border-line bg-panel p-4",
                justAddedId === entry.id &&
                  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 motion-safe:duration-300"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-medium text-ink">{entry.flag}</h3>
                <Badge className={cn("border-transparent", STATUS_BADGE_CLASS[entry.status])}>
                  {STATUS_LABEL[entry.status]}
                </Badge>
              </div>

              <p className="mt-1.5 text-sm text-ink-2">{entry.evidence}</p>

              {(entry.nightUtilisation || entry.spareMva) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-2">
                  {entry.nightUtilisation && (
                    <Value
                      field={entry.nightUtilisation}
                      label={`${entry.flag} — night utilisation`}
                      format={(v, unit) => `${v}${unit} night utilisation`}
                    />
                  )}
                  {entry.nightUtilisation && entry.spareMva && <span>·</span>}
                  {entry.spareMva && (
                    <Value
                      field={entry.spareMva}
                      label={`${entry.flag} — spare at night peak`}
                      format={(v, unit) => `${v} ${unit} spare`}
                    />
                  )}
                </p>
              )}

              <p className="mt-1 text-sm text-ink-2">
                <span className="text-ink-3">Suggested: </span>
                {entry.suggestedAction}
              </p>

              {entry.status === "closed" && entry.note && (
                <p className="mt-1 text-sm text-ink-2">
                  <span className="text-ink-3">Closed: </span>
                  {entry.note}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs text-ink-3">
                  {entry.assignee} · {formatProvenance(entry.by, entry.at)}
                  {entry.saved === false && (
                    <span className="ml-2 text-bad">· not saved</span>
                  )}
                </p>

                {canWrite && entry.status !== "closed" && (
                  <div className="flex gap-2">
                    {NEXT_STATUS[entry.status] && (
                      <Button size="sm" variant="outline" onClick={() => advanceStatus(entry.id)}>
                        Mark {STATUS_LABEL[NEXT_STATUS[entry.status]!]}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setCloseTarget(entry)}>
                      Close
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Preventive />

      <CloseNoteDialog
        entry={closeTarget}
        onOpenChange={(open) => !open && setCloseTarget(null)}
        onSubmit={handleClose}
      />
    </section>
  );
}

// Re-export so a lane composing its own status list (none does today) has
// a single source for the four-value order rather than re-deriving it.
export { STATUS_ORDER };
