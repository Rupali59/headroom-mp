# DEMO.md — the run sheet

Lane I (Demo hardening). Read alongside `DESIGN.md`'s "Demo script, 8 minutes" and
"Interaction states," `DATA.md`'s "What the ask becomes" and "Caveats," and
`design-system/MASTER.md` §8 (copy) — this file does not repeat their content, it
schedules and hardens it.

**The room:** MPSEDC and the MP state AI department, quite possibly with MPPTCL or MP
SLDC engineers present. Eight minutes, presenter-driven, unmeasured projector, conference
wifi.

**The gap this file closes:** the original script was 480 seconds of acts with zero
slack, no framing, no closing, and no ask written anywhere. Below is 6 minutes of
scripted content (framing through the ask), leaving 2 minutes of the 8-minute slot
unscripted on purpose — for one question and one fumble. If neither happens, stop
talking. Silence after the ask is not dead air, it is the room deciding.

---

## Standing rule for the full eight minutes

**No first person. No apologies.**

- *"The tool does not have transformation capacity for Katni"* is a finding.
- *"I didn't build that yet"* is an apology, and it quietly tells the room this is a
  half-finished side project instead of a deliberate scope decision.

Every gap on screen already says who holds the missing number and what it would unlock
(`design-system/MASTER.md` §8, the gap sentence). Read it as written. Do not soften it
with "we," "I," or "sorry" — those three words are the whole failure mode, and the whole
product's credibility rests on not needing them.

---

## The RESTRICTED pre-emption — say this in the first 5 seconds of Act 1

The CTUIL source carries `डेटा वर्गीकरण : प्रतिबंधित / RESTRICTED` on **26 of its 29
pages** (DESIGN.md D13 / BUILD.md correction — not "every page," that claim was revised
the same day). Someone in this room can read Hindi and English both, and someone in this
room may recognise that marking before the slide changes. Raising it costs five seconds.
Waiting for someone else to raise it costs thirty and leaves doubt sitting in the room for
the rest of the eight minutes.

Say, before touching the keyboard:

> "One thing before I start: this source PDF is marked RESTRICTED on most of its pages.
> It's publicly posted by CTUIL today, and this build sits behind Vercel's own
> authentication — nobody sees this without signing in. But the classification call isn't
> ours to make. I'd like to ask **[MPSEDC contact in the room, named if known, otherwise
> 'whoever here owns that call']** to tell us after: is a public posting of a RESTRICTED
> document fair game to build on, or does this need to come down?"

Then proceed. Do not wait for an answer before starting Act 1 — the point is that the
question was asked out loud, on the record, before the room could ask it first.

---

## 6-minute script (fits an 8-minute slot with 2 minutes unscripted)

| Time | Act | Role | What happens | Say |
|---|---|---|---|---|
| 0:00–0:15 | Framing | — | Screen up, nothing clicked yet | "Madhya Pradesh's grid, from its own published numbers. Three acts: what we can read, what it's doing right now, and where it has room to grow." |
| 0:15–0:20 | RESTRICTED pre-empt | — | Still nothing clicked | The five-second line above. |
| 0:20–1:15 | **Act 1** — Ingest | — | Drop the CTUIL PDF, watch rows stream in with page citations. Then attempt MPPTCL — it fails on screen, landing in Blocked sources with the real 404. | "That's a real government PDF becoming cited data in front of you. Now the one we actually need." *(MPPTCL fails)* "That wall is the ask." |
| 1:15–3:15 | **Act 2** — Operations | Operator | Replay 15 Jan winter night peak. Three nodes red, two hatched. Open worklist, flag one row, correct a value, watch its provenance update live. Switch to Manager, show the aggregate. | "Winter night, the coldest hour we have data for. Three substations are tight on headroom right now — not modelled, measured, from MPPTCL's own loading sheets. Two more we can't assess yet, and the screen says who holds that number. I'll flag one, and correct a value the way an MPPTCL engineer in this room could." |
| 3:15–4:45 | **Act 3** — Opportunity | Manager | 100 MW, 24×7 candidate. Twelve factors, tally resolves, three read blocked. | "Same data, a different question: where could a 100-megawatt, round-the-clock load land. Twelve factors. Nine resolve today. Three are blocked on exactly three datasets — MPPTCL margins, SLDC load profiles, MPPMCL storage milestones. Water and fibre aren't data gaps, they're physical site questions — different thing, not conflated here." |
| 4:45–5:30 | Owner | Owner | Open the ledger drawer inside Act 2. | "Every number you just saw has a name and a date attached to it. That's not a slide claim — click any figure, that's what opens." |
| 5:30–6:00 | **Close + ask** | — | Nothing new on screen — hold the ledger view. | See below, verbatim. |

**2 minutes remaining in the 8-minute slot: one question, one fumble, or silence.** Do not
fill it by narrating more of the product.

---

## The 30-second close — say this verbatim

> "Four things, and they're small on purpose. One: a stable, dated URL for MPPTCL's
> loading data — right now every month's filename is a different guess. Two: the five
> months before 2022 republished as `.xlsx` instead of legacy `.xls`, so nothing has to be
> hand-converted. Three: drawal headroom alongside transformer loading, because loading is
> what we can show today and drawal is what actually gates a new connection. And four —
> the only one that's a person, not a dataset — one real MPSEDC enquiry, run end to end,
> so we find out where this breaks against a real applicant instead of a fixture.
>
> One more thing, because you're the people who'd decide this: everything you saw today
> was built for a 100-megawatt data centre. The same published numbers, read the same
> way, are also the answer to whether a farm or a home has a reliable feeder. That's not
> built today. It's the same ask, pointed at a different constituency."

That last paragraph is deliberate — DESIGN.md's own open question 9 calls the citizen-side
feeder-reliability framing "likely the strongest thing to say in the closing thirty
seconds, given the audience." This is where it belongs: last, after the ask that is
actually built, not instead of it.

---

## 2-minute fallback (if the slot is halved on the day)

This happens. Do not try to compress all four acts — pick truth over completeness.

| Time | What | Say |
|---|---|---|
| 0:00–0:10 | RESTRICTED pre-empt, compressed | "Quick flag: this source is marked RESTRICTED, we're behind authentication, and the classification call belongs to MPSEDC, not us." |
| 0:10–1:10 | **Act 2 only** — the red/hatched replay and one correction | "Madhya Pradesh's grid at its coldest measured hour. Three substations are tight, measured from MPPTCL's own published loading — not modelled. Two more we can't assess, and the screen names who holds that number." *(correct one value, show provenance update)* "That's an MPPTCL engineer's correction, timestamped, attributed, live." |
| 1:10–1:40 | **The ask, compressed to two lines** | "Two things: a stable dated URL for this data, and drawal headroom alongside loading — loading is what we can show, drawal is what actually gates a connection." |
| 1:40–2:00 | Citizen close | "Same published numbers answer whether a farm or a home has a reliable feeder. Not built today — same ask, different audience." |

Skip Act 1 and Act 3 entirely rather than rushing them. A rushed extraction demo with no
time to let rows land is worse than not showing it; a compressed Act 3 tally with no time
to name the three blocked datasets loses the only fact in that act worth keeping.

---

## Five hardest questions, with written answers

Caveats are the presenter's friend here: **agree with the stated limitation first, then
convert it into the ask.** Do not defend the gap — name it, then hand it back as work for
the room to unblock.

### 1. "Isn't this just proportional to substation size? Why not use coincident load properly?"

Agree, then convert: an earlier version of this *was* exactly that — a formula linear in
installed capacity, so a substation's risk score was really just restating how big it is.
Both ends degenerate: every large substation reads safe, every small one reads red,
regardless of what's actually happening on it. It was thrown out.

What replaced it is MPPTCL's own monthly EHV loading sheets — which, unlike the earlier
research dossier claimed, do publish a genuine simultaneous-maximum reading per
substation, with a date and a time, for every month. Utilisation on screen is
`measured night peak ÷ installed capacity`, over 55 months of that published series. It
is not proportional to anything; it is read off the source.

### 2. "That's transformer loading. What about drawal headroom for an actual new connection?"

Agree immediately — this is the correct objection and the caveat is printed on every card,
not hidden in a footnote: spare MVA is transformer headroom, not drawal capacity. n-1
contingency, bay availability and the downstream network all still bind on top of it, and
none of those are in this dataset. That gap is ask #3 in the close: drawal headroom,
alongside loading, from MPPTCL.

### 3. "What's the planning derate here — is this n-1 checked?"

**Do not call it n-1.** At a two-ICT station, n-1 derates to roughly 50% — that is a real
and much larger number than anything on screen, and it is not what this tool shows.
What's on screen is the *raw* published spare MVA: installed capacity minus the worst
observed night peak, with nothing subtracted. Two real-world derates sit on top of that
raw number and this tool deliberately keeps them separate rather than folding them into
one score: n-1 contingency planning, and single-transformer exposure — which is already
its own named risk factor (factor 4 of 5: "single transformer at this voltage class").
Merging n-1 into the headline figure would both mislabel it and double-count a station
that's already flagged for having no second transformer to fall back on. We show the raw
number, name what still binds on top of it, and ask MPPTCL for the piece that would close
the gap — drawal headroom.

### 4. "GNA or intra-state — which route, and who actually grants it?"

Two different things, two different grantors. GNA — General Network Access, under the
CERC GNA Regulations 2022 — is granted by CTUIL, and it's the ISTS route: a bulk consumer
at 50 MW or above is eligible to connect directly to the interstate network (Reg
17.1(iii)). But CTUIL's own granted-connectivity list currently carries **zero** ISTS
bulk-consumer nodes in Madhya Pradesh. So today, practically, a 50–100 MW load in MP
connects **intra-state**, through MPPTCL as the State Transmission Utility, under MPERC's
open-access and wheeling rules — not through CTUIL's GNA process at all. Factor 4 on the
Act 3 card (`Connectivity route`) states exactly this, cited to the CERC regulation.

### 5. "Nineteen substations — that's what, 4% of the network? How does that support anything?"

Agree with the arithmetic, reject the premise. Nineteen is what's drawn on the map for an
eight-minute walkthrough — it is not what was ingested. The dataset behind every card is
**432 distinct EHV substations**, pulled from 55 months of MPPTCL's own published loading
sheets. That's effectively the whole MPPTCL EHV network, not a sample of it. Nineteen is a
legibility choice for today's room; 432 is the actual thesis, and it's the strongest
answer available if this question gets asked, because it turns the sharpest hostile
framing directly into the pitch.

---

## Recorded artifacts — verified 2026-09-20, described from their actual contents

**These are recorded evidence. Never fetched at demo time** — conference wifi is not part
of the trust chain for anything below. All three exist, are non-empty, and were opened and
read (not inferred from filename) for this check.

| File | Size | What it actually contains |
|---|---|---|
| `public/artifacts/mpptcl-robots.txt` | 1,396 bytes | **Not a robots.txt.** It's the captured HTML body returned when fetching `mptransco.in/robots.txt` — a plain IIS "404 - File or directory not found" page. This is the *evidence* that no robots.txt exists on that host, which is the opposite of what the filename might suggest to a fast reader: it is not a disallow list blocking the crawl, it is proof there was nothing to be blocked by. Captured 2026-09-20T09:45:14Z. |
| `public/artifacts/mpptcl-fetch.txt` | 378 bytes | A recorded fetch log against MPPTCL's "LIST OF EHV SUBSTATION WITH AVAILABILITY OF MARGIN (MVA)" PDF. `http_code=404`, redirecting through the dossier's dead `/STU_Cell/...` path. This is the actual wall Act 1 shows on stage — the live document has since been found at a different path (`/STUCell/`, per `DATA.md`), but this captured 404 is what the demo replays, because it is what a cold, unauthenticated fetch against the path the original research pointed to actually returns. Same capture timestamp as above. |
| `public/artifacts/extraction-recorded.json` | 16,993 bytes | 44 real extracted records from the CTUIL Annex-IV(3) fixture (`extraction-test/fixtures/ctuil-wr-mp.pdf`, pages 23–25 of the full document), model `claude-opus-5`, captured `2026-09-20T10:38:45.538Z`. Nine distinct substations, each row carrying an application ID, applicant, project type, solar/non-solar-hour access, and margin figures, with a per-row `page` claim. `citationsConfirmed: false` — the page number on each row is **the model self-reporting which page it read**, not a platform citation guarantee (DATA.md "Provenance"). Say it that way on stage if asked; do not say "the API cites the page." This is the "Use recorded extraction" fallback named in DESIGN.md's Act 1 interaction states — the thing that plays if a live extraction attempt 429s, refuses, or times out on the day. |

If any of the three go missing or empty before the demo, Act 1's error-state fallback has
nothing to fall back to — check this table's file sizes are still roughly these numbers as
part of T-60 below, not just that the files exist.

---

## `DemoStateReset` — the setup-time reset control

`src/components/demo-state.tsx` exports `DemoStateReset`. It clears every `headroom.*`
localStorage key, re-seeds the worklist via `seedWorklist()` from
`src/lib/worklist-store.ts`, and reloads the page at a query-stripped URL — so a stray
`?keep=1` left over from a rehearsal tab cannot survive a reset. `worklist-store.ts`
already resets by default on any load without `?keep=1`; this component is the visible
button for triggering that same reset **without** touching the address bar, for use during
setup (T-15 below) or immediately after a messy rehearsal pass.

**Where it should go (Lane F's call, not this lane's):** a small `outline`/`sm` button in
the top bar, beside the role switch — visible but not competing with Act 2/3 content, and
reachable in one click without navigating away from whatever's on screen. It is a setup
tool, not part of the eight-minute script; nobody should click it while the room is
watching.

---

## T-90 / T-60 / T-45 / T-30 / T-15 checklist

**T-90 (90 minutes before)**
- [ ] **Screen-record a full rehearsal run, start to finish.** This is free and it is the
      *only* defence against dead conference wifi — there is currently no offline artifact
      of any kind. Save it somewhere reachable without wifi (local disk, not a cloud link).
- [ ] Confirm the production URL loads on the venue network, **signed in** through Vercel
      Deployment Protection (DESIGN.md D13) — not just reachable, actually past the auth
      gate.
- [ ] Read through the five hardest-questions answers above once, out loud.

**T-60 (60 minutes before)**
- [ ] Re-open the three recorded artifacts and confirm their sizes are still close to the
      table above (1,396 / 378 / 16,993 bytes) — a build step or a careless edit silently
      truncating one of these is worse than it going missing, because it fails quietly.
- [ ] Click `DemoStateReset`, confirm the worklist returns to the two seeded machine rows
      plus the one field-reported row (Birsinghpur, Gwalior, Indore bay 3 hum) — not
      whatever state the last rehearsal left behind.
- [ ] Time one full run against a clock. If it's over 6:30 for the 6-minute script, find
      the slow act and cut there, not everywhere evenly.

**T-45 (45 minutes before)**
- [ ] **Press the density toggle (D11) on the actual venue projector and read the findings
      band from the back row.** This is the single most likely failure mode named in
      design review — not the API, a projector nobody measured. If findings or the action
      column disappear at either density, that is a stop-the-show problem, not a
      nice-to-have.
- [ ] Re-run `DemoStateReset` after the density check — clicking through the UI during
      testing dirties the worklist again.

**T-30 (30 minutes before)**
- [ ] Clear demo state one final time via `DemoStateReset`.
- [ ] Do Not Disturb on, on the presenting machine and any phone visible to the camera.
- [ ] One clean browser tab. No other tabs, no bookmarks bar with anything sensitive
      visible, no notification-generating apps running.
- [ ] Confirm the RESTRICTED pre-emption line is memorised well enough to say without
      reading it off a screen — it is the first thing out of your mouth and it must not
      sound read.

**T-15 (15 minutes before)**
- [ ] Final `DemoStateReset` click.
- [ ] Reload the production URL fresh, confirm sign-in still holds.
- [ ] Confirm the close (the four asks + citizen line) is memorised verbatim — it is the
      only 30 seconds of this demo that has to land exactly, because it's the only part
      that asks the room for something.
- [ ] Phone silent, water within reach, and stop rehearsing. One more read-through now
      costs more confidence than it buys.
