/**
 * BUILD.md D17 — "worklist-store: reset-by-default, ?keep=1 preserves,
 * versioned key."
 *
 * `src/lib/worklist-store.ts` is Lane D's exclusive file (BUILD.md "Then,
 * in parallel" table, "versioned `headroom.v1.*`, read in `useEffect`
 * after mount — reading during render is a hydration mismatch;
 * reset-by-default unless `?keep=1`") and does not exist yet — this
 * import fails until Lane D lands, the expected/meaningful failure D15/D17
 * describe.
 *
 * Contract this test pins for Lane D, since none of it was executable
 * code anywhere yet:
 *
 *   WORKLIST_STORAGE_KEY: string, versioned e.g. "headroom.v1.worklist"
 *   shouldKeepWorklist(search: string): boolean       // true iff ?keep=1
 *   loadWorklist<T>(storage, search, defaultValue: T[]): T[]
 *     - shouldKeepWorklist(search) === false -> clears storage, returns
 *       defaultValue (reset-by-default)
 *     - shouldKeepWorklist(search) === true  -> returns the stored value
 *       if present, else defaultValue
 *
 * `storage` is an injectable `{getItem,setItem,removeItem}` — a plain
 * object stands in for `window.localStorage` here so the test needs no
 * DOM, and Lane D's real call site passes `localStorage` itself, inside
 * `useEffect` per the ownership note above.
 */

import { describe, expect, it } from "vitest";
import { WORKLIST_STORAGE_KEY, shouldKeepWorklist, loadWorklist } from "../src/lib/worklist-store";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    _data: data,
  };
}

describe("worklist-store", () => {
  it("uses a versioned key", () => {
    expect(WORKLIST_STORAGE_KEY).toMatch(/^headroom\.v\d+\./);
  });

  it("?keep=1 is the only value that preserves", () => {
    expect(shouldKeepWorklist("?keep=1")).toBe(true);
    expect(shouldKeepWorklist("")).toBe(false);
    expect(shouldKeepWorklist("?keep=0")).toBe(false);
    expect(shouldKeepWorklist("?keep=true")).toBe(false);
  });

  it("resets by default: without ?keep=1, storage is cleared and the default is returned", () => {
    const storage = fakeStorage({
      [WORKLIST_STORAGE_KEY]: JSON.stringify([{ id: "stale" }]),
    });
    const result = loadWorklist(storage, "", [{ id: "default" }]);
    expect(result).toEqual([{ id: "default" }]);
    expect(storage.getItem(WORKLIST_STORAGE_KEY)).toBeNull();
  });

  it("?keep=1 preserves a previously stored worklist", () => {
    const stored = [{ id: "kept" }];
    const storage = fakeStorage({
      [WORKLIST_STORAGE_KEY]: JSON.stringify(stored),
    });
    const result = loadWorklist(storage, "?keep=1", [{ id: "default" }]);
    expect(result).toEqual(stored);
  });

  it("?keep=1 with nothing stored falls back to the default", () => {
    const storage = fakeStorage();
    const result = loadWorklist(storage, "?keep=1", [{ id: "default" }]);
    expect(result).toEqual([{ id: "default" }]);
  });
});
