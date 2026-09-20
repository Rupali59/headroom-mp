"use client";

/**
 * Lane I (Demo hardening) — the visible reset affordance.
 *
 * `src/lib/worklist-store.ts` (Lane D) already resets by default on every
 * load that lacks `?keep=1` in the URL — see that file's "RESET BY DEFAULT"
 * note. This component does not change that contract; it is the button a
 * presenter can press DURING SETUP (T-15 in DEMO.md) without having to
 * remember a URL query param, retype the address bar, or trust that the
 * last rehearsal's `?keep=1` tab isn't still the one on screen.
 *
 * What it actually does, in order:
 *   1. Removes every `headroom.*` localStorage key — not just
 *      `WORKLIST_STORAGE_KEY` by name, so a future Lane-D key
 *      (`headroom.v1.roles`, `headroom.v2.worklist`, …) is swept too
 *      without this file needing to track the version bump.
 *   2. Re-seeds the worklist key immediately via `saveWorklist` +
 *      `seedWorklist()`, so the on-screen state is correct even for a
 *      component that already mounted and won't re-run its `loadWorklist`
 *      effect on its own.
 *   3. Reloads the page at its bare pathname (query string stripped), so
 *      every component's mount-time `loadWorklist` effect also runs clean
 *      — belt and suspenders with step 2, and the reload is what clears
 *      any in-memory React state this component cannot reach directly.
 *
 * Every storage access is wrapped in try/catch per DESIGN.md and
 * worklist-store.ts's own convention: a private window makes the accessor
 * itself throw, not just return unhelpfully. A thrown accessor still lets
 * the button fall through to the reload — the URL alone (no `?keep=1`)
 * is the fallback reset path in that case.
 *
 * Not mounted anywhere by this lane. Lane F owns `src/app/page.tsx` and
 * decides where this renders — DEMO.md's "T-15" checklist item says where
 * it is meant to live for the run sheet's purposes.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { saveWorklist, seedWorklist } from "@/lib/worklist-store";

type ResetState = "idle" | "done" | "no-storage";

/** Key prefix swept on reset. Matches `WORKLIST_STORAGE_KEY`'s own
 * `headroom.v1.*` convention (see worklist-store.ts) so any sibling key a
 * later lane adds under the same namespace is cleared without edits here. */
const DEMO_STATE_PREFIX = "headroom.";

/**
 * Removes every localStorage key starting with `headroom.`. Returns the
 * number of keys removed, or `null` if localStorage itself is unreachable
 * (private window, blocked site data, disabled storage) — `null` is a
 * distinct outcome from "0 keys found", never collapsed into it, so the
 * caller can tell the presenter which case they are in.
 */
function clearDemoStateKeys(): number | null {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(DEMO_STATE_PREFIX)) toRemove.push(key);
    }
    for (const key of toRemove) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Individual key removal failing (unlikely once enumeration
        // succeeded) — skip it, keep clearing the rest.
      }
    }
    return toRemove.length;
  } catch {
    return null;
  }
}

/** Writes the seeded worklist back immediately, best-effort. Failure here
 * is not fatal to the reset — the page reload's own `loadWorklist` default
 * path re-seeds anyway once storage is empty. */
function reseedWorklist(): void {
  try {
    saveWorklist(window.localStorage, seedWorklist());
  } catch {
    // Nothing to do — the reload path covers this.
  }
}

export interface DemoStateResetProps {
  className?: string;
}

/**
 * Setup-time control: "Reset demo state." Clears `localStorage`, re-seeds
 * the worklist, and reloads at a query-stripped URL so `?keep=1` cannot
 * survive the reset.
 */
export function DemoStateReset({ className }: DemoStateResetProps) {
  const [state, setState] = useState<ResetState>("idle");
  const [pending, setPending] = useState(false);

  function handleReset() {
    setPending(true);
    const removed = clearDemoStateKeys();
    if (removed === null) {
      // localStorage itself is unreachable (private window / blocked site
      // data). Nothing more this control can do — tell the presenter
      // rather than pretend the reset happened.
      setState("no-storage");
      setPending(false);
      return;
    }
    reseedWorklist();
    setState("done");
    try {
      const url = new URL(window.location.href);
      url.search = "";
      window.location.replace(url.toString());
    } catch {
      // URL construction failing is not credible in a browser context, but
      // never let a reset control throw during a live demo — fall back to
      // a same-origin path reload.
      window.location.reload();
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={handleReset}
      >
        {pending ? "Resetting…" : "Reset demo state"}
      </Button>
      {state === "no-storage" && (
        <p className="mt-1 text-xs text-ink-3" role="status">
          Could not reach local storage (private window, or site data is
          blocked). Reload the page manually and confirm the worklist shows
          the seeded rows, not a corrected one.
        </p>
      )}
    </div>
  );
}
