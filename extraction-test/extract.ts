/**
 * Headroom MP — Act 1 extraction probe.
 *
 * Proves (or disproves) the three API claims DESIGN.md builds on, against a REAL
 * CTUIL document, before any of Act 1 is written:
 *
 *   C1  A base64 PDF document block with citations:true returns page_location
 *       with 1-indexed start/end page numbers.
 *   C2  citations:true + output_config.format is rejected (400). This is why
 *       extraction goes through a strict tool instead of structured outputs.
 *   C3  Claude resolves merged/blank Substation cells correctly — the rows where
 *       the substation column is empty and inherits from the cell above.
 *
 * C3 is the one that decides whether Act 1 is worth demoing. A naive parser
 * assigns "Agar Solar Park" and "Shajapur Solar Park" to whatever substation
 * label last appeared. The correct answer comes from the page layout.
 *
 * Run:  ANTHROPIC_API_KEY=sk-... bun run extraction-test/extract.ts
 *       ANTHROPIC_API_KEY=sk-... bun run extraction-test/extract.ts --control
 */

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PDF = join(here, "fixtures", "ctuil-wr-mp.pdf");
const MODEL = "claude-opus-5";

// Lane E, task 5: the app's Act 1 (`src/components/extraction-panel.tsx`)
// REPLAYS a local run that already succeeded — it never calls the API at
// runtime (BUILD.md: "No compute on Vercel"). This is where that replay
// data comes from: a successful run of this file writes the artifact the
// panel imports, alongside `public/artifacts/mpptcl-{curl,robots}.txt`
// (Lane B's same "recorded, timestamped, never re-fetched" convention).
const RECORDED_ARTIFACT = join(here, "..", "public", "artifacts", "extraction-recorded.json");

// ---------------------------------------------------------------- schema

/**
 * strict:true requires additionalProperties:false and an explicit required list
 * on every object. Nullable fields are unions with "null" rather than omitted,
 * because a blank cell in this document is information: it means "inherits from
 * the merged cell above", not "unknown".
 */
const RECORD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["records"],
  properties: {
    records: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "substation",
          "substation_cell_was_blank",
          "voltage_kv",
          "application_id",
          "applicant",
          "project_type",
          "solar_hour_access_mw",
          "non_solar_hour_access_mw",
          "margin_solar_hour_mw",
          "margin_non_solar_hour_mw",
          "page",
        ],
        properties: {
          substation: {
            type: "string",
            description:
              "Resolved substation name. If the cell was blank, inherit from the merged cell above and set substation_cell_was_blank true.",
          },
          substation_cell_was_blank: {
            type: "boolean",
            description:
              "True when this row's Substation cell was empty on the page and the value was inherited.",
          },
          voltage_kv: { type: ["number", "null"] },
          application_id: { type: ["string", "null"] },
          applicant: { type: "string" },
          project_type: { type: ["string", "null"] },
          solar_hour_access_mw: { type: ["number", "null"] },
          non_solar_hour_access_mw: { type: ["number", "null"] },
          margin_solar_hour_mw: { type: ["number", "null"] },
          margin_non_solar_hour_mw: { type: ["number", "null"] },
          page: {
            type: "integer",
            description: "1-indexed page of THIS sliced PDF the row was read from.",
          },
        },
      },
    },
  },
} as const;

const PROMPT = `This is Annex-IV(3) of the CERC GNA Regulations: solar and non-solar hour
access and margins at ISTS substations, published by CTUIL.

Extract ONLY rows whose substation is in Madhya Pradesh. The MP substations in this
document are: Mandsaur PS, Neemuch PS, Rajgarh SS, Indore (PG), and the Rewa Ultra Mega
Solar entries for the Agar, Shajapur and Neemuch solar parks.

Two things matter more than speed:

1. The Substation column uses MERGED CELLS. Many rows have an EMPTY substation cell and
   belong to the substation named in the merged cell spanning above them. Resolve each
   row to its true substation from the page layout, and set substation_cell_was_blank
   to true wherever you inherited the value. Do not carry a label forward blindly across
   a section boundary.

2. Report the page number each row came from.

Where a numeric cell is genuinely empty, return null. Do not infer, interpolate, or
carry a number sideways from an adjacent column.`;

// ---------------------------------------------------------------- helpers

function pdfBase64(): string {
  // .toString("base64") emits no newlines, which the API requires.
  return readFileSync(PDF).toString("base64");
}

function documentBlock(): Anthropic.Beta.BetaContentBlockParam {
  return {
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
      data: pdfBase64(),
    },
    title: "CTUIL Annex-IV(3) solar / non-solar margins (Western Region slice)",
    citations: { enabled: true },
  } as Anthropic.Beta.BetaContentBlockParam;
}

// ---------------------------------------------------------------- C2 control

/**
 * C2: assert the unsafe-looking shortcut is actually rejected, rather than
 * trusting the documentation. A claim nobody tested is a claim.
 */
async function controlOutputConfig(client: Anthropic) {
  console.log("\n=== C2 control: citations + output_config.format ===");
  try {
    // Beta client throughout: documentBlock() returns a BetaContentBlockParam
    // (its `citations` field requires the beta document-block shape), and the
    // non-beta `client.messages.create` types `content` as plain
    // ContentBlockParam[] — passing a Beta-typed block into it is exactly the
    // TS2769 this fixes. Use client.beta.messages.create for the control the
    // same way the main call below uses client.beta.messages.stream.
    await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { format: { type: "json_schema", schema: RECORD_SCHEMA } },
      messages: [
        { role: "user", content: [documentBlock(), { type: "text", text: PROMPT }] },
      ],
    });
    console.log("UNEXPECTED: the call succeeded. DESIGN.md's C2 claim is WRONG —");
    console.log("structured outputs may be used directly and the strict-tool detour is unnecessary.");
  } catch (err) {
    const e = err as { status?: number; message?: string };
    console.log(`status : ${e.status ?? "(none)"}`);
    console.log(`message: ${e.message?.slice(0, 300)}`);
    console.log(
      e.status === 400
        ? "CONFIRMED: 400. The strict-tool path in DESIGN.md is required."
        : "INCONCLUSIVE: failed, but not with a 400. Read the message above before trusting C2.",
    );
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const client = new Anthropic();

  if (process.argv.includes("--control")) {
    await controlOutputConfig(client);
    return;
  }

  const bytes = readFileSync(PDF).length;
  console.log(`PDF    : ${PDF}`);
  console.log(`size   : ${(bytes / 1048576).toFixed(2)} MB  (Anthropic cap 32 MB, Vercel body cap ~4.5 MB)`);
  console.log(`model  : ${MODEL}, ${process.argv.includes("--fast") ? "fast mode (opt-in)" : "standard speed"}, adaptive thinking\n`);

  const t0 = Date.now();

  // Fast mode is OPT-IN, and off by default. Measured 2026-09-20 on this org:
  //   "rate limit of 0 fast mode input tokens per minute (model: claude-opus-5)"
  // A ceiling of ZERO is not a transient 429 — fast mode is not provisioned, so
  // the documented "retry after the delay" mitigation loops forever. Pass --fast
  // to try it; it falls back to standard on the first refusal rather than
  // retrying. client.beta.messages.* is required either way for the betas.
  const wantFast = process.argv.includes("--fast");
  const stream = client.beta.messages.stream({
    model: MODEL,
    // Bumped from 16000 (Lane E, 2026-09-20): the first real run against
    // the fixture hit stop_reason "max_tokens" — adaptive thinking plus
    // page-by-page merged-cell narration ("I'll work through the
    // merged-cell blocks page by page...") consumed the whole budget
    // before the tool_use block's JSON finished streaming, so
    // `call.input` came back without `records` at all. Not a transient
    // failure — the same prompt will hit the same wall every time at
    // 16000. 48000 gives thinking + narration + the full MP record set
    // (small: ~10-15 rows) headroom without being an unbounded budget.
    max_tokens: 48000,
    ...(wantFast ? { speed: "fast" as const } : {}),
    betas: wantFast
      ? ["fast-mode-2026-02-01", "server-side-fallback-2026-07-01"]
      : ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive", display: "summarized" },
    tools: [
      {
        name: "emit_records",
        description: "Emit the extracted Madhya Pradesh substation access/margin rows.",
        input_schema: RECORD_SCHEMA,
        strict: true,
      },
    ],
    tool_choice: { type: "auto" },
    messages: [
      { role: "user", content: [documentBlock(), { type: "text", text: PROMPT }] },
    ],
  });

  stream.on("text", (t: string) => process.stdout.write(t));
  const msg = await stream.finalMessage();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n\n--- finished in ${elapsed}s ---`);
  console.log(`stop_reason: ${msg.stop_reason}`);

  // Fable/Opus-family safety classifiers can decline with HTTP 200.
  if (msg.stop_reason === "refusal") {
    console.log("REFUSAL:", JSON.stringify(msg.stop_details));
    process.exit(1);
  }

  // ---- C1: page citations -------------------------------------------------
  console.log("\n=== C1: page citations on text blocks ===");
  let cited = 0;
  for (const block of msg.content) {
    if (block.type !== "text" || !("citations" in block) || !block.citations) continue;
    for (const c of block.citations) {
      // The SDK types citations as a discriminated union. A PDF yields
      // page_location; plain text yields char_location. Narrowing rather than
      // casting is what proves C1 — if the branch never fires, the claim that
      // PDFs return page numbers is false, and a cast would have hidden that.
      if (c.type !== "page_location") {
        console.log(`  (non-page citation: type=${c.type})`);
        continue;
      }
      cited++;
      if (cited <= 6) {
        console.log(
          `  pages=${c.start_page_number}-${c.end_page_number} ` +
            `doc="${c.document_title?.slice(0, 40) ?? ""}" ` +
            `cited="${c.cited_text.replace(/\s+/g, " ").slice(0, 70)}"`,
        );
      }
    }
  }
  console.log(
    cited > 0
      ? `CONFIRMED: ${cited} citations carrying page numbers. DESIGN.md C1 holds.`
      : "NOT CONFIRMED: zero citations returned. Do NOT build Act 1's provenance on this.",
  );

  // ---- C3: merged-cell resolution ----------------------------------------
  const call = msg.content.find((b) => b.type === "tool_use");
  if (!call) {
    console.log("\nNo tool_use block — the model answered in prose. Records not extracted.");
    return;
  }
  const { records } = call.input as {
    records?: Array<Record<string, unknown>>;
  };
  if (!Array.isArray(records)) {
    // Seen once (2026-09-20, max_tokens: 16000): stop_reason "max_tokens"
    // truncates the tool call mid-stream and `call.input` comes back
    // without `records` at all — not absent-but-typed, genuinely missing.
    // A bare `records.length` below would throw an opaque TypeError; this
    // names the actual cause instead of crashing blind.
    console.log(
      `\nNo usable 'records' array on the tool_use block (stop_reason: ${msg.stop_reason}). ` +
        `input keys: ${Object.keys(call.input as object).join(", ") || "(none)"}. ` +
        "Likely truncated by max_tokens before the JSON finished streaming — raise max_tokens.",
    );
    return;
  }

  console.log(`\n=== C3: ${records.length} MP records ===`);
  for (const r of records) {
    const blank = r.substation_cell_was_blank ? " [inherited]" : "";
    console.log(
      `  p${r.page} ${String(r.substation)}${blank}\n` +
        `     ${String(r.applicant).slice(0, 52)} · ${r.project_type ?? "-"}\n` +
        `     solar-hr ${r.solar_hour_access_mw ?? "null"} / non-solar ${r.non_solar_hour_access_mw ?? "null"} MW` +
        ` · margin ${r.margin_solar_hour_mw ?? "null"} / ${r.margin_non_solar_hour_mw ?? "null"} MW`,
    );
  }

  const inherited = records.filter((r) => r.substation_cell_was_blank).length;
  const parks = records.filter((r) => /Agar|Shajapur/i.test(String(r.applicant)));
  console.log(`\ninherited (blank substation cell): ${inherited} of ${records.length}`);
  console.log(
    parks.length
      ? `Agar/Shajapur park rows resolved to: ${[...new Set(parks.map((p) => p.substation))].join(", ")}\n` +
          "  ^ THIS is the judgement call. Check it against page 18 of the PDF by eye before\n" +
          "    trusting any of it. A plausible wrong answer here is the whole risk of Act 1."
      : "No Agar/Shajapur rows returned — the hardest case was not exercised.",
  );

  const u = msg.usage;
  console.log(
    `\nusage: in=${u.input_tokens} out=${u.output_tokens} ` +
      `cache_read=${u.cache_read_input_tokens ?? 0} speed=${(u as { speed?: string }).speed ?? "n/a"}`,
  );

  // ---- recorded artifact for src/components/extraction-panel.tsx ---------
  mkdirSync(dirname(RECORDED_ARTIFACT), { recursive: true });
  writeFileSync(
    RECORDED_ARTIFACT,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        model: MODEL,
        sourceDocument: "CTUIL Annex-IV(3) solar / non-solar margins (Western Region slice)",
        sourceFixture: "extraction-test/fixtures/ctuil-wr-mp.pdf",
        pageRange: "23-25 of the full CTUIL document (this fixture's own pages are 1-indexed from that slice)",
        citationsConfirmed: cited > 0,
        records,
      },
      null,
      1,
    ),
  );
  console.log(`\nwrote recorded artifact: ${RECORDED_ARTIFACT}`);
}

main().catch((e) => {
  const msg = String(e?.message ?? e);
  if (e?.status === 429 && /fast mode/i.test(msg)) {
    console.error("\nFast mode is not provisioned on this organisation (limit 0/min).");
    console.error("Re-run WITHOUT --fast. Retrying will not help; the ceiling is zero, not a burst limit.");
    process.exit(2);
  }
  console.error("\nFAILED:", e?.status ?? "", msg);
  process.exit(1);
});
