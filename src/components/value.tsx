"use client";

/**
 * The provenance primitive — BUILD.md "Shared contracts": "EVERY number in
 * the app routes through this." Renders a `Field`'s value, a confidence
 * chip, and opens its provenance row (source, page, as-of, who, when) on
 * click, via `Dialog`. Must exist before any lane renders a number, or
 * three lanes invent three versions of "the number with the source".
 *
 * `conf === "unknown"` renders hatched per design-system/MASTER.md §2:
 * "Risk is never encoded by colour alone" — the confidence chip carries
 * the word, not only a colour.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Confidence, Field } from "@/lib/types";
import { cn } from "cn";

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  unknown: "not assessed",
  modelled: "modelled",
  derived: "derived",
  researched: "researched",
  field: "field-entered",
  verified: "verified",
};

const CONFIDENCE_BADGE_CLASS: Record<Confidence, string> = {
  unknown: "border border-dashed border-line-2 bg-transparent text-ink-3",
  modelled: "bg-panel-2 text-ink-2",
  derived: "bg-panel-2 text-ink-2",
  researched: "bg-panel-2 text-ink",
  field: "bg-night/20 text-ink",
  verified: "bg-good/20 text-good",
};

export interface ValueProps {
  /** The field to render. */
  field: Field<number | string>;
  /** Human name for this field, used as the provenance dialog title. */
  label: string;
  /** Optional formatter; defaults to `${v}${unit ? " " + unit : ""}`. */
  format?: (v: number | string, unit: string) => string;
  className?: string;
}

export function Value({ field, label, format, className }: ValueProps) {
  const [open, setOpen] = useState(false);
  const display =
    field.conf === "unknown"
      ? "—"
      : format
        ? format(field.v, field.unit)
        : `${field.v}${field.unit ? ` ${field.unit}` : ""}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-6 items-center gap-1.5 rounded-sm text-left align-baseline underline decoration-line-2 decoration-dotted underline-offset-4 hover:decoration-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            field.conf === "unknown" &&
              "bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,var(--line-2)_3px,var(--line-2)_4px)] px-1 no-underline",
            className
          )}
        >
          <span className="font-mono tabular-nums">{display}</span>
          <Badge
            variant="outline"
            className={cn(
              "border-transparent px-1.5 text-[10px] uppercase tracking-wide",
              CONFIDENCE_BADGE_CLASS[field.conf]
            )}
          >
            {CONFIDENCE_LABEL[field.conf]}
          </Badge>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>Provenance for this value</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 font-mono text-xs text-ink">
          <dt className="text-ink-3">Value</dt>
          <dd className="tabular-nums">
            {field.conf === "unknown"
              ? "not assessed"
              : `${field.v}${field.unit ? ` ${field.unit}` : ""}`}
          </dd>
          <dt className="text-ink-3">Confidence</dt>
          <dd>{CONFIDENCE_LABEL[field.conf]}</dd>
          <dt className="text-ink-3">Source</dt>
          <dd>{field.src || "—"}</dd>
          <dt className="text-ink-3">Page</dt>
          <dd>{field.page ?? "—"}</dd>
          <dt className="text-ink-3">As of</dt>
          <dd>{field.asOf || "—"}</dd>
          <dt className="text-ink-3">By</dt>
          <dd>{field.by || "—"}</dd>
          <dt className="text-ink-3">At</dt>
          <dd>{field.at ? new Date(field.at).toLocaleString() : "—"}</dd>
          {field.note && (
            <>
              <dt className="text-ink-3">Note</dt>
              <dd className="font-sans normal-case">{field.note}</dd>
            </>
          )}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
