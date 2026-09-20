/**
 * Headroom MP — research probe for the unknowns.
 *
 * The map currently hatches everything it cannot source from a published PDF:
 * 15 of 19 substations have no published transformation capacity, and three
 * siting factors (water, fibre, land) have no source at all. Hatching them is
 * honest but inert.
 *
 * This asks whether Claude with web search can close any of those gaps with a
 * citable source — producing a `researched` confidence rung that sits between
 * `derived` (voltage-class guess, no source) and `unknown` (nothing).
 *
 * WHAT WOULD MAKE THIS WORTH SHIPPING: a value with a real URL, a retrieval
 * date, and a quote that actually supports it. WHAT WOULD MAKE IT WORSE THAN
 * NOTHING: a plausible number with a vague or irrelevant source, presented at
 * the same visual weight as a figure extracted from an MPERC filing. The probe
 * is built to expose the second case, not to hide it.
 *
 * Uses web_search_20260318, not the _20260209 variant named in most docs: the
 * installed SDK exposes both and the newer one is a superset, adding
 * `response_inclusion`. The substation pass keeps results ("full") because the
 * citations ARE the deliverable; the factors pass excludes them ("excluded")
 * because only the conclusions matter and 12 searches x 3 factors of raw
 * results is a large bill for text nobody reads.
 *
 * Run:  ANTHROPIC_API_KEY=sk-... bun run extraction-test/research.ts
 *       ANTHROPIC_API_KEY=sk-... bun run extraction-test/research.ts --factors
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5";

/**
 * Domain allowlist. Restricting search is a credibility decision, not a
 * technical one: in a government room, a figure sourced to a regulator or the
 * transmission utility is worth more than the same figure from a content farm.
 * The API accepts 1-64 plain hostnames; subdomains are covered.
 */
const ALLOWED = [
  // primary: regulator, utility, central agencies
  "mptransco.in", "mperc.in", "cea.nic.in", "ctuil.in", "powergrid.in",
  "mppmcl.com", "mppkvvcl.org", "sldcmpindia.in", "npp.gov.in",
  // government
  "mp.gov.in", "invest.mp.gov.in", "mpsedc.mp.gov.in", "data.gov.in",
  "india.gov.in", "pib.gov.in",
  // trade press that covers Indian transmission specifically
  "tndindia.com", "powerline.net.in", "mercomindia.com",
  "energetica-india.net", "saurenergy.com", "globalenergymonitor.org",
];

/** The 15 substations with no published transformation capacity. */
const UNKNOWN_SUBSTATIONS = [
  { id: "manglia",   name: "Manglia",            kv: 220, district: "Indore" },
  { id: "pgIndore",  name: "Indore (PG)",        kv: 765, district: "Indore" },
  { id: "pitham",    name: "Pithampur",          kv: 220, district: "Dhar" },
  { id: "ujjain",    name: "Ujjain",             kv: 220, district: "Ujjain" },
  { id: "neemuch",   name: "Neemuch",            kv: 400, district: "Neemuch" },
  { id: "itarsi",    name: "Itarsi",             kv: 400, district: "Narmadapuram" },
  { id: "seoni",     name: "Seoni",              kv: 765, district: "Seoni" },
  { id: "jabalpur",  name: "Jabalpur",           kv: 400, district: "Jabalpur" },
  { id: "katni",     name: "Katni",              kv: 400, district: "Katni" },
  { id: "satna",     name: "Satna",              kv: 765, district: "Satna" },
  { id: "birsing",   name: "Birsinghpur (Pali)", kv: 400, district: "Umaria" },
  { id: "sendhwa",   name: "Sendhwa",            kv: 220, district: "Barwani" },
  { id: "gwalior",   name: "Gwalior",            kv: 765, district: "Gwalior" },
  { id: "sagar",     name: "Sagar",              kv: 220, district: "Sagar" },
  { id: "kurawar",   name: "Kurawar",            kv: 765, district: "Rajgarh" },
];

/** The siting factors with no source. Factor numbers match DESIGN.md's table. */
const UNKNOWN_FACTORS = [
  { n: 7, name: "Water availability for cooling",
    ask: "Perennial surface water or assured industrial water allocation within ~15 km of each substation. Name the river, reservoir or scheme." },
  { n: 8, name: "Fibre / backbone connectivity",
    ask: "Long-distance fibre routes, NKN/BharatNet points of presence, or national highway fibre corridors passing near each substation." },
  { n: 9, name: "Land and industrial zoning",
    ask: "Notified industrial areas, SEZs, or MPIDC land banks within ~20 km of each substation." },
];

const SYSTEM = `You research Indian power-transmission infrastructure for a grid-siting tool
used by Madhya Pradesh state agencies.

Four rules, and the third is the one that matters most:

1. Every value you report carries the URL you found it on and a short verbatim quote
   from that page supporting it. No quote, no value.
2. Prefer the regulator (MPERC), the transmission utility (MPPTCL/MP Transco), CEA and
   CTUIL over trade press. Prefer trade press over anything else.
3. If you cannot find a figure, say so and return null. A wrong number here is far worse
   than a missing one: this tool's entire premise is that it distinguishes what is known
   from what is not. Do NOT infer a capacity from a substation's voltage class and
   present it as researched - that is a different confidence tier and the tool already
   has it. Do NOT average, interpolate, or reason from a similar substation.
4. Note when a figure is dated or superseded. Transformation capacity grows; a 2019
   number presented as current is a wrong number with a real source.`;

const SUBSTATION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "transformation_mva", "as_of", "source_url", "quote", "confidence", "note"],
        properties: {
          id: { type: "string" },
          transformation_mva: { type: ["number", "null"], description: "Total transformation capacity in MVA. null if not found." },
          as_of: { type: ["string", "null"], description: "Date the figure describes, YYYY or YYYY-MM. null if the page does not say." },
          source_url: { type: ["string", "null"] },
          quote: { type: ["string", "null"], description: "Verbatim sentence from the source supporting the figure." },
          confidence: { type: "string", enum: ["found", "partial", "not-found"],
            description: "found = figure with a supporting quote. partial = related information but not the figure. not-found = nothing." },
          note: { type: "string", description: "Anything that qualifies the figure: dated, disputed, under construction, unit ambiguity." },
        },
      },
    },
  },
} as const;

async function researchSubstations(client: Anthropic) {
  const list = UNKNOWN_SUBSTATIONS.map(s => `- ${s.id}: ${s.name}, ${s.kv} kV, ${s.district} district`).join("\n");

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive", display: "summarized" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    tools: [
      { type: "web_search_20260318", name: "web_search", max_uses: 30,
        allowed_domains: ALLOWED, response_inclusion: "full" },
      { name: "emit_findings", description: "Report the researched transformation capacities.",
        input_schema: SUBSTATION_SCHEMA, strict: true },
    ],
    tool_choice: { type: "auto" },
    messages: [{
      role: "user",
      content: `Find the total transformation capacity (MVA) of each of these Madhya Pradesh EHV substations.

${list}

These are the substations for which no capacity is published in the CTUIL or MPERC documents
we already hold, so they currently render as "not assessed" in the tool. Anything you find with
a real source turns one of them from a blank into an assessable node.

Search, then call emit_findings once with one entry per substation, including the ones you
could not find - those must appear with confidence "not-found" and a null figure, because an
absent entry is indistinguishable from an oversight.`,
    }],
  } as never);

  stream.on("text", (t: string) => process.stdout.write(t));
  const msg = await stream.finalMessage();

  if (msg.stop_reason === "refusal") {
    console.log("\nREFUSAL:", JSON.stringify(msg.stop_details)); process.exit(1);
  }

  // Server-tool errors arrive as HTTP 200 with an error object in content, never
  // as a thrown exception. A success `content` is a LIST; an error `content` is
  // an OBJECT - branch on that before indexing, or a quota failure reads as
  // "no results found".
  let searches = 0, searchErrors: string[] = [];
  for (const b of msg.content) {
    if (b.type !== "web_search_tool_result") continue;
    const c = (b as { content: unknown }).content;
    if (Array.isArray(c)) searches += c.length;
    else searchErrors.push(JSON.stringify(c));
  }
  console.log(`\n\n--- web_search: ${searches} results, ${searchErrors.length} errors ---`);
  searchErrors.forEach(e => console.log("  ERROR:", e));

  const call = msg.content.find(b => b.type === "tool_use");
  if (!call) { console.log("No tool_use block - model answered in prose, nothing structured."); return; }

  const { findings } = call.input as { findings: Array<Record<string, unknown>> };
  const found = findings.filter(f => f.confidence === "found");
  const partial = findings.filter(f => f.confidence === "partial");

  console.log(`\n=== ${found.length} found · ${partial.length} partial · ${findings.length - found.length - partial.length} not found (of ${UNKNOWN_SUBSTATIONS.length}) ===\n`);
  for (const f of findings) {
    const mark = f.confidence === "found" ? "+" : f.confidence === "partial" ? "~" : " ";
    console.log(`${mark} ${String(f.id).padEnd(10)} ${f.transformation_mva ?? "—"} MVA${f.as_of ? ` (${f.as_of})` : ""}`);
    if (f.source_url) console.log(`    ${f.source_url}`);
    if (f.quote)      console.log(`    "${String(f.quote).replace(/\s+/g, " ").slice(0, 150)}"`);
    if (f.note)       console.log(`    note: ${f.note}`);
  }

  console.log(`
JUDGE IT BEFORE YOU SHIP IT. Open three of the source URLs and confirm the quote is
on the page and says what the figure claims. A 'researched' rung is only worth having
if it is right more often than a reader would assume from how it looks - and it will
look almost as authoritative as 'verified'.`);

  const u = msg.usage;
  console.log(`\nusage: in=${u.input_tokens} out=${u.output_tokens}`);
}

async function researchFactors(client: Anthropic) {
  const targets = UNKNOWN_SUBSTATIONS.slice(0, 6).map(s => `${s.name} (${s.district})`).join(", ");
  for (const f of UNKNOWN_FACTORS) {
    console.log(`\n${"=".repeat(70)}\nFACTOR ${f.n}: ${f.name}\n${"=".repeat(70)}`);
    const stream = client.beta.messages.stream({
      model: MODEL, max_tokens: 16000,
      thinking: { type: "adaptive", display: "summarized" },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system: SYSTEM,
      tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 12,
        allowed_domains: ALLOWED, response_inclusion: "excluded" }],
      messages: [{
        role: "user",
        content: `${f.ask}\n\nSubstations: ${targets}\n\nFor each, give one sentence with a source URL, or say plainly that nothing citable was found. This factor currently has NO source at all in our tool, so even a partial answer for one substation is progress - but an uncited guess is worse than the blank it replaces.`,
      }],
    } as never);
    stream.on("text", (t: string) => process.stdout.write(t));
    await stream.finalMessage();
    console.log();
  }
}

async function main() {
  const client = new Anthropic();
  console.log(`model: ${MODEL} · web_search_20260318 · ${ALLOWED.length} allowed domains\n`);
  if (process.argv.includes("--factors")) await researchFactors(client);
  else await researchSubstations(client);
}

main().catch(e => { console.error("\nFAILED:", e?.status ?? "", e?.message ?? e); process.exit(1); });
