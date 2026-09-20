/**
 * Preventive — DESIGN.md Act 2: "Each at-risk node gets one sentence in a
 * fixed form: '[condition] + [no mitigation before date] -> [action],
 * owner [role].'" This is the "steps before grid faults might occur"
 * requirement, and it costs one line of UI per node.
 *
 * Rendered inside `Worklist` (page.tsx only imports `Worklist` — see
 * worklist.tsx). Rules and typography, never card chrome: MASTER.md §4
 * "card chrome survives in exactly one place: a worklist row, because
 * acting on it is the interaction" — a preventive line is read, not acted
 * on, so it gets no box.
 *
 * Both lines below cite DATA.md's measured night-utilisation figures for
 * the two nodes `src/lib/risk.ts` factor 1 names by name (Birsinghpur
 * 0.88, Gwalior 0.85) — the same two the seeded worklist rows flag.
 * DESIGN.md's own worked example ("single 400 kV transformer, no
 * augmentation before Kurawar ~Jun 2027...") is deliberately NOT reused
 * here: it names a mitigation project without tying it to a specific
 * verified node in the data this lane holds, and asserting a
 * single-transformer condition nothing here can confirm would be the
 * over-claim D7 exists to avoid.
 */

import { Value } from "@/components/value";
import type { Field } from "@/lib/types";

interface PreventiveItem {
  id: string;
  node: string;
  utilisation: Field<number>;
  spare: Field<number>;
  action: string;
  owner: string;
}

const AS_OF = "worst obs., 55-month series";
const SRC = "MPPTCL monthly EHV loading (ingest/mpptcl-loading.py)";
const AT = Date.parse("2026-09-20T09:45:14Z");

function field(v: number, unit: string, note: string): Field<number> {
  return { v, unit, conf: "verified", src: SRC, page: null, asOf: AS_OF, by: "ingest", at: AT, note };
}

const HEADROOM_NOTE =
  "Transformer headroom, not drawal capacity for a new consumer — n-1, bay availability and the downstream network all still bind.";
const UTIL_NOTE =
  "Night peak is the worst observed across the published series, not a single date's reading.";

const PREVENTIVE_ITEMS: PreventiveItem[] = [
  {
    id: "birsinghpur",
    node: "Birsinghpur 220 kV",
    utilisation: field(88, "%", UTIL_NOTE),
    spare: field(20, "MVA", HEADROOM_NOTE),
    action: "prioritise for augmentation review before next winter peak",
    owner: "MPPTCL planning",
  },
  {
    id: "gwalior",
    node: "Gwalior 220 kV",
    utilisation: field(85, "%", UTIL_NOTE),
    spare: field(49, "MVA", HEADROOM_NOTE),
    action: "confirm augmentation timeline before next winter peak",
    owner: "MPPTCL planning",
  },
];

export function Preventive() {
  return (
    <section aria-labelledby="preventive-heading" className="space-y-1">
      <h3 id="preventive-heading" className="font-serif text-lg text-ink">
        Preventive
      </h3>
      <ul className="divide-y divide-line">
        {PREVENTIVE_ITEMS.map((item) => (
          <li key={item.id} className="py-2 text-sm leading-relaxed text-ink-2">
            <span className="text-ink">{item.node}</span> at{" "}
            <Value field={item.utilisation} label={`${item.node} night utilisation`} /> night
            utilisation, spare{" "}
            <Value field={item.spare} label={`${item.node} spare at night peak`} />, no
            augmentation date published →{" "}
            <span className="text-ink">{item.action}</span>, owner {item.owner}.
          </li>
        ))}
      </ul>
    </section>
  );
}
