// Written with AI assistance (Claude Code)
/**
 * The fact index: every number the verifier may accept, each stamped with where it came from.
 *
 * Built from (1) our data files, where every numeric cell becomes a fact carrying
 * {file, row, column, sha256}, and (2) seed facts: published numbers with paper, page and quote.
 * CSV rows are 0-based data rows (comment lines and the header don't count), the same
 * convention moongap.json provenance uses. For JSON files `row` is 0 and `column` is the
 * JSON path of the value.
 */
import { parseCsv } from "./csv.js";
import { MATERIALS, PAPER_IDS, tableS1RateMmS, type PaperId, type PaperSource } from "./contracts.js";
import type { Provenance } from "./index.js";
import { UNITS, unitFromName } from "./units.js";
import { findNumbers } from "./numbers.js";

export interface Fact {
  /** Stable id: `<dataset>:<cite or row>:<column>` or the seed fact's id. */
  id: string;
  value: number;
  /** Canonical unit (see units.ts), or null for a pure count. */
  unit: string | null;
  /** What the number is, in words, for tooltips. */
  label: string;
  /** Dataset (`spread_rates`, `moongap`, ...) or paper id for seed facts. */
  dataset: string;
  /** Row citation this fact belongs to (`spread_rates:B16/2`, `moongap:pmma`), or null. */
  cite: string | null;
  source: Provenance | PaperSource;
}

export interface SeedFact {
  id: string;
  paper: PaperId;
  page: number;
  quote: string;
  value: number;
  unit: string | null;
  label: string;
}

/** Data files the index is built from, and how rows are cited. Mock files never go in. */
export const FACT_FILES = [
  "data/derived/spread_rates.csv",
  "data/reference/link2018_table_s1.csv",
  "data/reference/ices2025_digitized.csv",
  "web/src/data/moongap.json",
  "data/derived/control_result.json",
  "data/reference/psi_investigations.json",
  "data/derived/envelope.json",
  "data/derived/flame_model.json",
] as const;

/**
 * The validation rule (pipeline/METHOD.md, Limitations; the 5:15 PM plan update): a fan step counts
 * as validated only below 1 cm/s and only when the tracker didn't flag it LOW CONFIDENCE. Early
 * high-flow steps share an ignition-transient bias in every test, so they never count. A method
 * rule, not a measurement; the UI and the fact index both use this one function.
 */
export const VALIDATED_BELOW_CM_S = 1;
export function isValidatedStep(row: { flow_cm_s?: string | number; notes?: string } | Record<string, string>): boolean {
  return Number(row.flow_cm_s) < VALIDATED_BELOW_CM_S && !/LOW CONFIDENCE/i.test(row.notes ?? "");
}

/** The headline summary of spread_rates.csv, computed with the validation rule. */
export function spreadSummary(rows: Record<string, string>[]) {
  const ok = rows.map((r, i) => ({ r, i })).filter(({ r }) => isValidatedStep(r) && r.pct_error !== "");
  const abs = ok.map(({ r }) => Math.abs(Number(r.pct_error))).sort((a, b) => a - b);
  const m = abs.length >> 1;
  const median = abs.length === 0 ? NaN : abs.length % 2 ? abs[m] : (abs[m - 1] + abs[m]) / 2;
  return {
    rows: ok.map(({ i }) => i),
    nValidated: ok.length,
    nTests: new Set(ok.map(({ r }) => r.test_id)).size,
    medianAbsPct: median,
    maxAbsPct: abs.length ? abs[abs.length - 1] : NaN,
    meanSignedPct: ok.length ? ok.reduce((a, { r }) => a + Number(r.pct_error), 0) / ok.length : NaN,
  };
}

const SKIP_COLUMNS = new Set(["page", "step", "n_frames", "segment", "rank", "n"]);

function csvFacts(
  file: string,
  text: string,
  sha256: string,
  dataset: string,
  citeOf: (row: Record<string, string>, i: number) => string | null,
  keep: (row: Record<string, string>) => boolean = () => true,
): Fact[] {
  const parsed = parseCsv(text);
  const facts: Fact[] = [];
  parsed.records.forEach((rec, i) => {
    const row: Record<string, string> = {};
    parsed.header.forEach((h, k) => (row[h] = rec.cells[k] ?? ""));
    if (!keep(row)) return;
    const cite = citeOf(row, i);
    parsed.header.forEach((column) => {
      if (SKIP_COLUMNS.has(column)) return;
      const raw = row[column];
      if (raw === "" || !/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(raw)) return;
      const u = unitFromName(column);
      if (!u) return;
      facts.push({
        id: `${dataset}:row${i}:${column}`,
        value: Number(raw) * u.scale,
        unit: u.unit,
        label: `${column} (${cite ?? `row ${i}`})`,
        dataset,
        cite,
        source: { file, row: i, column, sha256 },
      });
    });
  });
  return facts;
}

function spreadRatesFacts(file: string, text: string, sha256: string): Fact[] {
  const seen = new Map<string, number>();
  const facts = csvFacts(file, text, sha256, "spread_rates", (row) => {
    const k = (seen.get(row.test_id) ?? 0) + 1;
    seen.set(row.test_id, k);
    return `spread_rates:${row.test_id}/${k}`;
  });
  // the headline the team quotes (median, worst, mean signed error, counts), as facts of their own,
  // cited as the method's validation section and stamped with every row they were computed from
  const p = parseCsv(text);
  const rows = p.records.map((rec) => Object.fromEntries(p.header.map((h, k) => [h, rec.cells[k] ?? ""])));
  const s = spreadSummary(rows);
  const rule = `validated rows only (flow < ${VALIDATED_BELOW_CM_S} cm/s, not LOW CONFIDENCE)`;
  const add = (key: string, value: number, unit: string | null, how: string) => {
    if (!Number.isFinite(value)) return;
    facts.push({
      id: `method:validation:${key}`, value, unit, label: `${how} (${rule})`, dataset: "method", cite: "method:validation",
      source: { file, row: s.rows[0] ?? 0, column: "pct_error", sha256, rows: s.rows, derived: `${how}, ${rule}` },
    });
  };
  add("n_validated", s.nValidated, null, "number of validated fan steps");
  add("n_tests", s.nTests, null, "number of tests with a validated step");
  add("median_abs_pct_error", s.medianAbsPct, "%", "median absolute error against NASA's published rate");
  add("max_abs_pct_error", s.maxAbsPct, "%", "largest absolute error against NASA's published rate");
  add("mean_signed_pct_error", s.meanSignedPct, "%", "mean signed error against NASA's published rate");
  return facts;
}

/**
 * The fields of an investigation record that /api/ask quotes in its passage (scripts/build-ask-index.mjs)
 * and that hold measured conditions or findings. Their numbers become facts, read with the gate's own
 * number reader, so an answer that copies them from the cited passage verifies. They are the team
 * catalogue's numbers (each record names its PSI or paper source), labelled as such.
 */
const INVESTIGATION_TEXT_FIELDS = ["fuel_sample", "atmosphere.o2", "atmosphere.pressure", "flow", "key_finding"] as const;

/** The team's relevance scores (1 to 5, one per crew setting), each archive's size, and the numbers in its condition text, per investigation. */
function investigationsFacts(file: string, text: string, sha256: string): Fact[] {
  const doc = JSON.parse(text) as { investigations?: ({ accession: string; acronym?: string; relevance?: Record<string, { score: number }>; psi_data?: { n_files?: number } } & Record<string, unknown>)[] };
  const facts: Fact[] = [];
  (doc.investigations ?? []).forEach((iv, i) => {
    const cite = `investigations:${iv.accession}`;
    for (const [setting, r] of Object.entries(iv.relevance ?? {})) {
      if (typeof r?.score !== "number") continue;
      const column = `investigations[${i}].relevance.${setting}.score`;
      facts.push({ id: `investigations:${iv.accession}:${setting}`, value: r.score, unit: null, label: `team relevance score for ${setting.replace(/_/g, " ")}, ${iv.acronym ?? iv.accession} (team judgment, not NASA's)`, dataset: "investigations", cite, source: { file, row: 0, column, sha256 } });
    }
    if (typeof iv.psi_data?.n_files === "number")
      facts.push({ id: `investigations:${iv.accession}:n_files`, value: iv.psi_data.n_files, unit: null, label: `files in the PSI archive, ${iv.acronym ?? iv.accession}`, dataset: "investigations", cite, source: { file, row: 0, column: `investigations[${i}].psi_data.n_files`, sha256 } });
    for (const field of INVESTIGATION_TEXT_FIELDS) {
      const value = field.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), iv);
      if (typeof value !== "string") continue;
      const found = findNumbers(value);
      const seen = new Set<string>();
      found.forEach((n, j) => {
        // "0 to ~53 cm/s": the gate's range rule skips the "~", so the bare 0 also gets the next number's unit
        const next = found[j + 1];
        const units = [n.unit];
        if (n.unit === null && next?.unit && /^\s*(?:[-–—]|to|and)\s*~?\s*$/i.test(value.slice(n.end, next.start))) units.push(next.unit);
        for (const unit of units) {
          const key = `${n.value}|${unit}`;
          if (seen.has(key)) continue;
          seen.add(key);
          facts.push({
            id: `investigations:${iv.accession}:${field}:${seen.size}`,
            value: n.value,
            unit,
            label: `"${n.text}" in the ${field.replace(/\./g, " ")} of ${iv.acronym ?? iv.accession} (team catalogue of the PSI record)`,
            dataset: "investigations",
            cite,
            source: { file, row: 0, column: `investigations[${i}].${field}`, sha256 },
          });
        }
      });
    }
  });
  return facts;
}

function tableS1Facts(file: string, text: string, sha256: string): Fact[] {
  const cite = (row: Record<string, string>) => `table_s1:${row.sample_id}/${row.step}`;
  const facts = csvFacts(file, text, sha256, "table_s1", cite);
  // The printed rate is V_f × 10³ in cm/s; the fact users will quote is the mm/s value.
  parseCsv(text).records.forEach((rec, i) => {
    const header = parseCsv(text).header;
    const row: Record<string, string> = {};
    header.forEach((h, k) => (row[h] = rec.cells[k] ?? ""));
    if (row.rate_x1e3 === "" || Number.isNaN(Number(row.rate_x1e3))) return;
    facts.push({
      id: `table_s1:row${i}:rate_mm_s`,
      value: tableS1RateMmS({ rate_x1e3: Number(row.rate_x1e3) }),
      unit: "mm/s",
      label: `Link 2018 Table S1 spread rate in mm/s (${cite(row)}; printed ${row.rate_x1e3} × 10⁻³ cm/s)`,
      dataset: "table_s1",
      cite: cite(row),
      source: { file, row: i, column: "rate_x1e3", sha256 },
    });
  });
  return facts;
}

/** JSON keys whose numbers are never claims an answer would make (plot samples, row indices). */
const JSON_SKIP = /(^|\.)(curve|provenance|rows|tolerance|confidence|n|rank|r2|slope_se|intercept_se)(\.|\[|$)/;

function jsonFacts(file: string, value: unknown, sha256: string, dataset: string, citeOf: (path: string) => string | null): Fact[] {
  const facts: Fact[] = [];
  const walk = (v: unknown, path: string, key: string) => {
    if (JSON_SKIP.test(path)) return;
    if (typeof v === "number") {
      const u = unitFromName(key);
      if (!u || !Number.isFinite(v)) return;
      facts.push({ id: `${dataset}:${path}`, value: v * u.scale, unit: u.unit, label: path, dataset, cite: citeOf(path), source: { file, row: 0, column: path, sha256 } });
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, key));
    else if (typeof v === "object" && v !== null)
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, k);
  };
  walk(value, "", "");
  return facts;
}

function moonGapCite(path: string): string | null {
  const m = /^materials\.([a-z0-9_]+)\./.exec(path);
  return m && (MATERIALS as readonly string[]).includes(m[1]) ? `moongap:${m[1]}` : null;
}

/** Facts from one data file, by its repo path. Returns [] for files the index doesn't use. */
export function factsFromFile(path: string, text: string, sha256: string): Fact[] {
  if (/\/mock\//.test(path)) return [];
  if (path.endsWith("spread_rates.csv")) return spreadRatesFacts(path, text, sha256);
  if (path.endsWith("link2018_table_s1.csv")) return tableS1Facts(path, text, sha256);
  if (path.endsWith("ices2025_digitized.csv"))
    return csvFacts(path, text, sha256, "ices2025_digitized", (row) => `moongap:${row.material}`, (row) => row.point_kind !== "fit_end");
  if (path.endsWith("moongap.json")) return jsonFacts(path, JSON.parse(text), sha256, "moongap", moonGapCite);
  if (path.endsWith("control_result.json")) return jsonFacts(path, JSON.parse(text), sha256, "control", () => null);
  if (path.endsWith("psi_investigations.json")) return investigationsFacts(path, text, sha256);
  if (path.endsWith("envelope.json")) return envelopeFacts(path, text, sha256);
  if (path.endsWith("flame_model.json")) return flameModelFacts(path, text, sha256);
  return [];
}

/**
 * flame_model.json (a model, not a NASA measurement; validation only). Its fitted parameters are cited
 * as flame_model:parameters and its validation numbers as flame_model:validation.
 */
function flameModelFacts(path: string, text: string, sha256: string): Fact[] {
  return jsonFacts(path, JSON.parse(text), sha256, "flame_model", (p) =>
    /^model\.parameters/.test(p) ? "flame_model:parameters" : /^validation/.test(p) ? "flame_model:validation" : null,
  );
}

/**
 * envelope.json (the team's scaling estimate): a world's numbers are cited as envelope:<world id>
 * (envelope:moon), the threshold and the Table S1 flows behind it as envelope:threshold, and the
 * model's anchors as envelope:model.
 */
function envelopeFacts(path: string, text: string, sha256: string): Fact[] {
  const value = JSON.parse(text) as { worlds?: { id?: string }[] };
  const ids = (value.worlds ?? []).map((w) => w.id ?? "");
  return jsonFacts(path, value, sha256, "envelope", (p) => {
    const w = /^worlds\[(\d+)\]/.exec(p);
    if (w) return ids[Number(w[1])] ? `envelope:${ids[Number(w[1])]}` : null;
    if (/^(threshold|sustaining_flow)/.test(p)) return "envelope:threshold";
    if (/^anchors/.test(p)) return "envelope:model";
    return null;
  });
}

export function factsFromSeed(seed: readonly SeedFact[]): Fact[] {
  return seed.map((s) => ({
    id: s.id,
    value: s.value,
    unit: s.unit,
    label: s.label,
    dataset: s.paper,
    cite: null,
    source: { paper: s.paper, page: s.page, quote: s.quote },
  }));
}

/** Checks a seed-facts file. Returns problems, one line each; empty means usable. */
export function checkSeedFacts(value: unknown): string[] {
  const problems: string[] = [];
  const list = (value as { facts?: unknown })?.facts;
  if (!Array.isArray(list)) return ["expected { facts: [...] }"];
  const ids = new Set<string>();
  list.forEach((f: any, i) => {
    const at = `facts[${i}]`;
    if (typeof f?.id !== "string" || !f.id) problems.push(`${at}.id: required`);
    else if (ids.has(f.id)) problems.push(`${at}.id: duplicate ${f.id}`);
    else ids.add(f.id);
    if (!(PAPER_IDS as readonly string[]).includes(f?.paper)) problems.push(`${at}.paper: unknown paper ${f?.paper}`);
    if (!Number.isInteger(f?.page) || f.page < 1) problems.push(`${at}.page: expected a page number`);
    if (typeof f?.quote !== "string" || f.quote.length < 3) problems.push(`${at}.quote: required`);
    if (typeof f?.value !== "number" || !Number.isFinite(f.value)) problems.push(`${at}.value: expected a number`);
    if (f?.unit !== null && !(f?.unit in UNITS)) problems.push(`${at}.unit: unknown unit ${f?.unit}`);
    if (typeof f?.label !== "string" || !f.label) problems.push(`${at}.label: required`);
  });
  return problems;
}
