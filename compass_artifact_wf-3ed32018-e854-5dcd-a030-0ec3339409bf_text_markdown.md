# MP Grid Headroom Map for AI Data Centres — Research & Build Dossier

## TL;DR
- **Build it as a decision-support "candidate substation" map, not a live feed.** The single best public dataset framed for a *load* like a data centre is CTUIL's monthly "ISTS Substations for Bulk Consumers" PDF — but as of 31-08-2025 it lists **ZERO substations in Madhya Pradesh** (only Odisha/Gujarat/Tamil Nadu/Andhra: Paradeep, Gopalpur, Navinal-Mundra, Kandla, Tuticorin, Kakinada, Pendurthi). The honest headline your demo should surface: a 50–100 MW AI data centre in MP today most realistically connects at the **intra-state MPPTCL 220/400 kV level**, and the "night power" question is answered by MP's **thermal fleet (~15,100 MW) plus new BESS tenders (625–750 MW / 1.25–1.5 GWh)**, not by solar.
- **The data is real but messy: PDFs, no lat/long on load margins, and the one ideal MPPTCL substation-margin table is access-locked.** CTUIL solar/non-solar margin data is *generation-injection* framed; MPPTCL's EHV substation margin list (18 substations, MVA) exists but sits behind robots.txt/Scribd bot-walls and could not be retrieved programmatically. Plan for Claude-assisted PDF→JSON extraction with per-field citations, plus clearly-flagged mock/estimated values for the demo.
- **One-hour build = a single-file React/Leaflet dark map** with ~15–25 hardcoded MP substations, a Solar/Non-solar headroom toggle, filters, a scenario query panel ("100 MW near Bhopal, 24×7"), a citations drawer, a seasonal demand chart, and a "data we need from government" panel. Everything except the static GeoJSON basemap and the sample dataset should be mocked; the value is the UX narrative, not live ingestion.

## Key Findings

1. **CTUIL is the highest-value public source and now explicitly separates solar-hour vs non-solar-hour access** under CERC GNA Regulations 2022 (declaration format issued per CERC Order dated 10.07.2026, Petition 11/SM/2026). The two crown-jewel datasets are the substation-wise margins PDF (Annex-C, dated 13-08-2026) and the "ISTS Substations for Bulk Consumers" PDF. Both are monthly PDFs.
2. **A 50–100 MW data centre IS eligible for ISTS connectivity as a "bulk consumer ≥50 MW."** Verbatim from the CERC GNA Regulations 2022, eligible entities include "A distribution licensee or a Bulk consumer, seeking to connect to ISTS, directly, with a load of 50 MW and above" (Reg 17.1(iii)). But CTUIL's bulk-consumer substation list has no MP entries yet, so the practical route is intra-state via MPPTCL/MPERC, or ISTS via a nearby PGCIL node.
3. **MP has strong data-centre incentives.** Under the MP IT/ITeS & ESDM Policy 2023, "the first five data centres with over ₹500 crore investment get the biggest benefit in the whole policy, up to ₹125 crore each" (Anchor Data Centre capital support), plus power tariff reimbursement, electricity duty exemption, and (per the Data Centre policy) 100% waiver on banking/transmission/wheeling charges. A power-tariff rebate is estimated at "₹8–12 crore savings per MW" over five years (finraja.com).
4. **Night headroom is a thermal + storage story.** MP installed capacity ~27,700 MW (thermal ~15,100 MW). Active storage procurement: MPPMCL 625 MW/1,250 MWh — "2 units of 250 MW/500 MWh and 1 unit of 125 MW/250 MWh... connected to the Birsinghpur (Pali), Bina and Sendhwa substations... VGF up to INR 18 lakh/MWh... bids due July 30, 2026" (Energetica India) — plus an earlier 750 MW/1,500 MWh RfS and Morena solar-plus-2h-storage.
5. **The seasonal demand trough is the core "why MP" story.** Per CEIC/CEA (Power: Peak Demand: Western: Madhya Pradesh): "data was reported at 13,818.000 MW in Jul 2026... The data reached an all-time high of 19,902.000 MW in Jan 2026 and a record low of 4,003.000 MW in Jul 2005" — a swing of ~6,000 MW (peak-MET high was 19,895 MW). A flat 24×7 data-centre load is easiest to absorb in the monsoon trough and hardest at the winter-irrigation night peak.
6. **Geospatial reality: no clean lat/long for load margins.** CTUIL generator/bulk PDFs give coordinates; the MPPTCL margin list does not. You must geocode substations by name/district. OSM (Overpass) and Global Energy Monitor's Global Integrated Power Tracker are the practical geospatial layers.

## Details

### 1. Source Audit

| Source | URL | Contains | Format | Update freq | Latest | MP substation-level? | Lat/long? | Access | Reliability |
|---|---|---|---|---|---|---|---|---|---|
| **CTUIL — ISTS Substations for Bulk Consumers** | ctuil.in/substation-bulk-consumers | ISTS substations planned for bulk consumers (incl. green H2/ammonia): capacity MVA, granted/margin MW, coordinates, remarks | PDF | Monthly | as on 31-08-2025 | **No MP entries** (ER/WR/SR only) | Yes (boundary coords) | Public | High (primary, load-framed) |
| **CTUIL — Substation-wise solar/non-solar margins (Annex-C)** | ctuil.in/renewable-energy (Annex-C 13-08-2026) | Per-substation solar-hour & non-solar-hour margins (MW) | PDF | Monthly | 13-08-2026 | Some WR; mostly Rajasthan/Gujarat RE nodes | Partial | Public, marked RESTRICTED | High but generation-injection framed |
| **CTUIL — solar/non-solar margins (all, bay-wise)** | www.ctuil.in/uploads/assets/176011721061Website sheet_solar non solar margins_all.pdf | Applicant-wise connectivity + solar/non-solar hour access MW per bay/substation | PDF | Monthly | ~late 2025 | Barmer/Bhadla/Bikaner etc.; few WR | No coords in sheet | Public | High |
| **CTUIL — GNA granted list** | ctuil.in/gna2022updates | Connectivity/GNA granted (incl. MP entries e.g. Ujjain wind at Indore PG S/s) | HTML/PDF | Ongoing | 2026 | Some | No | Public | High |
| **MPPTCL / MP Transco STU margin list** | mptransco.in (STU_Cell/MPSTU-Availability of Margin(MVA).pdf); mirror scribd.com/document/730484497 | "LIST OF EHV SUBSTATION OF MPPTCL WITH AVAILABILITY OF MARGIN (MVA)" — 18 substations: location, voltages, transformer & total capacity, available margin, feeder bays | PDF | Irregular | Undated | **Yes — the ideal intra-state dataset** | No | **robots.txt blocked + Scribd bot-wall — values NOT programmatically retrievable** | High if obtained manually |
| **MP SLDC Jabalpur** | sldcmpindia.in | Real-time state load, scheduling, OCC minutes, MP Grid Code, STOA | HTML+PDF | Real-time/daily | 2026 | Load/scheduling, not substation margins | No | Public | Med-High |
| **github.com/jainsourabh/MP-SLDC** | github.com/jainsourabh/MP-SLDC | Python scraper for MP-SLDC (self-adjusting sleep) | Code (Python) | Stale | — | Scheduling data | No | Public repo | Reference only; verify before use |
| **MPERC** | mperc.in | Tariff orders, "Status of MP Power Sector" (installed capacity, demand, transmission), grid code | PDF/HTML | Periodic | 27.06.2025 status | Aggregate | No | Public | High (regulator) |
| **CEA** | cea.nic.in (power-supply, transmission reports) | Power supply position, transmission reports, demand | PDF | Monthly/daily | 2026 | State-level | No | Public | High |
| **CEIC (mirrors CEA)** | ceicdata.com | MP peak demand/met time series | HTML | Monthly | Jul 2026 | State | No | Freemium | High (CEA-sourced) |
| **Global Energy Monitor — Global Integrated Power Tracker** | globalenergymonitor.org | Power plants (unit-level), some transmission; geolocated | CSV/XLSX | Periodic | Aug 2026 | Plants yes, substations partial | Yes | Open download | High |
| **OpenStreetMap (Overpass)** | overpass-turbo.eu | power=substation nodes/ways with voltage tags | API/GeoJSON | Live | Live | Yes (crowd-sourced, incomplete) | Yes | Open | Med (coverage varies) |
| **Rentech Digital scrape** | rentechdigital.com | MP substations with lat/long (incl. BDTCL Bhopal 23.40,77.45) | HTML/JSON | Static | 2024 | Yes | Yes | Public | Low-Med (commercial scrape) |
| **data.gov.in / National Power Portal** | data.gov.in; npp.gov.in | Generation, capacity dashboards | CSV/API | Periodic | 2026 | Aggregate | No | Public | Med-High |

**Extraction of the latest CTUIL bulk-consumer list (31-07/31-08-2025):** seven ISTS substations — Paradeep & Gopalpur (Odisha, 765/400 kV, 9000 MVA space provision), Navinal/Mundra (GIS) & Kandla (GIS) (Gujarat), Tuticorin, Kakinada & Pendurthi (green-hydrogen, SR). Each lists boundary coordinates, S/s capacity MVA, granted MW, margins identified, and TBCB scheme/SCOD remarks (e.g., Navinal 7,500 MW planned, 3,050 granted, 4,450 margin; Adani Energy Solutions SCOD 14.07.2026). **None are in Madhya Pradesh / the WR interior** — the key demo finding: for load/drawal, MP is not yet served by a dedicated ISTS bulk-consumer node, so the tool must fall back to intra-state MPPTCL nodes and general ISTS PGCIL substations.

### 2. MP EHV Substation Dataset (compiled; sources flagged)

MPPTCL network totals (MPERC "Status of MP Power Sector," data as on 31.03.2024): **416 substations / 79,815 MVA** — 400 kV: 14 / 11,195 MVA; 220 kV: 88 / 33,110 MVA; 132 kV: 314 / 35,510 MVA. By June 2026 this grew to ~85,284 MVA over 417 substations (400 kV class 14 / 13,195 MVA); ~1,052 power transformers. **These are transformation capacities; per-substation spare margin (MVA) exists only in the access-locked STU list.**

Named substations with sourced capacity data (spare margins are estimated/mock unless from the STU list):
- **400 kV Suky Sewaniya (Bhopal)** — 1,630 MVA total after a 500 MVA transformer (2024); Bhopal district total 4,463 MVA. Source: tndindia / transformer-magazine.
- **765/400 kV Bhopal (BDTCL / IndiGrid)** — 2×1,500 MVA (3,000 MVA), commissioned 30-09-2014; ~23.40 N, 77.45 E. Source: indigrid.co.in / rentechdigital coords.
- **400 kV Bina** — 1,260 MVA (315 MVA added Jun 2026); PGCIL 765 kV hub nearby; ~24.18 N, 78.20 E. Source: tndindia / powergrid.
- **220 kV Manglia (Indore)** — +200 MVA (Apr 2026). Source: tndindia.
- **220 kV Chhatapur** — 643 MVA. Source: tndindia.
- **400 kV Mandsaur** — third 400 kV transformer, 500 MVA added (2×315 existing); Malwa/solar hub. Source: tndindia.
- **PGCIL Itarsi, Seoni (India's first 765 kV AIS), Satna (765 kV), Jabalpur** — WR ISTS nodes. Source: powergrid / powermin.
- **Sanjay Gandhi TPS, Birsinghpur (Umaria)** — MPPGCL thermal, 1,340 MW (Unit 1 commissioned March 1993); confirms the Birsinghpur/Pali BESS node co-locates with existing thermal. Source: Wikipedia/MPPGCL.
- **Kurawar (765/400/220 kV, under construction)** — PGCIL TBCB, ~₹3,600 cr, ~June 2027; links Mandsaur, Ashta, Shujalpur. Source: tndindia.

**Upcoming transmission adding capacity (schedules):**
- **Kurawar 765/400/220 kV ISTS-TBCB** (Powergrid Kurawar Transmission Ltd) — ~June 2027; 4,500 MW connectivity at Mandsaur.
- **Gadarwara-II TPS + 1,500 MW RE at Mandsaur common augmentation** — Part A ₹3,201 cr / 36 months; Part B ₹372 cr / by March 2031.
- **Rajgarh (1,000 MW) SEZ Phase II — Pachora Power Transmission Ltd** (commissioned Q1FY27).
- **Neemuch SEZ (1 GW)** — 2×500 MVA 400/220 kV pooling; ~₹581 cr.
- **Agar (550 MW) & Shajapur (450 MW) solar parks** — PGCIL Pachora 400/220 kV ISTS.

### 3. Load Connectivity Rules (concise)

- **Two routes.** (a) **ISTS/GNA route** — under CERC GNA Regulations 2022, "A distribution licensee or a Bulk consumer, seeking to connect to ISTS, directly, with a load of 50 MW and above" is eligible (Reg 17.1(iii)). Per Mercom India: "Applications... should be made online to CTU along with an application fee of ₹500,000 (~$6,430)... CTU will process all applications within two months." A one-time GNA charge (~₹1 lakh/MW) also applies (CTU Detailed Procedure). So a 50–100 MW data centre qualifies. **Caveat:** the GNA Regulations do **not** provide dual connectivity (part ISTS + part intra-state) to bulk consumers. (b) **Intra-state route** — via MPPTCL (STU) at 220 kV (typical for ~50–100 MW) or 132/400 kV, with MPERC governing wheeling/open access.
- **Voltage level:** ~50–100 MW loads typically connect at 220 kV (132 kV at the low end); ISTS bulk-consumer nodes are 765/400 kV with 400/220 kV ICTs.
- **Green Energy Open Access (GEOA Rules 2022):** open-access threshold cut from 1 MW to 100 kW; caps cross-subsidy surcharge, removes the additional surcharge for green power; 15-day deemed approval. Lets a data centre source RTC/green power via open access.
- **MP incentives:** MP Data Centre Policy — Anchor Data Centre capital support up to ₹125 cr (first five DCs investing >₹500 cr); power tariff reimbursement (~₹8–12 cr/MW over 5 yrs, finraja.com); electricity duty exemption; 100% waiver on banking, transmission & wheeling charges; 5% interest subsidy (5 yrs); stamp-duty/EDC exemptions; 50% green-solution reimbursement (max ₹12.5 cr). IT/ITeS & ESDM Policy 2023 — up to 25% capex subsidy (used by the CtrlS Bhopal facility at Badwai IT Park, ₹500 cr).

### 4. Night-Power Analysis (non-solar hours)

Core insight: MP solar is ~5,100 MW but produces nothing at night, so night headroom = thermal + hydro + imports + storage.
- **Thermal fleet:** MP installed ~15,100 MW thermal (MPPGCL state 4,570 MW + private 5,744 + central 4,818). Source: MPERC.
- **BESS tenders (the night-shifting layer):** MPPMCL 625 MW/1,250 MWh (units at Birsinghpur/Pali, Bina, Sendhwa; BOO; VGF up to ₹18 lakh/MWh; bids due 30 July 2026); earlier 750 MW/1,500 MWh RfS; 500 MW pumped-storage procurement.
- **Solar-plus-storage:** Morena 220 MW solar + 2h BESS at ~₹2.76/kWh, COD by Dec 2027 (widely reported; treat tariff as reported, not independently re-verified this pass).
- **Seasonal proxy:** Jan 2026 peak 19,902 MW vs Jul 2026 13,818 MW; night data-centre load is flat, so the binding constraint is winter-night coincidence with the irrigation peak.
- **Indicator design:** `night_headroom_MW ≈ (transformer capacity − night coincident load)` adjusted for firm non-solar supply; flag substations where solar-hour margin ≫ non-solar-hour margin (CTUIL Annex-IV(3) captures exactly this).

### 5. Ingestion Design (Go microservices + Next.js/Vercel + MongoDB)

**Pipeline:**
1. **Fetcher (Go cron service):** scheduled monthly pull of CTUIL PDFs (bulk-consumer list, Annex-C substation margins, solar/non-solar sheet) + quarterly MPERC/CEA. Store raw PDF in object storage (S3/GCS) with fetch timestamp + source URL. Respect robots.txt (MPPTCL STU list is blocked → flag for manual upload).
2. **Extractor (Claude / Anthropic API):** send each PDF page (text or image) to Claude with a strict JSON schema and an instruction to emit per-field `source: {document_url, page, as_of_date}`. Claude handles CTUIL's messy multi-row headers well. Validate output against JSON Schema; reject rows missing MW/MVA.
3. **Geocoder:** substation names → lat/long via (a) coordinates already in CTUIL PDFs, (b) a curated MP substation gazetteer seeded from OSM Overpass (`node["power"="substation"]["voltage"~"220000|400000|765000"](area:MP)`), (c) manual district-centroid fallback with a `geocode_confidence` flag.
4. **Loader:** upsert into MongoDB.
5. **Validator:** cross-check against MPERC aggregates (e.g., 14×400 kV substations, ~85,284 MVA); alert on drift.

**Real, verifiable libraries/tools (with links):**
- Anthropic SDKs: github.com/anthropics/anthropic-sdk-go, github.com/anthropics/anthropic-sdk-typescript
- PDF text: github.com/ledongthuc/pdf (Go) or `pdftotext` (poppler-utils)
- OSM extract: Overpass API (overpass-turbo.eu); earth-osm (github.com/pypsa-meets-earth/earth-osm)
- MongoDB Go driver: go.mongodb.org/mongo-driver
- MP boundary GeoJSON: github.com/datameet/maps or gadm.org (GADM India admin-1)
- Leaflet: leafletjs.com
*(Pin versions and review; don't run unverified install commands blindly.)*

**MongoDB schema (collections):**
```
substations: { _id, name, aliases[], owner, voltage_kv[], lat, lng, district,
  geocode_confidence, transformation_mva, data_source_ref }
margins: { _id, substation_id, as_of_date, solar_hour_margin_mw, non_solar_hour_margin_mw,
  bulk_consumer_margin_mw, constraint_notes, source: {document_url, page}, ingested_at }
sources: { _id, document_url, title, publisher, fetched_at, as_of_date, sha256 }
planned_upgrades: { _id, name, scheme, added_mva, scod, source }
```
**Refresh cadence:** CTUIL monthly; MPERC/CEA quarterly; OSM on demand. Keep every historical `margins` doc (append-only) for trend charts. **Validation:** schema enforcement + aggregate reconciliation + a human-review queue for `geocode_confidence:"low"` rows.

### 6. Viewer Functionality (demo feature set)

**Buildable in 1 hour (mock data, single file):**
- Dark, restrained MP map (Leaflet + MP GeoJSON, or plain SVG) with substation dots.
- Day/night headroom coloring: two-toggle (Solar hour / Non-solar hour) recoloring dots green→amber→red by MW threshold.
- Filters: voltage (132/220/400/765), owner (MPPTCL/PGCIL/IndiGrid), headroom slider, district.
- Scenario query panel: preset/free-text "100 MW near Bhopal, 24×7" → ranked candidate substations with day+night headroom, constraints, planned upgrades, citations.
- Citations drawer: every value shows source doc + page + as-of date.
- Demand-context chart: MP seasonal load curve (Jan 19,902 MW vs Jul 13,818 MW).
- "Data we need from government" panel: MPPTCL machine-readable margins; load-side ISTS bulk-consumer nodes in MP; night coincident-load per substation; lat/long.

**Mock, not build, in 1 hour:** live ingestion, real geocoding, auth, real-time SLDC feed, accurate per-substation night load.

### 7. Sample Artifact

**Sample JSON** (drop into the single-file UI; `verified` vs `estimated`/`mock` flagged per record):

```json
{
  "meta": {
    "title": "MP Grid Headroom — AI Data Centre Siting (DEMO)",
    "as_of": "2026-09-20",
    "disclaimer": "Margins marked estimated/mock are illustrative. Verified capacity from MPERC/tndindia; CTUIL bulk-consumer list has NO MP nodes as of 2025-08-31.",
    "demand_context": {"winter_peak_mw": 19902, "summer_trough_mw": 13818, "source": "CEA via CEIC"}
  },
  "substations": [
    {"id":"bhopal_bdtcl","name":"Bhopal (BDTCL) 765/400kV","owner":"IndiGrid","voltage_kv":[765,400],"lat":23.4027,"lng":77.4467,"district":"Bhopal","transformation_mva":3000,"transformation_source":"indigrid.co.in (verified)","day_headroom_mw":180,"night_headroom_mw":90,"headroom_flag":"estimated/mock","constraints":"Transit corridor loading","planned_upgrade":null},
    {"id":"suky_sewaniya","name":"Suky Sewaniya 400kV (Bhopal)","owner":"MPPTCL","voltage_kv":[400,220],"lat":23.33,"lng":77.55,"district":"Bhopal","transformation_mva":1630,"transformation_source":"tndindia (verified)","day_headroom_mw":150,"night_headroom_mw":70,"headroom_flag":"estimated/mock","constraints":null,"planned_upgrade":null},
    {"id":"bina_400","name":"Bina 400kV","owner":"MPPTCL","voltage_kv":[400,220],"lat":24.18,"lng":78.20,"district":"Sagar","transformation_mva":1260,"transformation_source":"tndindia (verified)","day_headroom_mw":140,"night_headroom_mw":110,"headroom_flag":"estimated/mock","constraints":"BESS node (MPPMCL 250MW/500MWh tender)","planned_upgrade":"BESS 250MW/500MWh"},
    {"id":"manglia_indore","name":"Manglia 220kV (Indore)","owner":"MPPTCL","voltage_kv":[220],"lat":22.79,"lng":75.75,"district":"Indore","transformation_mva":null,"transformation_source":"tndindia (+200MVA Apr2026)","day_headroom_mw":90,"night_headroom_mw":40,"headroom_flag":"estimated/mock","constraints":"Near RackBank 80MW DC load","planned_upgrade":null},
    {"id":"mandsaur_400","name":"Mandsaur 400kV","owner":"MPPTCL","voltage_kv":[400,220],"lat":24.07,"lng":75.07,"district":"Mandsaur","transformation_mva":1130,"transformation_source":"tndindia (verified)","day_headroom_mw":300,"night_headroom_mw":60,"headroom_flag":"estimated/mock","constraints":"Solar-rich; day margin >> night","planned_upgrade":"Kurawar scheme ~Jun2027"},
    {"id":"sendhwa_bess","name":"Sendhwa 220kV","owner":"MPPTCL","voltage_kv":[220],"lat":21.68,"lng":75.09,"district":"Barwani","transformation_mva":null,"transformation_source":"MPPMCL BESS tender node","day_headroom_mw":80,"night_headroom_mw":95,"headroom_flag":"estimated/mock","constraints":"BESS node improves night headroom","planned_upgrade":"BESS (MPPMCL 1.25GWh tender)"},
    {"id":"birsinghpur_pali","name":"Birsinghpur (Pali) 220kV","owner":"MPPTCL","voltage_kv":[400,220],"lat":23.36,"lng":81.09,"district":"Umaria","transformation_mva":null,"transformation_source":"co-located Sanjay Gandhi TPS 1340MW (MPPGCL)","day_headroom_mw":120,"night_headroom_mw":140,"headroom_flag":"estimated/mock","constraints":"Thermal + planned BESS = strong night","planned_upgrade":"BESS 125MW/250MWh"}
  ]
}
```
*(Extend to 15–25 records: add Itarsi, Seoni, Satna, Jabalpur, Gwalior, Ujjain, Dewas, Pithampur, Neemuch/Badi, Pachora/Agar, Shajapur, Katni. For non-verified nodes use district centroid and set `geocode_confidence:"low"`.)*

**UI spec / component layout:**
- Left rail (320px): filters + scenario query. Center: map. Right drawer (380px): selected-substation detail + citations. Bottom strip: seasonal demand chart. Top bar: Solar/Non-solar toggle + legend.
- Palette: near-black (#0b0e11) canvas, muted grid, headroom green #34d399 / amber #fbbf24 / red #f87171; single accent; generous whitespace; SF/Inter font.
- Map: Leaflet with CARTO dark-matter tiles, or an inline MP SVG (from datameet GeoJSON) if offline. Substations = circleMarkers sized by voltage, colored by the active headroom metric.

**One-hour build plan:**
- 0:00–0:10 — Scaffold single HTML file: React (CDN) + Leaflet (CDN) + inline JSON above.
- 0:10–0:25 — Render MP basemap + plot substations, size by voltage.
- 0:25–0:40 — Solar/Non-solar toggle recolors markers; headroom threshold slider; voltage/owner/district filters.
- 0:40–0:52 — Scenario panel: preset buttons ("100 MW @ Bhopal 24×7") filter+rank by `min(day,night) ≥ requested MW` near district; results list with headroom + constraints.
- 0:52–1:00 — Citations drawer + "data we need from government" panel + static seasonal demand mini-chart. Polish the dark theme.

## Recommendations

1. **Frame the demo around the honest gap, not a fake live feed.** Lead with: "CTUIL publishes bulk-consumer ISTS substations monthly — but MP has none yet; here's where a 50–100 MW AI DC would actually connect and whether it has night power." A truthful map is a stronger seminar narrative than a polished-but-fake one.
2. **Ship the single-file React/Leaflet artifact with the sample JSON.** Hardcode 15–25 substations; label every headroom number `verified` or `estimated/mock`. Mock the ingestion.
3. **Post-demo, wire real ingestion in this order:** (1) CTUIL bulk-consumer + Annex-C PDFs (monthly, Claude-extracted, cited); (2) a manual-upload path for the robots-blocked MPPTCL STU margin list; (3) OSM Overpass geocoding gazetteer; (4) MPERC/CEA aggregates for validation.
4. **Benchmarks that change the recommendation:** if CTUIL adds an MP bulk-consumer node (watch the monthly PDF), pivot the tool to ISTS-first. If MPPTCL publishes a machine-readable margin API/CSV, drop the manual-upload hack. If the BESS tenders (Bina/Sendhwa/Birsinghpur) reach COD, raise those nodes' `night_headroom`.
5. **For the actual siting question:** near-term best bets are Indore (RackBank precedent; Manglia/Pithampur 220 kV) and Bhopal (BDTCL/Suky Sewaniya + Badwai IT Park; CtrlS precedent). Night power leans on thermal + the new BESS nodes, so co-locating near Bina/Sendhwa/Birsinghpur BESS improves the 24×7 story.

## Caveats
- **MPPTCL per-substation spare-margin values could not be programmatically retrieved** (robots.txt + Scribd bot-wall). All specific spare-margin MW in the sample dataset are estimated/mock; transformation-capacity MVA figures are verified from MPERC/trade press. Obtain the STU list manually (browser download bypasses robots.txt).
- **CTUIL margin data is generation-injection framed.** Solar/non-solar margins describe RE evacuation headroom — a useful proxy but not identical to load-drawal headroom for a data centre.
- **No published per-substation "night coincident load" exists;** night headroom must be modeled, not read off a source.
- Several sources are 2026-dated documents (CTUIL Annex-C 13-08-2026; MPPMCL July 2026 tenders); treat forward-looking SCODs (Kurawar ~2027, Morena Dec 2027, Gadarwara Part B March 2031) as *scheduled*, not delivered.
- The Morena ₹2.76/kWh tariff and the exact ~15,100 MW thermal split are reported figures corroborated across trade press/MPERC but were not independently re-verified against the primary tariff order this pass.
- Rentech/commercial substation coordinate scrapes are lower reliability; verify before production use.