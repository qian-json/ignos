// Written with AI assistance (Claude Code)
// Builds data/derived/psi_conditions.json (contract psi_conditions/1): numeric test conditions for each
// of the 24 PSI combustion investigations, so the dashboard can match a habitat the user describes
// (O2 %, pressure, gravity, airflow, fuel phase) against what each investigation actually tested.
//
// Rules (D8 addendum, relay 2026-11-15):
//   - Every number is selected by hand (the C map below) from that record's own text in data/reference/psi_investigations.json, which
//     carries its sources. Each value keeps the exact text it came from (`source.text`), and the build
//     fails unless that text is in the record's field and every number in `values` is printed in it.
//   - Nothing is guessed: if the record gives no number ("air", "not tabulated", "as FLEX", UNVERIFIED),
//     the field is null and `not_reported` says why. The dashboard shows null as "not reported".
//   - "~", "e.g." or "not tabulated" next to a number make it `approx: true`.
//   - Gravity is 0 (microgravity) or 1 (Earth) only: no PSI record is at lunar or Martian gravity, and no
//     airflow is ever stated for the Moon or Mars.
//
//   node scripts/build-psi-conditions.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "data/reference/psi_investigations.json";
const OUT = "data/derived/psi_conditions.json";

// unit -> factor into the output unit (o2: %, pressure: atm, flow: cm/s)
const TO = {
  pct: 1, fraction: 100,
  atm: 1, bar: 1 / 1.01325, kPa: 1 / 101.325, mmHg: 1 / 760,
  "cm/s": 1, "m/s": 100,
};

// field shorthands: [source field, text, unit, values, opts]
// opts.pm: values are [centre, half-width]; opts.approx forces approx; opts.note adds a note.
const C = {
  "PSI-10": {
    o2: ["atmosphere.o2", "ambient XO2 0.198-0.40", "fraction", [0.198, 0.4], { note: "normal flames' ambient; inverse flames' burner-supply XO2 (0.21-0.85) is not ambient air" }],
    p: [["atmosphere.pressure", "~0.99-1.31 atm (normal)", "atm", [0.99, 1.31], { note: "normal flames, to match o2_pct; inverse flames ran at ~0.43-3.0 atm with burner-supply O2" }]],
    flow: ["flow", "Quiescent ambient", "cm/s", [], { zero: true }],
    fuel: [["gas"], "Gaseous ethylene"], combustion: "flame",
  },
  "PSI-20": {
    o2: ["atmosphere.o2", "21, 25, 26.5, 34, 40 %", "pct", [21, 25, 26.5, 34, 40], { discrete: true }],
    p: [["atmosphere.pressure", "~0.56 to 1 bar", "bar", [0.56, 1]]],
    flow: ["flow", "Quiescent (no forced ambient flow)", "cm/s", [], { zero: true }],
    fuel: [["gas"], "Gaseous emulator", "gas burners emulating condensed fuels (PMMA, Nylon, alcohols)"], combustion: "flame",
  },
  "PSI-21": {
    o2: ["atmosphere.o2", "air coflow (~21%; not tabulated)", "pct", [21], { approx: true }],
    p: null, pNull: "not tabulated",
    flow: null, flowNull: "coflow air speed not given",
    fuel: [["gas"], "Gaseous CH4 and C2H4"], combustion: "flame",
  },
  "PSI-22": {
    o2: ["atmosphere.o2", "air (~21%)", "pct", [21]],
    p: [["atmosphere.pressure", "~100 kPa", "kPa", [100]]],
    flow: null, flowNull: "only an example coflow speed (\"e.g., 3.1 cm/s\") and no-flow cases are given; the tested range is not reported, so 3.1 is not a maximum",
    fuel: [["gas"], "Gaseous CH4 and C2H4"], combustion: "flame",
  },
  "PSI-23": {
    o2: ["atmosphere.o2", "~21% and ~30% O2", "pct", [21, 30], { discrete: true }],
    p: [["atmosphere.pressure", "~1 atm", "atm", [1]]],
    flow: ["flow", "Quiescent ambient", "cm/s", [], { zero: true }],
    fuel: [["gas"], "Gaseous H2, CH4"], combustion: "flame",
  },
  "PSI-25": {
    o2: ["atmosphere.o2", "13.6-22.2 % by volume calibrated initial O2", "pct", [13.6, 22.2], { note: "pre-burn (initial) readings; O2 fell during each burn (\"The O2 decreased during each burn\", ICES-2015-196 p. 4, as quoted in docs/research/accuracy/uncertainty_floor.md), so a step late in a burn ran below its label" }],
    p: [["atmosphere.pressure", "~1 atm; not tabulated in PSI table", "atm", [1]]],
    flow: ["flow", "Forced fan flow 0 to ~53 cm/s", "cm/s", [0, 53], { note: "the 0 is the fan-off step at the end of a test, not a condition with measured spread: Link et al. 2018 report no flame spread below 0.6 cm/s (B16, B19), and Table S1's lowest flow with spread is 0.41 cm/s (P17). Sub-1 cm/s flow labels are approximate: NASA's on-screen air sensor (whole cm/s) reads 0 in most low-flow steps and 2 at the 0.82 cm/s steps, so it cannot confirm them (docs/research/accuracy/air_display/README.md)" }],
    fuel: [["solid"], "PMMA rods"], combustion: "flame",
  },
  "PSI-26": {
    o2: ["atmosphere.o2", "~16.1-22.1 %", "pct", [16.1, 22.1]],
    p: null, pNull: "As-Run values are not labelled with units (UNVERIFIED as atm)",
    flow: [["flow", "most sensitive at 0-5 cm/s", "cm/s", [0, 5]], ["flow", "flight report: up to 40 cm/s", "cm/s", [40]]],
    fuel: [["solid"], "PMMA spheres"], combustion: "flame",
  },
  "PSI-39": {
    o2: ["atmosphere.o2", "0.17-0.21 O2 mole fraction", "fraction", [0.17, 0.21]],
    p: [["atmosphere.pressure", "0.5-5 atm", "atm", [0.5, 5]]],
    flow: ["flow", "Quiescent", "cm/s", [], { zero: true }],
    fuel: [["liquid"], "n-dodecane"], combustion: "flame",
  },
  "PSI-47": {
    o2: null, o2Null: "ISS cabin air, no number given",
    p: null, pNull: "ISS cabin ambient, no number given",
    flow: null, flowNull: "instrument sampling flow only",
    fuel: [[], "No combustion"], combustion: "no combustion (dust measurement)",
  },
  "PSI-60": {
    o2: null, o2Null: "\"air\", no number given",
    p: [["atmosphere.pressure", "~1 atm", "atm", [1]]],
    flow: null, flowNull: "\"as SPICE coflow\", no number given here",
    fuel: [["gas"], "SPICE gaseous jet flames"], combustion: "flame (analysis of SPICE data)",
  },
  "PSI-62": {
    o2: null, o2Null: "\"as in BASS comparisons\", no number given",
    p: null, pNull: "\"as in BASS comparisons\", no number given",
    flow: null, flowNull: "modelled low-speed concurrent flow, no number given",
    fuel: [["solid"], "Modeled solid fuels"], combustion: "flame (model)",
  },
  "PSI-68": {
    o2: ["atmosphere.o2", "0.17, 0.21, 0.25, 0.30 O2 mole fraction", "fraction", [0.17, 0.21, 0.25, 0.3], { discrete: true }],
    p: [["atmosphere.pressure", "0.5-3.0 atm", "atm", [0.5, 3.0]]],
    flow: ["flow", "0.1-5 cm/s (convective-effects tests)", "cm/s", [0.1, 5], { note: "convective-effects tests only" }],
    fuel: [["liquid"], "Droplets 1.5-5 mm"], combustion: "flame",
  },
  "PSI-69": {
    o2: ["atmosphere.o2", "O2 mole fraction 0.12-0.34", "fraction", [0.12, 0.34]],
    p: [["atmosphere.pressure", "~526-2320 mmHg", "mmHg", [526, 2320]]],
    flow: ["flow", "Quiescent chamber", "cm/s", [], { zero: true }],
    fuel: [["liquid"], "Methanol (157 tests) and n-heptane (117 tests) droplets"], combustion: "flame",
  },
  "PSI-98": {
    o2: ["atmosphere.o2", "21.5-21.7 %", "pct", [21.5, 21.7]],
    p: null, pNull: "Cygnus cabin ambient, not tabulated (UNVERIFIED)",
    flow: ["flow", "20 cm/s forced air", "cm/s", [20]],
    fuel: [["solid"], "SIBAL fabric"], combustion: "flame",
  },
  "PSI-99": {
    o2: ["atmosphere.o2", "~21.9-22.1 %", "pct", [21.9, 22.1]],
    p: null, pNull: "Cygnus cabin ambient, not tabulated (UNVERIFIED)",
    flow: ["flow", "20 cm/s (one SIBAL test at 25 cm/s)", "cm/s", [20, 25], { discrete: true }],
    fuel: [["solid"], "silicone (0.27, 0.61, 1.03 mm)"], combustion: "flame",
  },
  "PSI-100": {
    o2: ["atmosphere.o2", "21.0-21.2 %", "pct", [21.0, 21.2]],
    p: null, pNull: "Cygnus cabin ambient (UNVERIFIED)",
    flow: [["flow", "25 cm/s per NASA ASGSR 2017 deck", "cm/s", [25]], ["flow", "PSI table says 30 cm/s (CONFLICT, see notes)", "cm/s", [30], { note: "sources conflict: 25 or 30 cm/s" }]],
    fuel: [["solid"], "SIBAL cotton-fiberglass fabric"], combustion: "flame",
  },
  "PSI-101": {
    o2: ["atmosphere.o2", "ISS cabin air (~21%, not tabulated)", "pct", [21]],
    p: null, pNull: "ISS cabin ambient, no number given",
    flow: ["flow", "Inlet velocity 0, 1, 2, 8 and 8.1 cm/s", "cm/s", [0, 1, 2, 8, 8.1], { discrete: true }],
    fuel: [["solid"], "Overheated Kapton"], combustion: "overheated materials (smoke), not flaming",
  },
  "PSI-102": {
    o2: ["atmosphere.o2", "ISS cabin air (~21%, not tabulated)", "pct", [21]],
    p: null, pNull: "ISS cabin ambient, no number given",
    flow: ["flow", "Air flow over sample 5 and 10 cm/s", "cm/s", [5, 10], { discrete: true }],
    fuel: [["solid", "liquid"], "Overheated (pyrolyzed, not flaming) Teflon"], combustion: "overheated materials (smoke), not flaming",
  },
  "PSI-106": {
    o2: ["atmosphere.o2", "MSG air (~21%)", "pct", [21]],
    p: null, pNull: "ISS ambient, no number given",
    flow: null, flowNull: "only the fuel-jet speed (23-90 cm/s) is given, not the coflow air speed",
    fuel: [["gas"], "Gaseous CH4"], combustion: "flame",
  },
  "PSI-107": {
    o2: ["atmosphere.o2", "21 +/- 1%", "pct", [21, 1], { pm: true }],
    p: [["atmosphere.pressure", "~101 kPa", "kPa", [101]]],
    flow: [["flow", "Coflow air 5.4-65 cm/s at smoke points", "cm/s", [5.4, 65]], ["flow", "table range up to ~85 cm/s", "cm/s", [85]]],
    fuel: [["gas"], "Gaseous ethylene"], combustion: "flame",
  },
  "PSI-115": {
    o2: null, o2Null: "\"air\", no number given",
    p: null, pNull: "not stated",
    flow: ["flow", "Inlet velocity 0.08 and 0.10 m/s", "m/s", [0.08, 0.1], { discrete: true }],
    fuel: [["liquid"], "Dibutyl phthalate surrogate vapor"], combustion: "smoke simulation, not flaming",
  },
  "PSI-117": {
    o2: null, o2Null: "\"as FLEX\", no number given",
    p: null, pNull: "\"as FLEX\", no number given",
    flow: null, flowNull: "modelled perturbations, no number given",
    fuel: [["liquid"], "n-alkane droplets"], combustion: "flame (CFD model)",
  },
  "PSI-142": {
    o2: null, o2Null: "\"varied\", no number given",
    p: null, pNull: "\"up to elevated pressure\", no number given",
    flow: null, flowNull: "counterflow, no speed given",
    fuel: [["liquid", "gas"], "n-heptane, n-decane, n-dodecane, DME"], combustion: "flame (lab)",
  },
  "PSI-159": {
    o2: ["atmosphere.o2", "ambient XO2 0.18-0.40", "fraction", [0.18, 0.4], { note: "normal flames' ambient; inverse flames' burner XO2 (0.12-0.85) is not ambient air" }],
    p: [["atmosphere.pressure", "~0.5-3.3 bar", "bar", [0.5, 3.3]]],
    flow: ["flow", "Quiescent ambient", "cm/s", [], { zero: true }],
    fuel: [["gas"], "Gaseous ethane"], combustion: "flame",
  },
};

// Hardware group, in the challenge statement's own grouping ("ACME's six experiments share modular ACME
// hardware in the Combustion Integrated Rack (CIR); FLEX, FLEX-2, CFI burn droplets in the Multi-user
// Droplet Combustion Apparatus (MDCA) in the CIR; BASS, BASS-II, SPICE, SLICE in the Microgravity Science
// Glovebox (MSG) with the fan-driven SPICE flow duct"). Read from each record's hardware / platform text;
// the matched phrase is kept, and the build fails if a record matches no rule.
const HARDWARE = [
  [/Cygnus/, "platform", "saffire", "Saffire module on a Cygnus cargo ship"],
  [/Multi-user Droplet Combustion Apparatus \(MDCA\)/, "hardware", "cir_mdca", "CIR · droplet apparatus (MDCA)"],
  [/ACME (?:chamber )?insert/, "hardware", "cir_acme", "CIR · ACME burners"],
  [/(?:BASS|SPICE)[\w -]*flow duct/, "hardware", "msg_duct", "MSG · SPICE flow duct"],
  [/Microgravity Science Glovebox \(MSG\)/, "platform", "msg_other", "MSG · other"],
  [/EXPRESS rack/, "platform", "express", "ISS EXPRESS rack"],
  [/^Ground/, "platform", "ground", "Ground lab or computation"],
];

// gravity text -> values in g (0 = microgravity, 1 = Earth). Checked against the record's text.
const GRAVITY = [
  [/^microgravity \((ISS|free-flying Cygnus)\)/, [0], "flight"],
  [/^microgravity \(modeled\)$/, [0], "model"],
  [/^0 g data vs 1 g$/, [0, 1], "analysis of flight and ground data"],
  [/^Earth gravity and microgravity cases \(simulated\)$/, [0, 1], "simulation"],
  [/^1 g \(lab\)$/, [1], "lab"],
];

const get = (rec, path) => path.split(".").reduce((o, k) => o?.[k], rec);
const r3 = (x) => Number(x.toPrecision(3));
const numbersIn = (text) => (text.match(/\d+(\.\d+)?/g) ?? []).map(Number);

function fail(msg) {
  console.error(`build-psi-conditions: ${msg}`);
  process.exit(1);
}

/** One or more [field, text, unit, values, opts] entries -> {min, max, approx, sources, notes}. */
function range(rec, acc, entries, outUnit) {
  const list = Array.isArray(entries[0]) ? entries : [entries];
  let lo = Infinity;
  let hi = -Infinity;
  let approx = false;
  const sources = [];
  const notes = [];
  let discrete = list.length > 0;
  const tested = [];
  for (const [field, text, unit, values, opts = {}] of list) {
    const full = get(rec, field);
    if (typeof full !== "string" || !full.includes(text)) fail(`${acc}: "${text}" is not in ${field}`);
    const printed = numbersIn(text);
    for (const v of values) if (!printed.includes(v)) fail(`${acc}: ${v} is not printed in "${text}"`);
    if (!(unit in TO)) fail(`${acc}: unknown unit ${unit}`);
    let vals = values.map((v) => v * TO[unit]);
    if (opts.pm) vals = [vals[0] - vals[1], vals[0] + vals[1]];
    if (opts.zero) {
      if (!/quiescent/i.test(text)) fail(`${acc}: zero flow without "quiescent" in "${text}"`);
      vals = [0];
    }
    if (opts.zeroToo) vals = [0, ...vals];
    if (opts.discrete) tested.push(...vals);
    else discrete = false;
    lo = Math.min(lo, ...vals);
    hi = Math.max(hi, ...vals);
    approx ||= Boolean(opts.approx) || /~|e\.g\.|not tabulated/i.test(text);
    sources.push({ field, text, unit });
    if (opts.note) notes.push(opts.note);
  }
  // values: only when the record lists separate tested values, so a value between them was NOT tested
  const values = discrete ? [...new Set(tested.map(r3))].sort((a, b) => a - b) : undefined;
  return { min: r3(lo), max: r3(hi), ...(values ? { values } : {}), unit: outUnit, approx, sources, ...(notes.length ? { notes } : {}) };
}

const srcBuf = readFileSync(join(root, SRC));
const src = JSON.parse(srcBuf.toString("utf8"));
const accs = src.investigations.map((r) => r.accession);
const missing = accs.filter((a) => !(a in C));
const extra = Object.keys(C).filter((a) => !accs.includes(a));
if (missing.length || extra.length) fail(`curation out of step with ${SRC}: missing ${missing.join(", ") || "none"}; extra ${extra.join(", ") || "none"}`);

const conditions = src.investigations.map((rec) => {
  const acc = rec.accession;
  const c = C[acc];
  const g = GRAVITY.find(([re]) => re.test(rec.gravity));
  if (!g) fail(`${acc}: no gravity rule for "${rec.gravity}"`);
  const hw = HARDWARE.find(([re, field]) => re.test(String(rec[field] ?? "")));
  if (!hw) fail(`${acc}: no hardware rule for "${rec.hardware}" / "${rec.platform}"`);
  const hwText = String(rec[hw[1]]).match(hw[0])[0];
  const [fuelPhase, fuelText, fuelNote] = c.fuel;
  if (!rec.fuel_sample.includes(fuelText)) fail(`${acc}: "${fuelText}" is not in fuel_sample`);
  const not_reported = {};
  if (!c.o2) not_reported.o2_pct = c.o2Null;
  if (!c.p) not_reported.pressure_atm = c.pNull;
  if (!c.flow) not_reported.forced_flow_cm_s = c.flowNull;
  return {
    accession: acc,
    acronym: rec.acronym,
    kind: rec.investigation_type.startsWith("Ground") ? "ground" : "flight",
    combustion: c.combustion,
    hardware_group: hw[2],
    hardware_label: hw[3],
    hardware_source: { field: hw[1], text: hwText },
    gravity_g: g[1],
    gravity_source: { field: "gravity", text: rec.gravity, reading: g[2] },
    o2_pct: c.o2 ? range(rec, acc, c.o2, "%") : null,
    pressure_atm: c.p ? range(rec, acc, c.p, "atm") : null,
    forced_flow_cm_s: c.flow ? range(rec, acc, c.flow, "cm/s") : null,
    fuel_phase: fuelPhase,
    fuel_source: { field: "fuel_sample", text: fuelText, ...(fuelNote ? { note: fuelNote } : {}) },
    ...(Object.keys(not_reported).length ? { not_reported } : {}),
  };
});

for (const c of conditions) {
  if (c.gravity_g.some((g) => g !== 0 && g !== 1)) fail(`${c.accession}: gravity other than 0 or 1`);
  for (const f of ["o2_pct", "pressure_atm", "forced_flow_cm_s"]) {
    const v = c[f];
    if (v && !(v.min <= v.max)) fail(`${c.accession}.${f}: min > max`);
    if (!v && !c.not_reported?.[f]) fail(`${c.accession}.${f}: null without a reason`);
  }
}

const file = {
  contract: "psi_conditions/1",
  _note: `Written with AI assistance (Claude Code). Generated by scripts/build-psi-conditions.mjs from ${SRC}; never edit by hand.`,
  how: "Numbers hand-transcribed (the C map in scripts/build-psi-conditions.mjs) from the condition text of the team's AI-assisted investigations catalogue, and checked by substring against that text; the catalogue text cites its PSI or paper source. A checked transcription, not parsed from NASA's records (atmosphere.o2, atmosphere.pressure, flow, gravity, fuel_sample), which carries the record's sources. Each value keeps the text it came from; null means the record gives no number, with the reason in not_reported. approx: true when the text says ~, e.g. or not tabulated. O2 in % (mole fraction x 100), pressure in atm, forced flow in cm/s; 0 cm/s means quiescent. gravity_g: 0 = microgravity, 1 = Earth.",
  caveats: [
    "No PSI combustion investigation here ran at lunar or Martian gravity; gravity_g is 0 or 1 only. No airflow is stated for the Moon or Mars.",
    "A range is the span of values the record reports, not a grid: the investigation may not have tested every combination inside it. Where the record lists separate tested values, they are in `values`, and a value between them was not tested (e.g. PSI-23 ran at ~21% and ~30% O2, not 25%).",
    "PSI-10 (ACME Flame Design): O2 and pressure are both for normal flames (ambient O2); inverse flames, fed O2 from the burner, are left out so the two ranges describe the same tests. PSI-159 gives one pressure range for all its flames.",
    "Provenance level: the numbers were selected by hand from the team's investigations catalogue text (docs/research/psi_investigations.json, which names its sources). The build checks that every selected number is printed in that text; it does not re-verify the interpretation against NASA's primary PSI tables.",
    "Keep approx, notes and not_reported visible wherever a value is shown: an approximate or example value is not a measured limit.",
    "O2, pressure and flow are separate spans over all of a record's tests, not joint conditions: a combination inside all three spans is not confirmed as tested. Say 'O2 within the reported span; pressure within the reported span; this combination is not confirmed', never 'tested at your conditions'.",
    "O2 % is a fraction. The oxygen partial pressure also depends on total pressure (30% at 10.2 psi is about 0.21 atm, close to sea-level air; 30% at 1 atm is about 0.30 atm), so matching on O2 % alone overstates how close a 1 atm test is to a low-pressure habitat. No per-record partial pressure is given, because the joint O2 and pressure values are not known.",
    "A 0 at the bottom of a flow span can be a fan-off step rather than a tested spread condition (see PSI-25's note).",
  ],
  derived_from: { file: SRC, sha256: createHash("sha256").update(srcBuf).digest("hex") },
  conditions,
};
writeFileSync(join(root, OUT), `${JSON.stringify(file, null, 1)}\n`);
const n = (f) => conditions.filter((c) => c[f]).length;
console.log(`build-psi-conditions: wrote ${OUT}: ${conditions.length} investigations; O2 ${n("o2_pct")}, pressure ${n("pressure_atm")}, forced flow ${n("forced_flow_cm_s")} with numbers; the rest not reported`);
