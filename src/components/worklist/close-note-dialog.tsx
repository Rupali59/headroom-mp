"use client";

/**
 * Close-with-note form — the other half of the operator write path
 * DESIGN.md Act 2 names: "Operator can add a flag, correct a field, or
 * close with a note."
 *
 * `Dialog`, not `AlertDialog` — same reasoning as `add-flag-dialog.tsx`:
 * this collects one required field (the note) and validates it before
 * submitting. Closing a worklist row changes its status, it does not
 * delete anything the ledger has recorded, so it is not the destructive
 * action task 5 / MASTER.md §4 reserve `AlertDialog` for.
 */

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { WorklistEntry } from "@/lib/worklist-store";

/**
 * The form itself, keyed by `entry.id` from the parent below — a fresh
 * mount per row gives fresh `note`/`error` state for free. That is
 * deliberately preferred over a `useEffect` that resets state when `entry`
 * changes: `react-hooks/set-state-in-effect` flags setState-in-effect as a
 * likely derived-state anti-pattern, and remounting via `key` sidesteps it
 * rather than suppressing the rule.
 */
function CloseNoteForm({
  entry,
  onCancel,
  onSubmit,
}: {
  entry: WorklistEntry;
  onCancel: () => void;
  onSubmit: (id: string, note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) {
      setError("A closing note is required.");
      return;
    }
    onSubmit(entry.id, note.trim());
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Close: {entry.flag}</DialogTitle>
        <DialogDescription>
          The note is held in this browser for this session. A pilot writes it to the shared
          record.
        </DialogDescription>
      </DialogHeader>
      <form id={formId} onSubmit={handleSubmit} className="space-y-1" noValidate>
        <Label htmlFor={`${formId}-note`}>Closing note</Label>
        <textarea
          id={`${formId}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was done, and how it was confirmed"
          rows={3}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${formId}-note-error` : undefined}
          className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
        {error && (
          <p id={`${formId}-note-error`} className="text-xs text-bad">
            {error}
          </p>
        )}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form={formId}>
          Close flag
        </Button>
      </DialogFooter>
    </>
  );
}

export function CloseNoteDialog({
  entry,
  onOpenChange,
  onSubmit,
}: {
  /** The row being closed, or `null` when the dialog is not open. */
  entry: WorklistEntry | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: string, note: string) => void;
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {entry && (
          <CloseNoteForm
            key={entry.id}
            entry={entry}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
