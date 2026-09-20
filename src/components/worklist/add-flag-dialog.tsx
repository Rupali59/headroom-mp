"use client";

/**
 * Add-flag form — the operator's write path, DESIGN.md Act 2: "Operator can
 * add a flag, correct a field, or close with a note." This is the "add a
 * flag" half; `close-note-dialog.tsx` is the other.
 *
 * `Dialog`, not `AlertDialog`: this collects required text across several
 * fields and validates before submitting — a form, not a destructive
 * confirmation. MASTER.md §4 / task 5: "AlertDialog for destructive
 * confirmation, never Dialog" — reserved for the field-model's own
 * correction paths and any irreversible action, neither of which exists
 * inside this lane's exclusive files.
 *
 * WCAG 2.2 AA (MASTER.md §6, "Forms — the write path"): visible label on
 * every field, placeholder never the only label, errors named in text next
 * to the field (not colour alone), reachable and completable by keyboard
 * alone — Radix's Dialog focus trap plus native `<form>` semantics cover
 * the keyboard half for free.
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface NewFlagInput {
  flag: string;
  evidence: string;
  suggestedAction: string;
  assignee: string;
  by: string;
}

interface FieldDef {
  key: keyof NewFlagInput;
  label: string;
  placeholder: string;
  multiline?: boolean;
}

const FIELDS: FieldDef[] = [
  { key: "flag", label: "Flag", placeholder: "e.g. Katni 400 kV — no published MVA" },
  {
    key: "evidence",
    label: "Evidence",
    placeholder: "What was observed, and where it comes from",
    multiline: true,
  },
  {
    key: "suggestedAction",
    label: "Suggested action",
    placeholder: "What should happen next",
  },
  { key: "assignee", label: "Assignee", placeholder: "e.g. MPPTCL planning" },
  { key: "by", label: "Your name and organisation", placeholder: "e.g. R. Sharma, MPPTCL Bhopal" },
];

const EMPTY: NewFlagInput = {
  flag: "",
  evidence: "",
  suggestedAction: "",
  assignee: "",
  by: "",
};

export function AddFlagDialog({
  onSubmit,
}: {
  onSubmit: (input: NewFlagInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<NewFlagInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof NewFlagInput, string>>>({});
  const formId = useId();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setValues(EMPTY);
      setErrors({});
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: Partial<Record<keyof NewFlagInput, string>> = {};
    for (const f of FIELDS) {
      if (!values[f.key].trim()) nextErrors[f.key] = `${f.label} is required.`;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onSubmit(values);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">+ Add flag</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a flag</DialogTitle>
          <DialogDescription>
            Held in this browser for this session. A pilot writes it to the shared record.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={handleSubmit} className="space-y-3" noValidate>
          {FIELDS.map((f) => {
            const fieldId = `${formId}-${f.key}`;
            const errorId = `${fieldId}-error`;
            return (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={fieldId}>{f.label}</Label>
                {f.multiline ? (
                  <textarea
                    id={fieldId}
                    value={values[f.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    rows={3}
                    aria-invalid={Boolean(errors[f.key])}
                    aria-describedby={errors[f.key] ? errorId : undefined}
                    className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                  />
                ) : (
                  <Input
                    id={fieldId}
                    value={values[f.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    aria-invalid={Boolean(errors[f.key])}
                    aria-describedby={errors[f.key] ? errorId : undefined}
                  />
                )}
                {errors[f.key] && (
                  <p id={errorId} className="text-xs text-bad">
                    {errors[f.key]}
                  </p>
                )}
              </div>
            );
          })}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId}>
            Add flag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
