"use client";

/**
 * THE FINAL SHAPE — BUILD.md Lane 0, step 7. After this file lands, no
 * lane edits it; each lane replaces its own stub component instead.
 *
 * Three acts, one record, three roles (DESIGN.md "Recommended Approach").
 * D15: page.tsx imports all five stub components directly, grouped by
 * which act DESIGN.md assigns them to — Blocked sources lives inside
 * Act 1, the map and worklist inside Act 2 (KISS, reconciled — an owner
 * ledger view is a drawer inside Act 2, not built here).
 *
 * D2: the top bar carries one time claim (REPLAY) and the role switch
 * sits to its left at full contrast, because it scopes every number below
 * it and was previously the smallest, faintest control on the screen.
 *
 * DATA WIRING — Lane F. `GridMap` is the only one of the five Act
 * components that accepts substation data as a prop
 * (`substations?: Substation[]`, `loadDetails?: SubstationLoadDetail[]`);
 * `ExtractionPanel`, `BlockedSources`, `Worklist` and `FactorCard` all
 * take zero props by their own current signatures — each reads its own
 * data internally (a recorded artifact, `worklist-store`, or
 * `factors-analysis.json` respectively; see each file's own header). So
 * "pass the composed data through" resolves, today, to wiring `GridMap`
 * alone — the other four already have their own data sources and were
 * never blocked on this seam the way `GridMap` was. See `src/app/data.ts`
 * for where `SUBSTATIONS`/`LOAD_DETAILS` come from and why.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRole, type Role } from "@/lib/role-context";
import { ExtractionPanel } from "@/components/extraction-panel";
import { BlockedSources } from "@/components/blocked-sources";
import { GridMap } from "@/components/map/grid-map";
import { Worklist } from "@/components/worklist/worklist";
import { FactorCard } from "@/components/factor-card";
import { AnalysisPanel } from "@/components/analysis/scenario";
import { TimelineSimulator } from "@/components/timeline/timeline";
import type { AnalysisSubstation } from "@/lib/analysis";
import { SUBSTATIONS, LOAD_DETAILS } from "./data";

/**
 * Three lanes independently built three types for the same data, because
 * `Substation` cannot carry load fields: `SubstationLoad` (loader),
 * `SubstationLoadDetail` (load panel) and `AnalysisSubstation` (analysis).
 * That convergence is the signal the contract should be ONE type. Until it is,
 * this adapter is the single place the shapes meet, so the seam is visible
 * rather than scattered. A node without an installed-capacity figure is
 * dropped rather than defaulted — analysis over an invented capacity is worse
 * than analysis over fewer nodes.
 */
const LOAD_BY_ID = new Map(LOAD_DETAILS.map((d) => [d.id, d]));
const ANALYSIS_SUBSTATIONS: AnalysisSubstation[] = SUBSTATIONS.flatMap((s) => {
  const d = LOAD_BY_ID.get(s.id);
  if (!d || !d.installedMva) return [];
  // nightUtilisation is DERIVED here, not carried: SubstationLoadDetail does
  // not have it and AnalysisSubstation needs it. Deriving beats widening the
  // source type, because the two shapes disagree on purpose — one describes a
  // node for display, the other for filtering. Null in, null out: a node with
  // no night peak (Sendhwa) must never read as 0% utilised.
  const util =
    d.nightPeakMva && d.installedMva && d.installedMva.v > 0
      ? { ...d.nightPeakMva, v: (d.nightPeakMva.v / d.installedMva.v) * 100, unit: "%" }
      : null;
  return [{
    id: s.id, name: s.name,
    voltageClass: d.voltageClass ?? String(s.voltageKv),
    lat: s.lat, lon: s.lon,
    installedMva: d.installedMva, nightPeakMva: d.nightPeakMva,
    spareAtNightMva: d.spareAtNightMva, nightUtilisation: util,
    // d.observationCount is the real count of months observed. s.series.length
    // is only the months whose LABEL parsed, which is 40 of 54 — using it here
    // would silently undercount by a quarter.
    minMva: d.minMva, observationCount: d.observationCount, quality: s.quality,
  }];
});

const ROLE_LABEL: Record<Role, string> = {
  operator: "Operator",
  manager: "Manager",
  owner: "Owner",
};

const ROLES = Object.keys(ROLE_LABEL) as Role[];

function RoleSwitch() {
  const { role, setRole } = useRole();
  return (
    <Select value={role} onValueChange={(value) => setRole(value as Role)}>
      <SelectTrigger
        aria-label="Role"
        className="border-line-2 bg-panel font-medium text-ink"
      >
        {/* Explicit children, not a bare <SelectValue />: Radix only
            populates SelectValue's text from its item registry after
            hydration, so a bare <SelectValue /> renders empty in the
            static-exported HTML before JS runs — verified by inspecting
            `out/index.html` (data-slot="select-value" with no text). The
            role switch is D2's highest-contrast, most consequential
            control; it must never render blank. */}
        <SelectValue>{ROLE_LABEL[role]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Home() {
  return (
    <Tabs defaultValue="act2" className="min-h-svh gap-0 bg-bg">
      <header
        role="banner"
        className="flex flex-wrap items-center gap-3 border-b border-line bg-bg-2 px-4 py-3 sm:gap-4 sm:px-6"
      >
        <RoleSwitch />
        <nav aria-label="Acts" className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
          <TabsList className="w-full justify-start sm:w-fit">
            <TabsTrigger value="act1">Where this comes from</TabsTrigger>
            <TabsTrigger value="act2">What is happening</TabsTrigger>
            <TabsTrigger value="act3">Where it could go</TabsTrigger>
          </TabsList>
        </nav>
        <span className="ml-auto font-mono text-xs uppercase tracking-wide text-ink-3 sm:ml-0">
          Replay
        </span>
      </header>

      <main id="main-content" role="main" className="px-4 py-6 sm:px-6">
        <TabsContent value="act1" className="space-y-4">
          <ExtractionPanel />
          <BlockedSources />
        </TabsContent>

        <TabsContent value="act2">
          <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
            <GridMap substations={SUBSTATIONS} loadDetails={LOAD_DETAILS} />
            <aside role="complementary" aria-label="Action">
              <Worklist />
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="act3" className="space-y-6">
          {/* Ask a question of the data, then read the verdicts. Order is
              deliberate: the legacy app lost its scenario query in the rebuild
              and the tool became something you could only read, never
              interrogate. */}
          <AnalysisPanel substations={ANALYSIS_SUBSTATIONS} />
          <TimelineSimulator subs={SUBSTATIONS} />
          <FactorCard />
        </TabsContent>
      </main>
    </Tabs>
  );
}
