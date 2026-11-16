// Written with AI assistance (Claude Code)
// Build step for /api/ask: turns our data files and source papers into short passages, each with
// the citation an answer carries when it uses it. Writes the git-ignored api/_ask_index.ts, which
// api/_retrieve.ts searches. Run after `npm run build -w proof`.
//
// Sources, and how each passage is cited:
//   data/derived/spread_rates.csv          row    spread_rates:<test_id>/<n>   (n = 1-based within the test)
//   data/reference/link2018_table_s1.csv   row    table_s1:<sample_id>/<step>
//   web/src/data/moongap.json              row    moongap:<material>, moongap:ranking, moongap:excluded
//   data/reference/psi_investigations.json row    investigations:<PSI-n>, investigations:ranking-<setting>
//   pipeline/METHOD.md                     row    method:<section>
//   data/derived/envelope.json             row    envelope:threshold, envelope:<world>, envelope:caveats
//   data/reference/seed_facts.json         paper  <paper>, page
//   docs/sources/Link2018_SciRep_main.txt  paper  link2018 (the text has no page numbers)
//   scripts/ask-index/pdf_pages.json       paper  ices2025 / link2018_si / fm2_2026, page
//
// docs/BUILD_PLAN.md is never read: its research notes quote a Moon airflow estimate. As a second
// guard, every sentence that pairs the Moon, lunar gravity or Mars with a speed is dropped.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAPER_IDS, ROW_CITATION_ID, VALIDATED_BELOW_CM_S, isValidatedStep, parseCsv, spreadSummary, tableS1RateMmS } from "../proof/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const sha256 = (rel) => createHash("sha256").update(readFileSync(join(root, rel))).digest("hex");

const MAX_CHARS = 1100;
const passages = [];
const files = [];
let droppedSentences = 0;

// ---------------------------------------------------------------------------
// Moon / Mars airflow guard
// ---------------------------------------------------------------------------

// "centrifuge": ICES-2025-392 ran its lunar-gravity tests in a centrifuge (p. 10 "the closed symbols at ~25 cm/s are the centrifuge data").
const PLACE = /\b(moon|lunar|1\/6\s*g|mars|martian|centrifuge)\b/i;
const SPEED = /\d[\d.,]*\s*(?:[-–]\s*\d[\d.,]*\s*)?(?:cm\/s|mm\/s|m\/s|ft\/min|cm s-1|cm\s*s\^?-1)/i;

/**
 * Drops each sentence that names the Moon or Mars and a speed. Line breaks are joined first, because
 * PDF text breaks sentences across lines; a table's lines then count as one sentence, which drops
 * more than needed but never less.
 */
function guard(text) {
  const parts = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const kept = parts.filter((s) => {
    const bad = PLACE.test(s) && SPEED.test(s);
    if (bad) droppedSentences++;
    return !bad;
  });
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

function add(kind, citation, text, subjects = []) {
  const clean = guard(text);
  if (clean.length < 20) return;
  if (citation.kind === "row" && !ROW_CITATION_ID.test(citation.id)) throw new Error(`bad row citation ${citation.id}`);
  if (citation.kind === "paper" && !PAPER_IDS.includes(citation.id)) throw new Error(`bad paper id ${citation.id}`);
  passages.push({ id: `p${passages.length}`, kind, citation, text: clean, subjects: subjects.filter(Boolean).map((s) => String(s).toLowerCase()) });
}

/** Splits long text into chunks of whole paragraphs, then whole sentences. */
function chunks(text) {
  const out = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const para of text.split(/\n\s*\n/)) {
    const pieces = para.length > MAX_CHARS ? para.split(/(?<=[.!?])\s+/) : [para];
    for (const piece of pieces) {
      if (cur.length + piece.length + 1 > MAX_CHARS) push();
      cur += (cur ? "\n" : "") + piece;
    }
    if (cur.length > MAX_CHARS * 0.6) push();
  }
  push();
  return out;
}

const plain = (s) => s.replace(/\*\*/g, "").replace(/`/g, "").replace(/^#+\s*/gm, "");
const num = (x, digits) => Number(Number(x).toFixed(digits)).toString();

// ---------------------------------------------------------------------------
// Our measurements: spread_rates.csv
// ---------------------------------------------------------------------------
{
  const rel = "data/derived/spread_rates.csv";
  files.push({ file: rel, sha256: sha256(rel) });
  const seen = new Map();
  const compared = [];
  for (const rec of parseCsv(read(rel)).records) {
    const [test_id, rod_d_mm, o2_pct, flow_cm_s, t_start_s, t_end_s, rate, ci95, thr, nasa, pct, flame_len, blue, ext, n_frames, notes] = rec.cells;
    const k = (seen.get(test_id) ?? 0) + 1;
    seen.set(test_id, k);
    const head = `Ignos measurement from NASA's BASS-II photos, test ${test_id}, flow step ${k}: ${rod_d_mm} mm black PMMA rod, ${o2_pct}% O2, opposed airflow ${flow_cm_s} cm/s.`;
    const body = rate
      ? ` Our flame spread rate: ${rate} mm/s (95% interval half-width ${ci95} mm/s; threshold sensitivity ${thr} mm/s), from ${n_frames} photos.` +
        (nasa ? ` NASA's published rate for this step (Link et al. 2018, Table S1): ${nasa} mm/s; our difference ${pct}%.` : " No NASA rate to compare.")
      : " No usable rate for this step.";
    add("measurement", { kind: "row", id: `spread_rates:${test_id}/${k}` }, `${head}${body} Notes: ${notes}`, [test_id]);
    if (rate && nasa && pct) compared.push({ test_id, k, flow_cm_s, rate, nasa, pct });
  }
  const ranked = [...compared]
    .sort((a, b) => Math.abs(Number(a.pct)) - Math.abs(Number(b.pct)) || a.test_id.localeCompare(b.test_id))
    .map((r, i) => `${i + 1}. test ${r.test_id} step ${r.k} at ${r.flow_cm_s} cm/s: ours ${r.rate} mm/s vs NASA ${r.nasa} mm/s, difference ${r.pct}%`)
    .join("; ");
  // The headline the team quotes, computed with the proof layer's own rule and function, so the
  // gate verifies every number in it (facts method:validation:*). Cited as method:validation.
  {
    const p = parseCsv(read(rel));
    const rows = p.records.map((rec) => Object.fromEntries(p.header.map((h, i) => [h, rec.cells[i] ?? ""])));
    const s = spreadSummary(rows);
    if (s.nValidated > 0) {
      const steps = s.rows.map((i) => `test ${rows[i].test_id} at ${rows[i].flow_cm_s} cm/s (${rows[i].pct_error}%)`).join(", ");
      const tests = [...new Set(s.rows.map((i) => rows[i].test_id))].join(", ");
      const fmt = (x) => num(x, 1);
      // What the rule leaves out, counted from the same rows (never a blanket claim).
      const high = rows.filter((r) => !(Number(r.flow_cm_s) < VALIDATED_BELOW_CM_S));
      const highOff = high.filter((r) => r.pct_error !== "" && Math.abs(Number(r.pct_error)) > 15).length;
      const highNone = high.filter((r) => r.pct_error === "").length;
      const lowFlagged = rows.filter((r) => Number(r.flow_cm_s) < VALIDATED_BELOW_CM_S && !isValidatedStep(r) && r.pct_error !== "");
      const left =
        `Steps at or above ${VALIDATED_BELOW_CM_S} cm/s are not counted, because the tracker is unreliable there: of those ${high.length} steps, ${highOff} differ from NASA's rate by more than 15%` +
        (highNone ? ` and ${highNone} ${highNone === 1 ? "has" : "have"} no usable rate` : "") +
        "." +
        (lowFlagged.length
          ? ` Low-flow steps the tracker flagged LOW CONFIDENCE are not counted either: ${lowFlagged.map((r) => `test ${r.test_id} at ${r.flow_cm_s} cm/s (${r.pct_error}%)`).join(", ")}.`
          : "");
      add(
        "method",
        { kind: "row", id: "method:validation" },
        `Ignos validation headline, overall across all tests: how closely our low-flow spread rates match NASA's published values (Link et al. 2018, Supplement Table S1, p. 1). ` +
          `A flow step counts as validated only when its airflow is below ${VALIDATED_BELOW_CM_S} cm/s and the tracker did not flag it LOW CONFIDENCE. ` +
          `Over ${s.nValidated} validated low-flow steps from ${s.nTests} tests (${tests}), the median absolute error of our spread rate against NASA's is ${fmt(s.medianAbsPct)}%; ` +
          `the largest is ${fmt(s.maxAbsPct)}% and the mean signed error is ${fmt(s.meanSignedPct)}%. The steps: ${steps}. ` +
          left,
        ["method", "validation", ...new Set(s.rows.map((i) => rows[i].test_id))],
      );
    }
  }
  add(
    "ranking",
    { kind: "row", id: "spread_rates:ranking" },
    `Ignos flow steps ranked by how closely our spread rate matches NASA's published rate (Link et al. 2018, Table S1), smallest difference first (computed in code from spread_rates.csv; it includes steps the method flags as unreliable, see each step's notes): ${ranked}.`,
    ["ranking", ...new Set(compared.map((r) => r.test_id))],
  );
}

// Which samples still spread below 0.6 cm/s (Link 2018's main text says none did, for B16 and B19).
{
  const p = parseCsv(read("data/reference/link2018_table_s1.csv"));
  const col = (n) => p.header.indexOf(n);
  const below = p.records
    .map((r) => r.cells)
    .filter((c) => c[col("rate_x1e3")] !== "" && Number(c[col("flow_cm_s")]) < 0.6)
    .map((c) => `${c[col("sample_id")]} step ${c[col("step")]} at ${c[col("flow_cm_s")]} cm/s`);
  if (below.length)
    add(
      "nasa_rate",
      { kind: "row", id: "table_s1:below-0.6" },
      `NASA's published rates (Link et al. 2018, Supplement Table S1, p. 1) that still show flame spread below 0.6 cm/s: ${below.join(", ")}. ` +
        "The paper's main text says no flame spread was observed below 0.6 cm/s, but that sentence is about samples B16 and B19; Table S1 lists spread below 0.6 cm/s for these other samples.",
      ["table_s1", "0.6", ...new Set(below.map((b) => b.split(" ")[0].toLowerCase()))],
    );
}

// ---------------------------------------------------------------------------
// The envelope: data/derived/envelope.json (the team's scaling estimate, scripts/build-envelope.mjs)
// ---------------------------------------------------------------------------
{
  const rel = "data/derived/envelope.json";
  files.push({ file: rel, sha256: sha256(rel) });
  const e = JSON.parse(read(rel));
  const t = e.threshold;
  const ours = "This is the Ignos team's order-of-magnitude reading of a NASA schematic, not a NASA measurement or model.";
  const flows = e.sustaining_flow.map((s) => `${s.sample_id} ${s.lowest_flow_with_spread_cm_s} cm/s`).join(", ");
  add(
    "envelope",
    { kind: "row", id: "envelope:threshold" },
    `${ours} A comparison of gravity levels: on a NASA schematic, at what gravity does the flow a flame makes for itself fall to the lowest flows at which orbit tests on these PMMA rods still measured spread? ` +
      `In orbit, Link et al. 2018 Table S1 still measured flame spread at its lowest airflows (${flows}); these are the lowest flows with measured spread, in tests at different oxygen and rod sizes, not quench speeds. ` +
      `NASA's FM2 slides (PDF p. 17) show a schematic (T'ien 1986) whose axis pairs gravity level with a characteristic flow speed, which we read as roughly the cube root of gravity (a reading of three tick labels, not a fit), with ${e.anchors.low.flow_1g_cm_s} to ${e.anchors.high.flow_1g_cm_s} cm/s at Earth gravity. ` +
      `Read to order of magnitude, the schematic's flow falls to those lowest measured flows at about ${t.g_low} to ${t.g_high} of Earth's gravity, at most. This is a comparison with a schematic, not a tested extinction limit. ` +
      "On the station, NASA's crews turn off ventilation to slow a fire's spread, together with other steps such as removing power, extinguishers and isolation (NASA Fire Protection brief, pp. 2-3); it is not described as putting every fire out.",
    ["envelope", "threshold", "fans", ...e.sustaining_flow.map((s) => s.sample_id)],
  );
  const sens = e.checks.find((k) => k.id === "exponent-sensitivity");
  if (!sens) throw new Error("build-ask-index: envelope.json has no exponent-sensitivity check");
  const o2s = e.sustaining_flow.map((x) => x.o2_pct);
  const floor = Math.floor(Math.min(...sens.rows.map((r) => r.moon_times_threshold_at_least)) / 100) * 100;
  // Only the floor that holds under both scalings is stated as the Moon's ratio (accuracy review, 2026-11-15).
  const robustMoon =
    `The cube-root scaling is a reading, not a fit: with a square-root scaling the ratio is ${sens.rows[1].moon_times_threshold_at_least} to ${sens.rows[1].moon_times_threshold_at_most} instead. ` +
    `So the robust statement is: the Moon is at least about ${floor} times above the threshold under either scaling, for PMMA rods at ${Math.min(...o2s)} to ${Math.max(...o2s)}% oxygen. `;
  const untested = "This compares gravity levels on a NASA schematic only; whether a flame there would die with the fans off has not been tested, and oxygen, pressure, material and location also matter. ";
  for (const w of e.worlds) {
    add(
      "envelope",
      { kind: "row", id: `envelope:${w.id}` },
      `${ours} ${w.label}: ${w.g_earth} of Earth's gravity, ${w.times_threshold_at_least} to ${w.times_threshold_at_most} times the threshold gravity assuming the cube-root scaling. ${w.id === "moon" ? robustMoon : ""}${untested}` +
        (w.id === "moon" ? "No airflow is stated for the Moon: NASA reports the lunar buoyant velocity as not known (ICES-2025-392 pp. 8 and 10). NASA's FM2 slides (PDF p. 18) say that numerical and experimental evidence suggests lunar gravity is nearly the most flammable condition." : ""),
      ["envelope", w.id, w.id === "moon" ? "lunar" : ""],
    );
  }
  add("envelope", { kind: "row", id: "envelope:caveats" }, `Caveats of the Ignos fans-off envelope: ${e.caveats.join(" ")}`, ["envelope"]);
}

// ---------------------------------------------------------------------------
// NASA's material-safety findings, quoted (the team's "Would you bring this tape to the Moon?",
// relay 2026-11-15). The same sentences are inside the page chunks below, but buried in long pages;
// as passages of their own, a material-safety question finds them. Every quote is checked against
// the page text at build time, so a wrong quote fails the build.
// ---------------------------------------------------------------------------
{
  const pages = JSON.parse(read("scripts/ask-index/pdf_pages.json")).pages;
  const pageText = (paper, page) => (pages.find((p) => p.paper === paper && p.page === page)?.text ?? "").replace(/\s+/g, " ");
  const quote = (paper, page, q) => {
    if (!pageText(paper, page).includes(q)) throw new Error(`build-ask-index: quote not on ${paper} p. ${page}: ${q}`);
    return `"${q}"`;
  };
  // A paper can be left out of pdf_pages.json on purpose: the public code export drops ICES-2025-392's
  // page text because its NTRS record says it may include copyrighted material (relay 2026-11-15).
  // Then its quoted passages are skipped with a message. A paper that is present but lacks a quote
  // still fails the build.
  const present = new Set(pages.map((p) => p.paper));
  const ifPaper = (paper, fn) => {
    if (present.has(paper)) return fn();
    console.warn(`build-ask-index: ${paper} has no pages in pdf_pages.json (left out on purpose?), so its quoted passages are skipped`);
  };
  const ICES = "Urban, Olson, Dietrich et al., ICES-2025-392";
  ifPaper("ices2025", () => {
  add(
    "published_fact",
    { kind: "paper", id: "ices2025", page: 2 },
    `How NASA approves spacecraft materials for fire safety (${ICES}, page 2), verbatim: ` +
      `${quote("ices2025", 2, "has focused on material selection as a primary means of fire prevention. The method for selecting fire safe materials has been NASA STD 6001 Test 1")} ` +
      `and ${quote("ices2025", 2, "The concept was that with a strong ignition source in upward spread, the test will be conservative.")}`,
    ["material", "materials", "test1", "safety"],
  );
  add(
    "published_fact",
    { kind: "paper", id: "ices2025", page: 8 },
    `Which tested materials pass NASA's Earth test, Test 1, in air (${ICES}, page 8), verbatim: ` +
      quote("ices2025", 8, "Three of the materials typically fail NASA test 1 (are flammable) in air (PMMA, P213 Tape (fiberglass with an acrylic (PMMA) adhesive), and cotton t-shirt material) and two materials pass Test 1 in air (polycarbonate and Nomex Velcro)."),
    ["material", "materials", "test1", "safety", "pmma", "p213", "cotton", "polycarbonate", "nomex"],
  );
  add(
    "published_fact",
    { kind: "paper", id: "ices2025", page: 9 },
    `NASA's lunar-gravity tests against its Earth (WSTF) testing (${ICES}, page 9), verbatim: ` +
      `${quote("ices2025", 9, "In figures 7, 8 and 9, the lunar-g buoyant limit was found to be less than the extrapolated value (for any assumed buoyant velocity) from the WSTF testing. This result is contrary to expected behavior.")} ` +
      "Figures 7, 8 and 9 are captioned PMMA, P-213 tape and cotton (flaming), but the Ignos team found the images under those captions may be shifted by one (Fig. 7's points match Table 2's P-213 row, and Fig. 9 repeats Fig. 10), so no single material should be named from them. NASA calls the result contrary to expected behavior; it did not conclude that Test 1 is unsafe.",
    ["material", "materials", "test1", "safety", "pmma", "p213", "cotton", "lunar"],
  );
  });
  ifPaper("fm2_2026", () =>
  add(
    "published_fact",
    { kind: "paper", id: "fm2_2026", page: 18 },
    "NASA's FM2 slides (Ferkul et al., LPSC 2026, PDF page 18, printed page 17), verbatim: " +
      `${quote("fm2_2026", 18, "Numerical and experimental evidence suggests that Lunar gravity is nearly the most flammable condition.")} ` +
      `and ${quote("fm2_2026", 18, "Oxygen concentration for flammability reaches a minimum value in the vicinity of g = gMoon")}`,
    ["material", "flammable", "lunar", "safety"],
  ));
}

// ---------------------------------------------------------------------------
// NASA's published rates: Link et al. 2018, Table S1
// ---------------------------------------------------------------------------
{
  const rel = "data/reference/link2018_table_s1.csv";
  files.push({ file: rel, sha256: sha256(rel) });
  const parsed = parseCsv(read(rel));
  const col = (name) => parsed.header.indexOf(name);
  for (const rec of parsed.records) {
    const c = (name) => rec.cells[col(name)];
    const mmS = Number(tableS1RateMmS({ rate_x1e3: Number(c("rate_x1e3")) }).toPrecision(6));
    add(
      "nasa_rate",
      { kind: "row", id: `table_s1:${c("sample_id")}/${c("step")}` },
      `NASA-team published result (Link et al. 2018, Scientific Reports, Supplement Table S1), sample ${c("sample_id")}: ` +
        `${c("rod_d_cm")} cm PMMA rod in microgravity on the ISS, ${c("o2_pct")}% O2, flow step ${c("step")}: opposed airflow ${c("flow_cm_s")} cm/s for ${c("dt_s")} s, ` +
        `flame spread rate ${mmS} mm/s (printed as ${c("rate_x1e3")} x 10^-3 cm/s).` +
        (c("notes") ? ` Note: ${c("notes")}` : ""),
      [c("sample_id")],
    );
  }
}

// ---------------------------------------------------------------------------
// Moon Gap: moongap.json (from ICES-2025-392)
// ---------------------------------------------------------------------------
const MATERIAL_LABEL = {
  pmma: "PMMA (acrylic)",
  p213: "P-213 tape",
  cotton_flaming: "cotton T-shirt fabric (flaming)",
  cotton_smolder: "cotton T-shirt fabric (smoldering)",
  polycarbonate: "polycarbonate",
  nomex_velcro: "Nomex Velcro",
};
// Figs. 7-9 (captioned PMMA, P-213 tape, cotton flaming) may be shifted by one material (moongap.json
// caveats), so their rows are named "as captioned" everywhere Ask reads them (team rule 4).
const AS_CAPTIONED = new Set(["pmma", "p213", "cotton_flaming"]);
const SHIFT_NOTE = "the images printed as Figs. 7-9 may be shifted by one material, so this row may belong to another material";
const shownLabel = (key) => (AS_CAPTIONED.has(key) ? `the figure captioned ${MATERIAL_LABEL[key] ?? key}` : MATERIAL_LABEL[key] ?? key);
{
  const rel = "web/src/data/moongap.json";
  files.push({ file: rel, sha256: sha256(rel) });
  const mg = JSON.parse(read(rel));
  const paper = typeof mg.paper === "string" ? mg.paper : "ICES-2025-392";
  const meaning =
    "Moon Gap = the 1-g (Earth, White Sands) oxygen limit extended to zero airflow, minus the oxygen limit measured in lunar gravity, in % O2. A positive gap means the material burned at a lower oxygen level in lunar gravity than the still-air Earth estimate. The lunar airflow itself is not determined.";
  for (const [key, m] of Object.entries(mg.materials)) {
    const label = MATERIAL_LABEL[key] ?? key;
    const shown = shownLabel(key);
    if (m.status !== "ok") continue;
    const ci = (a) => `${num(a[0], 2)}% to ${num(a[1], 2)}%`;
    const settled = (a) => (a[0] > 0 ? "the whole 95% range is above zero, so the lunar test burned at lower oxygen than the Earth trend predicts" : a[1] < 0 ? "the whole 95% range is below zero, so the lunar test needed more oxygen than the Earth trend predicts" : "the 95% range includes zero, so this material's direction is not settled");
    const sc = m.slope_check ?? {};
    const text =
      `Moon Gap for ${shown}${AS_CAPTIONED.has(key) ? ` (${SHIFT_NOTE}${typeof m.source_note === "string" ? `. ${m.source_note.replace(/\.$/, "")}` : ""})` : ""} (Ignos analysis of ${paper}): zero-flow 1-g oxygen limit ${num(m.zero_flow.intercept_pct, 2)}% O2 (95% CI ${ci(m.zero_flow.ci95_pct)}), ` +
      `lunar-gravity oxygen limit ${num(m.lunar.limit_pct, 2)}% O2, gap ${num(m.gap.gap_pct, 2)} percentage points of O2 (95% CI ${ci(m.gap.ci95_pct)}): ${settled(m.gap.ci95_pct)}. ${meaning}` +
      (sc.status
        ? ` Slope check against the paper's Table 2: ${sc.status === "documented_discrepancy" ? "the paper's drawn fit line and its Table 2 slope disagree (a documented discrepancy in the paper)" : "matches Table 2"}.`
        : "");
    add("moongap", { kind: "row", id: `moongap:${key}` }, text, [key, label]);
  }
  const ranked = mg.ranking
    .map((r) => `${r.rank}. ${shownLabel(r.material)}: gap ${num(r.gap_pct, 2)} percentage points of O2 (95% CI ${num(r.ci95_pct[0], 2)}% to ${num(r.ci95_pct[1], 2)}%; ${r.ci95_pct[0] > 0 ? "above zero" : r.ci95_pct[1] < 0 ? "below zero" : "includes zero"})`)
    .join("; ");
  add("ranking", { kind: "row", id: "moongap:ranking" }, `Moon Gap ranking of the tested materials, largest gap first (computed by Ignos from ${paper}): ${ranked}. Rows named "the figure captioned ..." come from Figs. 7-9, whose images may be shifted by one material. ${meaning}`, ["moon gap", "ranking"]);
  // A second order: lowest lunar-gravity oxygen limit first. "Which material burned on the least oxygen
  // on the Moon?" is about this order, not the gap order; with only the gap ranking the model conflated them.
  const byLimit = Object.entries(mg.materials)
    .filter(([, m]) => m.status === "ok" && typeof m.lunar?.limit_pct === "number")
    .sort((a, b) => a[1].lunar.limit_pct - b[1].lunar.limit_pct)
    .map(([k, m], i) => `${i + 1}. ${shownLabel(k)}: lunar-gravity oxygen limit ${num(m.lunar.limit_pct, 2)}% O2`)
    .join("; ");
  add(
    "ranking",
    { kind: "row", id: "moongap:ranking-lunar-limit" },
    `Lunar-gravity oxygen limits of the tested materials, lowest first, so the first kept burning on the least oxygen in lunar gravity (read by Ignos from the figures of ${paper}; ~5 s drop tests at 8.2 psia): ${byLimit}. This is a different order from the Moon Gap ranking, which compares each lunar limit with the Earth trend. Rows named "the figure captioned ..." come from Figs. 7-9, whose images may be shifted by one material.`,
    ["moon gap", "ranking", "limit", "lowest", "least"],
  );
  for (const ex of mg.excluded ?? []) {
    add("moongap", { kind: "row", id: "moongap:excluded" }, `Excluded from the Moon Gap ranking: ${shownLabel(ex.material)}. Reason: ${ex.reason}`, [ex.material]);
  }
  for (const [i, c] of (Array.isArray(mg.caveats) ? mg.caveats : []).entries()) {
    add("moongap", { kind: "row", id: "moongap:caveats" }, `Moon Gap caveat ${i + 1}: ${typeof c === "string" ? c : JSON.stringify(c)}`, ["moon gap"]);
  }
}

// ---------------------------------------------------------------------------
// The 24 PSI combustion investigations: psi_investigations.json
// ---------------------------------------------------------------------------
const SETTINGS = {
  spacecraft_cabin: "a spacecraft cabin",
  iss: "the International Space Station",
  lunar_base: "a lunar base",
  mars_base: "a Mars base",
  pressurized_rover: "a pressurized rover",
};
{
  const rel = "data/reference/psi_investigations.json";
  files.push({ file: rel, sha256: sha256(rel) });
  const inv = JSON.parse(read(rel));
  const judged = "The relevance scores are the Ignos team's judgment, not NASA's.";
  for (const r of inv.investigations) {
    const name = r.acronym ? `${r.accession} ${r.acronym}` : r.accession;
    const scores = Object.entries(SETTINGS)
      .map(([k, label]) => `${label} ${r.relevance[k].score}`)
      .join(", ");
    const text =
      `NASA PSI combustion investigation ${name}: ${r.full_name}. ${r.investigation_type}; ${r.research_subarea}; platform: ${r.platform}. ` +
      `Operations: ${r.years.operations}. Fuel or sample: ${r.fuel_sample}. Atmosphere: O2 ${r.atmosphere.o2}; pressure ${r.atmosphere.pressure}. ` +
      `Flow: ${r.flow}. Gravity: ${r.gravity}. Key finding: ${r.key_finding} (source: ${r.key_finding_source}). PSI DOI ${r.psi_doi}. ` +
      `Team relevance scores out of 5: ${scores}. ${judged}`;
    add("investigation", { kind: "row", id: `investigations:${r.accession}` }, text, [r.accession, r.acronym]);
  }
  const rankBy = (score, title, id) => {
    const order = [...inv.investigations].sort((a, b) => score(b) - score(a) || a.accession.localeCompare(b.accession, "en", { numeric: true }));
    const list = order
      .slice(0, 10)
      .map((r, i) => `${i + 1}. ${r.accession}${r.acronym ? ` ${r.acronym}` : ""} (score ${score(r)})`)
      .join("; ");
    add("ranking", { kind: "row", id }, `${title} (top 10 of 24; ties in PSI order): ${list}. ${judged}`, ["investigations", "ranking"]);
  };
  for (const [k, label] of Object.entries(SETTINGS)) {
    rankBy((r) => r.relevance[k].score, `Team ranking of NASA's PSI combustion investigations by relevance to ${label}, score out of 5`, `investigations:ranking-${k}`);
  }
  rankBy(
    (r) => Object.keys(SETTINGS).reduce((sum, k) => sum + r.relevance[k].score, 0),
    "Team ranking of NASA's PSI combustion investigations by total relevance across all five crew settings, score out of 25",
    "investigations:ranking-total",
  );

  // Which investigations burned what, and in which hardware: from data/derived/psi_conditions.json, read from
  // each record's own text. Questions like "Which investigations studied flame spread over solid materials?"
  // need the whole list in one passage; one passage per record only surfaced BASS and BASS-II.
  const condRel = "data/derived/psi_conditions.json";
  files.push({ file: condRel, sha256: sha256(condRel) });
  const cond = JSON.parse(read(condRel)).conditions;
  const nameOf = (acc) => {
    const r = inv.investigations.find((x) => x.accession === acc);
    return r?.acronym ? `${acc} ${r.acronym}` : `${acc} (${(r?.full_name ?? "").split(":")[0].slice(0, 60)})`;
  };
  const listWhere = (pred) => cond.filter(pred).map((c) => nameOf(c.accession)).join(", ") || "none";
  const flame = (c) => /^flame/.test(c.combustion);
  const flown = (c) => c.kind === "flight";
  add(
    "investigation",
    { kind: "row", id: "investigations:by-fuel" },
    "NASA PSI combustion investigations grouped by what burned and where (read from each record's own text; the grouping is the Ignos team's judgment, not NASA's). " +
      `Flame spread over solid materials, flown in microgravity: ${listWhere((c) => flown(c) && flame(c) && c.fuel_phase.includes("solid"))}. ` +
      `Solid materials overheated to make smoke, not flaming, in orbit: ${listWhere((c) => flown(c) && !flame(c) && c.fuel_phase.includes("solid"))}. ` +
      `Liquid fuel droplets burned in microgravity: ${listWhere((c) => flown(c) && flame(c) && c.fuel_phase.includes("liquid"))}. ` +
      `Gaseous fuel flames in microgravity: ${listWhere((c) => flown(c) && flame(c) && c.fuel_phase.includes("gas"))}. ` +
      `No combustion: ${listWhere((c) => c.fuel_phase.length === 0)}. ` +
      `Ground studies or models (not flown): ${listWhere((c) => !flown(c))}. ` +
      "Hardware: " +
      [...new Set(cond.map((c) => c.hardware_label))].map((h) => `${h}: ${cond.filter((c) => c.hardware_label === h).map((c) => nameOf(c.accession)).join(", ")}`).join("; ") +
      ".",
    ["investigations", "solid", "liquid", "gas", "fuel", "hardware", "flame spread"],
  );
}

// ---------------------------------------------------------------------------
// How we measured: pipeline/METHOD.md
// ---------------------------------------------------------------------------
{
  const rel = "pipeline/METHOD.md";
  files.push({ file: rel, sha256: sha256(rel) });
  const sections = read(rel).split(/^## /m).slice(1);
  for (const sec of sections) {
    const [title, ...rest] = sec.split("\n");
    const slug = title.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    for (const chunk of chunks(plain(rest.join("\n")))) {
      add("method", { kind: "row", id: `method:${slug}` }, `Ignos method (${title.trim()}): ${chunk}`, ["method"]);
    }
  }
}

// ---------------------------------------------------------------------------
// Published numbers, quoted: seed_facts.json
// ---------------------------------------------------------------------------
{
  const rel = "data/reference/seed_facts.json";
  files.push({ file: rel, sha256: sha256(rel) });
  for (const f of JSON.parse(read(rel)).facts) {
    add("published_fact", { kind: "paper", id: f.paper, page: f.page }, `${f.label}. Quoted from the source (page ${f.page}): "${f.quote}".`, [f.paper]);
  }
}

// ---------------------------------------------------------------------------
// Papers: Link 2018 main text, and the PDF pages
// ---------------------------------------------------------------------------
{
  const rel = "docs/sources/Link2018_SciRep_main.txt";
  files.push({ file: rel, sha256: sha256(rel) });
  let text = read(rel)
    .split("\n")
    .filter((l) => !l.startsWith("# Written with") && !/^#\s+(Source|Retrieved|License|Supplementary|\s)/.test(l))
    .join("\n");
  const end = text.search(/^#+\s*(References|Acknowledgements|Author information|Rights and permissions)\b/im);
  if (end > 0) text = text.slice(0, end);
  for (const chunk of chunks(plain(text))) {
    add("paper", { kind: "paper", id: "link2018" }, `Link et al. 2018, "The Effect of Gravity on Flame Spread over PMMA Cylinders" (Scientific Reports 8:120): ${chunk}`, ["link2018"]);
  }
}
{
  const rel = "scripts/ask-index/pdf_pages.json";
  files.push({ file: rel, sha256: sha256(rel) });
  const TITLE = {
    ices2025: "Urban, Olson, Dietrich et al., ICES-2025-392, lunar-gravity ignition and flammability",
    link2018_si: "Link et al. 2018, Supplementary Information",
    fm2_2026: "Ferkul et al., LPSC 2026 slides, material flammability at lunar and Martian gravity (FM2)",
  };
  for (const p of JSON.parse(read(rel)).pages) {
    for (const chunk of chunks(p.text)) {
      add("paper", { kind: "paper", id: p.paper, page: p.page }, `${TITLE[p.paper]}, page ${p.page}: ${chunk}`, [p.paper]);
    }
  }
}

// ---------------------------------------------------------------------------
// Meaning search: one embedding per passage, stored in scripts/ask-index/vectors.json
// ---------------------------------------------------------------------------
// The vectors are committed, so the build needs no key and makes no call. Each is stored under a
// hash of the model, size and passage text, so a passage whose text changed has no vector until
// `npm run embed-ask-index` (needs GEMINI_API_KEY) refreshes the file; until then that passage is
// found by keyword search only. Vectors are scaled to int8 and base64-encoded; the cosine
// similarity api/_retrieve.ts computes does not depend on the scale.

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;
const VECTORS = "scripts/ask-index/vectors.json";
const vecKey = (text) => createHash("sha256").update(`${EMBED_MODEL}|${EMBED_DIMS}|${text}`).digest("hex").slice(0, 24);

function quantize(values) {
  const max = Math.max(...values.map(Math.abs)) || 1;
  return Buffer.from(Int8Array.from(values, (v) => Math.round((v / max) * 127)).buffer).toString("base64");
}

async function embedMissing(store) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("--embed needs GEMINI_API_KEY in the environment");
  const todo = passages.filter((p) => !store.vectors[vecKey(p.text)]);
  for (let i = 0; i < todo.length; i += 100) {
    const batch = todo.slice(i, i + 100);
    let res;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((p) => ({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text: p.text }] }, taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: EMBED_DIMS })),
        }),
      });
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt));
    }
    // Status only: an error body can quote the request.
    if (!res.ok) throw new Error(`embedding request failed: HTTP ${res.status}`);
    const { embeddings } = await res.json();
    if (!Array.isArray(embeddings) || embeddings.length !== batch.length) throw new Error("embedding reply has the wrong length");
    batch.forEach((p, k) => {
      const v = embeddings[k].values;
      if (!Array.isArray(v) || v.length !== EMBED_DIMS) throw new Error("embedding has the wrong size");
      store.vectors[vecKey(p.text)] = quantize(v);
    });
    console.log(`build-ask-index: embedded ${Math.min(i + 100, todo.length)} of ${todo.length} new passages`);
  }
  // Keep only vectors the index uses, so the file doesn't grow with every edit.
  const used = new Set(passages.map((p) => vecKey(p.text)));
  store.vectors = Object.fromEntries(Object.entries(store.vectors).filter(([k]) => used.has(k)).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(root, VECTORS), JSON.stringify(store, null, 0) + "\n");
}

let store = { _note: "Written with AI assistance (Claude Code). Generated by `npm run embed-ask-index`.", model: EMBED_MODEL, dims: EMBED_DIMS, vectors: {} };
try {
  const saved = JSON.parse(read(VECTORS));
  if (saved.model === EMBED_MODEL && saved.dims === EMBED_DIMS) store = saved;
} catch {
  // no vectors yet: keyword search only
}
if (process.argv.includes("--embed")) await embedMissing(store);
let withVector = 0;
for (const p of passages) {
  const v = store.vectors[vecKey(p.text)];
  if (v) {
    p.vec = v;
    withVector++;
  }
}
if (withVector < passages.length) {
  console.warn(
    `build-ask-index: ${passages.length - withVector} of ${passages.length} passages have no stored vector (their text is new or changed), so meaning search skips them. Run \`npm run embed-ask-index\` with GEMINI_API_KEY set to refresh ${VECTORS}.`,
  );
}

const header = `// Generated by scripts/build-ask-index.mjs. Do not edit.
import type { Citation } from "@still-air/proof";

export interface IndexPassage {
  id: string;
  /** measurement, nasa_rate, moongap, ranking, investigation, method, published_fact or paper. */
  kind: string;
  citation: Citation;
  text: string;
  /** Lower-case IDs and names this passage is about (test IDs, materials, PSI numbers). */
  subjects: string[];
  /** The passage's ${EMBED_MODEL} embedding (${EMBED_DIMS} int8 values, base64), if one is stored. */
  vec?: string;
}
`;
const info = { files, passages: passages.length, dropped_sentences: droppedSentences, embedding: { model: EMBED_MODEL, dims: EMBED_DIMS, passages_with_vector: withVector } };
writeFileSync(
  join(root, "api", "_ask_index.ts"),
  `${header}
export const ASK_INDEX_INFO = ${JSON.stringify(info, null, 2)} as const;

export const ASK_INDEX: readonly IndexPassage[] = ${JSON.stringify(passages)};
`,
);
const byKind = passages.reduce((m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m), {});
console.log(`build-ask-index: ${passages.length} passages ${JSON.stringify(byKind)}; ${droppedSentences} sentence(s) dropped by the Moon/Mars speed guard`);
