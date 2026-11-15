<!-- Written with AI assistance (Claude Code) -->
# Data contracts (paste into team chat)

Source of truth: `proof/src/contracts.ts`. Check any file with `npm run validate -- <file>`. Mock examples of every file are in `data/mock/`.

**All CSVs:** UTF-8, comma-separated, header row exactly as listed and in that order (pandas: `index=False`). Dot decimals, no units or thousands separators in cells. Missing value = **empty cell** (not NaN, NA or 0). Quote text that contains commas. Real files have no `#` lines.

**1. `data/derived/spread_rates.csv`**. One row per flow segment, grouped by test, in time order.
`test_id,rod_d_mm,o2_pct,flow_cm_s,t_start_s,t_end_s,rate_mm_s,ci95_mm_s,threshold_spread_mm_s,nasa_rate_mm_s,pct_error,flame_len_mm,blue_frac,extinction_s,n_frames,notes`
- `test_id` = Table S1 sample ID (B16, B13a, C25, P17). Times are seconds since the test's first photo (EXIF).
- `rate_mm_s` is positive. `ci95_mm_s` = 95% half-width from the slope's standard error. `threshold_spread_mm_s` = half-range at threshold ±20%.
- `pct_error` = 100·(rate − nasa)/nasa, signed. Leave it empty if there's no NASA match.
- Unusable segment: keep the row, leave rate, ci95 and threshold empty, and say why in `notes`.
- Citation ID = `spread_rates:B16/2` (2nd segment of B16).

**2. `data/derived/edges/<test_id>.csv`**. `test_id,t_s,edge_mm,segment`
- One row per photo, in time order. **Overlay video frame i = row i.**
- `edge_mm`: along the rod axis from your first axis click, increasing upstream, so the slope = `rate_mm_s`. Leave it empty if there's no flame.
- `segment`: 1-based, same order as the spread_rates rows. Leave it empty outside fitted segments.

**3. `web/public/overlays/<test_id>.mp4`**. H.264, yuv420p, `-movflags +faststart`, no audio, width ≤ 1280, ≤ 15 MB, constant 10 fps, one frame per photo.

**4. `data/reference/ices2025_digitized.csv`** and **`ices2025_digitized_repeat.csv`**. `material,source,flow_cm_s,o2_pct,point_kind,extraction,page,notes`
- `material`: `pmma, p213, cotton_flaming, cotton_smolder, polycarbonate, nomex_velcro`.
- `source`: `wstf` (1-g White Sands tests) or `lunar` (1/6 g drop tower). `point_kind`: `marker` (a limit point; the fit uses these), `fit_end` (an end of the line the paper drew; never fitted), `line_end` (an end of the lunar line).
- **`lunar` rows leave `flow_cm_s` empty.** NASA says the lunar airflow is not determined, and the validator rejects a number there.
- `o2_pct` is a percentage (21 means 21%). `page` is the ICES-2025-392 page. Row numbers in `moongap.json` are 0-based data rows (comment lines and the header don't count).
- The only comment line a real file may have is the `# Written with AI assistance ...` header.

**5. `web/src/data/moongap.json`**. Schema `1.3.0`. Top level: `schema_version, input, repeat_input, caveats, warnings, paper, context_bands, reference_lines, excluded, settings, materials, ranking`.
- `materials` is keyed by material. Each has `status`: `ok`, `excluded` (with a `reason`; cotton flaming, because Fig. 9 repeats Fig. 10) or `missing`.
- An `ok` material has `fit, slope_check, zero_flow, curve, wstf_points, lunar, gap, gap_at_ref_flow`, each with `provenance: {rows, method}`.
- Slopes and `intercept_frac` are O2 **fractions**, like Table 2. Every other O2 value is in **%**.
- **Headline:** `gap.gap_pct` = `zero_flow.intercept_pct − lunar.limit_pct`. `ranking` lists the `ok` materials, largest gap first.
- `lunar` holds a level only. Draw it as a horizontal line, never a point. **No field anywhere may name a lunar or Moon airflow**; the validator refuses one.
- `slope_check.status` is `matches_table2` or `documented_discrepancy`. A discrepancy is the paper disagreeing with itself, so show it neutrally, never as "failed".
- `gap_at_ref_flow` is a secondary cross-check at the paper's **Earth** (1 g) buoyant flow; its `note` must say so.
- Every `context_bands` entry needs a `source`.
- Checked: the gap arithmetic, the curve on the fit line from 0 cm/s, the ranking order and its copied numbers, and that the excluded list matches. Unknown fields are rejected.

**6. `data/reference/link2018_table_s1.csv`**. Type it **exactly as printed**:
`sample_id,rod_d_cm,o2_pct,step,flow_cm_s,dt_s,rate_x1e3,rate_unit_printed,table_half,page,checked_by,notes`
- `step` = 1..n in table order within a sample. `rate_x1e3` = the printed V_f×10³ number.
- `rate_unit_printed` = the unit from that half's header (`cm/s` or `mm/s`). `table_half` = `left` or `right`.
- `checked_by` = initials of the second checker (required).
- **Unit trap, confirmed:** the right half's header says mm/s, but Fig. S1's slopes and our own B16 measurement only fit cm/s. Code reads both halves as cm/s (mm/s = printed × 0.01) in one function, `tableS1RateMmS()`. Don't convert by hand.
- **Status:** in place (52 rows, 19 samples). Transcribed by hand, then converted and auto-cross-checked (0 differences against a 300 dpi render). A second, independent check against the PDF text, word positions and ruled boxes found the same result (`python3 -I scripts/table-s1/crosscheck_pdf.py`).

**7. `/api/ask`**. Request: `{ "question": "1-500 chars", "mode": "summarize|rank|interpret", "subject": { "kind": "test|material", "id": "B16" } }`. `subject` is required for summarize.
- Response: `{ contract: "ask/1", mode, status: "answered|not_in_data", answer, citations, gate }`.
  - `citations`: `[{ kind: "row", id: "spread_rates:B16/2" } | { kind: "paper", id: "link2018_si", page?: 1 }]`. Row datasets: `spread_rates:<test>/<n>` and `spread_rates:ranking`, `table_s1:<sample>/<step>`, `moongap:<material>` (also `moongap:ranking`, `moongap:excluded`, `moongap:caveats`), `investigations:<PSI-n>` and `investigations:ranking-<setting>` (`spacecraft_cabin`, `iss`, `lunar_base`, `mars_base`, `pressurized_rover`, `total`), `method:<section of pipeline/METHOD.md>`, `control:<key>`. Paper IDs: `link2018, link2018_si, ices2025, bass2_results, ruff, fm2_2026, nasa_std_3001, jaxa_flare`.
  - `gate`: `{ action: "passed|flagged|removed", checked, verified, unverified, numbers: [{ text, start, end, value, unit, status, source }] }`.
  - `start`/`end` are character offsets into `answer`; they're null only for numbers the gate removed.
  - `source`: `{file,row,column,sha256}` (`row` is the 0-based data row, 0 for JSON files; a number computed from several rows, like the validation headline, adds `rows` and `derived`) or `{paper,page,quote}`. It's null when unverified.
- Rules: an answer cites at least one row or paper, and `not_in_data` cites nothing. Errors use `{ "error": { "code", "message" } }`. Examples are in `data/mock/ask/examples.json`.
- **Model:** Gemini (`gemini-3.5-flash-lite` by default; `GEMINI_MODEL` overrides it) through the Gemini API, key in `GEMINI_API_KEY`. It returns JSON (`status`, `answer`, `sources_used`) and the server turns `sources_used` into citations. One attempt per model within the function's time limit: if the model is busy or over its quota (429, 503) and at least 5 s are left, `gemini-3.1-flash-lite` gets one try, since free-tier quotas are per model.
- **No `GEMINI_API_KEY`:** the reply is a stub with `"mock": true`, a `_note`, and one fake citation (`spread_rates:STUB/1`), so the Ask panel can be built before the key exists. The stub is served only on Vercel preview and development deployments, or locally with `ASK_ALLOW_STUB=1`. Everywhere else, production included and also when `VERCEL_ENV` is missing, the reply is `503 not_configured`, never a stub.
- **Gate:** every answer goes through `gateAnswer()` (`proof/src/gate.ts`) with the answer's citations. A number is `verified` only when a fact behind those citations agrees with it to the precision written; anything else is `unverified` and kept, marked (`action` `flagged`). A speed stated about the Moon is never verified. An answer that writes a numeral the gate cannot read (not ASCII digits or superscript exponent digits) becomes `not_in_data`.
- **Sources:** `scripts/build-ask-index.mjs` (run by `npm run build` and `npm test`) turns our data and the source papers into short passages, each with its citation, in the git-ignored `api/_ask_index.ts`: spread_rates rows, Table S1 rows, Moon Gap materials, the 24 PSI investigations, `pipeline/METHOD.md` sections, the seed facts' quotes, the Link 2018 text and every page of the ICES-2025-392, Link 2018 SI and LPSC 2026 PDFs (page text in `scripts/ask-index/pdf_pages.json`, from `scripts/ask-index/extract_pdf_pages.py`). `api/_retrieve.ts` picks at most 10 per question by hybrid search: keyword (BM25) plus meaning (cosine similarity of `gemini-embedding-001` vectors; the passages' vectors are committed in `scripts/ask-index/vectors.json` and refreshed by `npm run embed-ask-index`, the question's is one call per request, and if that call fails the search is keyword only), merged by reciprocal rank fusion. Rules come first: a summarize subject's rows come first, a rank question gets the ranking computed in code (Moon Gap, investigation scores, or how closely our steps match Table S1) plus the rows behind it, and a test, investigation or material named in the question pulls in its rows. No keyword match means no sources (meaning search never adds passages to an off-topic question): `not_in_data` without calling the model. The validation headline (`method:validation`) is its own passage, computed with the proof layer's `spreadSummary`. An answer only ever cites passages the server sent, and an answer left with no citation becomes `not_in_data`. `docs/BUILD_PLAN.md` is never indexed, and every sentence that names the Moon, lunar gravity or Mars together with a speed is dropped at build time.
- Error codes: `invalid_json`, `invalid_request` (400; also for a `subject.id` that is not a plain ID of at most 64 characters); `method_not_allowed` (405, for every method but POST); `payload_too_large` (413); `unsupported_media_type` (415: send `application/json`); `declined` (422: the model refused); `internal_error` (500); `bad_answer`, `upstream_error` (502); `not_configured` (503: no usable key, or the account cannot be used), `upstream_busy` (503); `upstream_timeout` (504).
- Vercel's own errors are not JSON: a 504 when the platform stops the function (after `maxDuration`) and a 413 for a body over 4.5 MB. The panel should treat any non-JSON error body as "Ask is unavailable".

**8. `data/derived/control_result.json`** (Plan B). `{ contract: "control/1", test_id: "CTRL-1", clip: { fps, recorded_at, camera, scale_px_per_mm }, hand: { crossings: [{ mark_mm, t_s }], rate_mm_s, ci95_mm_s }, tracker: { rate_mm_s, ci95_mm_s, threshold_spread_mm_s, n_frames, t_start_s, t_end_s }, diff_pct, notes }`
- `diff_pct` = 100·(tracker − hand)/hand.
- The clip also gets `edges/CTRL-1.csv` and `overlays/CTRL-1.mp4`. It is not a row in spread_rates.

**9. `data/derived/frames_<test_id>.csv`**. One row per photo, from the NEF EXIF, in time order. Written by `tools/exif_dump.py`; regenerate rather than edit.
`file,datetime_original,subsec,t_s,t_burn_s,f_number,exposure_s,iso,width_px,height_px,link_id,phase,gap_prev_s,long_gap,exposure_scale`
- The `<test_id>` in the file name is the **NASA PSI test number** (`frames_P16.csv`). `link_id` is the same test's Table S1 sample ID (P16 → B16, P19 → B19), which is the `test_id` used in contracts 1 to 3.
- `file`: photo file name (`iss040e072585.NEF`), no folder. Unique.
- `datetime_original`: EXIF DateTimeOriginal exactly as stored, `YYYY:MM:DD HH:MM:SS`.
- `subsec`: EXIF SubSecTimeOriginal, the digits after the decimal point of the second. Keep it as text: `08` means 0.08 s.
- `t_s`: seconds since the test's first photo, from `datetime_original` + `subsec`. **Same clock as contracts 1 and 2.** The first row is 0.
- `t_burn_s`: seconds since the first photo of the burn sequence; negative before it. `t_s − t_burn_s` is the same on every row. In P16 and P19 the test's first photo is a lone shot long before the burn, so the burn starts at a large `t_s`.
- `f_number`: aperture (2 means f/2). `exposure_s`: shutter time in seconds. `iso`: ISO speed.
- `width_px`, `height_px`: full-resolution raw size stored in the NEF. The converted TIFFs from `tools/nef_convert.py` are narrower (masked sensor edge cropped), so take pixel sizes from the TIFF.
- `link_id`: see above. Same on every row.
- `phase`: `pretest` when `t_burn_s` is negative, otherwise `burn`.
- `gap_prev_s`: seconds since the previous row's photo. Empty on the first row.
- `long_gap`: `true` when `gap_prev_s` is over 20 s, otherwise `false`. A flag only: the row keeps its `phase`. Empty on the first row. The first burn photo is flagged, because the photo before it is the pretest shot.
- `exposure_scale`: `f_number² / (exposure_s · iso)`. Corrected brightness = linear pixel value × `exposure_scale`.
- A photo with no usable EXIF time is kept, never dropped: it goes after the timed rows with `t_s`, `t_burn_s`, `phase`, `gap_prev_s` and `long_gap` empty.

**Mocks:** IDs start with `MOCK-`, CSVs start with `# mock: true`, and JSON has `"mock": true`. The UI uses them only with `VITE_USE_MOCK=1` (dev and preview). **A production build fails if any mock data would ship.** Regenerate them with `npm run make-mocks`. The one runtime mock is the `/api/ask` stub described in section 7: it is flagged `"mock": true` in the response, is never served in production, and uses the ID `spread_rates:STUB/1` because `check-no-mock` refuses `MOCK-` IDs anywhere in `api/` source.

**10. `data/reference/seed_facts.json`** (proof layer). `{ "_note", "facts": [{ "id", "paper", "page", "quote", "value", "unit", "label" }] }`
- Published numbers quoted **verbatim** from `docs/sources/`, with the 1-based PDF page (slide number for the LPSC deck). `unit` is one of the proof layer's units (`mm/s, cm/s, %, psia, kPa, s, s/cm, ...`) or null for a printed value with no unit (Table S1 rates as printed, ×10³).
- `python3 -I scripts/seed-facts/verify_seed.py` re-checks every quote on its page. Never add a lunar or Moon airflow number.
- The proof layer indexes these plus our data files (`scripts/build-facts.mjs`). Every AI-written number in `/api/ask` is checked against that index by `gateAnswer()`.

**11. `data/reference/psi_investigations.json`** (read by the investigations table and the `/api/ask` index). The 24 NASA PSI investigations with Research Area = Combustion Science, one record each. `{ contract: "investigations/1", _note, relevance_note, derived_from: { file, sha256, generated_by, rubric }, investigations: [...] }`
- **Generated, never hand-edited:** `npm run build-investigations` (`scripts/build-investigations.mjs`) builds it from the research catalog `docs/research/psi_investigations.json` (rubric and method: `docs/research/psi_investigations_catalog.md`). `derived_from.sha256` is the catalog file's sha256. The script refuses to write a file that fails the contract.
- Each record: `accession` (`PSI-25`), `acronym` (null for the ground grants), `full_name, psi_doi, psi_url, investigation_type, research_subarea, fire_safety_theme, years: { psi_investigation_dates, operations }, platform, hardware, fuel_sample, atmosphere: { o2, pressure }, flow, gravity, diagnostics[], psi_data: { total_size_gb, n_files, file_types, source }, pi, key_finding, key_finding_source, key_papers: [{ citation, doi, doi_verified, note? }], relevance, notes_unverified[]`.
- Conditions (O2, pressure, flow, fuel) are **text as the catalog wrote it**, not numbers to compute with. `n_files` is null where PSI's file list could not be read; `doi` is null where no DOI was found or verified.
- `relevance` has exactly `spacecraft_cabin, iss, lunar_base, mars_base, pressurized_rover`, each `{ score, why }`: `score` a whole number 1 to 5, `why` a one-line reason. **The scores are the team's judgment, not NASA's**, and `relevance_note` must say so; show it next to the table.
- **No ranking in the file:** records are sorted by PSI number, and the UI ranks from the scores (per setting or summed).
- Every `key_finding` needs a `key_finding_source`. Items in `notes_unverified` are known conflicts or unverified points; show them, don't drop them.
- **No field name or value may state a Moon or Mars airflow** (a key like `lunar_base.airflow_cm_s`, or text pairing Moon/lunar/Mars/Martian with a speed in cm/s, m/s or ft/min); the validator refuses one. Unknown fields are rejected.
