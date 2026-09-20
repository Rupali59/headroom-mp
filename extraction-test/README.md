# Extraction probe

Tests the three Anthropic API behaviours the ingest pipeline depends on, **before**
any of the pipeline is written. Each is a claim that would otherwise be trusted.

| | Claim | Why it matters |
|---|---|---|
| **C1** | A base64 PDF block with `citations: {enabled: true}` returns `page_location` with 1-indexed page numbers | Per-field provenance is a platform feature, not pipeline work. If false, page citations must be built by hand |
| **C2** | `citations` and `output_config.format` are mutually exclusive (400) | This is why extraction goes through a `strict: true` tool instead of structured outputs. Discovering it at build time costs an hour |
| **C3** | Claude resolves **merged table cells** correctly | The CTUIL table leaves the Substation column blank on continuation rows, inheriting from a merged cell above. A naive parser assigns them to the last label it saw. **This is the one that decides whether the extraction is worth shipping** |

C3's output must be checked against the PDF by eye. A plausible wrong answer here is
the entire risk of the ingest step.

## Run

```bash
bash ../scripts/fetch-sources.sh      # the PDFs are not committed
bun install
ANTHROPIC_API_KEY=... bun run extract.ts            # C1 and C3
ANTHROPIC_API_KEY=... bun run extract.ts --control  # C2
```

`--control` asserts the *absence* of a side effect: it expects a 400 and says so
loudly if the call unexpectedly succeeds, because a check that cannot fail is worse
than no check.

## Notes

- Pin `@anthropic-ai/sdk` at `^0.127.0` or later. `^0.74.0` resolves to a version with
  no `speed` parameter, no `fast-mode-2026-02-01` beta and no adaptive thinking.
- Fast mode requires `client.beta.messages.*`, not `client.messages.*`.
- The citation branch **narrows** on the union discriminant rather than casting, so a
  false C1 fails loudly instead of printing `undefined`.
