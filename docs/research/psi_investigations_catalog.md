<!-- Written with AI assistance (Claude Code) -->
# NASA PSI combustion investigations: ranked catalog for Flame in Freefall

Built 2026-11-14 for the investigations table the challenge asks for ("summarizes, ranks, and interprets combustion science investigations"; compare objectives, fuels, test conditions, variables, sensors; identify relevance to spacecraft, stations, lunar and Martian bases, and pressurized rovers — [challenge page](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/)). Machine-readable copy: `web_data/investigations.json` (identical to the fenced JSON at the end of this file). Raw PSI downloads (metadata JSON, file inventories, experimental tables, ReadMes, reports; 107 MB, nothing over 12 MB) are in `data/raw/psi_catalog/PSI-<n>/`.

## Which combustion investigations does PSI hold, and how do they compare?

### Takeaway
PSI lists **24 investigations with Research Area = Combustion Science** (133 investigations in all): 18 ISS or free-flyer flight investigations and 6 ground/data-use grants. No partial-gravity data exists in PSI, and SoFIE, Saffire IV-VI, FLARE, FM2 and LUCI are **not** in PSI. Data volume ranges from a metadata zip only (PSI-60, PSI-62) to ~2.2 TB (ACME Flame Design).

### Cited Findings
- **Inventory method.** `https://psi.nasa.gov/geode-py/ws/repo/search?q=combustion&size=200` returned 133 hits, 24 with Research Area "Combustion Science"; a `q=*` search confirmed 133 total investigations (Combustion 24, Materials 35, Complex Fluids 34, Fluid Physics 27, Biophysics 7, Fundamental Physics 6). Extra searches for flame, fire, saffire, sofie, droplet, smoke, flammability, soot and ignition found no further combustion investigations; the only other fire-adjacent record is PSI-179 ASE (Aerosol Sampling Experiment, Research Area "Complex Fluids - Soft Matter", sub-area Multiphase Flow), which is not a combustion study and is excluded. The `/geode-py/ws/repo/investigations` list endpoint suggested in the task returned **HTTP 404**; per-accession `/repo/investigations/PSI-<n>` returned 200 for all 24. — [PSI search API](https://psi.nasa.gov/geode-py/ws/repo/search?q=combustion&size=200)
- **File inventories** come from `https://psi.nasa.gov/geode-py/ws/api/investigations/files/search/<n>?page=1`, which returns every file with category and size. It returned **HTTP 500** for PSI-21 (CLD Flame) and PSI-106 (SLICE), twice each; their sizes come from the metadata `totalFileSize` and their file counts are left blank. — [PSI file search API](https://psi.nasa.gov/geode-py/ws/api/investigations/files/search/25?page=1)
- **Small files downloaded** (all HTTP 200 via `/geode-py/ws/studies/PSI-<n>/download?file=`): every experimental-table CSV (27), every metadata ISA zip, ReadMe/DoD documents, BASS and BASS-II test matrices, and final reports for ACME (Flame Design, BRE, E-FIELD, s-Flame, CFI-G), CFI, SPICE, SAME, SAME-R, DAFT, FLEX test plan, FLEX-2 SRD and PSI-115. — [PSI download route](https://psi.nasa.gov/geode-py/ws/studies/PSI-25/download?file=PSI-25_Experimental%20table_BASS-II.csv)
- **Hardware families**, matching the challenge text: ACME in the Combustion Integrated Rack (Flame Design, BRE, CLD Flame, E-FIELD, s-Flame, CFI-G); MDCA droplet apparatus in the CIR (FLEX, FLEX-2, CFI); SPICE flow duct in the Microgravity Science Glovebox (SPICE, SLICE, BASS, BASS-II); SAME smoke hardware in the MSG (SAME, SAME-R; DAFT tested its P-Trak); Saffire modules in uncrewed Cygnus vehicles (Saffire-I to -III). — PSI metadata `experimentHardware` fields; [challenge page](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/)
- **Atmospheres that match the planned Moon base** (challenge: "30% or greater" O2 at "10.2 psi or less"): only ACME BRE ran NASA exploration atmospheres (14.7 psia/21%, 10.2 psia/26.5%, 8.2 psia/34%); FLEX reached O2 0.34 and ~0.7 atm; FLEX-2 0.30 O2 and 0.5 atm; Flame Design up to 0.40 ambient O2; s-Flame ~30% O2; CFI-G up to 0.85 O2 (inverse burner supply). The solid-material tests (BASS, BASS-II, Saffire) never exceeded ~22% O2. — PSI-20 metadata objective; PSI experimental tables (computed ranges)

Summary table (relevance scores are **analyst judgment**, rubric below; C = spacecraft cabin, I = ISS, L = lunar base, M = Mars base, R = pressurized rover):

| Rank | Accession | Acronym | Type / platform / hardware | Fuel or sample | O2 / pressure | Flow | Diagnostics (main) | PSI data | PI | C | I | L | M | R |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | PSI-98 | SAFFIRE-I | Free-flyer spacecraft flight; Saffire module (~53 x 90 x 133 cm): flow duct with sample card + avionics bay | SIBAL fabric (75% cotton / 25% fiberglass), 40.6 cm wide x 94 cm long x 0.37 mm thick (concurrent); ~10 cm opposed-fl... | 21.5-21.7 %; Cygnus cabin ambient (not tabulated; UNVERIFIED) | 20 cm/s forced air, concurrent and opposed | 2 video cameras; flow inlet/outlet thermocouples; thermocouples embedded in sample | 12.25 GB, 76 files | David Urban (NASA GRC) | 5 | 5 | 4 | 4 | 5 |
| 2 | PSI-100 | SAFFIRE-III | Free-flyer spacecraft flight; Saffire module, same design as Saffire-I | SIBAL cotton-fiberglass fabric 40.6 cm x 94 cm x 0.33-0.37 mm (concurrent) and ~10 cm opposed sample | 21.0-21.2 %; Cygnus cabin ambient (UNVERIFIED) | 25 cm/s per NASA ASGSR 2017 deck; PSI table says 30 cm/s (CONFLICT, see notes) | 2 video cameras; thermocouples; 4 radiometers | 35.21 GB, 87 files | David Urban (NASA GRC) | 5 | 5 | 4 | 4 | 5 |
| 3 | PSI-101 | SAME-R | ISS flight; SAME hardware with new M-pass instrument (replaced one Commercial Diagnostic Enclosure) | Overheated Kapton, silicone, lampwick, Teflon, Pyrell intumescent foam (109 table rows) | ISS cabin air (~21%, not tabulated); ISS cabin ambient | Inlet velocity 0, 1, 2, 8 and 8.1 cm/s (no-flow cases added) | prototype two-moment smoke detector; P-Trak (number); ionization chamber (diameter) | 6.31 GB, 344 files | David Urban (NASA GRC) | 5 | 5 | 4 | 4 | 5 |
| 4 | PSI-20 | ACME BRE | ISS flight; ACME chamber insert in CIR; flat porous burners 25 mm and 50 mm dia with 2 heat-flux gauges each | Gaseous emulator: C2H4 (50% and 100%, N2 balance) and CH4 fed through flat porous burners to emulate condensed fuels... | 21, 25, 26.5, 34, 40 % (O2/N2); ~0.56 to 1 bar; NASA habitat atmospheres 14.7 psia/21%, 10.2 psia/26.5%, 8.... | Quiescent (no forced ambient flow); fuel mass flux set by burner | heat-flux gauges on burner; radiometers; thin-filament pyrometry (TFP) | 2035.57 GB, 2361 files | James Quintiere (University of Maryland) | 4 | 4 | 5 | 5 | 5 |
| 5 | PSI-25 | BASS-II | ISS flight; BASS fan-driven flow duct (built for SPICE) inside the MSG; MSG working volume vitiated with N2 | 129 tests (PSI table): PMMA rods 1/4, 3/8, 1/2 in (0.64-1.27 cm) dia (54 tests); thin and thick PMMA sheets incl. 100... | 13.6-22.2 % by volume calibrated initial O2 (N2-vitiated MSG volume); ISS cabin ambient (~1 atm; not tabula... | Forced fan flow 0 to ~53 cm/s; flames most sensitive at 0-5 cm/s and sustaine... | video camera with 5 Hz on-screen data overlay (fan, air speed, radiometer); Nikon digit... | 274.63 GB, 695 files | No single PI in PSI record | 5 | 5 | 4 | 4 | 4 |
| 6 | PSI-26 | BASS | ISS flight; SPICE-derived fan-driven flow duct in the MSG with N2 suppression nozzle (0-500 cc/min mass flo... | 122 rows (PSI table): PMMA spheres 1 and 2 cm, PMMA flat samples/slabs 1-2 cm wide, SIBAL cotton-fiberglass fabric 2... | ~16.1-22.1 % (ISS environment O2 fraction 0.1605-0.221 logged in As-Run matrix; some tests N2-vitiated); IS... | Forced flow 5-50 cm/s design (SRD); flight report: up to 40 cm/s, flames most... | video camera; digital still camera; radiometer | 163.55 GB, 210 files | Paul Ferkul (NASA GRC) | 5 | 5 | 4 | 4 | 4 |
| 7 | PSI-99 | SAFFIRE-II | Free-flyer spacecraft flight; Saffire module with nine-sample card | Nine 5 cm x 29 cm samples: silicone (0.27, 0.61, 1.03 mm), SIBAL cotton-fiberglass 0.37 mm (x2), PMMA + Nomex, PMMA (... | ~21.9-22.1 %; Cygnus cabin ambient (not tabulated; UNVERIFIED) | 20 cm/s (one SIBAL test at 25 cm/s); concurrent and opposed | 2 video cameras; thermocouples (flow, sample, plume); radiometers | 16.92 GB, 217 files | David Urban (NASA GRC) | 5 | 5 | 4 | 4 | 4 |
| 8 | PSI-102 | SAME | ISS flight; SAME smoke generator (heated samples), aging chamber, thermal precipitator, Commercial Diagnost... | Overheated (pyrolyzed, not flaming) Teflon, Kapton, silicone rubber, cotton lampwick, dibutyl phthalate (8 samples) | ISS cabin air (~21%, not tabulated); ISS cabin ambient | Air flow over sample 5 and 10 cm/s; aging 1-20 min | TSI P-Trak condensation particle counter (0th moment); ionization chamber from resident... | 0.66 GB, 101 files | David Urban (NASA GRC) | 5 | 5 | 4 | 4 | 4 |
| 9 | PSI-69 | FLEX | ISS flight; Multi-user Droplet Combustion Apparatus (MDCA) in CIR; free-floated or fiber-tethered droplets | Methanol (157 tests) and n-heptane (117 tests) droplets, initial diameter 1.1-4.67 mm | O2 mole fraction 0.12-0.34; diluents N2, CO2 (0-0.70), He (0-0.45); ~526-2320 mmHg in PSI table (~0.7-3.0 atm) | Quiescent chamber (droplet drift only) | backlit droplet camera (droplet diameter); OH* UV camera (flame size); color video | 923.83 GB, 6555 files | Forman Williams (UC San Diego) | 4 | 5 | 4 | 4 | 4 |
| 10 | PSI-10 | ACME Flame Design | ISS flight; ACME chamber insert; porous spherical burners (6.35-12.7 mm dia family); thermocouple rakes | Gaseous ethylene (and propane, one day) with N2 dilution; normal (fuel out) and inverse (oxidizer out) spherical diff... | Normal flames ambient XO2 0.198-0.40; inverse flames burner-supply XO2 0.21-0.85; ~0.99-1.31 atm (normal),... | Quiescent ambient; burner total flow 0.6-12.2 mg/s | ACME HD color camera; thermocouple rakes; thin-filament pyrometry | 2180.44 GB, 3807 files | Richard Axelbaum (Washington University in... | 3 | 3 | 3 | 3 | 3 |
| 11 | PSI-47 | DAFT / DAFT-2 | ISS flight; Modified TSI P-Trak (alcohol wick) and TSI DustTrak, DAFT impactor | No combustion: Arizona Road Dust (ARD Fine) dispersed with ISS GN2; ambient ISS air sampled | ISS cabin air; ISS cabin ambient | Instrument sampling flow only | P-Trak particle counter (pt/cc); DustTrak mass concentration (mg/m3); impactor removing... | 0.04 GB, 33 files | David Urban (NASA GRC) | 3 | 3 | 3 | 3 | 3 |
| 12 | PSI-115 | (ground grant) | Ground (PSI data-use grant, simulation); n/a | Dibutyl phthalate surrogate vapor from a heated source | air; not stated | Inlet velocity 0.08 and 0.10 m/s | simulation outputs (.dat) for figures | 0.26 GB, 47 files | Sean Garrick (University of Illinois per P... | 3 | 3 | 3 | 3 | 3 |
| 13 | PSI-22 | ACME E-FIELD Flames | ISS flight; ACME insert; coflow burner and gas-jet burner; copper mesh electrode 37 mm above burner; high-v... | Gaseous CH4 and C2H4, pure or N2-diluted (25-100% fuel) | air (~21%); ~100 kPa | Coflow air (e.g., 3.1 cm/s) or none; fuel 15-19 cm/s examples | ion current and applied voltage; flame broadband luminosity; CH* luminosity | 950.21 GB, 2590 files | Derek Dunn-Rankin (UC Irvine) | 2 | 2 | 3 | 3 | 3 |
| 14 | PSI-62 | (ground grant) | Ground (PSI data-use grant, modeling); n/a | Modeled solid fuels (concurrent flame spread, compared to BASS data) | as in BASS comparisons; as in BASS comparisons | Concurrent low-speed flow (modeled) | two-color pyrometry / tomography of BASS images (per title) | 0 GB, 1 files | Paul DesJardin (University at Buffalo) | 3 | 3 | 2 | 2 | 2 |
| 15 | PSI-107 | SPICE | ISS flight; SPICE fan-driven flow duct (later reused by BASS/BASS-II), nozzles 0.41, 0.76, 1.6 mm | Gaseous ethylene, propane, propylene, 50% and 75% propylene/N2, methane | MSG air, 21 +/- 1%; ~101 kPa | Coflow air 5.4-65 cm/s at smoke points (table range up to ~85 cm/s) | Nikon D100 12-bit color still camera (3008 x 2000); analog color video (downlinked); ma... | 6.95 GB, 188 files | David Urban (NASA GRC) | 3 | 3 | 2 | 2 | 2 |
| 16 | PSI-23 | ACME s-Flame | ISS flight; ACME insert; porous spherical burner | Gaseous H2, CH4, H2/CH4 mixtures, C2H4, diluted with N2 or He | ~21% and ~30% O2 with N2 or He; ~1 atm (rises and O2 drops with vitiation, per PSI table note) | Quiescent ambient; ramped fuel flow | two intensified cameras (opposite views); PMTs for OH* (310 nm) and CH*; radiometers | 782.17 GB, 4165 files | Chung K. Law (Princeton) | 2 | 2 | 2 | 2 | 2 |
| 17 | PSI-39 | CFI | ISS flight; Multi-user Droplet Combustion Apparatus (MDCA); optional 40-micron SiC tether fiber | n-dodecane and n-dodecane/iso-dodecane (60/40, 75/25) droplets; farnesane also studied | 0.17-0.21 O2 mole fraction; He 0-0.59, N2 balance; 0.5-5 atm | Quiescent | backlit black-and-white camera (5 x 5 cm FOV, droplet size); UV OH* camera (flame size)... | 718.89 GB, 2812 files | Forman Williams (UC San Diego) | 2 | 2 | 2 | 2 | 2 |
| 18 | PSI-60 | (ground grant) | Ground (PSI data-use grant); n/a | SPICE gaseous jet flames (ethylene etc.) | air; ~1 atm | as SPICE coflow | analysis of >1600 raw SPICE DSLR images (pyrometry, soot volume fraction) | 0 GB, 1 files | Mitchell Smooke (Yale) | 2 | 2 | 2 | 2 | 2 |
| 19 | PSI-68 | FLEX-2 | ISS flight; Multi-user Droplet Combustion Apparatus (MDCA) | Droplets 1.5-5 mm: isooctane, n-octane, heptane, decane, ethanol, propanol/glycerol, heptane/isooctane, decane/hexanol | 0.17, 0.21, 0.25, 0.30 O2 mole fraction in N2 or He; 0.5-3.0 atm | 0.1-5 cm/s (convective-effects tests) | CIR LLL-UV camera (OH*); MDCA color camera; CIR HiBMs backlit cameras | 1224.75 GB, 10156 files | Forman Williams (UC San Diego) | 2 | 2 | 2 | 2 | 2 |
| 20 | PSI-159 | ACME CFI-G | ISS flight; ACME insert; porous spherical burner; long and short thermocouple rakes | Gaseous ethane, propane, n-butane (n-pentane replaced by ethane), pure or N2-diluted, normal and inverse spherical fl... | Normal: ambient XO2 0.18-0.40; inverse: burner XO2 0.12-0.85; ~0.5-3.3 bar | Quiescent ambient; hydrocarbon flow 0.25-2.5 mg/s | intensified video camera; radiometers; thermocouples (incl. type B) | 2085.59 GB, 3756 files | Peter Sunderland (University of Maryland) | 2 | 2 | 2 | 2 | 2 |
| 21 | PSI-21 | ACME CLD Flame | ISS flight; ACME insert; coflow burner | Gaseous CH4 and C2H4, N2-diluted (fuel 15-100%) | air coflow (~21%; not tabulated); not tabulated | Coflow air; fuel and N2 via mass-flow controllers (0.02-0.2 full-scale) | color digital camera (soot and thin-filament pyrometry); CH* chemiluminescence; ACME ca... | 2005.54 GB, file list unavailable | Marshall Long (Yale) | 2 | 2 | 1 | 1 | 1 |
| 22 | PSI-106 | SLICE | ISS flight; SPICE flow duct and coflow burners (per challenge statement: MSG + SPICE duct) | Gaseous CH4 (40-100%, N2 balance), C2H4 (20% and 100%), C2H6 | MSG air (~21%); ISS ambient | Fuel inlet velocity 23-90 cm/s (CH4 flames, NTRS 20150002322); coflow air | digital color camera (flame shape, soot temperature); pyrometry calibration tests | 72.91 GB, file list unavailable | Marshall Long (Yale) | 2 | 2 | 1 | 1 | 1 |
| 23 | PSI-117 | (ground grant) | Ground (PSI data-use grant, CFD); n/a | n-alkane droplets (FLEX data) | as FLEX; as FLEX | imposed thermal/convective perturbations (modeled) | CFD outputs (CSV), dissertation | 0.07 GB, 16 files | Tanvir Farouk (University of South Carolina) | 2 | 2 | 1 | 1 | 1 |
| 24 | PSI-142 | (ground grant) | Ground (lab + simulation); PI laboratory hardware | n-heptane, n-decane, n-dodecane, DME with ozone sensitization | varied; up to elevated pressure | counterflow (stretch-controlled) | CH2O PLIF; thermometry; chemiluminescence | 0 GB, 3 files | Yiguang Ju (Princeton) | 2 | 2 | 1 | 1 | 1 |

- **Conflicts and data-quality notes found while building the table:**
  - Saffire-III flow: 25 cm/s in NASA's ASGSR 2017 deck vs 30 cm/s in the PSI-100 experimental table; the 2016 status deck said "close to 30 cm/s". Burn time 300 s (deck table) vs 320 s (deck slide). — [NTRS 20180005168](https://ntrs.nasa.gov/citations/20180005168); [NTRS 20170002628](https://ntrs.nasa.gov/citations/20170002628); PSI-100 table
  - SAFFIRE-I's PSI record gives investigation dates 2001-2008, identical to SAME's; the experiment flew in 2016. Treat as a PSI metadata error. — PSI-98 metadata; [NTRS 20180005168](https://ntrs.nasa.gov/citations/20180005168)
  - SAME vs SAME-R on particle size: the SAME-R report says no-flow smoke particles were 2-3 times larger than at 8 cm/s, and Mulholland et al. report a 1.9x increase on average; Meyer et al. 2018 summarize that ISS smoke particles "are not significantly different" from 1-g equivalents. These are different comparisons (flow vs gravity), not necessarily a contradiction. — PSI-101 final report; [Mulholland 2015](https://doi.org/10.1080/02786826.2015.1025125); [Meyer 2018](https://doi.org/10.1016/j.firesaf.2018.04.004)
  - BASS-II table "Calibrated final O2" contains a value of 40.4, which is likely a data-entry error. — PSI-25 table
  - CFI's PSI investigation dates (2020-2021) are later than its 2017 test dates (probably the grant period). — PSI-39 metadata and table

### Inferences
- The challenge's three named themes map onto PSI cleanly: **prevention/flammability** (BASS, BASS-II, Saffire I-III, BRE), **detection** (SAME, SAME-R, DAFT, PSI-115), **suppression** (FLEX, plus the BASS N2 jet). The ACME, CFI, FLEX-2, SPICE and SLICE sets are fundamental combustion science and should rank lower for crew fire safety, which matches the challenge's note that other PSI investigations are "still relevant to fire safety, just not as strongly or directly".
- ACME BRE is the bridge to the Moon/rover story: it is the only PSI dataset run at the planned exploration atmospheres, and it found steady still-air burning at >=26.5% O2. Pairing it with BASS-II (solid materials, <=22% O2) is the strongest evidence-backed "Moon gap" argument available from PSI alone.
- For a dashboard, the most usable tabular data are the experimental-table CSVs (all 24 sets have one except PSI-60, PSI-62, PSI-115, PSI-117), because the raw sets are dominated by multi-GB ZIP/TS/MP4 image and video archives.

### Gaps
- PSI-21 (CLD Flame) and PSI-106 (SLICE) file lists could not be retrieved (HTTP 500), so their file counts and types are blank.
- Ambient pressure is not tabulated for BASS, BASS-II, Saffire, SAME or SLICE; "ISS/Cygnus cabin ambient" is stated, not measured here.
- FLEX-2 operating years and the s-Flame key ISS paper were not found.
- Mars-base atmosphere is not specified in the challenge; scores assume it resembles the lunar exploration atmosphere.

## What is each investigation's key finding and key paper?

### Takeaway
Every investigation has a sourced key finding. Most carry a specific number from a NASA report, NTRS record or verified paper abstract; five (PSI-21 CLD Flame, PSI-47 DAFT, PSI-62, PSI-117, PSI-142) have no verified headline number, and the JSON says so. Forty candidate DOIs were checked in Crossref (all resolved, titles matched). Two investigations (ACME s-Flame, PSI-115) have no DOI-verified results paper.

### Cited Findings
Key findings with their sources (full text in the JSON `key_finding` and `key_finding_source` fields):

- **PSI-98 SAFFIRE-I** (Launched OA-6 2016-03-22; burned 2016-06-14 in Cygnus after unberthing (NTRS 20180005168)): Largest fire burned in space at the time: concurrent spread over the 40.6 x 94 cm fabric averaged 1.8 mm/s with an estimated flame power of 1200 +/- 300 W; burn lasted 420 s and consumed ~84 cm. Opposed-flow spread was 1.3 mm/s. Source: Urban et al., ASGSR 2017 presentation, NTRS 20180005168 (Table 1 and Saffire-1 slide). Key paper(s): [10.1016/j.combustflame.2018.10.012](https://doi.org/10.1016/j.combustflame.2018.10.012); [10.1016/j.proci.2018.05.168](https://doi.org/10.1016/j.proci.2018.05.168)
- **PSI-100 SAFFIRE-III** (Launched OA-7 2017-03-27 (NTRS deck) / burned 2017-06-04 in Cygnus): Concurrent spread over the large fabric was 2.3 mm/s (burn ~300-320 s), faster than Saffire-I's 1.8 mm/s at 20 cm/s; NASA notes flame speed scaled with air-flow velocity. Opposed spread was 0.98 mm/s. Source: NTRS 20180005168 Table 1 and Saffire-I/III results slide. Key paper(s): [10.1016/j.combustflame.2018.10.012](https://doi.org/10.1016/j.combustflame.2018.10.012)
- **PSI-101 SAME-R** (ISS 2010-07-16 to 2010-09-09, 66 test points (final report)): With no air flow, smoke particles were 2-3 times larger than at the nominal 8 cm/s flow (final report); averaged over materials, the diameter of average mass rose by a factor of 1.9 at no flow (Mulholland et al. 2015). Source: SAME-R Final Report (PSI-101) conclusions; Mulholland et al. 2015 abstract (OpenAlex). Key paper(s): [10.1080/02786826.2015.1025125](https://doi.org/10.1080/02786826.2015.1025125); [10.1016/j.firesaf.2018.04.004](https://doi.org/10.1016/j.firesaf.2018.04.004)
- **PSI-20 ACME BRE** (ISS test days Feb 2019 - Jan 2021 (18 rows in PSI table)): In still microgravity air, steady flames over an emulated 25 mm flat material occurred at nominal O2 of ~26% and above (including the NASA 10.2 psia/26.5% and 8.2 psia/34% atmospheres), whereas 21% O2 flames self-extinguished; an emulated material like PMMA (hc~24 kJ/g, L~3 kJ/g) burned steadily at 26.5%/10.2 psia. Radiative loss fraction reached ~60% vs ~30% in 1 g. 59 ignited tests. Source: ACME/BRE Final Report 2022 (PSI-20) 'Surprises' and results sections; Dehghani et al. 2021 abstract (Semantic Scholar). Key paper(s): [10.1016/j.combustflame.2021.01.035](https://doi.org/10.1016/j.combustflame.2021.01.035); [10.1016/j.proci.2022.08.107](https://doi.org/10.1016/j.proci.2022.08.107)
- **PSI-25 BASS-II** (ISS tests 2014-02-19 to 2014-08-04 (dates in PSI experimental table)): Over PMMA cylinders, microgravity flame spread was sustained down to 17% O2 versus 18% in normal gravity, and spread rate first rose then fell as opposed flow increased from 0.4 to 8 cm/s (not seen on Earth). Across BASS-II, most tests released well under 100 W and burned fuel-rich (global equivalence ratio ~1.3). Source: Link et al. 2018 abstract (OpenAlex); NASA/TM-20210011385 BASS-II Summary Report abstract (NTRS). Key paper(s): [10.1038/s41598-017-18398-4](https://doi.org/10.1038/s41598-017-18398-4); [10.1016/j.combustflame.2017.03.001](https://doi.org/10.1016/j.combustflame.2017.03.001)
- **PSI-26 BASS** (ISS tests 2012-03-31 to 2013 (dates in PSI table and As-Run test matrix)): Microgravity flames over thin and thick samples were especially sensitive to air flow in the 0-5 cm/s range; at the lowest speeds (<1 cm/s) all flames became dim blue and very stable. Air flow could be imposed up to 40 cm/s. Source: Ferkul et al., 'Thickness and Fuel Preheating Effects on Material Flammability in Microgravity from the BASS Experiment', NTRS 20140011099 abstract. Key paper(s): [10.1016/j.firesaf.2015.11.011](https://doi.org/10.1016/j.firesaf.2015.11.011); no DOI (UNVERIFIED)
- **PSI-99 SAFFIRE-II** (Launched OA-5 2016-10-17; burned 2016-11-21 in Cygnus (NTRS 20180005168)): Silicone samples ignited but showed insignificant burning in microgravity at ~22.1% O2 and 20 cm/s, while the 0.27 mm silicone burned completely (accelerating) in the 1-g test; cotton-fiberglass spread at 2.1 mm/s (20 cm/s) and 2.6 mm/s (25 cm/s); average flame power ~200 +/- 50 W. Source: NTRS 20180005168 Table 1 and slides; PSI-99 experimental table. Key paper(s): [10.1016/j.combustflame.2018.10.012](https://doi.org/10.1016/j.combustflame.2018.10.012); [10.1007/s10694-019-00863-3](https://doi.org/10.1007/s10694-019-00863-3)
- **PSI-102 SAME** (ISS Increment 15, 2007-09-09 to 2007-10-05 (SAME-R final report)): All materials produced large numbers of sub-micron (<1 micrometer) smoke particles that ionization detectors catch better; later analysis found ISS smoke particles varied in morphology and size but were not significantly different from 1-g equivalents. Source: SAME Final Science Report (PSI-102) conclusions; Meyer et al. 2018 abstract/TLDR (Semantic Scholar). Key paper(s): [10.1016/j.firesaf.2018.04.004](https://doi.org/10.1016/j.firesaf.2018.04.004)
- **PSI-69 FLEX** (ISS tests 2009-2011 (274 rows, test dates in PSI table)): Limiting oxygen index for quasi-steady burning was 0.12 (methanol) and 0.15 (heptane) in O2/N2, rising to ~0.14 and ~0.17 when CO2 was added (simulated CO2 suppressant at 1 atm), and ~0.14/0.15 with helium. Large heptane droplets kept burning with an invisible 'cool flame' after the visible flame went out; pre-extinction oscillations ~1 Hz. Source: Dietrich et al. 2014 abstract (OpenAlex). Key paper(s): [10.1007/s12217-014-9372-2](https://doi.org/10.1007/s12217-014-9372-2); [10.1016/j.combustflame.2012.07.012](https://doi.org/10.1016/j.combustflame.2012.07.012)
- **PSI-10 ACME Flame Design** (ISS test days 2019 (normal flames, test IDs 19xxx) and 2021 (inverse flames, 21xxx); ISS Increments 59-60 and 66): Across ambient O2 0.2-0.38, fuel fraction 0.13-1 and 0.6-12.2 mg/s, all ethylene spherical flames reached radiative extinction at a critical temperature of 1130 K (fuel mass flux 0.2 g/m2-s normal; O2 mass flux 0.68 g/m2-s inverse). Source: Irace et al. 2023 abstract reproduced in ACME/Flame Design Final Report (PSI-10). Key paper(s): [10.1016/j.proci.2022.07.043](https://doi.org/10.1016/j.proci.2022.07.043); [10.1016/j.combustflame.2021.02.019](https://doi.org/10.1016/j.combustflame.2021.02.019)
- **PSI-47 DAFT / DAFT-2** (DAFT sessions D1 and D2: GMT 054 and 063, 2005 (PSI table); DAFT-2 dates not found): Showed the gravity-dependent P-Trak could be used in orbit (risk reduction for SAME); the sample aerosol contained more large particles than on Earth and particle build-up in the optics was suspected; early results gave the first measurements of ISS ambient aerosol, which was very low. Source: DAFT 30-Day Post-Flight Report (PSI-47); Urban et al. 2005 SAE abstract (OpenAlex). Key paper(s): [10.4271/2005-01-2930](https://doi.org/10.4271/2005-01-2930)
- **PSI-115 Utilization of the Smoke Aerosol Measurement Experiment Data** (n/a): In Earth gravity, settling capped smoke particles at ~40 micrometers (mode ~5 micrometers); without buoyancy or settling the microgravity plume was symmetric and held very large particles (>40 micrometers), with a bimodal distribution behind the heated source. Source: PSI-115 Final Report NNX17AF08A executive summary. Key paper(s): no DOI (UNVERIFIED)
- **PSI-22 ACME E-FIELD Flames** (ISS March-November 2018 (Increments 55-57)): In microgravity the voltage-current curve has a distinct peak ion current at the most compact flame instead of the 1-g saturation plateau; very weak flames that would quench were stabilized by small fields. Voltage sweeps went to at least -7 kV with the mesh 37 mm from the burner. Source: ACME/E-FIELD Flames Final Report (PSI-22) 'Surprises' and results sections. Key paper(s): [10.1016/j.combustflame.2022.112443](https://doi.org/10.1016/j.combustflame.2022.112443)
- **PSI-62 Concurrent Flame Spread Modeling using Flamelet Generated Ma** (n/a (ground/computational)): Developed an unsteady radiative flamelet-generated-manifold model for solid-fuel flame spread in microgravity, aimed at screening material flammability limits. No headline number verified. Source: PSI-62 metadata objective/impact. Key paper(s): [10.1016/j.combustflame.2023.112939](https://doi.org/10.1016/j.combustflame.2023.112939)
- **PSI-107 SPICE** (ISS, twelve sessions from 2009-02-14 (final report); 469 flames in PSI table): Fifty-two laminar smoke points were measured; smoke-point length scaled as d^-0.91 u_air^0.41, so smaller burners or faster coflow gave longer smoke points, and ethylene and propane swapped sooting rank relative to 1 g. Source: SPICE Final Report (PSI-107) abstract and conclusions. Key paper(s): [10.1016/j.firesaf.2011.08.002](https://doi.org/10.1016/j.firesaf.2011.08.002)
- **PSI-23 ACME s-Flame** (ISS 18 test days, 2019-09-11 to 2020-07-08 (PSI table)): Radiative extinction turned out to be common on ISS (predicted but not previously observed for these conditions); N2-diluted CH4 and C2H4 flames showed kinetic extinction at low flow and radiative extinction at high flow, and ethylene flames did not soot in microgravity. 18 test days at ~21% and ~30% O2. Source: ACME s-Flame Final Report 2021 (PSI-23) 'Surprises and New Discoveries'. Key paper(s): no DOI (UNVERIFIED)
- **PSI-39 CFI** (ISS tests March-July 2017 (87 rows, PSI table)): Cool-flame burning data (regression rate, hot/cool flame diameters, extinction, radiant emission) for n-dodecane and mixtures across 0.5-5 atm and up to 59% He; analysis showed simplified cool-flame chemistry deteriorates with increasing pressure in predicting extinction diameters. Source: CFI Science Final Report (PSI-39); Williams & Nayagam 2020 abstract (Semantic Scholar); conditions from PSI table. Key paper(s): [10.1007/s12217-024-10115-x](https://doi.org/10.1007/s12217-024-10115-x); [10.1016/j.combustflame.2019.10.036](https://doi.org/10.1016/j.combustflame.2019.10.036)
- **PSI-60 Computational and Experimental Analysis of SPICE Data Sets** (n/a): Analyzed over 1600 raw SPICE DSLR images with soot models; simulations agreed that 0-g flames are longer, cooler and sootier, and pointed to inadequate thermal-field prediction as the main model gap. Source: PSI-60 metadata objective; Dobbins et al. 2022 abstract (OpenAlex). Key paper(s): [10.1080/00102202.2022.2041621](https://doi.org/10.1080/00102202.2022.2041621)
- **PSI-68 FLEX-2** (ISS test years UNVERIFIED (not in PSI table)): Large 50/50 decane/hexanol droplets at 0.05-0.30 MPa showed sustained cool-flame burning after radiative extinction at >=0.10 MPa; at 0.20 MPa the hot flame spontaneously re-ignited, and at ~0.30 MPa the droplet burned to completion on the cool flame. Source: Dietrich et al. 2016 abstract (OpenAlex). Key paper(s): [10.1080/00102202.2016.1225730](https://doi.org/10.1080/00102202.2016.1225730); [10.1016/j.combustflame.2018.04.023](https://doi.org/10.1016/j.combustflame.2018.04.023)
- **PSI-159 ACME CFI-G** (ISS 2021 (test IDs 21088-21291; extra day 2021-10-18 per final report)): Spherical gas-fueled cool diffusion flames were observed for the first time, but only for normal n-butane flames at 2 bar and ambient XO2 0.39; the hot flames that spawned them were 2.6 times larger, and the cool flames sat near mixture fraction 0.53. Source: Kim et al. 2023 abstract reproduced in ACME/CFI-G Final Report (PSI-159). Key paper(s): [10.1016/j.proci.2022.07.015](https://doi.org/10.1016/j.proci.2022.07.015)
- **PSI-21 ACME CLD Flame** (ISS 32 test days, 2017 to 2021 (test days 17319-21062 in PSI table)): At 0 g coflow ethylene flames were longer, broader and cooler, with more soot and longer residence time than at 1 g, but these effects were much smaller for the small ACME burner flame. Dataset: 32 ISS test days (2017-2021). Source: Dobbins et al. 2022 abstract (OpenAlex); PSI-21 experimental table. Key paper(s): [10.1080/00102202.2022.2041621](https://doi.org/10.1080/00102202.2022.2041621)
- **PSI-106 SLICE** (ISS 12 test days, 2012-02-09 to 2012-03-23 (PSI table)): For CH4 fuel fractions 0.4-1.0 and inlet velocities 23-90 cm/s, luminous flame length scaled with fuel mass flow and nonbuoyant flames were noticeably longer than at 1 g; fuel dilution and inlet velocity were secondary. Source: Cao et al., NTRS 20150002322 abstract (conference version of Proc. Combust. Inst. 35 paper). Key paper(s): [10.1016/j.proci.2014.05.138](https://doi.org/10.1016/j.proci.2014.05.138)
- **PSI-117 Effect of External Thermo-Convective Perturbation on Cool Fl** (n/a): Mapped stability windows for droplet cool flames (ignition, oscillation, hot-ignition transition, extinction) under deliberate heating and drift-induced convection. No headline number verified. Source: PSI-117 metadata objective. Key paper(s): [10.1016/j.proci.2022.07.094](https://doi.org/10.1016/j.proci.2022.07.094)
- **PSI-142 Quantitative Studies of Cool Flame Transitions at Radiation ** (n/a): Warm diffusion flames have a double reaction zone and mediate the cool-to-hot transition; flammable regions of warm and cool flames expand with pressure. No headline number verified. Source: PSI-142 metadata impact statement. Key paper(s): [10.1016/j.pecs.2019.100787](https://doi.org/10.1016/j.pecs.2019.100787); [10.1016/j.combustflame.2021.111471](https://doi.org/10.1016/j.combustflame.2021.111471)

- **Paper verification method.** Every DOI above was resolved through Crossref `/works/{doi}` (all HTTP 200, title and authors matched) and OpenAlex `/works/doi:{doi}` on 2026-11-14. Abstracts came from OpenAlex where present, otherwise from a Semantic Scholar `/paper/batch` call (first two attempts returned HTTP 429 without an API key; a later attempt succeeded) or from NASA NTRS records. Elsevier abstracts for Olson & Ferkul 2017, Bhattacharjee 2016, Irace 2023, Kim 2023, Dietrich 2024 and Budzinski 2023 were not retrievable, so their numbers come from NASA reports instead. — [Crossref API](https://api.crossref.org/works/10.1038/s41598-017-18398-4); [OpenAlex](https://api.openalex.org/works/doi:10.1007/s12217-014-9372-2); [NTRS API](https://ntrs.nasa.gov/api/citations/search?q=BASS-II)
- **Extra NASA cross-checks used:** BASS-II Summary Report NASA/TM-20210011385 (heat-release rates mostly below 100 W; global equivalence ratio ~1.3) — [NTRS 20210011385](https://ntrs.nasa.gov/citations/20210011385); BASS-II results presentation (flows up to 53 cm/s; flames sensitive at 0-5 cm/s, sustained below 1 cm/s) — [NTRS 20160000593](https://ntrs.nasa.gov/citations/20160000593); BASS-II/BASS SIBAL fabric quenching at 1-5 cm/s for O2 from 21% down to 16% — [NTRS 20150008962](https://ntrs.nasa.gov/citations/20150008962); BASS-II PMMA rods, 24 concurrent-flow tests with blowoff and quenching limits — [NTRS 20150008961](https://ntrs.nasa.gov/citations/20150008961).

### Inferences
- The four Saffire/BASS-II numbers (1.8, 2.1, 2.3, 2.6 mm/s spread; 200 W to 1.2 kW flame power) give the dashboard a simple "fire size vs. sample scale vs. flow" comparison across three investigations.
- Cool-flame findings (FLEX, FLEX-2, CFI) carry a safety message even though they are fundamental studies: a droplet can keep burning invisibly after the visible flame goes out, and can re-ignite.

### Gaps
- Olson & Ferkul 2017 and Bhattacharjee 2016 abstracts were not retrieved; their specific numbers are not in this catalog.
- No ISS-results paper with a DOI was identified for ACME s-Flame.

## Which investigations matter most for each crew setting? (ranking)

### Takeaway
By total relevance score (analyst judgment), the top tier is **Saffire-I, Saffire-III, SAME-R, ACME BRE, BASS-II, BASS, Saffire-II, SAME and FLEX**. BRE ranks highest for lunar base, Mars base and pressurized rover because it alone tested exploration atmospheres; the Saffire set ranks highest for spacecraft cabins because it burned real fires at realistic scale inside a spacecraft.

### Cited Findings
- Lunar base and rover atmosphere: "The intermediate oxygen concentration used on the Moon will likely be 30% or greater, with a corresponding pressure of 10.2 psi or less." — [challenge page](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/)
- "There is currently no partial-gravity combustion data available in PSI" and "Microgravity and normal-gravity results could bound what occurs at intermediate gravity levels"; E-FIELD Flames "mimicked" partial gravity via the electric field. — [challenge page](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/)
- BRE's stated objective included NASA atmospheres "14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen", and its impact statement says flames without air flow persisted in elevated-O2 atmospheres while 21% O2 flames self-extinguished. — PSI-20 metadata

**Scoring rubric (analyst judgment, 1-5):**
- 5 = directly measures fire behavior of cabin materials, smoke detection or suppression under conditions matching that setting (atmosphere, flow, scale).
- 4 = directly fire-safety relevant, but conditions only partly match (for lunar, Mars and rover this usually means micro-g only with ~21% O2, one point below the cabin/ISS score).
- 3 = fundamental flame or model data with a clear route into fire-safety models for that setting, or overlap with exploration atmospheres.
- 2 = fundamental combustion science with only an indirect fire-safety link.
- 1 = no meaningful overlap with that setting.
- Adjustments: +1 for lunar/Mars/rover when tests were run at elevated O2 and reduced pressure (BRE); +1 for lunar/Mars/rover for E-FIELD (partial-g surrogate); rover +1 where fire growth in an enclosed vehicle volume or no-flow conditions were measured (Saffire-I, Saffire-III, SAME-R). Ties are broken by cabin + ISS score, then accession number.

### Inferences
- A dashboard filter by crew setting can sort directly on these scores; the `why` strings in the JSON give a one-line justification for each cell.
- The ranking shifts by setting: for ISS and cabins, Saffire and BASS lead; for lunar and rover, BRE leads, followed by Saffire-I/III and SAME-R.

### Gaps
- The scores are not a NASA product and have not been reviewed by a subject-matter expert.

## Investigations named in the task that are NOT in PSI (context only)

### Takeaway
SoFIE, Saffire IV-VI, JAXA FLARE, FM2 and LUCI have no PSI records as of 2026-11-14, so they are excluded from the JSON.

### Cited Findings
- **SoFIE** (Solid Fuel Ignition and Extinction): CIR insert for solid spacecraft materials at "variable oxygen concentrations and pressures representative of current and planned NASA Space Exploration Atmospheres"; five investigations; ISS operations were slated to begin July 2021. — [NTRS 20200000361](https://ntrs.nasa.gov/citations/20200000361). A 2024 NTRS paper reports ISS extinction tests on 4-cm PMMA spheres at 0.2-80 cm/s flow and 13-28% O2 (it does not name the investigation, so the SoFIE link is UNVERIFIED). — [NTRS 20240007628](https://ntrs.nasa.gov/citations/20240007628)
- **Saffire IV-VI**: tests "spanned 1.5 to 3.2 kW with free air volumes of 17 to 19 cubic meters"; Saffire VI burned 41-cm-wide samples (cotton/fiberglass, 1 cm and 0.5 cm PMMA, Nomex); temperature and pressure rise were less significant than the CO2 and CO increase. — [NTRS 20240002981](https://ntrs.nasa.gov/citations/20240002981)
- **FM2, LUCI**: named by the challenge as future sources of partial-gravity data. **FLARE** (JAXA) and SoFIE are listed by NASA Glenn as current combustion experiments. — [challenge page](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/); [NASA Combustion Science](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/)

### Inferences
- Saffire IV-VI results (kW-scale fires and CO/CO2 build-up in a 17-19 m3 volume) would strengthen a rover/habitat argument, but they are NTRS-only and must be labeled as non-PSI data.

### Gaps
- Saffire IV and V spread rates were not extracted.

## Machine-readable catalog (identical to web_data/investigations.json)

```json
[
  {
    "overall_rank": 1,
    "accession": "PSI-98",
    "acronym": "SAFFIRE-I",
    "full_name": "Spacecraft Fire Safety Experiment-I",
    "psi_doi": "10.60555/0t15-1z43",
    "psi_url": "https://doi.org/10.60555/0t15-1z43",
    "investigation_type": "Free-flyer spacecraft flight",
    "research_subarea": "Spacecraft Fire, Smoke Distribution",
    "fire_safety_theme": "large-scale fire growth in a spacecraft",
    "years": {
      "psi_investigation_dates": "PSI record lists 2001-03-02 to 2008-02-28 (appears copied from SAME; UNVERIFIED)",
      "operations": "Launched OA-6 2016-03-22; burned 2016-06-14 in Cygnus after unberthing (NTRS 20180005168)"
    },
    "platform": "Orbital ATK Cygnus cargo vehicle (uncrewed) after leaving ISS",
    "hardware": "Saffire module (~53 x 90 x 133 cm): flow duct with sample card + avionics bay",
    "fuel_sample": "SIBAL fabric (75% cotton / 25% fiberglass), 40.6 cm wide x 94 cm long x 0.37 mm thick (concurrent); ~10 cm opposed-flow sample",
    "atmosphere": {
      "o2": "21.5-21.7 %",
      "pressure": "Cygnus cabin ambient (not tabulated; UNVERIFIED)"
    },
    "flow": "20 cm/s forced air, concurrent and opposed",
    "gravity": "microgravity (free-flying Cygnus)",
    "diagnostics": [
      "2 video cameras",
      "flow inlet/outlet thermocouples",
      "thermocouples embedded in sample",
      "plume thermocouple",
      "4 radiometers (2 front, 2 back)",
      "solid-state CO2 and O2 sensors",
      "pressure"
    ],
    "psi_data": {
      "total_size_gb": 12.25,
      "n_files": 76,
      "file_types": "62 ZIP (12.179 GB), 6 PDF, 4 XLSX (0.065 GB), 3 DOCX, 1 CSV",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "David Urban (NASA GRC)",
    "key_finding": "Largest fire burned in space at the time: concurrent spread over the 40.6 x 94 cm fabric averaged 1.8 mm/s with an estimated flame power of 1200 +/- 300 W; burn lasted 420 s and consumed ~84 cm. Opposed-flow spread was 1.3 mm/s.",
    "key_finding_source": "Urban et al., ASGSR 2017 presentation, NTRS 20180005168 (Table 1 and Saffire-1 slide)",
    "key_papers": [
      {
        "citation": "Urban D.L., Ferkul P., Olson S., Ruff G.A., Easton J., T'ien J.S., et al. (2019). Flame spread: Effects of microgravity and scale. Combustion and Flame 199.",
        "doi": "10.1016/j.combustflame.2018.10.012",
        "doi_verified": true
      },
      {
        "citation": "Li C., Liao Y.-T.T., T'ien J.S., Urban D.L., Ferkul P., Olson S., et al. (2019). Transient flame growth and spread processes over a large solid fabric in concurrent low-speed flows in microgravity - Model versus experiment. Proceedings of the Combustion Institute 37.",
        "doi": "10.1016/j.proci.2018.05.168",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 5,
        "why": "A real fire inside a real spacecraft at realistic scale and ventilation speed (20 cm/s): the closest analogue to a cabin fire."
      },
      "iss": {
        "score": 5,
        "why": "Same scale and flow as ISS module ventilation; samples are spacecraft fabrics."
      },
      "lunar_base": {
        "score": 4,
        "why": "Fire growth at practical scale informs habitat design, but only ~21.5% O2 and micro-g."
      },
      "mars_base": {
        "score": 4,
        "why": "As lunar: scale data useful, gravity and atmosphere not matched."
      },
      "pressurized_rover": {
        "score": 5,
        "why": "Cygnus free volume is closer to a rover cabin than any other PSI test; fire power vs. small cabin volume is directly relevant."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 23,
    "notes_unverified": [
      "PSI investigation dates (2001-2008) do not match the 2016 flight; treat as a PSI metadata error.",
      "Spread rates are from a NASA slide deck, not a peer-reviewed table."
    ]
  },
  {
    "overall_rank": 2,
    "accession": "PSI-100",
    "acronym": "SAFFIRE-III",
    "full_name": "Spacecraft Fire Experiment-III",
    "psi_doi": "10.60555/040q-4h36",
    "psi_url": "https://doi.org/10.60555/040q-4h36",
    "investigation_type": "Free-flyer spacecraft flight",
    "research_subarea": "Spacecraft Fire Safety",
    "fire_safety_theme": "large-scale fire growth in a spacecraft",
    "years": {
      "psi_investigation_dates": "2017-04-18 start",
      "operations": "Launched OA-7 2017-03-27 (NTRS deck) / burned 2017-06-04 in Cygnus"
    },
    "platform": "Cygnus cargo vehicle (uncrewed)",
    "hardware": "Saffire module, same design as Saffire-I",
    "fuel_sample": "SIBAL cotton-fiberglass fabric 40.6 cm x 94 cm x 0.33-0.37 mm (concurrent) and ~10 cm opposed sample",
    "atmosphere": {
      "o2": "21.0-21.2 %",
      "pressure": "Cygnus cabin ambient (UNVERIFIED)"
    },
    "flow": "25 cm/s per NASA ASGSR 2017 deck; PSI table says 30 cm/s (CONFLICT, see notes)",
    "gravity": "microgravity (free-flying Cygnus)",
    "diagnostics": [
      "2 video cameras",
      "thermocouples",
      "4 radiometers",
      "solid-state CO2 and O2 sensors",
      "1 Hz telemetry (PSI)"
    ],
    "psi_data": {
      "total_size_gb": 35.21,
      "n_files": 87,
      "file_types": "68 ZIP (35.115 GB), 7 PDF (0.012 GB), 6 XLSX (0.073 GB), 3 CSV, 3 DOCX",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "David Urban (NASA GRC)",
    "key_finding": "Concurrent spread over the large fabric was 2.3 mm/s (burn ~300-320 s), faster than Saffire-I's 1.8 mm/s at 20 cm/s; NASA notes flame speed scaled with air-flow velocity. Opposed spread was 0.98 mm/s.",
    "key_finding_source": "NTRS 20180005168 Table 1 and Saffire-I/III results slide",
    "key_papers": [
      {
        "citation": "Urban D.L., et al. (2019). Flame spread: Effects of microgravity and scale. Combustion and Flame 199.",
        "doi": "10.1016/j.combustflame.2018.10.012",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 5,
        "why": "Repeat of the large spacecraft fire at higher flow shows how ventilation speeds up spread."
      },
      "iss": {
        "score": 5,
        "why": "ISS-like ventilation and materials."
      },
      "lunar_base": {
        "score": 4,
        "why": "Ventilation/scale effects transfer; gravity and O2 do not match."
      },
      "mars_base": {
        "score": 4,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 5,
        "why": "Shows fire growth vs. fan speed in an enclosed vehicle volume, directly useful for rover ventilation shutdown logic."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 23,
    "notes_unverified": [
      "Flow speed conflict: 25 cm/s (NASA 2017 deck) vs 30 cm/s (PSI experimental table, 2016 plan said 'close to 30 cm/s').",
      "Burn duration 300 s (deck Table 1) vs 320 s (deck slide text)."
    ]
  },
  {
    "overall_rank": 3,
    "accession": "PSI-101",
    "acronym": "SAME-R",
    "full_name": "Smoke Aerosol Measurement Experiment-Reflight",
    "psi_doi": "10.60555/2np7-jv14",
    "psi_url": "https://doi.org/10.60555/2np7-jv14",
    "investigation_type": "ISS flight",
    "research_subarea": "Spacecraft Fire Safety",
    "fire_safety_theme": "detection (smoke particle size, no-flow smoke)",
    "years": {
      "psi_investigation_dates": "2010-07-01 to 2010-09-30",
      "operations": "ISS 2010-07-16 to 2010-09-09, 66 test points (final report)"
    },
    "platform": "ISS, Microgravity Science Glovebox (MSG)",
    "hardware": "SAME hardware with new M-pass instrument (replaced one Commercial Diagnostic Enclosure)",
    "fuel_sample": "Overheated Kapton, silicone, lampwick, Teflon, Pyrell intumescent foam (109 table rows)",
    "atmosphere": {
      "o2": "ISS cabin air (~21%, not tabulated)",
      "pressure": "ISS cabin ambient"
    },
    "flow": "Inlet velocity 0, 1, 2, 8 and 8.1 cm/s (no-flow cases added)",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "prototype two-moment smoke detector",
      "P-Trak (number)",
      "ionization chamber (diameter)",
      "mass monitor",
      "M-pass",
      "thermal precipitator / TEM grids"
    ],
    "psi_data": {
      "total_size_gb": 6.31,
      "n_files": 344,
      "file_types": "80 ZIP (1.754 GB), 77 XLS (0.475 GB), 76 PPTX (0.255 GB), 45 CSV (0.028 GB), 36 PDF (0.053 GB), 15 XLSX (0.01 GB), 8 MP4 (3.687 GB), 3 TIF, 2 PPT (0.016 GB), 1 DOCX (0.029 GB), 1 DOC",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "David Urban (NASA GRC); Co-Is Zeng-guang Yuan (GRC), Jiann Yang and Thomas Cleary (NIST), George Mulholland (UMD)",
    "key_finding": "With no air flow, smoke particles were 2-3 times larger than at the nominal 8 cm/s flow (final report); averaged over materials, the diameter of average mass rose by a factor of 1.9 at no flow (Mulholland et al. 2015).",
    "key_finding_source": "SAME-R Final Report (PSI-101) conclusions; Mulholland et al. 2015 abstract (OpenAlex)",
    "key_papers": [
      {
        "citation": "Mulholland G.W., Meyer M., Urban D.L., Ruff G.A., Yuan Z., Bryg V., et al. (2015). Pyrolysis Smoke Generated Under Low-Gravity Conditions. Aerosol Science and Technology 49.",
        "doi": "10.1080/02786826.2015.1025125",
        "doi_verified": true
      },
      {
        "citation": "Meyer M.E., et al. (2018). Evaluation of spacecraft smoke detector performance in the low-gravity environment. Fire Safety Journal 98.",
        "doi": "10.1016/j.firesaf.2018.04.004",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 5,
        "why": "No-flow smoke (e.g., overheating electronics in a closed rack) grows larger, changing which detector works."
      },
      "iss": {
        "score": 5,
        "why": "ISS racks and stagnant pockets are exactly the no-flow case."
      },
      "lunar_base": {
        "score": 4,
        "why": "Detector design transfers; partial-g settling not tested."
      },
      "mars_base": {
        "score": 4,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 5,
        "why": "Stagnant, cramped rover compartments match the no-flow condition most closely."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 23,
    "notes_unverified": []
  },
  {
    "overall_rank": 4,
    "accession": "PSI-20",
    "acronym": "ACME BRE",
    "full_name": "Advanced Combustion via Microgravity Experiments - Burning Rate Emulator",
    "psi_doi": "10.60555/vb93-3y72",
    "psi_url": "https://doi.org/10.60555/vb93-3y72",
    "investigation_type": "ISS flight",
    "research_subarea": "Flames of Gaseous Fuels",
    "fire_safety_theme": "prevention (material flammability in quiescent, elevated-O2 atmospheres)",
    "years": {
      "psi_investigation_dates": "2010-01-01 to 2025-02-08",
      "operations": "ISS test days Feb 2019 - Jan 2021 (18 rows in PSI table)"
    },
    "platform": "ISS, Combustion Integrated Rack (CIR)",
    "hardware": "ACME chamber insert in CIR; flat porous burners 25 mm and 50 mm dia with 2 heat-flux gauges each",
    "fuel_sample": "Gaseous emulator: C2H4 (50% and 100%, N2 balance) and CH4 fed through flat porous burners to emulate condensed fuels (PMMA, Nylon, alcohols); heat of combustion 23.6 and 47.2 kJ/g",
    "atmosphere": {
      "o2": "21, 25, 26.5, 34, 40 % (O2/N2)",
      "pressure": "~0.56 to 1 bar; NASA habitat atmospheres 14.7 psia/21%, 10.2 psia/26.5%, 8.2 psia/34%"
    },
    "flow": "Quiescent (no forced ambient flow); fuel mass flux set by burner",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "heat-flux gauges on burner",
      "radiometers",
      "thin-filament pyrometry (TFP)",
      "ACME color data camera",
      "CFI intensified camera",
      "HiBMs camera",
      "thermocouples",
      "SAMS acceleration"
    ],
    "psi_data": {
      "total_size_gb": 2035.57,
      "n_files": 2361,
      "file_types": "1049 ZIP (2016.29 GB), 652 TXT, 383 CSV (1.109 GB), 199 MP4 (16.005 GB), 59 PDF (0.185 GB), 10 MDIPSUG, 5 XLSX, 2 DOCX, 1 ZIIP (1.973 GB), 1 NEXT",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "James Quintiere (University of Maryland); Co-I John de Ris; Project Scientists Peter Sunderland (UMD), Dennis Stocker (NASA GRC)",
    "key_finding": "In still microgravity air, steady flames over an emulated 25 mm flat material occurred at nominal O2 of ~26% and above (including the NASA 10.2 psia/26.5% and 8.2 psia/34% atmospheres), whereas 21% O2 flames self-extinguished; an emulated material like PMMA (hc~24 kJ/g, L~3 kJ/g) burned steadily at 26.5%/10.2 psia. Radiative loss fraction reached ~60% vs ~30% in 1 g. 59 ignited tests.",
    "key_finding_source": "ACME/BRE Final Report 2022 (PSI-20) 'Surprises' and results sections; Dehghani et al. 2021 abstract (Semantic Scholar)",
    "key_papers": [
      {
        "citation": "Dehghani P., Sunderland P.B., Quintiere J.G., deRis J.L. (2021). Burning in microgravity: Experimental results and analysis. Combustion and Flame 228.",
        "doi": "10.1016/j.combustflame.2021.01.035",
        "doi_verified": true
      },
      {
        "citation": "Dehghani P., de Ris J.L., Quintiere J.G. (2023). Demonstrating steady burning for small flat materials in microgravity in a quiescent ambient. Proceedings of the Combustion Institute 39.",
        "doi": "10.1016/j.proci.2022.08.107",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 4,
        "why": "Shows that turning off ventilation (a standard spacecraft fire response) may not extinguish fires in enriched O2; cabin is normally 21%."
      },
      "iss": {
        "score": 4,
        "why": "ISS uses 21% O2 where these flames self-extinguished, so the risk is lower but the 'fans-off' assumption is tested."
      },
      "lunar_base": {
        "score": 5,
        "why": "Only PSI dataset run at the planned exploration atmospheres (26.5%/10.2 psia, 34%/8.2 psia) that match the >=30% O2 lunar base."
      },
      "mars_base": {
        "score": 5,
        "why": "Same exploration atmospheres; micro-g bound for 0.38 g."
      },
      "pressurized_rover": {
        "score": 5,
        "why": "Rovers are expected to use the same high-O2/low-pressure atmosphere; still-air burning applies to a small cabin with fans off."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 23,
    "notes_unverified": [
      "Mars-base atmosphere is not specified in the challenge text; scoring assumes it resembles the lunar exploration atmosphere."
    ]
  },
  {
    "overall_rank": 5,
    "accession": "PSI-25",
    "acronym": "BASS-II",
    "full_name": "Burning and Suppression of Solids - II",
    "psi_doi": "10.60555/4qc4-de67",
    "psi_url": "https://doi.org/10.60555/4qc4-de67",
    "investigation_type": "ISS flight",
    "research_subarea": "Spacecraft Fire Safety",
    "fire_safety_theme": "prevention (material flammability limits) + ventilation-flow effects",
    "years": {
      "psi_investigation_dates": "2010-01-01 to 2022-12-31",
      "operations": "ISS tests 2014-02-19 to 2014-08-04 (dates in PSI experimental table)"
    },
    "platform": "International Space Station, Microgravity Science Glovebox (MSG)",
    "hardware": "BASS fan-driven flow duct (built for SPICE) inside the MSG; MSG working volume vitiated with N2",
    "fuel_sample": "129 tests (PSI table): PMMA rods 1/4, 3/8, 1/2 in (0.64-1.27 cm) dia (54 tests); thin and thick PMMA sheets incl. 100-200 micron films 1-2 cm wide (41); SIBAL cotton-fiberglass fabric 1-2 cm wide (27); Nomex, PMMA spherical sections, Japan-wax candle (6)",
    "atmosphere": {
      "o2": "13.6-22.2 % by volume calibrated initial O2 (N2-vitiated MSG volume)",
      "pressure": "ISS cabin ambient (~1 atm; not tabulated in PSI table)"
    },
    "flow": "Forced fan flow 0 to ~53 cm/s; flames most sensitive at 0-5 cm/s and sustained below 1 cm/s (NTRS 20160000593); opposed-flow rod tests 0.4-8 cm/s (Link et al. 2018)",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "video camera with 5 Hz on-screen data overlay (fan, air speed, radiometer)",
      "Nikon digital still camera (raw .NEF frames)",
      "uncalibrated radiometer",
      "duct air-speed display (cm/s, ~1 min response)",
      "ISS CSA-CP O2 and CO readings",
      "Carbon Dioxide Monitor CO2 before/after each test"
    ],
    "psi_data": {
      "total_size_gb": 274.63,
      "n_files": 695,
      "file_types": "296 MP4 (17.708 GB), 265 ZIP (256.748 GB), 127 PDF (0.173 GB), 2 XLSX, 2 DOCX, 1 PPTX, 1 JPG, 1 CSV",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "No single PI in PSI record; Co-Is: Paul Ferkul (NASA GRC), Carlos Fernandez-Pello (UC Berkeley), Fletcher Miller (SDSU), James T'ien (Case Western), Subrata Bhattacharjee (SDSU); Sandra Olson (NASA GRC) is lead author of the Summary Report",
    "key_finding": "Over PMMA cylinders, microgravity flame spread was sustained down to 17% O2 versus 18% in normal gravity, and spread rate first rose then fell as opposed flow increased from 0.4 to 8 cm/s (not seen on Earth). Across BASS-II, most tests released well under 100 W and burned fuel-rich (global equivalence ratio ~1.3).",
    "key_finding_source": "Link et al. 2018 abstract (OpenAlex); NASA/TM-20210011385 BASS-II Summary Report abstract (NTRS)",
    "key_papers": [
      {
        "citation": "Link S., Huang X., Fernandez-Pello C., Olson S., Ferkul P. (2018). The Effect of Gravity on Flame Spread over PMMA Cylinders. Scientific Reports 8.",
        "doi": "10.1038/s41598-017-18398-4",
        "doi_verified": true
      },
      {
        "citation": "Olson S.L., Ferkul P.V. (2017). Microgravity flammability boundary for PMMA rods in axial stagnation flow: Experimental results and energy balance analyses. Combustion and Flame 180.",
        "doi": "10.1016/j.combustflame.2017.03.001",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 5,
        "why": "Real cabin materials (PMMA, cotton-fiberglass, Nomex) at ventilation-scale flows (0-53 cm/s) give low-g flammability limits that the 1-g NASA-STD-6001 test cannot."
      },
      "iss": {
        "score": 5,
        "why": "Run in the ISS MSG at ISS cabin conditions; directly informs ISS material selection and fans-off procedures."
      },
      "lunar_base": {
        "score": 4,
        "why": "Strong micro-g end-member for bounding lunar gravity, but O2 never exceeded 22.2%, below the >=30% planned lunar atmosphere."
      },
      "mars_base": {
        "score": 4,
        "why": "Same as lunar: micro-g bound for 0.38 g, but no elevated-O2 or reduced-pressure tests."
      },
      "pressurized_rover": {
        "score": 4,
        "why": "Low-flow results matter in a small rover cabin, but rover atmospheres (high O2, low pressure) were not tested."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 22,
    "notes_unverified": [
      "Pressure is not in the PSI table; '~1 atm' is inferred from ISS cabin operation.",
      "PSI 'Calibrated final O2' column contains a 40.4 value that looks like a data-entry error; not used."
    ]
  },
  {
    "overall_rank": 6,
    "accession": "PSI-26",
    "acronym": "BASS",
    "full_name": "Burning and Suppression of Solids",
    "psi_doi": "10.60555/58h4-dy80",
    "psi_url": "https://doi.org/10.60555/58h4-dy80",
    "investigation_type": "ISS flight",
    "research_subarea": "Spacecraft Fire Safety",
    "fire_safety_theme": "prevention (material flammability) + suppression (N2 jet)",
    "years": {
      "psi_investigation_dates": "2009-10-01 to 2013-06-30",
      "operations": "ISS tests 2012-03-31 to 2013 (dates in PSI table and As-Run test matrix)"
    },
    "platform": "International Space Station, Microgravity Science Glovebox (MSG)",
    "hardware": "SPICE-derived fan-driven flow duct in the MSG with N2 suppression nozzle (0-500 cc/min mass flow controller)",
    "fuel_sample": "122 rows (PSI table): PMMA spheres 1 and 2 cm, PMMA flat samples/slabs 1-2 cm wide, SIBAL cotton-fiberglass fabric 2 cm, Nomex blend 2 cm, paraffin and Japan-wax candles (incl. wake-ignition tests)",
    "atmosphere": {
      "o2": "~16.1-22.1 % (ISS environment O2 fraction 0.1605-0.221 logged in As-Run matrix; some tests N2-vitiated)",
      "pressure": "ISS cabin ambient (As-Run matrix logs ~0.97-0.98 in the ISS environment columns; units not labeled, UNVERIFIED as atm)"
    },
    "flow": "Forced flow 5-50 cm/s design (SRD); flight report: up to 40 cm/s, flames most sensitive at 0-5 cm/s, dim blue and stable below 1 cm/s",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "video camera",
      "digital still camera",
      "radiometer",
      "fan/air-speed display",
      "N2 mass flow controller",
      "ISS O2 measurement (MCA or CSA-CP)"
    ],
    "psi_data": {
      "total_size_gb": 163.55,
      "n_files": 210,
      "file_types": "114 MP4 (22.789 GB), 60 ZIP (140.722 GB), 30 PDF (0.025 GB), 2 XLSX, 2 PPTX, 1 DOCX, 1 CSV",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Paul Ferkul (NASA GRC); Project Scientist Sandra Olson (NASA GRC); Co-Is James T'ien, Fumiaki Takahashi (Case Western)",
    "key_finding": "Microgravity flames over thin and thick samples were especially sensitive to air flow in the 0-5 cm/s range; at the lowest speeds (<1 cm/s) all flames became dim blue and very stable. Air flow could be imposed up to 40 cm/s.",
    "key_finding_source": "Ferkul et al., 'Thickness and Fuel Preheating Effects on Material Flammability in Microgravity from the BASS Experiment', NTRS 20140011099 abstract",
    "key_papers": [
      {
        "citation": "Bhattacharjee S., Laue M., Carmignani L., Ferkul P., Olson S. (2016). Opposed-flow flame spread: A comparison of microgravity and normal gravity experiments to establish the thermal regime. Fire Safety Journal 79.",
        "doi": "10.1016/j.firesaf.2015.11.011",
        "doi_verified": true,
        "note": "abstract not retrievable (Elsevier); title/DOI verified"
      },
      {
        "citation": "Ferkul P., Olson S.L., Takahashi F., et al. Thickness and Fuel Preheating Effects on Material Flammability in Microgravity from the BASS Experiment (NASA conference paper).",
        "doi": "",
        "doi_verified": false,
        "note": "NTRS 20140011099; no DOI"
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 5,
        "why": "Spacecraft materials at cabin-like low flows, plus an N2-jet extinguishment test that mirrors inert-gas suppression."
      },
      "iss": {
        "score": 5,
        "why": "Run on ISS; links low-g flammability to the NASA-STD-6001 Test 1 used to clear ISS materials."
      },
      "lunar_base": {
        "score": 4,
        "why": "Micro-g bound for lunar gravity; no elevated-O2 or reduced-pressure atmospheres tested."
      },
      "mars_base": {
        "score": 4,
        "why": "Micro-g bound for Mars gravity; same atmosphere gap."
      },
      "pressurized_rover": {
        "score": 4,
        "why": "Low-flow behavior relevant to a small cabin with stopped fans; rover atmosphere not tested."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 22,
    "notes_unverified": [
      "Pressure units in the As-Run matrix ISS columns are not labeled."
    ]
  },
  {
    "overall_rank": 7,
    "accession": "PSI-99",
    "acronym": "SAFFIRE-II",
    "full_name": "Spacecraft Fire Experiment-II",
    "psi_doi": "10.60555/2chp-m469",
    "psi_url": "https://doi.org/10.60555/2chp-m469",
    "investigation_type": "Free-flyer spacecraft flight",
    "research_subarea": "Surface Combustion",
    "fire_safety_theme": "material flammability limits vs. NASA-STD-6001",
    "years": {
      "psi_investigation_dates": "2016-09-30 to 2017-04-01",
      "operations": "Launched OA-5 2016-10-17; burned 2016-11-21 in Cygnus (NTRS 20180005168)"
    },
    "platform": "Cygnus cargo vehicle (uncrewed)",
    "hardware": "Saffire module with nine-sample card",
    "fuel_sample": "Nine 5 cm x 29 cm samples: silicone (0.27, 0.61, 1.03 mm), SIBAL cotton-fiberglass 0.37 mm (x2), PMMA + Nomex, PMMA (shaped and 1 cm thick)",
    "atmosphere": {
      "o2": "~21.9-22.1 %",
      "pressure": "Cygnus cabin ambient (not tabulated; UNVERIFIED)"
    },
    "flow": "20 cm/s (one SIBAL test at 25 cm/s); concurrent and opposed",
    "gravity": "microgravity (free-flying Cygnus)",
    "diagnostics": [
      "2 video cameras",
      "thermocouples (flow, sample, plume)",
      "radiometers",
      "solid-state CO2 and O2 sensors"
    ],
    "psi_data": {
      "total_size_gb": 16.92,
      "n_files": 217,
      "file_types": "190 ZIP (16.678 GB), 11 XLSX (0.231 GB), 10 DOCX, 5 PDF, 1 CSV",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "David Urban (NASA GRC); Investigator Gary Ruff (NASA GRC)",
    "key_finding": "Silicone samples ignited but showed insignificant burning in microgravity at ~22.1% O2 and 20 cm/s, while the 0.27 mm silicone burned completely (accelerating) in the 1-g test; cotton-fiberglass spread at 2.1 mm/s (20 cm/s) and 2.6 mm/s (25 cm/s); average flame power ~200 +/- 50 W.",
    "key_finding_source": "NTRS 20180005168 Table 1 and slides; PSI-99 experimental table",
    "key_papers": [
      {
        "citation": "Urban D.L., et al. (2019). Flame spread: Effects of microgravity and scale. Combustion and Flame 199.",
        "doi": "10.1016/j.combustflame.2018.10.012",
        "doi_verified": true
      },
      {
        "citation": "Olson S.L., Urban D.L., Ruff G.A., Ferkul P.V., Toth B., Eigenbrod C., et al. (2019). Concurrent Flame Spread Over Two-Sided Thick PMMA Slabs in Microgravity. Fire Technology 56.",
        "doi": "10.1007/s10694-019-00863-3",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 5,
        "why": "Directly tests whether materials passing/failing the 1-g screening test behave the same in a spacecraft."
      },
      "iss": {
        "score": 5,
        "why": "Materials and flow speed representative of ISS cabin."
      },
      "lunar_base": {
        "score": 4,
        "why": "Material-limit comparison is the key lunar question, but O2 ~22% only."
      },
      "mars_base": {
        "score": 4,
        "why": "Same atmosphere/gravity gap as lunar."
      },
      "pressurized_rover": {
        "score": 4,
        "why": "Material choice for a rover cabin; rover O2 levels not tested."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 22,
    "notes_unverified": [
      "PSI table column header '?-g' is a mis-encoded 'micro-g'."
    ]
  },
  {
    "overall_rank": 8,
    "accession": "PSI-102",
    "acronym": "SAME",
    "full_name": "Smoke and Aerosol Measurement Experiment",
    "psi_doi": "10.60555/gd4k-8h62",
    "psi_url": "https://doi.org/10.60555/gd4k-8h62",
    "investigation_type": "ISS flight",
    "research_subarea": "Spacecraft Fire Safety",
    "fire_safety_theme": "detection (smoke particle size vs. detector type)",
    "years": {
      "psi_investigation_dates": "2001-03-02 to 2008-02-28",
      "operations": "ISS Increment 15, 2007-09-09 to 2007-10-05 (SAME-R final report)"
    },
    "platform": "ISS, Microgravity Science Glovebox (MSG)",
    "hardware": "SAME smoke generator (heated samples), aging chamber, thermal precipitator, Commercial Diagnostic Enclosures",
    "fuel_sample": "Overheated (pyrolyzed, not flaming) Teflon, Kapton, silicone rubber, cotton lampwick, dibutyl phthalate (8 samples)",
    "atmosphere": {
      "o2": "ISS cabin air (~21%, not tabulated)",
      "pressure": "ISS cabin ambient"
    },
    "flow": "Air flow over sample 5 and 10 cm/s; aging 1-20 min",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "TSI P-Trak condensation particle counter (0th moment)",
      "ionization chamber from residential smoke detector (1st moment)",
      "TSI DustTrak (mass)",
      "ISS and Shuttle smoke detectors",
      "thermal precipitator TEM grids"
    ],
    "psi_data": {
      "total_size_gb": 0.66,
      "n_files": 101,
      "file_types": "55 XLS (0.227 GB), 27 PDF (0.02 GB), 6 XLSX, 4 ZIP (0.333 GB), 3 PPT (0.043 GB), 2 MP4 (0.014 GB), 2 PPTX (0.017 GB), 1 DOC, 1 CSV",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "David Urban (NASA GRC); Co-Is George Mulholland (UMD), Thomas Cleary and Jiann Yang (NIST)",
    "key_finding": "All materials produced large numbers of sub-micron (<1 micrometer) smoke particles that ionization detectors catch better; later analysis found ISS smoke particles varied in morphology and size but were not significantly different from 1-g equivalents.",
    "key_finding_source": "SAME Final Science Report (PSI-102) conclusions; Meyer et al. 2018 abstract/TLDR (Semantic Scholar)",
    "key_papers": [
      {
        "citation": "Meyer M.E., Urban D.L., Mulholland G.W., Bryg V., Yuan Z.-G., Ruff G.A., et al. (2018). Evaluation of spacecraft smoke detector performance in the low-gravity environment. Fire Safety Journal 98.",
        "doi": "10.1016/j.firesaf.2018.04.004",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 5,
        "why": "Pre-fire overheat smoke from cabin materials is what cabin detectors must catch first."
      },
      "iss": {
        "score": 5,
        "why": "Evaluated the actual spacecraft smoke detectors under ISS conditions."
      },
      "lunar_base": {
        "score": 4,
        "why": "Detector design transfers, but partial-g settling and lunar dust nuisance sources are untested."
      },
      "mars_base": {
        "score": 4,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 4,
        "why": "Early detection is critical in a small rover with little escape volume; same partial-g gap."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 22,
    "notes_unverified": [
      "The final report text says 'four materials' while the PSI table lists five; not resolved."
    ]
  },
  {
    "overall_rank": 9,
    "accession": "PSI-69",
    "acronym": "FLEX",
    "full_name": "Flame Extinguishment Experiment",
    "psi_doi": "10.60555/mbq8-0451",
    "psi_url": "https://doi.org/10.60555/mbq8-0451",
    "investigation_type": "ISS flight",
    "research_subarea": "Spacecraft Fire Safety",
    "fire_safety_theme": "suppression (inert-gas dilution, limiting oxygen index)",
    "years": {
      "psi_investigation_dates": "2007-08-01 to 2016-07-31",
      "operations": "ISS tests 2009-2011 (274 rows, test dates in PSI table)"
    },
    "platform": "ISS, Combustion Integrated Rack (CIR) / Fluids and Combustion Facility",
    "hardware": "Multi-user Droplet Combustion Apparatus (MDCA) in CIR; free-floated or fiber-tethered droplets",
    "fuel_sample": "Methanol (157 tests) and n-heptane (117 tests) droplets, initial diameter 1.1-4.67 mm",
    "atmosphere": {
      "o2": "O2 mole fraction 0.12-0.34; diluents N2, CO2 (0-0.70), He (0-0.45)",
      "pressure": "~526-2320 mmHg in PSI table (~0.7-3.0 atm)"
    },
    "flow": "Quiescent chamber (droplet drift only)",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "backlit droplet camera (droplet diameter)",
      "OH* UV camera (flame size)",
      "color video",
      "radiometers",
      "LCTF calibration data in PSI"
    ],
    "psi_data": {
      "total_size_gb": 923.83,
      "n_files": 6555,
      "file_types": "4208 TXT (0.249 GB), 1420 ZIP (884.896 GB), 422 PDF (0.127 GB), 271 RTF (0.248 GB), 228 MP4 (38.122 GB), 2 XLS, 1 CSV, 1 EPS, 1 MPG (0.189 GB), 1 DOCX",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Forman Williams (UC San Diego); Project Scientist Daniel Dietrich (NASA GRC)",
    "key_finding": "Limiting oxygen index for quasi-steady burning was 0.12 (methanol) and 0.15 (heptane) in O2/N2, rising to ~0.14 and ~0.17 when CO2 was added (simulated CO2 suppressant at 1 atm), and ~0.14/0.15 with helium. Large heptane droplets kept burning with an invisible 'cool flame' after the visible flame went out; pre-extinction oscillations ~1 Hz.",
    "key_finding_source": "Dietrich et al. 2014 abstract (OpenAlex)",
    "key_papers": [
      {
        "citation": "Dietrich D.L., Nayagam V., Hicks M.C., Ferkul P.V., Dryer F.L., Farouk T., et al. (2014). Droplet Combustion Experiments Aboard the International Space Station. Microgravity Science and Technology 26.",
        "doi": "10.1007/s12217-014-9372-2",
        "doi_verified": true
      },
      {
        "citation": "Nayagam V., Dietrich D.L., Ferkul P.V., Hicks M.C., Williams F.A. (2012). Can cool flames support quasi-steady alkane droplet burning? Combustion and Flame 159.",
        "doi": "10.1016/j.combustflame.2012.07.012",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 4,
        "why": "Quantifies how much CO2/He dilution is needed to stop burning; liquid-fuel fires are less common than solids in a cabin."
      },
      "iss": {
        "score": 5,
        "why": "ISS carries CO2 extinguishers; FLEX measured CO2-dilution limits in ISS conditions."
      },
      "lunar_base": {
        "score": 4,
        "why": "Includes ~0.7 atm and O2 up to 0.34, close to exploration atmospheres; micro-g only."
      },
      "mars_base": {
        "score": 4,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 4,
        "why": "Suppressant dosing in a small volume; invisible cool-flame burning warns that 'flame out' may not mean 'fire out'."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 21,
    "notes_unverified": [
      "Some PSI table rows show 0 mmHg pressure (calibration rows); range quoted excludes them."
    ]
  },
  {
    "overall_rank": 10,
    "accession": "PSI-10",
    "acronym": "ACME Flame Design",
    "full_name": "Advanced Combustion via Microgravity Experiments / Flame Design",
    "psi_doi": "10.60555/w4zy-bt45",
    "psi_url": "https://doi.org/10.60555/w4zy-bt45",
    "investigation_type": "ISS flight",
    "research_subarea": "Flames of Gaseous Fuels",
    "fire_safety_theme": "fundamental (soot and radiative extinction; stated spacecraft fire-safety implications)",
    "years": {
      "psi_investigation_dates": "1999-01-14 to 2025-04-30",
      "operations": "ISS test days 2019 (normal flames, test IDs 19xxx) and 2021 (inverse flames, 21xxx); ISS Increments 59-60 and 66"
    },
    "platform": "ISS, Combustion Integrated Rack (CIR)",
    "hardware": "ACME chamber insert; porous spherical burners (6.35-12.7 mm dia family); thermocouple rakes",
    "fuel_sample": "Gaseous ethylene (and propane, one day) with N2 dilution; normal (fuel out) and inverse (oxidizer out) spherical diffusion flames",
    "atmosphere": {
      "o2": "Normal flames ambient XO2 0.198-0.40; inverse flames burner-supply XO2 0.21-0.85",
      "pressure": "~0.99-1.31 atm (normal), ~0.43-3.0 atm (inverse)"
    },
    "flow": "Quiescent ambient; burner total flow 0.6-12.2 mg/s",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "ACME HD color camera",
      "thermocouple rakes",
      "thin-filament pyrometry",
      "photomultiplier tubes (OH*, CH*)",
      "radiometers",
      "HiBMs camera (soot volume fraction)"
    ],
    "psi_data": {
      "total_size_gb": 2180.44,
      "n_files": 3807,
      "file_types": "1184 ZIP (2103.85 GB), 993 TXT, 636 CSV (1.249 GB), 490 MDIPSUG (0.109 GB), 317 TS (75.056 GB), 76 PDF (0.125 GB), 66 ASC (0.031 GB), 35 LOG (0.012 GB), 5 JPG, 2 XLSX, 2 PNG, 1 ERRORS",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Richard Axelbaum (Washington University in St. Louis); Co-Is Peter Sunderland (UMD), David Urban (GRC)",
    "key_finding": "Across ambient O2 0.2-0.38, fuel fraction 0.13-1 and 0.6-12.2 mg/s, all ethylene spherical flames reached radiative extinction at a critical temperature of 1130 K (fuel mass flux 0.2 g/m2-s normal; O2 mass flux 0.68 g/m2-s inverse).",
    "key_finding_source": "Irace et al. 2023 abstract reproduced in ACME/Flame Design Final Report (PSI-10)",
    "key_papers": [
      {
        "citation": "Irace P.H., Waddell K.A., Constales D., Sunderland P.B., Axelbaum R.L., et al. (2023). Critical temperature and reactant mass flux for radiative extinction of ethylene microgravity spherical diffusion flames at 1 bar. Proceedings of the Combustion Institute 39.",
        "doi": "10.1016/j.proci.2022.07.043",
        "doi_verified": true
      },
      {
        "citation": "Irace P.H., Lee H.J., Waddell K., Tan L., Stocker D.P., Sunderland P.B., et al. (2021). Observations of long duration microgravity spherical diffusion flames aboard the International Space Station. Combustion and Flame 229.",
        "doi": "10.1016/j.combustflame.2021.02.019",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 3,
        "why": "A single extinction temperature (1130 K) is a usable model input for cabin fire predictions; gaseous fuel, not materials."
      },
      "iss": {
        "score": 3,
        "why": "Same as cabin."
      },
      "lunar_base": {
        "score": 3,
        "why": "Tests up to 40% ambient O2 overlap the lunar atmosphere range; still a burner, not a material."
      },
      "mars_base": {
        "score": 3,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 3,
        "why": "As lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 15,
    "notes_unverified": [
      "Pressure ranges are from PSI table 'pmean' columns."
    ]
  },
  {
    "overall_rank": 11,
    "accession": "PSI-47",
    "acronym": "DAFT / DAFT-2",
    "full_name": "Dust and Aerosol Measurement Feasibility Test / DAFT-2",
    "psi_doi": "10.60555/ztgj-d202",
    "psi_url": "https://doi.org/10.60555/ztgj-d202",
    "investigation_type": "ISS flight",
    "research_subarea": "Spacecraft Fire Safety",
    "fire_safety_theme": "detection (instrument validation for SAME)",
    "years": {
      "psi_investigation_dates": "2003-03-01 to 2009-06-01",
      "operations": "DAFT sessions D1 and D2: GMT 054 and 063, 2005 (PSI table); DAFT-2 dates not found"
    },
    "platform": "ISS (EXPRESS rack 4, Node 1 locations)",
    "hardware": "Modified TSI P-Trak (alcohol wick) and TSI DustTrak, DAFT impactor",
    "fuel_sample": "No combustion: Arizona Road Dust (ARD Fine) dispersed with ISS GN2; ambient ISS air sampled",
    "atmosphere": {
      "o2": "ISS cabin air",
      "pressure": "ISS cabin ambient"
    },
    "flow": "Instrument sampling flow only",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "P-Trak particle counter (pt/cc)",
      "DustTrak mass concentration (mg/m3)",
      "impactor removing particles >2.5 micrometers"
    ],
    "psi_data": {
      "total_size_gb": 0.04,
      "n_files": 33,
      "file_types": "12 XLS, 7 PDF, 6 TXT, 3 PPT (0.022 GB), 2 DOC (0.014 GB), 1 ZIP, 1 JPG, 1 CSV",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "David Urban (NASA GRC)",
    "key_finding": "Showed the gravity-dependent P-Trak could be used in orbit (risk reduction for SAME); the sample aerosol contained more large particles than on Earth and particle build-up in the optics was suspected; early results gave the first measurements of ISS ambient aerosol, which was very low.",
    "key_finding_source": "DAFT 30-Day Post-Flight Report (PSI-47); Urban et al. 2005 SAE abstract (OpenAlex)",
    "key_papers": [
      {
        "citation": "Urban D.L., Griffin D.W., Ruff G.A., Cleary T., Yang J., Mulholland G., et al. (2005). Detection of Smoke from Microgravity Fires. SAE Technical Paper 2005-01-2930.",
        "doi": "10.4271/2005-01-2930",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 3,
        "why": "Instrument feasibility, not fire data; supports detector design indirectly."
      },
      "iss": {
        "score": 3,
        "why": "Validated a particle counter for ISS use and measured ISS background aerosol."
      },
      "lunar_base": {
        "score": 3,
        "why": "Dust-vs-smoke discrimination matters with lunar regolith (inference), but test used micro-g dust only."
      },
      "mars_base": {
        "score": 3,
        "why": "As lunar (Martian dust)."
      },
      "pressurized_rover": {
        "score": 3,
        "why": "Same dust-nuisance argument for a rover cabin."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 15,
    "notes_unverified": [
      "Numeric P-Trak results were not extracted; electronic data collection was limited per the report."
    ]
  },
  {
    "overall_rank": 12,
    "accession": "PSI-115",
    "acronym": "",
    "full_name": "Utilization of the Smoke Aerosol Measurement Experiment Data for Advanced Modeling and Simulation of Smoke Generation in Micro-Gravity",
    "psi_doi": "10.60555/q0v5-1v28",
    "psi_url": "https://doi.org/10.60555/q0v5-1v28",
    "investigation_type": "Ground (PSI data-use grant, simulation)",
    "research_subarea": "Smoke Aerosol, Combustion Simulation",
    "fire_safety_theme": "detection (smoke growth modeling)",
    "years": {
      "psi_investigation_dates": "2017-01-30 to 2019-12-31",
      "operations": "n/a"
    },
    "platform": "Ground / computation",
    "hardware": "n/a",
    "fuel_sample": "Dibutyl phthalate surrogate vapor from a heated source",
    "atmosphere": {
      "o2": "air",
      "pressure": "not stated"
    },
    "flow": "Inlet velocity 0.08 and 0.10 m/s",
    "gravity": "Earth gravity and microgravity cases (simulated)",
    "diagnostics": [
      "simulation outputs (.dat) for figures"
    ],
    "psi_data": {
      "total_size_gb": 0.26,
      "n_files": 47,
      "file_types": "44 DAT (0.254 GB), 2 PDF (0.011 GB), 1 ZIP",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Sean Garrick (University of Illinois per PSI record)",
    "key_finding": "In Earth gravity, settling capped smoke particles at ~40 micrometers (mode ~5 micrometers); without buoyancy or settling the microgravity plume was symmetric and held very large particles (>40 micrometers), with a bimodal distribution behind the heated source.",
    "key_finding_source": "PSI-115 Final Report NNX17AF08A executive summary",
    "key_papers": [
      {
        "citation": "No journal paper listed in PSI; final report NNX17AF08A in PSI-115.",
        "doi": "",
        "doi_verified": false,
        "note": "UNVERIFIED: no DOI"
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 3,
        "why": "Predicts smoke size that cabin detectors see."
      },
      "iss": {
        "score": 3,
        "why": "Built on ISS SAME data."
      },
      "lunar_base": {
        "score": 3,
        "why": "Simulates both 1 g and 0 g, bracketing lunar settling (inference)."
      },
      "mars_base": {
        "score": 3,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 3,
        "why": "As lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 15,
    "notes_unverified": []
  },
  {
    "overall_rank": 13,
    "accession": "PSI-22",
    "acronym": "ACME E-FIELD Flames",
    "full_name": "Advanced Combustion via Microgravity Experiments / Electric-Field Effects on Laminar Diffusion Flames",
    "psi_doi": "10.60555/se5a-8c73",
    "psi_url": "https://doi.org/10.60555/se5a-8c73",
    "investigation_type": "ISS flight",
    "research_subarea": "Laminar Flames",
    "fire_safety_theme": "fundamental (ion-driven flow as a buoyancy surrogate)",
    "years": {
      "psi_investigation_dates": "2016-11-18 to 2020-11-17",
      "operations": "ISS March-November 2018 (Increments 55-57)"
    },
    "platform": "ISS, Combustion Integrated Rack (CIR)",
    "hardware": "ACME insert; coflow burner and gas-jet burner; copper mesh electrode 37 mm above burner; high-voltage supply",
    "fuel_sample": "Gaseous CH4 and C2H4, pure or N2-diluted (25-100% fuel)",
    "atmosphere": {
      "o2": "air (~21%)",
      "pressure": "~100 kPa"
    },
    "flow": "Coflow air (e.g., 3.1 cm/s) or none; fuel 15-19 cm/s examples",
    "gravity": "microgravity (ISS); electric field used to drive ion wind",
    "diagnostics": [
      "ion current and applied voltage",
      "flame broadband luminosity",
      "CH* luminosity",
      "OH* and visible imaging",
      "ACME color camera"
    ],
    "psi_data": {
      "total_size_gb": 950.21,
      "n_files": 2590,
      "file_types": "907 ZIP (935.828 GB), 650 TXT, 410 CSV (1.52 GB), 222 MP4 (12.574 GB), 198 MDIPSUG (0.053 GB), 85 METADATA (0.022 GB), 57 PDF (0.178 GB), 52 LOG (0.014 GB), 4 JPG, 2 ERRORS (0.011 GB), 2 XLSX, 1 PNG",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Derek Dunn-Rankin (UC Irvine); Technical POC Alice Chien",
    "key_finding": "In microgravity the voltage-current curve has a distinct peak ion current at the most compact flame instead of the 1-g saturation plateau; very weak flames that would quench were stabilized by small fields. Voltage sweeps went to at least -7 kV with the mesh 37 mm from the burner.",
    "key_finding_source": "ACME/E-FIELD Flames Final Report (PSI-22) 'Surprises' and results sections",
    "key_papers": [
      {
        "citation": "Chien Y.-C., Stocker D., Hegde U., Dunn-Rankin D. (2022). Electric-field effects on methane coflow flames aboard the international space station (ISS): ACME E-FIELD flames. Combustion and Flame 246.",
        "doi": "10.1016/j.combustflame.2022.112443",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 2,
        "why": "Not a fire-safety study (PSI impact statement says so)."
      },
      "iss": {
        "score": 2,
        "why": "As cabin."
      },
      "lunar_base": {
        "score": 3,
        "why": "The challenge notes it mimicked partial gravity via ion wind, the only PSI handle on intermediate-g flow."
      },
      "mars_base": {
        "score": 3,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 3,
        "why": "Rovers operate in partial g; same argument as lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 13,
    "notes_unverified": []
  },
  {
    "overall_rank": 14,
    "accession": "PSI-62",
    "acronym": "",
    "full_name": "Concurrent Flame Spread Modeling using Flamelet Generated Manifolds in Microgravity with Comparison to BASS Experiments using Two-Color Tomography",
    "psi_doi": "10.60555/e9xp-ex83",
    "psi_url": "https://doi.org/10.60555/e9xp-ex83",
    "investigation_type": "Ground (PSI data-use grant, modeling)",
    "research_subarea": "Spacecraft Fire Safety",
    "fire_safety_theme": "prevention (predictive flammability modeling)",
    "years": {
      "psi_investigation_dates": "2019-05-01 to 2021-04-30",
      "operations": "n/a (ground/computational)"
    },
    "platform": "Ground / computation",
    "hardware": "n/a",
    "fuel_sample": "Modeled solid fuels (concurrent flame spread, compared to BASS data)",
    "atmosphere": {
      "o2": "as in BASS comparisons",
      "pressure": "as in BASS comparisons"
    },
    "flow": "Concurrent low-speed flow (modeled)",
    "gravity": "microgravity (modeled)",
    "diagnostics": [
      "two-color pyrometry / tomography of BASS images (per title)"
    ],
    "psi_data": {
      "total_size_gb": 0.0,
      "n_files": 1,
      "file_types": "1 ZIP",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Paul DesJardin (University at Buffalo); Project Scientist David Urban",
    "key_finding": "Developed an unsteady radiative flamelet-generated-manifold model for solid-fuel flame spread in microgravity, aimed at screening material flammability limits. No headline number verified.",
    "key_finding_source": "PSI-62 metadata objective/impact",
    "key_papers": [
      {
        "citation": "Budzinski K., DesJardin P.E. (2023). Radiative flamelet generated manifolds for solid fuel flame spread in microgravity. Combustion and Flame 256.",
        "doi": "10.1016/j.combustflame.2023.112939",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 3,
        "why": "Model meant to screen cabin materials' flammability."
      },
      "iss": {
        "score": 3,
        "why": "Validated against ISS BASS data."
      },
      "lunar_base": {
        "score": 2,
        "why": "Micro-g only; could be extended to partial g (inference)."
      },
      "mars_base": {
        "score": 2,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 2,
        "why": "As lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 12,
    "notes_unverified": [
      "PSI holds only a metadata zip (0 data files)."
    ]
  },
  {
    "overall_rank": 15,
    "accession": "PSI-107",
    "acronym": "SPICE",
    "full_name": "Smoke Point In Co-flow Experiment",
    "psi_doi": "10.60555/9kbh-e962",
    "psi_url": "https://doi.org/10.60555/9kbh-e962",
    "investigation_type": "ISS flight",
    "research_subarea": "Fire Safety",
    "fire_safety_theme": "fundamental (soot / smoke point; flame radiation)",
    "years": {
      "psi_investigation_dates": "not given in PSI record",
      "operations": "ISS, twelve sessions from 2009-02-14 (final report); 469 flames in PSI table"
    },
    "platform": "ISS, Microgravity Science Glovebox (MSG)",
    "hardware": "SPICE fan-driven flow duct (later reused by BASS/BASS-II), nozzles 0.41, 0.76, 1.6 mm",
    "fuel_sample": "Gaseous ethylene, propane, propylene, 50% and 75% propylene/N2, methane",
    "atmosphere": {
      "o2": "MSG air, 21 +/- 1%",
      "pressure": "~101 kPa"
    },
    "flow": "Coflow air 5.4-65 cm/s at smoke points (table range up to ~85 cm/s)",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "Nikon D100 12-bit color still camera (3008 x 2000)",
      "analog color video (downlinked)",
      "mass flow meter",
      "hot-wire igniter"
    ],
    "psi_data": {
      "total_size_gb": 6.95,
      "n_files": 188,
      "file_types": "101 ZIP (3.55 GB), 27 XLS (0.024 GB), 18 PDF (0.016 GB), 18 MP4 (1.165 GB), 9 PPT (0.948 GB), 6 XLSX, 2 PPTX, 2 TXT, 1 DOC, 1 DOCX, 1 NEF (0.011 GB), 1 AVI (1.229 GB), 1 CSV",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "David Urban (NASA GRC); Co-I Peter Sunderland (UMD)",
    "key_finding": "Fifty-two laminar smoke points were measured; smoke-point length scaled as d^-0.91 u_air^0.41, so smaller burners or faster coflow gave longer smoke points, and ethylene and propane swapped sooting rank relative to 1 g.",
    "key_finding_source": "SPICE Final Report (PSI-107) abstract and conclusions",
    "key_papers": [
      {
        "citation": "Dotson K.T., Sunderland P.B., Yuan Z.-G., Urban D.L. (2011). Laminar smoke points of coflowing flames in microgravity. Fire Safety Journal 46.",
        "doi": "10.1016/j.firesaf.2011.08.002",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 3,
        "why": "Smoke points correlate with flame radiation and soot, inputs to fire-growth and detection models."
      },
      "iss": {
        "score": 3,
        "why": "Same hardware family as ISS fire tests."
      },
      "lunar_base": {
        "score": 2,
        "why": "Air at ~1 atm only."
      },
      "mars_base": {
        "score": 2,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 2,
        "why": "As lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 12,
    "notes_unverified": []
  },
  {
    "overall_rank": 16,
    "accession": "PSI-23",
    "acronym": "ACME s-Flame",
    "full_name": "Advanced Combustion via Microgravity Experiments - Structure and Response of Spherical Diffusion Flames",
    "psi_doi": "10.60555/k57n-p030",
    "psi_url": "https://doi.org/10.60555/k57n-p030",
    "investigation_type": "ISS flight",
    "research_subarea": "Flames of gaseous fuels",
    "fire_safety_theme": "fundamental (radiative and kinetic extinction)",
    "years": {
      "psi_investigation_dates": "2015-02-05 to 2019-11-24",
      "operations": "ISS 18 test days, 2019-09-11 to 2020-07-08 (PSI table)"
    },
    "platform": "ISS, Combustion Integrated Rack (CIR)",
    "hardware": "ACME insert; porous spherical burner",
    "fuel_sample": "Gaseous H2, CH4, H2/CH4 mixtures, C2H4, diluted with N2 or He",
    "atmosphere": {
      "o2": "~21% and ~30% O2 with N2 or He",
      "pressure": "~1 atm (rises and O2 drops with vitiation, per PSI table note)"
    },
    "flow": "Quiescent ambient; ramped fuel flow",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "two intensified cameras (opposite views)",
      "PMTs for OH* (310 nm) and CH*",
      "radiometers",
      "thermocouples",
      "ACME data camera",
      "LLL-UV and HiBMs cameras"
    ],
    "psi_data": {
      "total_size_gb": 782.17,
      "n_files": 4165,
      "file_types": "2038 ZIP (771.58 GB), 963 TXT, 577 CSV (0.773 GB), 290 MP4 (9.605 GB), 170 ASC (0.079 GB), 68 LOG (0.021 GB), 38 PDF (0.11 GB), 16 MDIPSUG, 2 NEXT, 2 XLSX, 1 SFK",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Chung K. Law (Princeton); Co-I Stephen Tse (Rutgers)",
    "key_finding": "Radiative extinction turned out to be common on ISS (predicted but not previously observed for these conditions); N2-diluted CH4 and C2H4 flames showed kinetic extinction at low flow and radiative extinction at high flow, and ethylene flames did not soot in microgravity. 18 test days at ~21% and ~30% O2.",
    "key_finding_source": "ACME s-Flame Final Report 2021 (PSI-23) 'Surprises and New Discoveries'",
    "key_papers": [
      {
        "citation": "No ISS-results journal paper with DOI found in the PSI publication list; use the PSI-23 final report.",
        "doi": "",
        "doi_verified": false,
        "note": "UNVERIFIED: key results paper not identified"
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 2,
        "why": "Extinction physics useful for models; gaseous burner, not materials."
      },
      "iss": {
        "score": 2,
        "why": "As cabin."
      },
      "lunar_base": {
        "score": 2,
        "why": "Includes ~30% O2 tests, near lunar atmosphere O2; fundamental only."
      },
      "mars_base": {
        "score": 2,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 2,
        "why": "As lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 10,
    "notes_unverified": [
      "Key results paper missing."
    ]
  },
  {
    "overall_rank": 17,
    "accession": "PSI-39",
    "acronym": "CFI",
    "full_name": "Cool Flames Investigation",
    "psi_doi": "10.60555/m6pj-a914",
    "psi_url": "https://doi.org/10.60555/m6pj-a914",
    "investigation_type": "ISS flight",
    "research_subarea": "Droplets",
    "fire_safety_theme": "fundamental (cool-flame droplet burning and extinction)",
    "years": {
      "psi_investigation_dates": "2020-10-01 to 2021-10-20",
      "operations": "ISS tests March-July 2017 (87 rows, PSI table)"
    },
    "platform": "ISS, Combustion Integrated Rack (CIR)",
    "hardware": "Multi-user Droplet Combustion Apparatus (MDCA); optional 40-micron SiC tether fiber",
    "fuel_sample": "n-dodecane and n-dodecane/iso-dodecane (60/40, 75/25) droplets; farnesane also studied",
    "atmosphere": {
      "o2": "0.17-0.21 O2 mole fraction; He 0-0.59, N2 balance",
      "pressure": "0.5-5 atm"
    },
    "flow": "Quiescent",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "backlit black-and-white camera (5 x 5 cm FOV, droplet size)",
      "UV OH* camera (flame size)",
      "color video",
      "radiometers (broadband and narrow band)"
    ],
    "psi_data": {
      "total_size_gb": 718.89,
      "n_files": 2812,
      "file_types": "1776 TXT (0.176 GB), 338 ZIP (588.914 GB), 234 META, 126 MP4 (18.878 GB), 120 TS (109.834 GB), 116 METADATA (0.032 GB), 48 PDF (0.04 GB), 29 PXP (0.975 GB), 22 RTF (0.032 GB), 1 PPTX, 1 XLSX, 1 CSV",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Forman Williams (UC San Diego); Co-Is Frederick Dryer, Tanvir Farouk, Vedha Nayagam",
    "key_finding": "Cool-flame burning data (regression rate, hot/cool flame diameters, extinction, radiant emission) for n-dodecane and mixtures across 0.5-5 atm and up to 59% He; analysis showed simplified cool-flame chemistry deteriorates with increasing pressure in predicting extinction diameters.",
    "key_finding_source": "CFI Science Final Report (PSI-39); Williams & Nayagam 2020 abstract (Semantic Scholar); conditions from PSI table",
    "key_papers": [
      {
        "citation": "Dietrich D.L., Krause, Nayagam V., Farouk T., Dryer F.L., Williams F.A., et al. (2024). Low Temperature n-Dodecane Droplet Combustion Experiments Aboard the International Space Station. Microgravity Science and Technology 36.",
        "doi": "10.1007/s12217-024-10115-x",
        "doi_verified": true,
        "note": "abstract not retrievable"
      },
      {
        "citation": "Williams F.A., Nayagam V. (2020). Cool-flame dodecane-droplet extinction diameters. Combustion and Flame 212.",
        "doi": "10.1016/j.combustflame.2019.10.036",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 2,
        "why": "Invisible cool-flame burning is a detection caveat; otherwise fundamental fuel science."
      },
      "iss": {
        "score": 2,
        "why": "As cabin."
      },
      "lunar_base": {
        "score": 2,
        "why": "Pressures down to 0.5 atm overlap reduced-pressure habitats, but O2 <= 21%."
      },
      "mars_base": {
        "score": 2,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 2,
        "why": "As lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 10,
    "notes_unverified": [
      "PSI investigation dates (2020-2021) postdate the 2017 test dates; likely grant period.",
      "No single headline number verified from the 2024 paper."
    ]
  },
  {
    "overall_rank": 18,
    "accession": "PSI-60",
    "acronym": "",
    "full_name": "Computational and Experimental Analysis of SPICE Data Sets",
    "psi_doi": "10.60555/mzjm-yv57",
    "psi_url": "https://doi.org/10.60555/mzjm-yv57",
    "investigation_type": "Ground (PSI data-use grant)",
    "research_subarea": "Gaseous",
    "fire_safety_theme": "fundamental (soot formation 1 g vs 0 g)",
    "years": {
      "psi_investigation_dates": "2019-06-05 to 2022-08-29",
      "operations": "n/a"
    },
    "platform": "Ground / computation + SPICE images",
    "hardware": "n/a",
    "fuel_sample": "SPICE gaseous jet flames (ethylene etc.)",
    "atmosphere": {
      "o2": "air",
      "pressure": "~1 atm"
    },
    "flow": "as SPICE coflow",
    "gravity": "0 g data vs 1 g",
    "diagnostics": [
      "analysis of >1600 raw SPICE DSLR images (pyrometry, soot volume fraction)"
    ],
    "psi_data": {
      "total_size_gb": 0.0,
      "n_files": 1,
      "file_types": "1 ZIP",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Mitchell Smooke (Yale); Co-I Marshall Long",
    "key_finding": "Analyzed over 1600 raw SPICE DSLR images with soot models; simulations agreed that 0-g flames are longer, cooler and sootier, and pointed to inadequate thermal-field prediction as the main model gap.",
    "key_finding_source": "PSI-60 metadata objective; Dobbins et al. 2022 abstract (OpenAlex)",
    "key_papers": [
      {
        "citation": "Dobbins R.R., et al. (2022). A Combined Experimental and Computational Study of Soot Formation in Normal and Microgravity Conditions. Combustion Science and Technology 195.",
        "doi": "10.1080/00102202.2022.2041621",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 2,
        "why": "Soot model improvements, indirect for fire safety."
      },
      "iss": {
        "score": 2,
        "why": "As cabin."
      },
      "lunar_base": {
        "score": 2,
        "why": "Compares 1 g and 0 g, a bounding pair (inference)."
      },
      "mars_base": {
        "score": 2,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 2,
        "why": "As lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 10,
    "notes_unverified": [
      "PSI holds only a metadata zip."
    ]
  },
  {
    "overall_rank": 19,
    "accession": "PSI-68",
    "acronym": "FLEX-2",
    "full_name": "Flame Extinguishment Experiment - 2",
    "psi_doi": "10.60555/byp8-h018",
    "psi_url": "https://doi.org/10.60555/byp8-h018",
    "investigation_type": "ISS flight",
    "research_subarea": "Spacecraft Fire Safety",
    "fire_safety_theme": "fundamental droplet combustion (fuel mixtures, surrogates, convection, arrays)",
    "years": {
      "psi_investigation_dates": "2016-08-12 to 2019-09-30",
      "operations": "ISS test years UNVERIFIED (not in PSI table)"
    },
    "platform": "ISS, Combustion Integrated Rack (CIR)",
    "hardware": "Multi-user Droplet Combustion Apparatus (MDCA)",
    "fuel_sample": "Droplets 1.5-5 mm: isooctane, n-octane, heptane, decane, ethanol, propanol/glycerol, heptane/isooctane, decane/hexanol",
    "atmosphere": {
      "o2": "0.17, 0.21, 0.25, 0.30 O2 mole fraction in N2 or He",
      "pressure": "0.5-3.0 atm"
    },
    "flow": "0.1-5 cm/s (convective-effects tests)",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "CIR LLL-UV camera (OH*)",
      "MDCA color camera",
      "CIR HiBMs backlit cameras",
      "LCTF soot volume fraction/temperature",
      "radiometers"
    ],
    "psi_data": {
      "total_size_gb": 1224.75,
      "n_files": 10156,
      "file_types": "7925 TXT (0.527 GB), 2120 ZIP (1224.21 GB), 89 DOCX, 9 PDF, 6 JPG, 4 LOG, 1 CSV, 1 PPT, 1 XLSX",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Forman Williams (UC San Diego); Co-Is Avedisian, Choi, Dryer, Nayagam, Shaw, Dietrich",
    "key_finding": "Large 50/50 decane/hexanol droplets at 0.05-0.30 MPa showed sustained cool-flame burning after radiative extinction at >=0.10 MPa; at 0.20 MPa the hot flame spontaneously re-ignited, and at ~0.30 MPa the droplet burned to completion on the cool flame.",
    "key_finding_source": "Dietrich et al. 2016 abstract (OpenAlex)",
    "key_papers": [
      {
        "citation": "Dietrich D.L., Calabria R., Massoli P., Nayagam V., Williams F.A. (2016). Experimental Observations of the Low-Temperature Burning of Decane/Hexanol Droplets in Microgravity. Combustion Science and Technology 189.",
        "doi": "10.1080/00102202.2016.1225730",
        "doi_verified": true
      },
      {
        "citation": "Nayagam V., Dietrich D.L., Hicks M.C., Williams F.A. (2018). Radiative extinction of large n-alkane droplets in oxygen-inert mixtures in microgravity. Combustion and Flame 194.",
        "doi": "10.1016/j.combustflame.2018.04.023",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 2,
        "why": "Spontaneous hot-flame re-ignition after apparent extinction is a safety caveat; mostly fundamental."
      },
      "iss": {
        "score": 2,
        "why": "As cabin."
      },
      "lunar_base": {
        "score": 2,
        "why": "O2 up to 0.30 and 0.5 atm overlap exploration atmospheres; liquid droplets only."
      },
      "mars_base": {
        "score": 2,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 2,
        "why": "As lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 10,
    "notes_unverified": [
      "Operations years not confirmed.",
      "PSI file-search lists 10,156 files but PSI metadata 'added' shows only the CSV; inventory taken from file-search."
    ]
  },
  {
    "overall_rank": 20,
    "accession": "PSI-159",
    "acronym": "ACME CFI-G",
    "full_name": "Advanced Combustion via Microgravity Experiments / Cool Flames Investigation with Gases",
    "psi_doi": "10.60555/cyt1-kh64",
    "psi_url": "https://doi.org/10.60555/cyt1-kh64",
    "investigation_type": "ISS flight",
    "research_subarea": "Flames of Gaseous Fuels",
    "fire_safety_theme": "fundamental (cool flames; highest-O2 microgravity tests in PSI)",
    "years": {
      "psi_investigation_dates": "not given in PSI record",
      "operations": "ISS 2021 (test IDs 21088-21291; extra day 2021-10-18 per final report)"
    },
    "platform": "ISS, Combustion Integrated Rack (CIR)",
    "hardware": "ACME insert; porous spherical burner; long and short thermocouple rakes",
    "fuel_sample": "Gaseous ethane, propane, n-butane (n-pentane replaced by ethane), pure or N2-diluted, normal and inverse spherical flames",
    "atmosphere": {
      "o2": "Normal: ambient XO2 0.18-0.40; inverse: burner XO2 0.12-0.85",
      "pressure": "~0.5-3.3 bar"
    },
    "flow": "Quiescent ambient; hydrocarbon flow 0.25-2.5 mg/s",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "intensified video camera",
      "radiometers",
      "thermocouples (incl. type B)",
      "ACME color camera"
    ],
    "psi_data": {
      "total_size_gb": 2085.59,
      "n_files": 3756,
      "file_types": "1022 TXT, 987 ZIP (2002.1 GB), 680 CSV (1.469 GB), 610 MDIPSUG (0.146 GB), 336 TS (81.697 GB), 93 PDF (0.148 GB), 22 LOG, 1 XLSX, 1 ERRORS, 1 MP4 (0.021 GB), 1 NEXT, 1 PNG, 1 JPG",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Peter Sunderland (University of Maryland); Co-Is Richard Axelbaum, Forman Williams",
    "key_finding": "Spherical gas-fueled cool diffusion flames were observed for the first time, but only for normal n-butane flames at 2 bar and ambient XO2 0.39; the hot flames that spawned them were 2.6 times larger, and the cool flames sat near mixture fraction 0.53.",
    "key_finding_source": "Kim et al. 2023 abstract reproduced in ACME/CFI-G Final Report (PSI-159)",
    "key_papers": [
      {
        "citation": "Kim M., Waddell K.A., Sunderland P.B., Nayagam V., Stocker D.P., Dietrich D.L., et al. (2023). Spherical gas-fueled cool diffusion flames. Proceedings of the Combustion Institute 39.",
        "doi": "10.1016/j.proci.2022.07.015",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 2,
        "why": "Fundamental engine-chemistry study; little direct cabin application."
      },
      "iss": {
        "score": 2,
        "why": "As cabin."
      },
      "lunar_base": {
        "score": 2,
        "why": "Contains the highest-O2 microgravity data in PSI (up to 85% O2, inverse flames), useful context for enriched atmospheres but not material flammability."
      },
      "mars_base": {
        "score": 2,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 2,
        "why": "As lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 10,
    "notes_unverified": []
  },
  {
    "overall_rank": 21,
    "accession": "PSI-21",
    "acronym": "ACME CLD Flame",
    "full_name": "Advanced Combustion via Microgravity Experiments / Coflow Laminar Diffusion Flame",
    "psi_doi": "10.60555/23e1-9950",
    "psi_url": "https://doi.org/10.60555/23e1-9950",
    "investigation_type": "ISS flight",
    "research_subarea": "Flames of gaseous fuel",
    "fire_safety_theme": "fundamental (soot, extinction of weak diffusion flames)",
    "years": {
      "psi_investigation_dates": "2006-10-01 to 2022-05-31",
      "operations": "ISS 32 test days, 2017 to 2021 (test days 17319-21062 in PSI table)"
    },
    "platform": "ISS, Combustion Integrated Rack (CIR)",
    "hardware": "ACME insert; coflow burner",
    "fuel_sample": "Gaseous CH4 and C2H4, N2-diluted (fuel 15-100%)",
    "atmosphere": {
      "o2": "air coflow (~21%; not tabulated)",
      "pressure": "not tabulated"
    },
    "flow": "Coflow air; fuel and N2 via mass-flow controllers (0.02-0.2 full-scale)",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "color digital camera (soot and thin-filament pyrometry)",
      "CH* chemiluminescence",
      "ACME cameras"
    ],
    "psi_data": {
      "total_size_gb": 2005.54,
      "n_files": null,
      "file_types": "",
      "source": "PSI metadata totalFileSize only; file-search endpoint returned HTTP 500 on 2026-11-14 (n_files/file types UNVERIFIED)"
    },
    "pi": "Marshall Long (Yale); Co-I Mitchell Smooke (Yale)",
    "key_finding": "At 0 g coflow ethylene flames were longer, broader and cooler, with more soot and longer residence time than at 1 g, but these effects were much smaller for the small ACME burner flame. Dataset: 32 ISS test days (2017-2021).",
    "key_finding_source": "Dobbins et al. 2022 abstract (OpenAlex); PSI-21 experimental table",
    "key_papers": [
      {
        "citation": "Dobbins R.R., Tinjero J., Squeo J., Zhao M., Hall R.J., Colket M.B., et al. (2022). A Combined Experimental and Computational Study of Soot Formation in Normal and Microgravity Conditions. Combustion Science and Technology 195.",
        "doi": "10.1080/00102202.2022.2041621",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 2,
        "why": "Soot and radiation data feed fire models indirectly."
      },
      "iss": {
        "score": 2,
        "why": "As cabin."
      },
      "lunar_base": {
        "score": 1,
        "why": "No atmosphere or gravity overlap with a lunar base."
      },
      "mars_base": {
        "score": 1,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 1,
        "why": "As lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 7,
    "notes_unverified": [
      "Atmosphere and pressure are not in the PSI table.",
      "No headline numeric result verified beyond test counts."
    ]
  },
  {
    "overall_rank": 22,
    "accession": "PSI-106",
    "acronym": "SLICE",
    "full_name": "Structure and Liftoff In Combustion Experiment",
    "psi_doi": "10.60555/pm12-rg61",
    "psi_url": "https://doi.org/10.60555/pm12-rg61",
    "investigation_type": "ISS flight",
    "research_subarea": "(blank in PSI)",
    "fire_safety_theme": "fundamental (flame structure, liftoff, soot)",
    "years": {
      "psi_investigation_dates": "not given in PSI record",
      "operations": "ISS 12 test days, 2012-02-09 to 2012-03-23 (PSI table)"
    },
    "platform": "ISS, Microgravity Science Glovebox (MSG)",
    "hardware": "SPICE flow duct and coflow burners (per challenge statement: MSG + SPICE duct)",
    "fuel_sample": "Gaseous CH4 (40-100%, N2 balance), C2H4 (20% and 100%), C2H6",
    "atmosphere": {
      "o2": "MSG air (~21%)",
      "pressure": "ISS ambient"
    },
    "flow": "Fuel inlet velocity 23-90 cm/s (CH4 flames, NTRS 20150002322); coflow air",
    "gravity": "microgravity (ISS)",
    "diagnostics": [
      "digital color camera (flame shape, soot temperature)",
      "pyrometry calibration tests"
    ],
    "psi_data": {
      "total_size_gb": 72.91,
      "n_files": null,
      "file_types": "",
      "source": "PSI metadata totalFileSize only; file-search endpoint returned HTTP 500 on 2026-11-14 (n_files/file types UNVERIFIED)"
    },
    "pi": "Marshall Long (Yale); Co-Is Mitchell Smooke (Yale), Fumiaki Takahashi (Case Western)",
    "key_finding": "For CH4 fuel fractions 0.4-1.0 and inlet velocities 23-90 cm/s, luminous flame length scaled with fuel mass flow and nonbuoyant flames were noticeably longer than at 1 g; fuel dilution and inlet velocity were secondary.",
    "key_finding_source": "Cao et al., NTRS 20150002322 abstract (conference version of Proc. Combust. Inst. 35 paper)",
    "key_papers": [
      {
        "citation": "Cao S., Ma B., Bennett B.A.V., Giassi D., Stocker D.P., Takahashi F., et al. (2015). A computational and experimental study of coflow laminar methane/air diffusion flames: Effects of fuel dilution, inlet velocity, and gravity. Proceedings of the Combustion Institute 35.",
        "doi": "10.1016/j.proci.2014.05.138",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 2,
        "why": "Flame stability insight; gaseous jets, not cabin materials."
      },
      "iss": {
        "score": 2,
        "why": "As cabin."
      },
      "lunar_base": {
        "score": 1,
        "why": "No atmosphere/gravity overlap."
      },
      "mars_base": {
        "score": 1,
        "why": "As lunar."
      },
      "pressurized_rover": {
        "score": 1,
        "why": "As lunar."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 7,
    "notes_unverified": [
      "PSI file-search endpoint returned HTTP 500; file inventory from metadata only."
    ]
  },
  {
    "overall_rank": 23,
    "accession": "PSI-117",
    "acronym": "",
    "full_name": "Effect of External Thermo-Convective Perturbation on Cool Flame Dynamics: A Multidimensional Multi-Physics CFD Analysis",
    "psi_doi": "10.60555/gz0q-b577",
    "psi_url": "https://doi.org/10.60555/gz0q-b577",
    "investigation_type": "Ground (PSI data-use grant, CFD)",
    "research_subarea": "Droplet",
    "fire_safety_theme": "fundamental (cool-flame stability, uses FLEX data)",
    "years": {
      "psi_investigation_dates": "2017-02-15 to 2022-02-14",
      "operations": "n/a"
    },
    "platform": "Ground / computation",
    "hardware": "n/a",
    "fuel_sample": "n-alkane droplets (FLEX data)",
    "atmosphere": {
      "o2": "as FLEX",
      "pressure": "as FLEX"
    },
    "flow": "imposed thermal/convective perturbations (modeled)",
    "gravity": "microgravity (modeled)",
    "diagnostics": [
      "CFD outputs (CSV), dissertation"
    ],
    "psi_data": {
      "total_size_gb": 0.07,
      "n_files": 16,
      "file_types": "9 CSV, 5 PDF (0.071 GB), 1 ZIP, 1 XLSX",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Tanvir Farouk (University of South Carolina)",
    "key_finding": "Mapped stability windows for droplet cool flames (ignition, oscillation, hot-ignition transition, extinction) under deliberate heating and drift-induced convection. No headline number verified.",
    "key_finding_source": "PSI-117 metadata objective",
    "key_papers": [
      {
        "citation": "Farouk T.I., Dryer F.L. (2023). Extinction characteristics of isolated n-alkane fuel droplets during low temperature cool flame burning in air. Proceedings of the Combustion Institute 39.",
        "doi": "10.1016/j.proci.2022.07.094",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 2,
        "why": "Explains re-ignition/extinction variability; indirect."
      },
      "iss": {
        "score": 2,
        "why": "As cabin."
      },
      "lunar_base": {
        "score": 1,
        "why": "No overlap."
      },
      "mars_base": {
        "score": 1,
        "why": "No overlap."
      },
      "pressurized_rover": {
        "score": 1,
        "why": "No overlap."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 7,
    "notes_unverified": []
  },
  {
    "overall_rank": 24,
    "accession": "PSI-142",
    "acronym": "",
    "full_name": "Quantitative Studies of Cool Flame Transitions at Radiation / Stretch Extinction Using Counterflow Flames",
    "psi_doi": "10.60555/80qf-vj95",
    "psi_url": "https://doi.org/10.60555/80qf-vj95",
    "investigation_type": "Ground (lab + simulation)",
    "research_subarea": "Spacecraft Fire Safety",
    "fire_safety_theme": "fundamental (hot/warm/cool flame limits, compared with FLEX)",
    "years": {
      "psi_investigation_dates": "2016-08-01 to 2021-07-31",
      "operations": "n/a"
    },
    "platform": "Ground laboratory (Princeton counterflow burner)",
    "hardware": "PI laboratory hardware",
    "fuel_sample": "n-heptane, n-decane, n-dodecane, DME with ozone sensitization",
    "atmosphere": {
      "o2": "varied",
      "pressure": "up to elevated pressure"
    },
    "flow": "counterflow (stretch-controlled)",
    "gravity": "1 g (lab)",
    "diagnostics": [
      "CH2O PLIF",
      "thermometry",
      "chemiluminescence"
    ],
    "psi_data": {
      "total_size_gb": 0.0,
      "n_files": 3,
      "file_types": "1 ZIP, 1 XLSX, 1 CSV",
      "source": "PSI API /geode-py/ws/api/investigations/files/search/<n> (2026-11-14)"
    },
    "pi": "Yiguang Ju (Princeton)",
    "key_finding": "Warm diffusion flames have a double reaction zone and mediate the cool-to-hot transition; flammable regions of warm and cool flames expand with pressure. No headline number verified.",
    "key_finding_source": "PSI-142 metadata impact statement",
    "key_papers": [
      {
        "citation": "Ju Y., Reuter C.B., Yehia O.R., Farouk T.I., Won S.H. (2019). Dynamics of cool flames. Progress in Energy and Combustion Science 75.",
        "doi": "10.1016/j.pecs.2019.100787",
        "doi_verified": true
      },
      {
        "citation": "Zhou M., Yehia O.R., Xu C., Reuter C.B., Wang Z., Yan C., et al. (2021). The radical index and the effect of oxygen concentration on non-premixed cool flame extinction of large n-alkanes. Combustion and Flame 231.",
        "doi": "10.1016/j.combustflame.2021.111471",
        "doi_verified": true
      }
    ],
    "relevance": {
      "spacecraft_cabin": {
        "score": 2,
        "why": "Explains FLEX cool-flame observations; indirect."
      },
      "iss": {
        "score": 2,
        "why": "As cabin."
      },
      "lunar_base": {
        "score": 1,
        "why": "No overlap."
      },
      "mars_base": {
        "score": 1,
        "why": "No overlap."
      },
      "pressurized_rover": {
        "score": 1,
        "why": "No overlap."
      },
      "basis": "Analyst judgment (Claude, 2026-11-14) using the rubric in psi_investigations_catalog.md; not a NASA rating."
    },
    "relevance_total": 7,
    "notes_unverified": []
  }
]
```
