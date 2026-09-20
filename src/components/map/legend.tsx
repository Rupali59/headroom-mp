/**
 * Risk legend — DESIGN.md "Act 2 layout": "Risk legend / risk = count
 * (Weak) of 5", sitting in the context rail beside the map. Shows the
 * deterministic arithmetic ON SCREEN, not just the swatches — DESIGN.md
 * premise 3: "the LLM does judgement; arithmetic stays deterministic," and
 * this is that arithmetic, visible next to the legend it colours.
 *
 * `src/lib/risk.ts` (Lane 0) owns the arithmetic; this component only
 * displays counts it is handed, never recomputes them.
 */

export interface RiskLegendProps {
  counts: {
    green: number;
    amber: number;
    red: number;
    hatched: number;
  };
}

const SWATCH: { level: keyof RiskLegendProps["counts"]; label: string; swatchClass: string }[] = [
  { level: "green", label: "0 weak — healthy", swatchClass: "bg-good" },
  { level: "amber", label: "1–2 weak — at risk", swatchClass: "bg-mid" },
  { level: "red", label: "3+ weak — at high risk", swatchClass: "bg-bad" },
  {
    level: "hatched",
    label: "≥2 unknown — not assessed",
    swatchClass:
      "border border-dashed border-ink-2 bg-[repeating-linear-gradient(135deg,transparent,transparent_2px,var(--ink-2)_2px,var(--ink-2)_3px)]",
  },
];

export function RiskLegend({ counts }: RiskLegendProps) {
  return (
    <section aria-labelledby="risk-legend-heading" className="space-y-2">
      <p
        id="risk-legend-heading"
        className="font-mono text-[10.5px] uppercase tracking-wide text-ink-3"
      >
        Risk legend
      </p>
      <ul className="space-y-1.5">
        {SWATCH.map((s) => (
          <li key={s.level} className="flex items-center gap-2 text-xs text-ink-2">
            <span
              aria-hidden="true"
              className={`inline-block size-2.5 shrink-0 rounded-full ${s.swatchClass}`}
            />
            <span className="flex-1">{s.label}</span>
            <span className="font-mono tabular-nums text-ink-3">
              {counts[s.level]}
            </span>
          </li>
        ))}
      </ul>
      <p className="font-mono text-[10.5px] leading-relaxed text-ink-3">
        risk = count(factors scoring Weak) of 5 · 0 green · 1–2 amber · 3+ red
        · ≥2 of 5 unknown → hatched, excluded from risk
      </p>
    </section>
  );
}
