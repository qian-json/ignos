// Written with AI assistance (Claude Code)
// Builds data/derived/envelope.json (contract envelope/1): roughly what gravity is low enough that
// low airflow alone can let a flame die, and how far above it the Moon and Earth sit. It is the
// Ignos team's order-of-magnitude reading of a NASA schematic, not a NASA measurement or model. It
// states NO lunar (or any world's) airflow: only gravity levels and ratios (team rule; relay
// 2026-11-15, team decision). Every number is read from a source or computed
// here, and carries its provenance and the formula that made it.
//
// The reading: NASA's FM2 slides (Ferkul, LPSC 2026, PDF p. 17) show a flammability-boundary
// schematic (T'ien 1986) whose axis pairs gravity level with a characteristic flow speed: 1 cm/s at
// 10^-4 g, 4 cm/s at 10^-2 g, 20 cm/s at 1 g. Those three tick labels fit flow ~ g^(1/3), so
//   g ~ (flow / flow_at_1g)^3
// with flow_at_1g taken as a band: 20 cm/s (that axis) to 35 cm/s (ICES-2025-392 p. 10, Takahashi).
// The flows are the lowest at which Link et al. 2018 Table S1 still has a measured spread rate (B16,
// B19, B12, P17; different oxygen and rod sizes). They are not quench speeds: spread continued there,
// so the gravity computed from them is an "at most".
//
// Run after `npm run build -w proof`:  node scripts/build-envelope.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, validateEnvelope } from "../proof/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = "data/reference/seed_facts.json";
const TABLE_S1 = "data/reference/link2018_table_s1.csv";
const OUT = "data/derived/envelope.json";
/** The tests whose photos we measured; Table S1 rows of these samples bound the quench flow. */
const SAMPLES = ["B16", "B19", "B12", "P17"];
const EXPONENT = 1 / 3;

const raw = (rel) => readFileSync(join(root, rel));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

// ---------------------------------------------------------------------------
// Inputs: seed facts (paper, page, verbatim quote) and Table S1 rows
// ---------------------------------------------------------------------------

const seedBuf = raw(SEED);
const seeds = new Map(JSON.parse(seedBuf.toString("utf8")).facts.map((f) => [f.id, f]));
function seed(id, unit) {
  const f = seeds.get(id);
  if (!f) throw new Error(`${SEED}: no seed fact ${id}`);
  if (f.unit !== unit) throw new Error(`${SEED}: ${id} has unit ${f.unit}, expected ${unit}`);
  return { value: f.value, source: { seed: id, paper: f.paper, page: f.page, quote: f.quote } };
}
const anchorFm2 = seed("fm2_2026-axis-flow-1g", "cm/s");
const anchorTakahashi = seed("ices2025-earth-1g-buoyant-velocity", "cm/s");
const axis1e2 = seed("fm2_2026-axis-flow-1e-2g", "cm/s");
const axis1e4 = seed("fm2_2026-axis-flow-1e-4g", "cm/s");
const lunarG = seed("fm2_2026-lunar-g", null);
/** The gravity ticks the flow ticks sit under on FM2 p. 17 ("10-4 10-2 1"; not a seed fact, since "10-4" is not a number the seed verifier can parse). */
const AXIS_G = [1e-4, 1e-2, 1];

const s1Buf = raw(TABLE_S1);
const s1 = parseCsv(s1Buf.toString("utf8"));
const col = (name) => {
  const i = s1.header.indexOf(name);
  if (i < 0) throw new Error(`${TABLE_S1}: no column ${name}`);
  return i;
};
const sustaining = SAMPLES.map((sample) => {
  const rows = s1.records
    .map((rec, row) => ({ rec, row }))
    .filter(({ rec }) => rec.cells[col("sample_id")] === sample && rec.cells[col("rate_x1e3")] !== "");
  if (rows.length === 0) throw new Error(`${TABLE_S1}: no rows with a rate for ${sample}`);
  const lowest = rows.reduce((a, b) => (Number(b.rec.cells[col("flow_cm_s")]) < Number(a.rec.cells[col("flow_cm_s")]) ? b : a));
  const c = (name) => lowest.rec.cells[col(name)];
  return {
    sample_id: sample,
    o2_pct: Number(c("o2_pct")),
    rod_d_cm: Number(c("rod_d_cm")),
    lowest_flow_with_spread_cm_s: Number(c("flow_cm_s")),
    provenance: {
      file: TABLE_S1,
      row: lowest.row,
      column: "flow_cm_s",
      step: Number(c("step")),
      derived: `lowest flow_cm_s among ${sample}'s Table S1 rows with a printed spread rate (Link et al. 2018 SI p. ${c("page")}); a measured spread, not a quench speed`,
    },
  };
});

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

const round = (x, sig = 3) => Number(x.toPrecision(sig));
const flowAt = (anchor, g) => anchor * g ** EXPONENT;
const gFor = (flow, anchor) => (flow / anchor) ** (1 / EXPONENT);

const flows = sustaining.map((s) => s.lowest_flow_with_spread_cm_s);
const flowLow = Math.min(...flows);
const flowHigh = Math.max(...flows);
const aLow = Math.min(anchorFm2.value, anchorTakahashi.value);
const aHigh = Math.max(anchorFm2.value, anchorTakahashi.value);
const gLow = gFor(flowLow, aHigh);
const gHigh = gFor(flowHigh, aLow);
const lowestSample = sustaining.find((s) => s.lowest_flow_with_spread_cm_s === flowLow).sample_id;
const highestSample = sustaining.filter((s) => s.lowest_flow_with_spread_cm_s === flowHigh).map((s) => s.sample_id).join(", ");

function world(id, label, g, gSource) {
  return {
    id,
    label,
    // Everything about a world here is the team's reading, not NASA's (envelope/1 requires this).
    estimate: true,
    g_earth: g,
    times_threshold_at_least: round(g / gHigh),
    times_threshold_at_most: round(g / gLow),
    provenance: {
      g_earth: gSource,
      times_threshold_at_least: { derived: `${g} / threshold.g_high`, from: ["threshold"] },
      times_threshold_at_most: { derived: `${g} / threshold.g_low`, from: ["threshold"] },
    },
  };
}

const exponentFromAxis = Math.log(anchorFm2.value / axis1e4.value) / Math.log(AXIS_G[2] / AXIS_G[0]);

// The exponent is a reading, not a fit: show what a square-root scaling (flow ~ g^(1/2)) would give,
// so no ratio is quoted as if the cube root were known. Gravity levels and Moon ratios only.
const SQRT = 1 / 2;
const gAt = (flow, anchor, k) => (flow / anchor) ** (1 / k);
const sensitivity = [EXPONENT, SQRT].map((k) => {
  const lo = gAt(flowLow, aHigh, k);
  const hi = gAt(flowHigh, aLow, k);
  return { exponent: round(k, 4), g_low: round(lo), g_high: round(hi), moon_times_threshold_at_least: round(lunarG.value / hi), moon_times_threshold_at_most: round(lunarG.value / lo) };
});
const moonFloor = Math.floor(Math.min(...sensitivity.map((r) => r.moon_times_threshold_at_least)) / 100) * 100;

const file = {
  contract: "envelope/1",
  _note:
    `Written with AI assistance (Claude Code). Generated by scripts/build-envelope.mjs from ${SEED} and ${TABLE_S1}; never edit by hand.`,
  estimate_note:
    "Everything computed here is the Ignos team's order-of-magnitude reading of a NASA schematic, not a NASA measurement or model. It states no airflow for the Moon or any world: NASA reports the lunar buoyant velocity as not known (ICES-2025-392 pp. 8 and 10).",
  model: {
    law: "order-of-magnitude reading: g ~ (flow / flow_at_1g)^3, from flow ~ g^(1/3)",
    exponent: round(EXPONENT, 4),
    source: "FM2 (Ferkul, LPSC 2026) PDF p. 17: a flammability-boundary schematic (T'ien 1986) whose axis is labelled 'Gravity Level (g/gEarth) or Characteristic Flow Speed (cm/s)', ticks 10-4, 10-2, 1 and 1, 4, 20. Three tick labels on a schematic, not a fit to data.",
  },
  anchors: {
    low: { flow_1g_cm_s: aLow, provenance: aLow === anchorFm2.value ? anchorFm2.source : anchorTakahashi.source },
    high: { flow_1g_cm_s: aHigh, provenance: aHigh === anchorFm2.value ? anchorFm2.source : anchorTakahashi.source },
  },
  sustaining_flow: sustaining,
  threshold: {
    flow_low_cm_s: flowLow,
    flow_high_cm_s: flowHigh,
    g_low: round(gLow),
    g_high: round(gHigh),
    bound: "at most",
    provenance: {
      flow_low_cm_s: { derived: `min of sustaining_flow (${lowestSample})`, from: ["sustaining_flow"] },
      flow_high_cm_s: { derived: `max of sustaining_flow (${highestSample})`, from: ["sustaining_flow"] },
      g_low: { derived: `(${flowLow} / ${aHigh})^3`, from: ["threshold.flow_low_cm_s", "anchors.high"] },
      g_high: { derived: `(${flowHigh} / ${aLow})^3`, from: ["threshold.flow_high_cm_s", "anchors.low"] },
    },
  },
  worlds: [
    world("moon", "Moon (lunar gravity)", lunarG.value, lunarG.source),
    world("earth", "Earth (1 g)", 1, { derived: "1 g by definition" }),
  ],
  checks: [
    {
      id: "axis-ticks",
      what: "The g^(1/3) reading with the 20 cm/s tick against the other two ticks on the same FM2 axis",
      rows: [
        { g_earth: AXIS_G[1], axis_flow_cm_s: axis1e2.value, reading_flow_cm_s: round(flowAt(anchorFm2.value, AXIS_G[1])), provenance: axis1e2.source },
        { g_earth: AXIS_G[0], axis_flow_cm_s: axis1e4.value, reading_flow_cm_s: round(flowAt(anchorFm2.value, AXIS_G[0])), provenance: axis1e4.source },
      ],
      exponent_from_axis: round(exponentFromAxis),
      result: `the axis's end ticks imply an exponent of ${round(exponentFromAxis)}, against 1/3 in the reading`,
    },
    {
      id: "exponent-sensitivity",
      what: "The same reading with a square-root scaling (flow ~ g^(1/2)) instead of the cube root",
      rows: sensitivity,
      result: `with the square root the threshold is ${sensitivity[1].g_low} to ${sensitivity[1].g_high} g and the Moon sits ${sensitivity[1].moon_times_threshold_at_least} to ${sensitivity[1].moon_times_threshold_at_most} times above it; with the cube root, ${sensitivity[0].moon_times_threshold_at_least} to ${sensitivity[0].moon_times_threshold_at_most}. Under either, at least about ${moonFloor} times above, so only that floor is robust to the exponent`,
    },
    {
      id: "earth-anchors",
      what: "The two 1 g anchors disagree, so the band carries both",
      ratio: round(aHigh / aLow),
      result: `${aHigh} cm/s is ${round(aHigh / aLow)} times ${aLow} cm/s; every threshold here is a band between them`,
    },
    {
      id: "earth-observed",
      what: "Normal gravity: the flame makes its own flow, so cutting a slow forced flow does not stop it",
      result:
        "consistent: Link et al. 2018 (Sci. Rep. 8:120, p. 5) report spread nearly independent of forced flow below the buoyant flow, and no low-flow extinction in normal gravity",
    },
    {
      id: "iss-observed",
      what: "Orbit: with no gravity-driven flow, a slow enough forced flow lets the flame die",
      result:
        "consistent: Link et al. 2018 (p. 4-5) report no flame spread below 0.6 cm/s for B16 and B19; Table S1 shows B12 and P17 still spreading at 0.48 and 0.41 cm/s, so these flows are lowest measured spreads, not quench speeds, and the threshold is an 'at most'",
    },
  ],
  caveats: [
    "An order-of-magnitude reading of three tick labels on a NASA schematic (FM2 PDF p. 17, T'ien 1986), not a model fitted to data and not a measurement. It gives gravity levels only, never an airflow for the Moon: NASA reports the lunar buoyant velocity as not known (ICES-2025-392 pp. 8 and 10).",
    `The cube root is read from a schematic, not fitted. With a square-root scaling the Moon sits ${sensitivity[1].moon_times_threshold_at_least} to ${sensitivity[1].moon_times_threshold_at_most} times above the threshold instead of ${sensitivity[0].moon_times_threshold_at_least} to ${sensitivity[0].moon_times_threshold_at_most}; only "at least about ${moonFloor} times above, under either scaling" is robust (checks: exponent-sensitivity).`,
    "Table S1's sub-1 cm/s flow labels (0.41 to 0.83 cm/s), which set this threshold, are the least certain numbers in the data: NASA's on-screen air sensor (whole cm/s) reads 0 in most low-flow steps and 2 at the 0.82 cm/s steps, so it cannot confirm them, and NASA's fan calibrations do not reproduce them (team check, docs/research/accuracy/air_display/README.md). Treat them as approximate.",
    "Table S1's lowest flows are where spread was still measured, in tests at different oxygen and rod sizes, not quench speeds; so the threshold gravity is 'at most' that value.",
    "The 1 g flow comes from a NASA slide (20 cm/s) and an Earth estimate (35 cm/s, Takahashi); they differ by a factor of 1.75, and the band carries both.",
    "Gravity only: oxygen also matters (more oxygen lets a flame live on less flow), and that axis is not in this file.",
    "Rod samples of black PMMA only (Link et al. 2018); other materials and shapes may differ.",
  ],
  derived_from: [
    { file: SEED, sha256: sha(seedBuf) },
    { file: TABLE_S1, sha256: sha(s1Buf) },
  ],
};

const res = validateEnvelope(file);
if (!res.ok) {
  console.error("build-envelope: the output fails envelope/1, nothing written:");
  for (const i of res.issues.slice(0, 50)) console.error(`  ${i.path}: ${i.message}`);
  process.exit(1);
}
writeFileSync(join(root, OUT), `${JSON.stringify(file, null, 2)}\n`);
const moon = file.worlds[0];
console.log(
  `build-envelope: wrote ${OUT}: threshold ${file.threshold.g_low} to ${file.threshold.g_high} g (at most); ` +
    `Moon ${moon.times_threshold_at_least}x to ${moon.times_threshold_at_most}x over it`,
);
