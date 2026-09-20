/**
 * Worklist persistence — Lane D exclusive. BUILD.md D17 names this a
 * contract-test seam (`tests/worklist-store.test.ts`, written before this
 * file existed — its contract is authoritative, not renegotiated here).
 *
 * DESIGN.md "Demo state hygiene": version the localStorage key
 * (`headroom.v1.*`), ship a seeded worklist, reset by default.
 *
 * **RESET BY DEFAULT, unless `?keep=1`.** Inverted deliberately from the
 * more obvious `?reset=1` an earlier draft of BUILD.md named: rehearsal
 * leaves flags and closed rows behind, and a reflex Cmd-R on demo day would
 * otherwise restore yesterday's acknowledgements onto a "fresh" grid. The
 * safe path must be the lazy path, so the flag that changes behaviour is
 * the one you have to remember to type, not the one you have to remember to
 * avoid.
 *
 * `storage` is always an injected `{getItem,setItem,removeItem}` — never
 * `window.localStorage` read directly in this module. Read in a
 * `useEffect` AFTER mount at the call site: this app is statically
 * exported (`output: "export"`, BUILD.md D16), so the server has no
 * `window` at all, and reading storage during render is a hydration
 * mismatch. This module itself is safe to import anywhere; only the call
 * site needs to mind timing.
 *
 * Every accessor call is wrapped in try/catch: a private window or blocked
 * site data makes `getItem`/`setItem`/`removeItem` themselves throw, not
 * just return unhelpfully.
 */

import type { Field } from "./types";

// ---------------------------------------------------------------------------
// Storage contract
// ---------------------------------------------------------------------------

/** The subset of the `Storage` interface this module needs — lets the test
 *  suite pass a plain object instead of a DOM `localStorage`. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Versioned so a future shape change can ship a `headroom.v2.*` key
 * without a migration step — old data simply stops being read. */
export const WORKLIST_STORAGE_KEY = "headroom.v1.worklist";

/** `true` iff the query string carries exactly `keep=1` — no other value
 * (`0`, `true`, anything else) opts in. Accepts either a bare query string
 * (`"?keep=1"`) or one without the leading `?`. */
export function shouldKeepWorklist(search: string): boolean {
  try {
    const qs = search.startsWith("?") ? search.slice(1) : search;
    return new URLSearchParams(qs).get("keep") === "1";
  } catch {
    return false;
  }
}

/**
 * Reset-by-default loader.
 *
 * - `?keep=1` absent (or any other value): clears whatever is stored and
 *   returns `defaultValue` — the safe, lazy path.
 * - `?keep=1` present: returns the stored value if present and parseable,
 *   else `defaultValue`.
 *
 * Never throws — a storage accessor that throws (private window, blocked
 * site data) is treated the same as "nothing stored".
 */
export function loadWorklist<T>(
  storage: StorageLike,
  search: string,
  defaultValue: T[]
): T[] {
  if (!shouldKeepWorklist(search)) {
    try {
      storage.removeItem(WORKLIST_STORAGE_KEY);
    } catch {
      // Private window / blocked site data — nothing to clear, and nothing
      // to do about it either. The in-memory state is already the default.
    }
    return defaultValue;
  }

  try {
    const raw = storage.getItem(WORKLIST_STORAGE_KEY);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T[];
  } catch {
    return defaultValue;
  }
}

/**
 * Write path. Returns `false` (never throws) on failure so the call site
 * can mark the affected row `not saved` instead of losing it —
 * DESIGN.md's interaction-states table: "Write failed: the row stays on
 * screen marked `not saved`, never silently dropped."
 */
export function saveWorklist<T>(storage: StorageLike, value: T[]): boolean {
  try {
    storage.setItem(WORKLIST_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Domain shape — the operator's screen, DESIGN.md Act 2
// ---------------------------------------------------------------------------

/** "a status (Open → Acknowledged → Acted → Closed)" */
export type WorklistStatus = "open" | "acknowledged" | "acted" | "closed";

export const STATUS_ORDER: readonly WorklistStatus[] = [
  "open",
  "acknowledged",
  "acted",
  "closed",
];

/**
 * "Each row: the flag, its evidence, a suggested action, a status
 * (Open → Acknowledged → Acted → Closed), an assignee."
 *
 * `nightUtilisation` / `spareMva` are optional cited `Field`s — populated
 * for rows generated from DATA.md's measured MPPTCL loading data, `null`
 * for a purely field-reported flag with no attached figure (this file's
 * seed carries one of each, deliberately, per DESIGN.md's operator
 * journey: "a human-created flag beside a machine-created one").
 */
export interface WorklistEntry {
  id: string;
  flag: string;
  evidence: string;
  suggestedAction: string;
  status: WorklistStatus;
  assignee: string;
  /** "ingest" for a machine-generated row, else a person/org name — the
   * same `by` convention as `Field.by` in `./types`. */
  by: string;
  /** Epoch ms of the last status/content change. */
  at: number;
  /** Closing note. Empty until the row is closed. */
  note: string;
  /** `false` after a write attempt failed — the row must stay on screen,
   * marked, never silently dropped. */
  saved: boolean;
  nightUtilisation: Field<number> | null;
  spareMva: Field<number> | null;
}

const INGEST_AT = Date.parse("2026-09-20T09:45:14Z"); // matches the recorded artifacts' capture time
const FIELD_REPORT_AT = Date.parse("2026-09-20T14:31:00+05:30"); // D7's own worked example timestamp

/**
 * Seeded default worklist — DESIGN.md "ship a SEEDED default worklist so an
 * empty device is not an empty screen." Two rows machine-generated from
 * DATA.md's measured night-utilisation risk factor (Birsinghpur 88%,
 * Gwalior 85% — the two nodes `src/lib/risk.ts` factor 1 names by name),
 * one hand-added field report, per Open Question 6's proposal: "auto-
 * generate, then hand-add one row so the demo can show a human-created
 * flag beside a machine-created one."
 *
 * A fresh array + fresh object identities on every call, so React state
 * initializers (`useState(() => seedWorklist())`) never share mutable
 * seed data across mounts.
 */
export function seedWorklist(): WorklistEntry[] {
  return [
    {
      id: "seed-birsinghpur",
      flag: "Birsinghpur 220 kV — 88% night utilisation",
      evidence:
        "Night peak 140.5 MVA of 160 MVA installed, spare 20 MVA — the tightest margin of the 15 monitored nodes.",
      suggestedAction:
        "Prioritise for augmentation review before next winter peak.",
      status: "open",
      assignee: "MPPTCL planning",
      by: "ingest",
      at: INGEST_AT,
      note: "",
      saved: true,
      nightUtilisation: {
        v: 88,
        unit: "%",
        conf: "verified",
        src: "MPPTCL monthly EHV loading (ingest/mpptcl-loading.py)",
        page: null,
        asOf: "worst obs., 55-month series",
        by: "ingest",
        at: INGEST_AT,
        note: "Night peak is the worst observed across the published series, not a single date's reading.",
      },
      spareMva: {
        v: 20,
        unit: "MVA",
        conf: "verified",
        src: "MPPTCL monthly EHV loading (ingest/mpptcl-loading.py)",
        page: null,
        asOf: "worst obs., 55-month series",
        by: "ingest",
        at: INGEST_AT,
        note: "Transformer headroom, not drawal capacity for a new consumer — n-1, bay availability and the downstream network all still bind.",
      },
    },
    {
      id: "seed-gwalior",
      flag: "Gwalior 220 kV — 85% night utilisation",
      evidence:
        "Night peak 271 MVA of 320 MVA installed, spare 49 MVA.",
      suggestedAction:
        "Confirm augmentation timeline before next winter peak.",
      status: "open",
      assignee: "MPPTCL planning",
      by: "ingest",
      at: INGEST_AT,
      note: "",
      saved: true,
      nightUtilisation: {
        v: 85,
        unit: "%",
        conf: "verified",
        src: "MPPTCL monthly EHV loading (ingest/mpptcl-loading.py)",
        page: null,
        asOf: "worst obs., 55-month series",
        by: "ingest",
        at: INGEST_AT,
        note: "Night peak is the worst observed across the published series, not a single date's reading.",
      },
      spareMva: {
        v: 49,
        unit: "MVA",
        conf: "verified",
        src: "MPPTCL monthly EHV loading (ingest/mpptcl-loading.py)",
        page: null,
        asOf: "worst obs., 55-month series",
        by: "ingest",
        at: INGEST_AT,
        note: "Transformer headroom, not drawal capacity for a new consumer — n-1, bay availability and the downstream network all still bind.",
      },
    },
    {
      id: "seed-indore-field-report",
      flag: "Indore 400 kV bay 3 — audible transformer hum reported",
      evidence:
        "Reported by site engineer during routine walk-down, 20 Sep. No MPPTCL loading figure attached — this is a field observation, not a measured value.",
      suggestedAction: "Schedule thermal imaging inspection within 2 weeks.",
      status: "acknowledged",
      assignee: "MPPTCL Indore O&M",
      by: "R. Sharma, MPPTCL Bhopal",
      at: FIELD_REPORT_AT,
      note: "",
      saved: true,
      nightUtilisation: null,
      spareMva: null,
    },
  ];
}
