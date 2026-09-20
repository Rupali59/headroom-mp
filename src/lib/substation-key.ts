/**
 * Key reconciliation — Lane F, the seam DATA.md names but never resolves:
 * "That composition key is NOT specified anywhere in DATA.md/BUILD.md
 * beyond 'the map composes them'."
 *
 * MEASURED (2026-09-20, independently, before reading `src/data/loader.ts`
 * in full): `src/data/geometry.ts`'s `NODE_GEOMETRY` carries 19 hand-picked
 * ids ("bdtcl", "suky", "manglia", "pgIndore", ...) ported verbatim from
 * the legacy demo. `data-local/mpptcl-loading.json`'s 432 raw `substation`
 * labels are MPPTCL's own sheet strings ("400KV BHOPAL", "220KV
 * GWALIOR-II", ...). THEY DO NOT MATCH. `loader.ts`'s exported
 * `slugifySubstation()` turns a raw label into a lowercase-hyphenated id
 * ("400KV BHOPAL" -> "bhopal"), and even that does not equal geometry's
 * "bdtcl" — the two id spaces were invented independently and share no
 * naming convention at all.
 *
 * This file is the explicit, hand-verified bridge: for each of
 * `NODE_GEOMETRY`'s 19 ids, the EXACT raw `substation` label (as printed
 * in `data-local/mpptcl-loading.json`) that represents the same physical
 * site, or no entry at all when no defensible match exists. Every pair
 * below was checked by hand against DATA.md's own 15-row worked table
 * (installed MVA / night peak / spare, to the exact figure) before being
 * written down — see the per-row notes.
 *
 * NOT SILENTLY FUZZY-MATCHED, per the Lane F brief: two of geometry's ids
 * (`manglia`, `suky`) get no entry, because no defensible match exists —
 * see the note above the map.
 *
 * DUPLICATION, FLAGGED RATHER THAN HIDDEN: `src/data/loader.ts` (Lane H,
 * not this lane's file — "src/data/loader.ts ... (Lane H)" is on this
 * lane's forbidden list) independently built the IDENTICAL 17-pair mapping
 * as its own private `GEOMETRY_LABEL_ALIAS` constant, for its own
 * `series`-scoping purpose (AGGREGATION CHOICE #3 in that file's header).
 * That constant is not exported, so this file cannot import it — it is
 * restated here instead, verified to match Lane H's version pair-for-pair
 * (both files arrived at the same 17 labels independently, which is
 * corroborating evidence the mapping is right, not just asserted twice).
 * FINDING for the integration report: two hand-synced copies of the same
 * fact is exactly the divergence risk this whole exercise exists to avoid
 * — if `src/data/loader.ts` ever exports `GEOMETRY_LABEL_ALIAS`, this file
 * should import it instead of restating it. Filed rather than fixed here,
 * since that file is Lane H's exclusively.
 */

/**
 * `NODE_GEOMETRY` id -> the exact raw `substation` label in
 * `data-local/mpptcl-loading.json` that represents the same physical site.
 * Pass a value here to `src/data/loader.ts`'s exported `aggregateSubstations()`
 * output and match on `.rawLabel` (or equivalently
 * `.id === slugifySubstation(value)`).
 */
export const GEOMETRY_TO_RAW_LABEL: Readonly<Record<string, string>> = {
  // "Bhopal (BDTCL)", geometry 765kV. No 765kV Bhopal row exists anywhere
  // in the 27,680-row dataset (zero 765kV rows in the whole file — 765kV
  // is a POWERGRID/CTUIL asset class, not MPPTCL's). Matched to the city's
  // only EHV MPPTCL asset instead. installedMva at the worst-night row is
  // 1445, matching DATA.md's Bhopal row (1445 / 914 / 531) exactly.
  bdtcl: "400KV BHOPAL",

  // "Bina", geometry 400kV — matches. installedMva 945 at the worst-night
  // row, matching DATA.md's Bina row (945 / 743 / 202) exactly.
  bina: "400KV BINA",

  // "Indore (PG)", geometry 765kV. Same zero-765kV-rows situation as
  // bdtcl; matched to the city's EHV MPPTCL asset. installedMva 1260,
  // worst-night peak 577, spare 683 — matches DATA.md's Indore row
  // (1260 / 577 / 683) exactly, and is the brief's own required proof
  // figure ("Indore's 683 spare").
  pgIndore: "400KV INDORE",

  // "Pithampur", geometry 220kV. installedMva 945 at the worst-night row —
  // matches DATA.md's Pithampur row (945 / 449 / 496) exactly, but ONLY at
  // the 400KV class ("400KV PITHAMPUR"); geometry's 220kV never reaches
  // that figure (the 220kV Pithampur rows top out far lower). Voltage-class
  // mismatch, not "fixed" here (geometry.ts is Lane A's).
  pitham: "400KV PITHAMPUR",

  // "Ujjain", geometry 220kV. installedMva 630 at the worst-night row —
  // matches DATA.md's Ujjain row (630 / 304 / 326) exactly, but ONLY at
  // the 400KV class; "220KV UJJAIN"'s installed values ([146, 176, 480])
  // never reach 630. Voltage-class mismatch, not "fixed" here.
  ujjain: "400KV UJJAIN",

  // "Katni", geometry 400kV — matches, no voltage-class discrepancy.
  // installedMva 630, matching DATA.md's Katni row (630 / 431 / 199)
  // exactly.
  katni: "400KV KATNI",

  // "Sagar", geometry 220kV. installedMva 630 at the worst-night row —
  // matches DATA.md's Sagar row (630 / 377 / 253) exactly, but only at the
  // 400KV class. Voltage-class mismatch, not "fixed" here.
  sagar: "400KV SAGAR",

  // "Jabalpur", geometry 400kV. installedMva 640 at the worst-night row —
  // matches DATA.md's Jabalpur row (640 / 397 / 243) exactly, but only at
  // the 220KV class. Voltage-class mismatch — already flagged in
  // geometry.ts's own header comment.
  jabalpur: "220KV JABALPUR",

  // "Neemuch", geometry 400kV. installedMva 320 at the worst-night row —
  // matches DATA.md's Neemuch row (320 / 80 / 240) exactly, but only at
  // the 220KV class. Voltage-class mismatch — already flagged in
  // geometry.ts's own header comment.
  neemuch: "220KV NEEMUCH",

  // "Satna", geometry 765kV. installedMva 480 at the worst-night row —
  // matches DATA.md's Satna row (480 / 396 / 84) exactly, but only at the
  // 220KV class (zero 765kV Satna rows, same POWERGRID/CTUIL boundary as
  // bdtcl/pgIndore). Voltage-class mismatch — already flagged in
  // geometry.ts's own header comment.
  satna: "220KV SATNA",

  // "Seoni", geometry 765kV. installedMva 520 at the worst-night row —
  // matches DATA.md's Seoni row (520 / 325 / 195) exactly, but only at the
  // 220KV class. Voltage-class mismatch — already flagged in geometry.ts's
  // own header comment.
  seoni: "220KV SEONI",

  // "Itarsi", geometry 400kV. installedMva 320 at the worst-night row —
  // matches DATA.md's Itarsi row (320 / 236 / 84) exactly, but only at the
  // 220KV class. Voltage-class mismatch — already flagged in geometry.ts's
  // own header comment.
  itarsi: "220KV ITARSI",

  // "Birsinghpur (Pali)", geometry 400kV. installedMva 160 at the
  // worst-night row, peak 140.5 — matches DATA.md's Birsinghpur row
  // (160 / 140.5 / 20) exactly, and is the brief's own required proof
  // figure ("Birsinghpur's 140.5 night peak"). Only at the 220KV class —
  // voltage-class mismatch, already flagged in geometry.ts's own header.
  // No raw label contains "PALI" — the sheet only ever calls this site
  // "BIRSINGHPUR".
  birsing: "220KV BIRSINGHPUR",

  // "Sendhwa", geometry 220kV — matches, no voltage-class discrepancy.
  // installedMva 160 present at the 220KV class, matching DATA.md's
  // Sendhwa row's installed figure. DATA.md caveat 6's night-peak
  // disagreement (93 vs. this pipeline's "no night peak found") is a
  // genuine, separately-reported data gap — see `src/data/loader.ts`'s
  // header — not a key-mapping error; the label match itself is solid.
  sendhwa: "220KV SENDHWA",

  // "Gwalior", geometry 765kV, matched via the sheet's "-II" suffixed
  // label (spelling/naming variant, not the same string). installedMva
  // 320 at the worst-night row — matches DATA.md's Gwalior row
  // (320 / 271 / 49) exactly, but only at the 220KV class (zero 765kV
  // Gwalior rows, same POWERGRID/CTUIL boundary). Voltage-class mismatch —
  // already flagged in geometry.ts's own header comment.
  gwalior: "220KV GWALIOR-II",

  // "Mandsaur", geometry 400kV. Only present in the sheet at 132KV — no
  // "400KV MANDSAUR" label exists at all. Not in DATA.md's worked table
  // (name-match only, no independent cross-check available), but it is
  // the ONLY Mandsaur candidate in the 432 labels, so there is no
  // ambiguity to silently resolve either way.
  mandsaur: "132KV MANDSAUR",

  // "Kurawar", geometry 765kV. Only present in the sheet at 132KV (same
  // POWERGRID/CTUIL 765kV boundary as bdtcl/pgIndore/satna/seoni/gwalior).
  // Not in DATA.md's worked table; only Kurawar candidate in the 432
  // labels.
  kurawar: "132KV KURAWAR",

  // "suky" ("Suky Sewaniya", geometry 400kV) and "manglia" ("Manglia
  // (Indore)", geometry 220kV) are DELIBERATELY ABSENT.
  //
  //   suky: no raw label anywhere in the 432 contains "SUKY", "SEWANIYA",
  //   or any recognisable variant. Genuinely no data.
  //
  //   manglia: the closest raw label is "220KV MANGLIYA" (Mangliya vs.
  //   Manglia — a plausible transliteration variant, and geometry's own
  //   220kV matches that label's class), but the brief's instruction is
  //   explicit — "do not silently fuzzy-match" — and a one-letter spelling
  //   guess on an unfamiliar place name is exactly that. Reported here
  //   rather than guessed: `220KV MANGLIYA` is the most likely real match
  //   for `manglia` and is worth a human confirming before it is wired in.
};

/**
 * The inverse of `GEOMETRY_TO_RAW_LABEL` — raw label -> geometry id.
 * Every value in the map above is a distinct raw label (verified: 17 keys,
 * 17 distinct values), so this inversion is total and lossless.
 */
export const RAW_LABEL_TO_GEOMETRY: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(GEOMETRY_TO_RAW_LABEL).map(([geometryId, rawLabel]) => [rawLabel, geometryId]),
);

/**
 * Geometry ids with no confident raw-label match — see the comment above
 * `manglia`/`suky` in `GEOMETRY_TO_RAW_LABEL`. Exported so a caller (or a
 * test) can assert these nodes render hatched rather than merely being
 * absent from a lookup by accident.
 */
export const UNMATCHED_GEOMETRY_IDS: readonly string[] = ["suky", "manglia"];
