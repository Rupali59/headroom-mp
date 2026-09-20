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
import { SUBSTATIONS, LOAD_DETAILS } from "./data";

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

        <TabsContent value="act3">
          <FactorCard />
        </TabsContent>
      </main>
    </Tabs>
  );
}
