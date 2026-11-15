// Written with AI assistance (Claude Code)
// Regenerates data/mock/: the real file shapes from proof/src/contracts.ts, with obviously fake
// values (MOCK- IDs, repeating digits). Never shown as real data; production builds refuse them
// (scripts/check-no-mock.mjs). Run: node scripts/make-mocks.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "data", "mock");
// MOCK-DATA is the sentinel the production guard looks for in built bundles; keep it in every mock.
const NOTE = "Written with AI assistance (Claude Code). MOCK-DATA: fake values, never real.";
const ZERO_SHA = "0".repeat(64);
const FAKE = "MOCK: fake values";

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

function write(rel, text) {
  const p = join(out, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
  console.log(`wrote data/mock/${rel}`);
}

function cell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(header, rows) {
  const lines = [header.join(","), ...rows.map((r) => r.map(cell).join(","))];
  return `# mock: true\n# ${NOTE}\n${lines.join("\n")}\n`;
}

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

// --- spread_rates.csv: 3 tests, 7 segments --------------------------------
const tests = [
  {
    id: "MOCK-B01", rod: 11.1, o2: 22.2,
    segs: [
      { flow: 1.11, t0: 0, t1: 11.1, rate: 0.111, nasa: 0.1, ext: null },
      { flow: 2.22, t0: 11.1, t1: 22.2, rate: 0.222, nasa: 0.2, ext: null },
      { flow: 3.33, t0: 22.2, t1: 33.3, rate: 0.333, nasa: 0.3, ext: 33.3 },
    ],
  },
  {
    id: "MOCK-B02", rod: 22.2, o2: 33.3,
    segs: [
      { flow: 4.44, t0: 0, t1: 44.4, rate: 0.444, nasa: null, ext: null, notes: `${FAKE}; no matching reference row` },
      { flow: 5.55, t0: 44.4, t1: 55.5, rate: null, nasa: 0.5, ext: null, notes: `${FAKE}; unusable segment, edge lost` },
    ],
  },
  {
    id: "MOCK-C03", rod: 33.3, o2: 44.4,
    segs: [
      { flow: 6.66, t0: 0, t1: 66.6, rate: 0.666, nasa: 0.6, ext: null },
      { flow: 7.77, t0: 66.6, t1: 77.7, rate: 0.777, nasa: 0.7, ext: null },
    ],
  },
];

const spreadRows = [];
for (const t of tests) {
  for (const s of t.segs) {
    const usable = s.rate !== null;
    spreadRows.push([
      t.id, t.rod, t.o2, s.flow, s.t0, s.t1,
      s.rate,
      usable ? 0.011 : null,
      usable ? 0.022 : null,
      s.nasa,
      usable && s.nasa !== null ? r2((100 * (s.rate - s.nasa)) / s.nasa) : null,
      usable ? 1.11 : null,
      usable ? 0.111 : null,
      s.ext,
      usable ? Math.max(2, Math.round(s.t1 - s.t0)) : 2,
      s.notes ?? FAKE,
    ]);
  }
}
write(
  "spread_rates.csv",
  csv(
    ["test_id", "rod_d_mm", "o2_pct", "flow_cm_s", "t_start_s", "t_end_s", "rate_mm_s", "ci95_mm_s",
      "threshold_spread_mm_s", "nasa_rate_mm_s", "pct_error", "flame_len_mm", "blue_frac", "extinction_s",
      "n_frames", "notes"],
    spreadRows,
  ),
);

// --- edges/<test_id>.csv: one row per photo, 1 s apart -----------------------
function edgeRows(id, segs, gaps) {
  const end = segs[segs.length - 1].t1;
  const rows = [];
  let pos = 0;
  for (let i = 0; i <= Math.floor(end); i++) {
    const t = i;
    const k = segs.findIndex((s, j) => t >= s.t0 && (t < s.t1 || j === segs.length - 1));
    if (i > 0) {
      const s = segs[segs.findIndex((s, j) => t - 1 >= s.t0 && (t - 1 < s.t1 || j === segs.length - 1))];
      pos += s.rate ?? 0.555;
    }
    const edge = gaps.has(i) ? null : r3(pos + 0.05 * Math.sin(i * 1.7));
    rows.push([id, t, edge, i === 0 ? null : k + 1]);
  }
  return rows;
}
for (const t of tests) {
  write(`edges/${t.id}.csv`, csv(["test_id", "t_s", "edge_mm", "segment"], edgeRows(t.id, t.segs, new Set([5, 6]))));
}
const ctrlSegs = [{ t0: 0, t1: 30, rate: 1.22 }];
write("edges/MOCK-CTRL-1.csv", csv(["test_id", "t_s", "edge_mm", "segment"], edgeRows("MOCK-CTRL-1", ctrlSegs, new Set())));

// --- frames_<test_id>.csv: one row per photo, from EXIF ----------------------
// One early pretest photo, then a burn with one long gap, then a photo with no EXIF time.
{
  const BURN_START = 111.11;
  const burnTimes = [0, 4.44, 9.99, 44.44, 48.88];
  const exposures = [0.25, 0.25, 0.125, 0.125, 0.25, 0.25];
  const times = [0, ...burnTimes.map((b) => r2(BURN_START + b))];
  const rows = times.map((t, i) => {
    const gap = i === 0 ? null : r2(t - times[i - 1]);
    const sec = 11 + Math.floor(t);
    const clock = `2011:11:11 11:${String(11 + Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    const subsec = String(Math.round((11 + (t % 1) * 100) % 100)).padStart(2, "0");
    return [
      `mock_${String(i + 1).padStart(4, "0")}.NEF`, clock, subsec, t, r2(t - BURN_START),
      2, exposures[i], 1000, 1111, 1111, "MOCK-B01",
      t < BURN_START ? "pretest" : "burn", gap, gap === null ? null : gap > 20, 4 / (exposures[i] * 1000),
    ];
  });
  rows.push([`mock_${String(rows.length + 1).padStart(4, "0")}.NEF`, null, null, null, null, null, null, null, null, null, "MOCK-B01", null, null, null, null]);
  write(
    "frames_MOCK-P01.csv",
    csv(
      ["file", "datetime_original", "subsec", "t_s", "t_burn_s", "f_number", "exposure_s", "iso", "width_px", "height_px", "link_id", "phase", "gap_prev_s", "long_gap", "exposure_scale"],
      rows,
    ),
  );
}

// --- overlays/MOCK-B01.mp4: one frame per edge row, 10 fps -------------------
{
  const frames = Math.floor(tests[0].segs[2].t1) + 1;
  const p = join(out, "overlays", "MOCK-B01.mp4");
  mkdirSync(dirname(p), { recursive: true });
  // "MOCK" in 5x5 block letters via drawbox (works without the drawtext/freetype filter).
  const glyphs = {
    M: ["10001", "11011", "10101", "10001", "10001"],
    O: ["01110", "10001", "10001", "10001", "01110"],
    C: ["01111", "10000", "10000", "10000", "01111"],
    K: ["10010", "10100", "11000", "10100", "10010"],
  };
  const boxes = [];
  [..."MOCK"].forEach((ch, li) =>
    glyphs[ch].forEach((row, y) =>
      [...row].forEach((bit, x) => {
        if (bit === "1") boxes.push(`drawbox=x=${16 + li * 48 + x * 8}:y=${16 + y * 8}:w=8:h=8:color=white:t=fill`);
      }),
    ),
  );
  // A blue bar standing in for the tracked edge, moving 8 px per frame.
  const graph = `[0:v]${boxes.join(",")}[bg];[bg][1:v]overlay=x='20+n*8':y=100:eval=frame`;
  try {
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=0x101820:s=320x180:r=10",
      "-f", "lavfi", "-i", "color=c=0x66ccff:s=6x60:r=10",
      "-frames:v", String(frames),
      "-filter_complex", graph,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
      "-metadata", "title=MOCK-B01", "-metadata", `comment=${NOTE}`,
      p,
    ]);
    console.log("wrote data/mock/overlays/MOCK-B01.mp4");
  } catch (e) {
    console.warn(`skipped overlays/MOCK-B01.mp4 (ffmpeg failed or missing): ${e.message.split("\n")[0]}`);
  }
}

// --- link2018_table_s1.csv ---------------------------------------------------
const s1 = [
  ["MOCK-B01", 1.11, 22.2, 1, 1.11, 11, 10.0, "cm/s", "left"],
  ["MOCK-B01", 1.11, 22.2, 2, 2.22, 22, 20.0, "cm/s", "left"],
  ["MOCK-B01", 1.11, 22.2, 3, 3.33, 33, 30.0, "cm/s", "left"],
  ["MOCK-B02", 2.22, 33.3, 1, 5.55, 44, 50.0, "mm/s", "right"],
  ["MOCK-C03", 3.33, 44.4, 1, 6.66, 66, 60.0, "mm/s", "right"],
  ["MOCK-C03", 3.33, 44.4, 2, 7.77, 77, 70.0, "mm/s", "right"],
].map((r) => [...r, 99, "MOCK-QA", FAKE]);
write(
  "link2018_table_s1.csv",
  csv(
    ["sample_id", "rod_d_cm", "o2_pct", "step", "flow_cm_s", "dt_s", "rate_x1e3", "rate_unit_printed",
      "table_half", "page", "checked_by", "notes"],
    s1,
  ),
);

// --- ices2025_digitized.csv + moongap.json (schema 1.3.0) ---------------------
// Fake numbers, built so every consistency rule in validateMoonGap holds exactly.
const MATS = ["pmma", "p213", "cotton_flaming", "cotton_smolder", "polycarbonate", "nomex_velcro"];
const EXCLUDED = "cotton_flaming";
const FLOWS = [66.6, 77.7, 88.8, 99.9];
const MIN_FIT = 55.5;
const REF_FLOW = 33.3;
const digit = [];
const moonMats = {};
const ok = [];
const prov = (rows, method) => ({ rows, method: `MOCK: ${method}` });
MATS.forEach((material, k) => {
  const i0 = r3(0.111 + 0.011 * k);
  const slope = 0.00011 * (k + 1);
  const ref = k === 1 ? (0.00011 * (k + 1)) / 1.5 : 0.0001 * (k + 1);
  const lunar = r2(10 + 0.5 * k);
  const line = (f) => 100 * (i0 + slope * f);
  const first = digit.length;
  for (const f of FLOWS) digit.push([material, "wstf", f, r3(line(f)), "marker", "mock", 99, "MOCK point"]);
  digit.push([material, "wstf", 70, r3(line(70)), "fit_end", "mock", 99, "MOCK drawn line end"]);
  digit.push([material, "wstf", 95, r3(line(95)), "fit_end", "mock", 99, "MOCK drawn line end"]);
  digit.push([material, "lunar", null, lunar, "line_end", "mock", 99, "MOCK lunar line end"]);
  digit.push([material, "lunar", null, lunar, "line_end", "mock", 99, "MOCK lunar line end"]);
  const markerRows = [first, first + 1, first + 2, first + 3];
  const lunarRows = [first + 6, first + 7];
  if (material === EXCLUDED) {
    moonMats[material] = { material, status: "excluded", warnings: [], reason: "MOCK: this figure can't be read." };
    return;
  }
  const intercept = 100 * i0;
  const curveF = Array.from({ length: 11 }, (_, i) => (i * FLOWS[FLOWS.length - 1]) / 10);
  const curveY = curveF.map((f) => 100 * (i0 + slope * f));
  const gap = intercept - lunar;
  const earth = 100 * (i0 + slope * REF_FLOW);
  const rd = Math.abs(slope - ref) / ref;
  const within = rd <= 0.2;
  moonMats[material] = {
    material, status: "ok", warnings: [],
    fit: {
      n: FLOWS.length, slope_frac_per_cm_s: slope, slope_se: 0.00001, intercept_frac: i0, intercept_se: 0.001, r2: 0.99,
      min_flow_cm_s: MIN_FIT, flow_range_cm_s: [FLOWS[0], FLOWS[FLOWS.length - 1]], provenance: prov(markerRows, "OLS on markers"),
    },
    slope_check: {
      reference_slope_frac_per_cm_s: ref, reference_source: "MOCK-Table 2", relative_difference: rd, tolerance: 0.2,
      within_tolerance: within, passed: within, status: within ? "matches_table2" : "documented_discrepancy",
    },
    zero_flow: { intercept_pct: intercept, ci95_pct: [intercept - 0.5, intercept + 0.5], provenance: prov(markerRows, "intercept") },
    curve: { flow_cm_s: curveF, o2_pct: curveY, lower_pct: curveY.map((y) => y - 0.5), upper_pct: curveY.map((y) => y + 0.5), provenance: prov(markerRows, "fit line and band") },
    wstf_points: { flow_cm_s: FLOWS, o2_pct: FLOWS.map((f) => r3(line(f))), provenance: prov(markerRows, "markers") },
    lunar: { limit_pct: lunar, provenance: prov(lunarRows, "mean of the lunar line ends") },
    gap: { gap_pct: gap, ci95_pct: [gap - 0.6, gap + 0.6], lunar_limit_treated_as_exact: false, reading_error_pct: 0.01, provenance: prov([...markerRows, ...lunarRows], "intercept minus lunar limit") },
    gap_at_ref_flow: {
      flow_cm_s: REF_FLOW, label: "MOCK gap at the Earth reference flow",
      note: "MOCK: an Earth (1 g) buoyant-flow reference, not a Moon airflow.",
      earth_pct: earth, gap_pct: earth - lunar, ci95_pct: [earth - lunar - 0.7, earth - lunar + 0.7], reading_error_pct: 0.01,
      provenance: prov([...markerRows, ...lunarRows], "fit at the reference flow minus lunar limit"),
    },
  };
  ok.push({ material, gap, ci: moonMats[material].gap.ci95_pct });
});
ok.sort((a, b) => b.gap - a.gap);
write("ices2025_digitized.csv", csv(["material", "source", "flow_cm_s", "o2_pct", "point_kind", "extraction", "page", "notes"], digit));
write(
  "moongap.json",
  json({
    schema_version: "1.3.0",
    mock: true,
    _note: NOTE,
    input: { file: "data/mock/ices2025_digitized.csv", sha256: ZERO_SHA },
    repeat_input: null,
    caveats: ["MOCK caveat: fake data."],
    warnings: [],
    paper: "MOCK-Paper",
    context_bands: {
      fans_off: { label: "MOCK fans off", min_cm_s: 0, max_cm_s: 0, source: "MOCK-definition" },
      bass_ii: { label: "MOCK BASS-II", min_cm_s: 1.1, max_cm_s: 9.9, source: "MOCK-source" },
      wstf: { label: "MOCK WSTF", min_cm_s: 66.6, max_cm_s: 99.9, source: "MOCK-source" },
      station_ventilation: { label: "MOCK ventilation", min_cm_s: 11.1, max_cm_s: 22.2, source: "MOCK-source" },
    },
    reference_lines: { moon_base_o2: { label: "MOCK base line", o2_pct: 33.3, note: "MOCK note", source: "MOCK-source" } },
    excluded: [{ material: EXCLUDED, reason: moonMats[EXCLUDED].reason }],
    settings: { min_fit_flow_cm_s: MIN_FIT, confidence: 0.95, ref_flow_cm_s: REF_FLOW, slope_tolerance: 0.2, slope_reference_source: "MOCK-Table 2" },
    materials: moonMats,
    ranking: ok.map((x, i) => ({ rank: i + 1, material: x.material, gap_pct: x.gap, ci95_pct: x.ci })),
  }),
);

// --- control_result.json (Plan B) -------------------------------------------
write(
  "control_result.json",
  json({
    contract: "control/1",
    mock: true,
    _note: NOTE,
    test_id: "MOCK-CTRL-1",
    clip: { fps: 33.3, recorded_at: "2000-01-01T00:00:00Z", camera: "MOCK-Camera", scale_px_per_mm: 11.1 },
    hand: {
      crossings: [
        { mark_mm: 11.1, t_s: 0 },
        { mark_mm: 22.2, t_s: 10 },
        { mark_mm: 33.3, t_s: 20 },
        { mark_mm: 44.4, t_s: 30 },
      ],
      rate_mm_s: 1.11,
      ci95_mm_s: 0.01,
    },
    tracker: { rate_mm_s: 1.22, ci95_mm_s: 0.02, threshold_spread_mm_s: 0.03, n_frames: 31, t_start_s: 0, t_end_s: 30 },
    diff_pct: r2((100 * (1.22 - 1.11)) / 1.11),
    notes: FAKE,
  }),
);

// --- envelope.json (envelope/1) ------------------------------------------------
{
  const prov = { derived: "MOCK formula" };
  write(
    "envelope.json",
    json({
      contract: "envelope/1",
      mock: true,
      _note: NOTE,
      estimate_note: "MOCK: fake values, not a NASA measurement.",
      model: { law: "MOCK law", exponent: 0.5, source: "MOCK source" },
      anchors: { low: { flow_1g_cm_s: 11.1, provenance: prov }, high: { flow_1g_cm_s: 22.2, provenance: prov } },
      sustaining_flow: [
        { sample_id: "MOCK-B01", o2_pct: 11.1, rod_d_cm: 1.11, lowest_flow_with_spread_cm_s: 1.11, provenance: { file: "MOCK", row: 0, column: "flow_cm_s", derived: "MOCK" } },
      ],
      threshold: { flow_low_cm_s: 1.11, flow_high_cm_s: 1.11, g_low: 0.001, g_high: 0.002, bound: "at most", provenance: prov },
      worlds: [
        {
          id: "mock_world", label: "MOCK world", estimate: true, g_earth: 0.5,
          times_threshold_at_least: 250, times_threshold_at_most: 500,
          provenance: { g_earth: prov, times_threshold_at_least: prov, times_threshold_at_most: prov },
        },
      ],
      checks: [{ id: "mock-check", what: "MOCK", result: FAKE }],
      caveats: [FAKE],
      derived_from: [{ file: "MOCK", sha256: "0".repeat(64) }],
    }),
  );
}

// --- flame_model.json (flame_model/1) ------------------------------------------
write(
  "flame_model.json",
  json({
    contract: "flame_model/1",
    mock: true,
    _note: NOTE,
    label: "MOCK: fake values. A model, not a NASA measurement.",
    scope: "MOCK scope",
    model: { equations: ["MOCK"], gravity_note: "MOCK", fit: "MOCK", parameters: { k: { value: 0.5, ci95: [0.4, 0.6], unit: null } } },
    validation: {
      fit_all: {},
      leave_one_group_out: { median_abs_error_pct: 11.1, rows_with_rate_scored: 2, always_burns_baseline_correct: 2, how: "MOCK-LOGO" },
      cross_domain: { orbit_only_to_earth: { passed: false }, earth_only_to_orbit: { passed: false } },
      bootstrap: {},
      remeasurement_cross_check: {},
    },
    caveats: [FAKE],
    derived_from: [{ file: "MOCK", sha256: "0".repeat(64) }],
  }),
);

// --- psi_investigations.json (investigations/1) -------------------------------
{
  const SETTINGS = ["spacecraft_cabin", "iss", "lunar_base", "mars_base", "pressurized_rover"];
  const relevance = (scores) =>
    Object.fromEntries(SETTINGS.map((s, i) => [s, { score: scores[i], why: `MOCK reason for ${s}.` }]));
  const investigation = (n, acronym, scores, papers) => ({
    accession: `MOCK-PSI-${n}`,
    acronym,
    full_name: `MOCK Investigation ${n}`,
    psi_doi: `10.99999/mock-${n}`,
    psi_url: `https://doi.org/10.99999/mock-${n}`,
    investigation_type: "MOCK type",
    research_subarea: "MOCK subarea",
    fire_safety_theme: "MOCK theme",
    years: { psi_investigation_dates: "MOCK dates", operations: "MOCK operations" },
    platform: "MOCK platform",
    hardware: "MOCK hardware",
    fuel_sample: "MOCK fuel",
    atmosphere: { o2: "MOCK O2", pressure: "MOCK pressure" },
    flow: "MOCK flow",
    gravity: "MOCK gravity",
    diagnostics: ["MOCK camera", "MOCK radiometer"],
    psi_data: { total_size_gb: 11.1 * n, n_files: n === 1 ? 111 : null, file_types: n === 1 ? "MOCK 111 ZIP" : "", source: "MOCK source" },
    pi: "MOCK PI",
    key_finding: `MOCK finding for investigation ${n}.`,
    key_finding_source: "MOCK-Source, p. 99",
    key_papers: papers,
    relevance: relevance(scores),
    notes_unverified: n === 1 ? [] : ["MOCK unverified note."],
  });
  write(
    "psi_investigations.json",
    json({
      contract: "investigations/1",
      mock: true,
      _note: NOTE,
      relevance_note: "MOCK: relevance scores are the team's judgment, not NASA's.",
      derived_from: { file: "data/mock/MOCK-catalog.json", sha256: ZERO_SHA, generated_by: "scripts/make-mocks.mjs" },
      investigations: [
        investigation(1, "MOCK-ONE", [5, 4, 3, 2, 1],
          [{ citation: "MOCK-Paper 1.", doi: "10.99999/mock-paper-1", doi_verified: true }]),
        investigation(2, null, [1, 2, 3, 4, 5],
          [{ citation: "MOCK-Report 2 (no DOI).", doi: null, doi_verified: false, note: "MOCK note" }]),
      ],
    }),
  );
}

// --- ask/examples.json --------------------------------------------------------
function num(answer, text, value, unit, status, source) {
  const start = answer.indexOf(text);
  if (start < 0) throw new Error(`"${text}" not in answer`);
  return { text, start, end: start + text.length, value, unit, status, source };
}
const rowSource = (row, column) => ({ file: "data/mock/spread_rates.csv", row, column, sha256: ZERO_SHA });
function response(mode, status, answer, citations, numbers, action, removed = []) {
  const all = [...numbers, ...removed];
  const verified = all.filter((n) => n.status === "verified").length;
  return {
    contract: "ask/1", mock: true, mode, status, answer, citations,
    gate: { action, checked: all.length, verified, unverified: all.length - verified, numbers: all },
  };
}
const a1 = "MOCK: test MOCK-B01 spread at 0.111 mm/s in its first flow step.";
const a2 = "MOCK: MOCK-Nomex Velcro ranks first, with a Moon Gap of 4.1 % O2.";
const a3 = "MOCK: test MOCK-C03 spread at 9.99 mm/s.";
const a4 = "MOCK: test MOCK-C03 spread at [number removed: not in our data].";
const a5 = "Not in our data.";
write(
  "ask/examples.json",
  json({
    mock: true,
    _note: NOTE,
    examples: [
      {
        request: { question: "MOCK: summarize test MOCK-B01", mode: "summarize", subject: { kind: "test", id: "MOCK-B01" } },
        response: response("summarize", "answered", a1, [{ kind: "row", id: "spread_rates:MOCK-B01/1" }],
          [num(a1, "0.111 mm/s", 0.111, "mm/s", "verified", rowSource(1, "rate_mm_s"))], "passed"),
      },
      {
        request: { question: "MOCK: rank the materials by Moon Gap", mode: "rank" },
        response: response("rank", "answered", a2,
          [{ kind: "row", id: "moongap:nomex_velcro" }, { kind: "paper", id: "ices2025", page: 99 }],
          [num(a2, "4.1 % O2", 4.1, "% O2", "verified", { paper: "ices2025", page: 99, quote: "MOCK quote" })], "passed"),
      },
      {
        request: { question: "MOCK: how fast did MOCK-C03 spread?", mode: "interpret" },
        response: response("interpret", "answered", a3, [{ kind: "row", id: "spread_rates:MOCK-C03/1" }],
          [num(a3, "9.99 mm/s", 9.99, "mm/s", "unverified", null)], "flagged"),
      },
      {
        request: { question: "MOCK: how fast did MOCK-C03 spread, strictly?", mode: "interpret" },
        response: response("interpret", "answered", a4, [{ kind: "row", id: "spread_rates:MOCK-C03/1" }], [], "removed",
          [{ text: "8.88 mm/s", start: null, end: null, value: 8.88, unit: "mm/s", status: "unverified", source: null }]),
      },
      {
        request: { question: "MOCK: a question our sources do not answer", mode: "interpret" },
        response: response("interpret", "not_in_data", a5, [], [], "passed"),
      },
    ],
  }),
);
