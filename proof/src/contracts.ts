// Written with AI assistance (Claude Code)
/**
 * Data contracts: the exact shape of every file or payload teammates hand over, as
 * TypeScript types plus runtime validators (no dependencies).
 *
 * This file is the source of truth; docs/DATA_CONTRACTS.md is the short version for the
 * team chat. It holds formats, units and consistency rules only, never a scientific value:
 * every number users see comes from the data files themselves.
 */
import { CsvSyntaxError, parseCsv } from "./csv.js";
import type { Provenance } from "./index.js";

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface Issue {
  /** Where: `line 7, rate_mm_s`, `header`, `materials[2].rank`, ... */
  path: string;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

function result<T>(issues: Issue[], value: T): Result<T> {
  return issues.length ? { ok: false, issues } : { ok: true, value };
}

// ---------------------------------------------------------------------------
// Shared vocabularies
// ---------------------------------------------------------------------------

export const MATERIALS = [
  "pmma",
  "p213",
  "cotton_flaming",
  "cotton_smolder",
  "polycarbonate",
  "nomex_velcro",
] as const;
export type Material = (typeof MATERIALS)[number];

/** `wstf`: 1-g tests at NASA White Sands. `lunar`: drop-tower centrifuge tests at 1/6 g. */
export const DIGITIZED_SOURCES = ["wstf", "lunar"] as const;
export type DigitizedSource = (typeof DIGITIZED_SOURCES)[number];

export const ASK_MODES = ["summarize", "rank", "interpret"] as const;
export type AskMode = (typeof ASK_MODES)[number];

export const PAPER_IDS = [
  "link2018",
  "link2018_si",
  "ices2025",
  "bass2_results",
  "ruff",
  "fm2_2026",
  "nasa_std_3001",
  "jaxa_flare",
] as const;
export type PaperId = (typeof PAPER_IDS)[number];

/** Datasets a row citation can point into: `<dataset>:<key>`. */
export const ROW_DATASETS = ["spread_rates", "table_s1", "moongap", "control", "investigations", "method", "envelope", "flame_model"] as const;

/** The only allowed value for a lunar airflow: NASA says it is not determined. */
export const LUNAR_FLOW = "not determined";

/** Table S1 sample IDs: B13a, C25, P17. Mock IDs carry a `MOCK-` prefix. */
export const SAMPLE_ID = /^(MOCK-)?[BCP]\d+[a-z]?$/;
/** Earth control clips (Plan B). */
export const CONTROL_ID = /^(MOCK-)?CTRL-\d+$/;
/** Anything with an edge series or overlay: a sample or a control clip. */
export const TRACKED_ID = /^(MOCK-)?([BCP]\d+[a-z]?|CTRL-\d+)$/;
export const ROW_CITATION_ID = /^(spread_rates|table_s1|moongap|control|investigations|method|envelope|flame_model):[A-Za-z0-9_./-]+$/;
const SHA256 = /^[0-9a-f]{64}$/;
/** A mock identifier (MOCK-B01, MOCK-CTRL-1). Real files must never contain one. */
const MOCK_ID = /MOCK-[A-Z0-9]/;

export const OVERLAY_MAX_BYTES = 15 * 1024 * 1024;

// ---------------------------------------------------------------------------
// CSV decoding
// ---------------------------------------------------------------------------

type Cell =
  | { name: string; type: "string"; required?: boolean; pattern?: RegExp; oneOf?: readonly string[] }
  | {
      name: string;
      type: "number";
      required?: boolean;
      min?: number;
      gt?: number;
      max?: number;
      integer?: boolean;
    };

type CellValue = string | number | null;
type RawRow = Record<string, CellValue>;

/** Plain decimal or exponent notation. No units, thousands separators, NaN or inf. */
const NUMBER_TEXT = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;

function decodeCell(raw: string, c: Cell, path: string, issues: Issue[]): CellValue {
  if (c.type === "string") {
    if (raw === "") {
      if (c.required) issues.push({ path, message: "required, got an empty cell" });
      return "";
    }
    if (raw !== raw.trim()) issues.push({ path, message: "leading or trailing spaces" });
    if (c.pattern && !c.pattern.test(raw)) issues.push({ path, message: `"${raw}" does not match ${c.pattern}` });
    if (c.oneOf && !c.oneOf.includes(raw))
      issues.push({ path, message: `"${raw}" is not one of ${c.oneOf.join(", ")}` });
    return raw;
  }
  if (raw === "") {
    if (c.required) issues.push({ path, message: "required, got an empty cell" });
    return null;
  }
  if (!NUMBER_TEXT.test(raw)) {
    issues.push({
      path,
      message: `"${raw}" is not a plain number (dot decimals, no units; leave the cell empty for missing)`,
    });
    return null;
  }
  const v = Number(raw);
  if (c.integer && !Number.isInteger(v)) issues.push({ path, message: `${raw} must be a whole number` });
  if (c.min !== undefined && v < c.min) issues.push({ path, message: `${raw} is below ${c.min}` });
  if (c.gt !== undefined && v <= c.gt) issues.push({ path, message: `${raw} must be greater than ${c.gt}` });
  if (c.max !== undefined && v > c.max) issues.push({ path, message: `${raw} is above ${c.max}` });
  return v;
}

interface Table {
  mock: boolean;
  rows: RawRow[];
  lines: number[];
}

function readTable(text: string, cells: readonly Cell[], issues: Issue[]): Table | null {
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (e) {
    if (e instanceof CsvSyntaxError) {
      issues.push({ path: `line ${e.line}`, message: e.message });
      return null;
    }
    throw e;
  }
  const mock = parsed.meta.mock === "true";
  // Real files may carry the team's required "Written with AI assistance" header comment, nothing else.
  const extraComments = parsed.comments.filter((c) => !/^\s*Written with AI assistance\b/.test(c));
  if (extraComments.length > 0 && !mock)
    issues.push({
      path: "line 1",
      message: 'comment lines are only allowed in mock files (# mock: true), apart from a "# Written with AI assistance" header',
    });

  const expected = cells.map((c) => c.name).join(",");
  const got = parsed.header.join(",");
  if (got !== expected) {
    issues.push({ path: "header", message: `expected exactly "${expected}", got "${got}"` });
    return null;
  }

  const rows: RawRow[] = [];
  const lines: number[] = [];
  let sawMockId = false;
  for (const rec of parsed.records) {
    if (rec.cells.length !== cells.length) {
      issues.push({ path: `line ${rec.line}`, message: `expected ${cells.length} cells, got ${rec.cells.length}` });
      continue;
    }
    const row: RawRow = {};
    cells.forEach((c, k) => {
      const raw = rec.cells[k];
      if (MOCK_ID.test(raw)) sawMockId = true;
      row[c.name] = decodeCell(raw, c, `line ${rec.line}, ${c.name}`, issues);
    });
    rows.push(row);
    lines.push(rec.line);
  }
  if (parsed.records.length === 0) issues.push({ path: "file", message: "no data rows" });
  if (sawMockId && !mock)
    issues.push({ path: "file", message: "contains MOCK- IDs but is not flagged as mock (# mock: true)" });
  return { mock, rows, lines };
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** Checks that rows sharing a key are contiguous; returns groups in file order. */
function groupContiguous<T>(rows: T[], key: (r: T) => string, lines: number[], issues: Issue[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  let prev: string | undefined;
  rows.forEach((r, i) => {
    const k = key(r);
    if (k !== prev && groups.has(k))
      issues.push({ path: `line ${lines[i]}`, message: `rows for ${k} must be contiguous` });
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(i);
    prev = k;
  });
  return groups;
}

// ---------------------------------------------------------------------------
// A. spread_rates.csv: one row per flow segment
// ---------------------------------------------------------------------------

export const SPREAD_RATES_COLUMNS = [
  "test_id",
  "rod_d_mm",
  "o2_pct",
  "flow_cm_s",
  "t_start_s",
  "t_end_s",
  "rate_mm_s",
  "ci95_mm_s",
  "threshold_spread_mm_s",
  "nasa_rate_mm_s",
  "pct_error",
  "flame_len_mm",
  "blue_frac",
  "extinction_s",
  "n_frames",
  "notes",
] as const;

export interface SpreadRateRow {
  test_id: string;
  rod_d_mm: number;
  o2_pct: number;
  flow_cm_s: number;
  /** Seconds since the test's first photo (EXIF DateTimeOriginal + SubSecTimeOriginal). */
  t_start_s: number;
  t_end_s: number;
  /** Positive in the spread direction. Null only for an unusable segment (notes say why). */
  rate_mm_s: number | null;
  /** Half-width of the 95% interval from the slope's standard error. */
  ci95_mm_s: number | null;
  /** Half-range of the rate when the threshold moves ±20%. */
  threshold_spread_mm_s: number | null;
  /** Table S1 rate converted to mm/s; null when no Table S1 row matches. */
  nasa_rate_mm_s: number | null;
  /** 100·(rate − nasa)/nasa, signed; null when either is null. */
  pct_error: number | null;
  flame_len_mm: number | null;
  /** 0 to 1. */
  blue_frac: number | null;
  /** Same clock as t_start_s; null if the flame did not go out. */
  extinction_s: number | null;
  n_frames: number;
  notes: string;
}

const SPREAD_RATES_CELLS: Cell[] = [
  { name: "test_id", type: "string", required: true, pattern: SAMPLE_ID },
  { name: "rod_d_mm", type: "number", required: true, gt: 0 },
  { name: "o2_pct", type: "number", required: true, gt: 0, max: 100 },
  { name: "flow_cm_s", type: "number", required: true, min: 0 },
  { name: "t_start_s", type: "number", required: true, min: 0 },
  { name: "t_end_s", type: "number", required: true, min: 0 },
  { name: "rate_mm_s", type: "number", min: 0 },
  { name: "ci95_mm_s", type: "number", min: 0 },
  { name: "threshold_spread_mm_s", type: "number", min: 0 },
  { name: "nasa_rate_mm_s", type: "number", gt: 0 },
  { name: "pct_error", type: "number" },
  { name: "flame_len_mm", type: "number", min: 0 },
  { name: "blue_frac", type: "number", min: 0, max: 1 },
  { name: "extinction_s", type: "number", min: 0 },
  { name: "n_frames", type: "number", required: true, integer: true, min: 2 },
  { name: "notes", type: "string" },
];

export interface SpreadRates {
  mock: boolean;
  rows: SpreadRateRow[];
  /** Row citation ID per row, e.g. `spread_rates:B16/2` (segment = 1-based order within the test). */
  ids: string[];
}

export function validateSpreadRates(text: string): Result<SpreadRates> {
  const issues: Issue[] = [];
  const t = readTable(text, SPREAD_RATES_CELLS, issues);
  if (!t) return result(issues, { mock: false, rows: [], ids: [] });
  const rows = t.rows as unknown as SpreadRateRow[];

  rows.forEach((r, i) => {
    const at = (col: string) => `line ${t.lines[i]}, ${col}`;
    if (r.t_end_s !== null && r.t_start_s !== null && !(r.t_start_s < r.t_end_s))
      issues.push({ path: at("t_end_s"), message: "t_end_s must be after t_start_s" });
    if (r.rate_mm_s === null) {
      if (!r.notes) issues.push({ path: at("notes"), message: "an unusable segment (empty rate_mm_s) must say why in notes" });
      if (r.ci95_mm_s !== null || r.threshold_spread_mm_s !== null)
        issues.push({ path: at("ci95_mm_s"), message: "ci95 and threshold spread must be empty when rate_mm_s is empty" });
    } else {
      if (r.ci95_mm_s === null) issues.push({ path: at("ci95_mm_s"), message: "required when rate_mm_s is set" });
      if (r.threshold_spread_mm_s === null)
        issues.push({ path: at("threshold_spread_mm_s"), message: "required when rate_mm_s is set" });
    }
    const expected =
      r.rate_mm_s !== null && r.nasa_rate_mm_s !== null
        ? (100 * (r.rate_mm_s - r.nasa_rate_mm_s)) / r.nasa_rate_mm_s
        : null;
    if (expected === null && r.pct_error !== null)
      issues.push({ path: at("pct_error"), message: "must be empty when rate_mm_s or nasa_rate_mm_s is empty" });
    if (expected !== null && (r.pct_error === null || !near(r.pct_error, expected, 0.1)))
      issues.push({
        path: at("pct_error"),
        message: `must be 100·(rate − nasa)/nasa = ${expected.toFixed(2)} (±0.1), got ${r.pct_error ?? "empty"}`,
      });
  });

  const groups = groupContiguous(rows, (r) => r.test_id, t.lines, issues);
  const ids: string[] = new Array(rows.length);
  for (const [testId, idx] of groups) {
    idx.forEach((i, k) => {
      ids[i] = `spread_rates:${testId}/${k + 1}`;
      if (k === 0) return;
      const prev = rows[idx[k - 1]];
      const r = rows[i];
      if (!(r.t_start_s >= prev.t_end_s))
        issues.push({ path: `line ${t.lines[i]}, t_start_s`, message: "segments must be in time order and not overlap" });
      if (r.rod_d_mm !== prev.rod_d_mm || r.o2_pct !== prev.o2_pct)
        issues.push({ path: `line ${t.lines[i]}`, message: `rod_d_mm and o2_pct must be the same on every row of ${testId}` });
    });
  }
  return result(issues, { mock: t.mock, rows, ids });
}

// ---------------------------------------------------------------------------
// B. edges/<test_id>.csv: one row per photo; overlay video frame i = row i
// ---------------------------------------------------------------------------

export const EDGE_COLUMNS = ["test_id", "t_s", "edge_mm", "segment"] as const;

export interface EdgeRow {
  test_id: string;
  /** Same clock as spread_rates t_start_s. */
  t_s: number;
  /** Distance along the rod axis from the first axis click, increasing upstream. Null: no flame found. */
  edge_mm: number | null;
  /** 1-based segment (matches spread_rates row order within the test); null outside fitted segments. */
  segment: number | null;
}

const EDGE_CELLS: Cell[] = [
  { name: "test_id", type: "string", required: true, pattern: TRACKED_ID },
  { name: "t_s", type: "number", required: true, min: 0 },
  { name: "edge_mm", type: "number" },
  { name: "segment", type: "number", integer: true, min: 1 },
];

export function validateEdges(text: string, expectedTestId?: string): Result<{ mock: boolean; rows: EdgeRow[] }> {
  const issues: Issue[] = [];
  const t = readTable(text, EDGE_CELLS, issues);
  if (!t) return result(issues, { mock: false, rows: [] });
  const rows = t.rows as unknown as EdgeRow[];
  if (rows.length < 2) issues.push({ path: "file", message: "need at least 2 rows" });
  let lastSegment = 0;
  rows.forEach((r, i) => {
    const at = (col: string) => `line ${t.lines[i]}, ${col}`;
    const want = expectedTestId ?? rows[0].test_id;
    if (r.test_id !== want) issues.push({ path: at("test_id"), message: `expected ${want} (one test per file, named <test_id>.csv)` });
    if (i > 0 && !(r.t_s > rows[i - 1].t_s)) issues.push({ path: at("t_s"), message: "t_s must strictly increase" });
    if (r.segment !== null) {
      if (r.segment < lastSegment) issues.push({ path: at("segment"), message: "segments must not go backwards in time" });
      lastSegment = r.segment;
    }
  });
  return result(issues, { mock: t.mock, rows });
}

// ---------------------------------------------------------------------------
// D. ices2025_digitized.csv: points read from ICES-2025-392 Figs. 7 to 12 (our extractor)
// ---------------------------------------------------------------------------
//
// One row per point read off a figure. `wstf` rows are 1-g White Sands tests: `marker` rows are the
// limit points the fit uses, `fit_end` rows are the ends of the line the paper drew (kept for
// checking, never fitted). `lunar` rows are the two ends of the lunar-gravity line (`line_end`); the
// lunar airflow is not determined, so their flow_cm_s is always empty. Row numbers used in
// moongap.json provenance are 0-based data rows (comment lines and the header don't count).
// The same contract covers the repeat reading, ices2025_digitized_repeat.csv.

export const DIGITIZED_COLUMNS = ["material", "source", "flow_cm_s", "o2_pct", "point_kind", "extraction", "page", "notes"] as const;
export const POINT_KINDS = ["marker", "fit_end", "line_end"] as const;
export type PointKind = (typeof POINT_KINDS)[number];

export interface DigitizedRow {
  material: Material;
  source: DigitizedSource;
  /** Empty (null) on lunar rows: the lunar airflow is not determined. */
  flow_cm_s: number | null;
  /** Percent, 0 to 100. */
  o2_pct: number;
  point_kind: PointKind;
  /** How the point was read: `raster` (image analysis), `manual` (by hand), ... */
  extraction: string;
  /** Page of ICES-2025-392 the figure is on. */
  page: number;
  notes: string;
}

const DIGITIZED_CELLS: Cell[] = [
  { name: "material", type: "string", required: true, oneOf: MATERIALS },
  { name: "source", type: "string", required: true, oneOf: DIGITIZED_SOURCES },
  { name: "flow_cm_s", type: "number", min: 0 },
  { name: "o2_pct", type: "number", required: true, gt: 0, max: 100 },
  { name: "point_kind", type: "string", required: true, oneOf: POINT_KINDS },
  { name: "extraction", type: "string", required: true },
  { name: "page", type: "number", required: true, integer: true, min: 1 },
  { name: "notes", type: "string" },
];

export function validateDigitized(text: string): Result<{ mock: boolean; rows: DigitizedRow[] }> {
  const issues: Issue[] = [];
  const t = readTable(text, DIGITIZED_CELLS, issues);
  if (!t) return result(issues, { mock: false, rows: [] });
  const rows = t.rows as unknown as DigitizedRow[];
  const counts = new Map<string, { markers: number; lunar: number }>();
  rows.forEach((r, i) => {
    const at = (col: string) => `line ${t.lines[i]}, ${col}`;
    const lunar = r.source === "lunar";
    if (lunar && r.flow_cm_s !== null)
      issues.push({ path: at("flow_cm_s"), message: "lunar rows must leave flow_cm_s empty: the lunar airflow is not determined" });
    if (!lunar && r.flow_cm_s === null) issues.push({ path: at("flow_cm_s"), message: "required on wstf rows" });
    if (lunar && r.point_kind !== "line_end") issues.push({ path: at("point_kind"), message: "lunar rows are line_end" });
    if (!lunar && r.point_kind === "line_end") issues.push({ path: at("point_kind"), message: "wstf rows are marker or fit_end" });
    const c = counts.get(r.material) ?? { markers: 0, lunar: 0 };
    if (r.source === "wstf" && r.point_kind === "marker") c.markers++;
    if (lunar) c.lunar++;
    counts.set(r.material, c);
  });
  for (const [m, c] of counts) {
    if (c.markers < 2) issues.push({ path: m, message: "needs at least 2 wstf marker points" });
    if (c.lunar < 1) issues.push({ path: m, message: "needs at least 1 lunar point" });
  }
  return result(issues, { mock: t.mock, rows });
}

// ---------------------------------------------------------------------------
// F. link2018_table_s1.csv: Link et al. 2018 supplement, Table S1, as printed
// ---------------------------------------------------------------------------

export const TABLE_S1_COLUMNS = [
  "sample_id",
  "rod_d_cm",
  "o2_pct",
  "step",
  "flow_cm_s",
  "dt_s",
  "rate_x1e3",
  "rate_unit_printed",
  "table_half",
  "page",
  "checked_by",
  "notes",
] as const;

export interface TableS1Row {
  sample_id: string;
  rod_d_cm: number;
  o2_pct: number;
  /** 1-based order within the sample, as listed (the table lists steps in time order). */
  step: number;
  flow_cm_s: number;
  dt_s: number;
  /** The printed V_f × 10³ value, unchanged. Convert with tableS1RateMmS(). */
  rate_x1e3: number;
  /** The unit printed in that half's header, verbatim. */
  rate_unit_printed: "cm/s" | "mm/s";
  table_half: "left" | "right";
  page: number;
  /** Initials of the second person who checked the row against the PDF. */
  checked_by: string;
  notes: string;
}

const TABLE_S1_CELLS: Cell[] = [
  { name: "sample_id", type: "string", required: true, pattern: SAMPLE_ID },
  { name: "rod_d_cm", type: "number", required: true, gt: 0 },
  { name: "o2_pct", type: "number", required: true, gt: 0, max: 100 },
  { name: "step", type: "number", required: true, integer: true, min: 1 },
  { name: "flow_cm_s", type: "number", required: true, min: 0 },
  { name: "dt_s", type: "number", required: true, min: 0 },
  { name: "rate_x1e3", type: "number", required: true, min: 0 },
  { name: "rate_unit_printed", type: "string", required: true, oneOf: ["cm/s", "mm/s"] },
  { name: "table_half", type: "string", required: true, oneOf: ["left", "right"] },
  { name: "page", type: "number", required: true, integer: true, min: 1 },
  { name: "checked_by", type: "string" },
  { name: "notes", type: "string" },
];

export function validateTableS1(text: string): Result<{ mock: boolean; rows: TableS1Row[]; ids: string[] }> {
  const issues: Issue[] = [];
  const t = readTable(text, TABLE_S1_CELLS, issues);
  if (!t) return result(issues, { mock: false, rows: [], ids: [] });
  const rows = t.rows as unknown as TableS1Row[];
  rows.forEach((r, i) => {
    if (!r.checked_by && !t.mock)
      issues.push({ path: `line ${t.lines[i]}, checked_by`, message: "every row needs a second person's check" });
  });
  const ids: string[] = new Array(rows.length);
  for (const [sample, idx] of groupContiguous(rows, (r) => r.sample_id, t.lines, issues)) {
    idx.forEach((i, k) => {
      const r = rows[i];
      ids[i] = `table_s1:${sample}/${r.step}`;
      if (r.step !== k + 1)
        issues.push({ path: `line ${t.lines[i]}, step`, message: `expected step ${k + 1} (steps run 1..n in table order)` });
      const first = rows[idx[0]];
      if (
        r.rod_d_cm !== first.rod_d_cm ||
        r.o2_pct !== first.o2_pct ||
        r.table_half !== first.table_half ||
        r.rate_unit_printed !== first.rate_unit_printed
      )
        issues.push({
          path: `line ${t.lines[i]}`,
          message: `rod_d_cm, o2_pct, table_half and rate_unit_printed must match on every row of ${sample}`,
        });
    });
  }
  return result(issues, { mock: t.mock, rows, ids });
}

/**
 * Table S1 rate in mm/s.
 *
 * CONFIRMED (2026-11-14): both halves are cm/s, so mm/s = printed × 0.01.
 *
 * The table prints V_f × 10³. The left half's header gives the unit as cm/s, the right half's
 * (the 0.64 cm rods, including B16 and B19) as mm/s. Three independent checks say the right
 * half's "(mm/s)" is a typo: the edge slopes in Fig. S1 for B16 and B19; the team's research
 * check (BUILD_PLAN.md Part 3); and our own measurement from NASA's raw P16 photos (B16 at
 * 0.72 cm/s: tracker 0.0593 mm/s vs printed 5.68 → 0.0568 mm/s; read literally it would be
 * 0.00568 mm/s, ten times slower than measured). This is the one place to change if the
 * authors or the raw data ever say otherwise.
 */
const TABLE_S1_PRINT_SCALE = 1e3;
const MM_PER_CM = 10;
export function tableS1RateMmS(row: Pick<TableS1Row, "rate_x1e3">): number {
  return (row.rate_x1e3 / TABLE_S1_PRINT_SCALE) * MM_PER_CM;
}

// ---------------------------------------------------------------------------
// JSON checking helpers
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;

class Checker {
  constructor(readonly issues: Issue[]) {}

  fail(path: string, message: string) {
    this.issues.push({ path: path || "(root)", message });
  }

  obj(v: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Obj | null {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      this.fail(path, "expected an object");
      return null;
    }
    const o = v as Obj;
    for (const k of required) if (!(k in o)) this.fail(join(path, k), "missing");
    const allowed = new Set([...required, ...optional]);
    for (const k of Object.keys(o)) if (!allowed.has(k)) this.fail(join(path, k), "unknown field");
    return o;
  }

  num(
    v: unknown,
    path: string,
    o: { min?: number; gt?: number; max?: number; int?: boolean; nullable?: boolean } = {},
  ): number | null {
    if (v === null && o.nullable) return null;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      this.fail(path, o.nullable ? "expected a number or null" : "expected a number");
      return null;
    }
    if (o.int && !Number.isInteger(v)) this.fail(path, "expected a whole number");
    if (o.min !== undefined && v < o.min) this.fail(path, `${v} is below ${o.min}`);
    if (o.gt !== undefined && v <= o.gt) this.fail(path, `${v} must be greater than ${o.gt}`);
    if (o.max !== undefined && v > o.max) this.fail(path, `${v} is above ${o.max}`);
    return v;
  }

  str(
    v: unknown,
    path: string,
    o: { oneOf?: readonly string[]; pattern?: RegExp; minLen?: number; maxLen?: number; nullable?: boolean } = {},
  ): string | null {
    if (v === null && o.nullable) return null;
    if (typeof v !== "string") {
      this.fail(path, "expected a string");
      return null;
    }
    if (o.oneOf && !o.oneOf.includes(v)) this.fail(path, `"${v}" is not one of ${o.oneOf.join(", ")}`);
    if (o.pattern && !o.pattern.test(v)) this.fail(path, `"${v}" does not match ${o.pattern}`);
    if (o.minLen !== undefined && v.length < o.minLen) this.fail(path, `must be at least ${o.minLen} characters`);
    if (o.maxLen !== undefined && v.length > o.maxLen) this.fail(path, `must be at most ${o.maxLen} characters`);
    return v;
  }

  arr(v: unknown, path: string, minLen = 0): unknown[] | null {
    if (!Array.isArray(v)) {
      this.fail(path, "expected an array");
      return null;
    }
    if (v.length < minLen) this.fail(path, `needs at least ${minLen} item(s)`);
    return v;
  }

  /** [lo, hi] with lo ≤ hi. */
  range(v: unknown, path: string, o: { min?: number } = {}): [number, number] | null {
    const a = this.arr(v, path);
    if (!a) return null;
    if (a.length !== 2) {
      this.fail(path, "expected [low, high]");
      return null;
    }
    const lo = this.num(a[0], `${path}[0]`, o);
    const hi = this.num(a[1], `${path}[1]`, o);
    if (lo === null || hi === null) return null;
    if (lo > hi) this.fail(path, "low must not exceed high");
    return [lo, hi];
  }

  /** Top-level `contract`, optional `mock` and `_note`, and the MOCK- ID rule. */
  header(o: Obj, contract: string): boolean {
    if (o.contract !== contract) this.fail("contract", `expected "${contract}"`);
    if ("mock" in o && typeof o.mock !== "boolean") this.fail("mock", "expected true or false");
    if ("_note" in o) this.str(o._note, "_note");
    const mock = o.mock === true;
    if (!mock && hasMockId(o)) this.fail("mock", "contains MOCK- IDs but is not flagged as mock");
    return mock;
  }
}

function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function hasMockId(v: unknown): boolean {
  if (typeof v === "string") return MOCK_ID.test(v);
  if (Array.isArray(v)) return v.some(hasMockId);
  if (typeof v === "object" && v !== null) return Object.values(v).some(hasMockId);
  return false;
}

const HEADER_KEYS = ["mock", "_note"] as const;

// ---------------------------------------------------------------------------
// E. moongap.json (our Moon Gap pipeline, schema 1.x from 1.3.0)
// ---------------------------------------------------------------------------
//
// Field docs: below. Every O2 value for plotting is in percent; slopes and
// intercept_frac are fractions. The headline is materials.*.gap (zero flow): the 1-g still-air
// estimate minus the lunar-gravity limit. The lunar limit is a horizontal line, never a point:
// no field anywhere may carry a lunar or Moon airflow.

export const MOONGAP_SCHEMA = /^1\.([3-9]|\d\d+)\.\d+$/;
export const MOONGAP_STATUSES = ["ok", "missing", "excluded"] as const;
export const SLOPE_CHECK_STATUSES = ["matches_table2", "documented_discrepancy"] as const;
export const CONTEXT_BAND_KEYS = ["fans_off", "bass_ii", "wstf", "station_ventilation"] as const;

export interface MoonGapProvenance {
  /** 0-based data rows of the input CSV. */
  rows: number[];
  method: string;
}
export interface MoonGapOk {
  material: Material;
  status: "ok";
  warnings: string[];
  source_note?: string;
  fit: {
    n: number;
    slope_frac_per_cm_s: number;
    slope_se: number;
    intercept_frac: number;
    intercept_se: number;
    r2: number;
    min_flow_cm_s: number;
    flow_range_cm_s: [number, number];
    provenance: MoonGapProvenance;
  };
  slope_check: {
    reference_slope_frac_per_cm_s: number;
    reference_source: string;
    relative_difference: number;
    tolerance: number;
    within_tolerance: boolean;
    /** Same value as within_tolerance (kept from 1.1.0). */
    passed: boolean;
    status: (typeof SLOPE_CHECK_STATUSES)[number];
  };
  zero_flow: { intercept_pct: number; ci95_pct: [number, number]; provenance: MoonGapProvenance };
  curve: { flow_cm_s: number[]; o2_pct: number[]; lower_pct: number[]; upper_pct: number[]; provenance: MoonGapProvenance };
  wstf_points: { flow_cm_s: number[]; o2_pct: number[]; provenance: MoonGapProvenance };
  /** Horizontal line only: there is no lunar flow. */
  lunar: { limit_pct: number; provenance: MoonGapProvenance };
  gap: {
    gap_pct: number;
    ci95_pct: [number, number];
    lunar_limit_treated_as_exact: boolean;
    /** From 1.4.0: where the 95% range sits relative to zero. */
    verdict?: "above_zero" | "below_zero" | "includes_zero";
    reading_error_pct: number | null;
    provenance: MoonGapProvenance;
  };
  /** Cross-check at the paper's Earth (1 g) buoyant-flow reference. Not a Moon airflow. */
  gap_at_ref_flow: {
    flow_cm_s: number;
    label: string;
    note: string;
    earth_pct: number;
    gap_pct: number;
    ci95_pct: [number, number];
    reading_error_pct: number | null;
    provenance: MoonGapProvenance;
  };
}
export interface MoonGapNotOk {
  material: Material;
  status: "missing" | "excluded";
  warnings: string[];
  reason: string;
}
export type MoonGapMaterial = MoonGapOk | MoonGapNotOk;
export interface ContextBand {
  label: string;
  min_cm_s: number | null;
  max_cm_s: number | null;
  source: string;
}
export interface MoonGap {
  schema_version: string;
  mock?: boolean;
  _note?: string;
  input: { file: string; sha256: string };
  repeat_input: { file: string; sha256: string } | null;
  caveats: string[];
  warnings: string[];
  paper: string;
  context_bands: Record<(typeof CONTEXT_BAND_KEYS)[number], ContextBand>;
  reference_lines: { moon_base_o2: { label: string; o2_pct: number; note: string; source: string } };
  excluded: { material: Material; reason: string }[];
  settings: {
    min_fit_flow_cm_s: number;
    confidence: number;
    ref_flow_cm_s: number;
    slope_tolerance: number;
    slope_reference_source: string;
  };
  materials: Partial<Record<Material, MoonGapMaterial>>;
  ranking: { rank: number; material: Material; gap_pct: number; ci95_pct: [number, number] }[];
}

/** Figure-reading tolerance on flow positions, cm/s (an engineering limit, not a scientific value). */
const FLOW_READING_TOL_CM_S = 0.5;

/** Any key naming a lunar/Moon airflow is refused wherever it appears. */
const LUNAR_FLOW_KEY = /(lunar|moon).*(flow|velocity|speed)|(flow|velocity|speed).*(lunar|moon)/i;

function findLunarFlowKeys(v: unknown, path: string, out: string[]) {
  if (Array.isArray(v)) v.forEach((x, i) => findLunarFlowKeys(x, `${path}[${i}]`, out));
  else if (typeof v === "object" && v !== null)
    for (const [k, x] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (LUNAR_FLOW_KEY.test(k)) out.push(p);
      findLunarFlowKeys(x, p, out);
    }
}

export function validateMoonGap(value: unknown): Result<MoonGap> {
  const issues: Issue[] = [];
  const c = new Checker(issues);
  const o = c.obj(
    value,
    "",
    ["schema_version", "input", "repeat_input", "caveats", "warnings", "paper", "context_bands", "reference_lines", "excluded", "settings", "materials", "ranking"],
    HEADER_KEYS,
  );
  if (!o) return result(issues, value as MoonGap);
  c.str(o.schema_version, "schema_version", { pattern: MOONGAP_SCHEMA });
  if ("mock" in o && typeof o.mock !== "boolean") c.fail("mock", "expected true or false");
  if ("_note" in o) c.str(o._note, "_note");
  if (o.mock !== true && hasMockId(o)) c.fail("mock", "contains MOCK- IDs but is not flagged as mock");

  const lunarFlowKeys: string[] = [];
  findLunarFlowKeys(o, "", lunarFlowKeys);
  for (const p of lunarFlowKeys) c.fail(p, "a lunar or Moon airflow is never stated: remove this field");

  const fileRef = (v: unknown, p: string) => {
    const f = c.obj(v, p, ["file", "sha256"]);
    if (f) {
      c.str(f.file, `${p}.file`, { minLen: 1 });
      c.str(f.sha256, `${p}.sha256`, { pattern: SHA256 });
    }
  };
  fileRef(o.input, "input");
  if (o.repeat_input !== null) fileRef(o.repeat_input, "repeat_input");
  for (const k of ["caveats", "warnings"] as const) (c.arr(o[k], k) ?? []).forEach((s, i) => c.str(s, `${k}[${i}]`));
  c.str(o.paper, "paper", { minLen: 1 });

  const bands = c.obj(o.context_bands, "context_bands", CONTEXT_BAND_KEYS);
  if (bands)
    for (const k of CONTEXT_BAND_KEYS) {
      const p = `context_bands.${k}`;
      const b = c.obj(bands[k], p, ["label", "min_cm_s", "max_cm_s", "source"]);
      if (!b) continue;
      c.str(b.label, `${p}.label`, { minLen: 1 });
      c.str(b.source, `${p}.source`, { minLen: 1 });
      const lo = c.num(b.min_cm_s, `${p}.min_cm_s`, { min: 0, nullable: true });
      const hi = c.num(b.max_cm_s, `${p}.max_cm_s`, { min: 0, nullable: true });
      if ((lo === null) !== (hi === null)) c.fail(p, "set both min_cm_s and max_cm_s, or neither");
      if (lo !== null && hi !== null && lo > hi) c.fail(p, "min_cm_s must not exceed max_cm_s");
    }

  const refLines = c.obj(o.reference_lines, "reference_lines", ["moon_base_o2"]);
  if (refLines) {
    const p = "reference_lines.moon_base_o2";
    const l = c.obj(refLines.moon_base_o2, p, ["label", "o2_pct", "note", "source"]);
    if (l) {
      c.str(l.label, `${p}.label`, { minLen: 1 });
      c.num(l.o2_pct, `${p}.o2_pct`, { gt: 0, max: 100 });
      c.str(l.note, `${p}.note`, { minLen: 1 });
      c.str(l.source, `${p}.source`, { minLen: 1 });
    }
  }

  const st = c.obj(o.settings, "settings", ["min_fit_flow_cm_s", "confidence", "ref_flow_cm_s", "slope_tolerance", "slope_reference_source"]);
  const minFit = st ? c.num(st.min_fit_flow_cm_s, "settings.min_fit_flow_cm_s", { min: 0 }) : null;
  if (st) {
    c.num(st.confidence, "settings.confidence", { gt: 0, max: 1 });
    c.str(st.slope_reference_source, "settings.slope_reference_source", { minLen: 1 });
    c.num(st.slope_tolerance, "settings.slope_tolerance", { gt: 0 });
  }
  const refFlow = st ? c.num(st.ref_flow_cm_s, "settings.ref_flow_cm_s", { gt: 0 }) : null;

  const prov = (v: unknown, p: string) => {
    const pr = c.obj(v, p, ["rows", "method"]);
    if (!pr) return;
    (c.arr(pr.rows, `${p}.rows`, 1) ?? []).forEach((r, i) => c.num(r, `${p}.rows[${i}]`, { int: true, min: 0 }));
    c.str(pr.method, `${p}.method`, { minLen: 1 });
  };
  const nums = (v: unknown, p: string, minLen: number): number[] =>
    (c.arr(v, p, minLen) ?? []).map((x, i) => c.num(x, `${p}[${i}]`) ?? NaN);
  const contains = (ci: [number, number] | null, x: number | null, p: string, what: string) => {
    if (ci && x !== null && (x < ci[0] - 1e-9 || x > ci[1] + 1e-9)) c.fail(p, `must contain ${what}`);
  };
  const TOL = 1e-6; // the pipeline writes full doubles; allow for rounding only

  const mats = c.obj(o.materials, "materials", [], MATERIALS) ?? {};
  const okGaps = new Map<string, { gap: number; ci: [number, number] | null }>();
  const excludedSet = new Set<string>();
  for (const [key, mv] of Object.entries(mats)) {
    const p = `materials.${key}`;
    const head = mv as Obj;
    const status = c.str(head?.status, `${p}.status`, { oneOf: MOONGAP_STATUSES });
    if (status !== "ok") {
      const m = c.obj(mv, p, ["material", "status", "warnings", "reason"]);
      if (!m) continue;
      if (m.material !== key) c.fail(`${p}.material`, `must be "${key}"`);
      (c.arr(m.warnings, `${p}.warnings`) ?? []).forEach((s, i) => c.str(s, `${p}.warnings[${i}]`));
      c.str(m.reason, `${p}.reason`, { minLen: 1 });
      if (status === "excluded") excludedSet.add(key);
      continue;
    }
    const m = c.obj(
      mv,
      p,
      ["material", "status", "warnings", "fit", "slope_check", "zero_flow", "curve", "wstf_points", "lunar", "gap", "gap_at_ref_flow"],
      ["source_note"],
    );
    if (!m) continue;
    if (m.material !== key) c.fail(`${p}.material`, `must be "${key}"`);
    (c.arr(m.warnings, `${p}.warnings`) ?? []).forEach((s, i) => c.str(s, `${p}.warnings[${i}]`));
    if ("source_note" in m) c.str(m.source_note, `${p}.source_note`, { minLen: 1 });

    // fit
    const fp = `${p}.fit`;
    const fit = c.obj(m.fit, fp, ["n", "slope_frac_per_cm_s", "slope_se", "intercept_frac", "intercept_se", "r2", "min_flow_cm_s", "flow_range_cm_s", "provenance"]);
    const n = fit ? c.num(fit.n, `${fp}.n`, { int: true, min: 2 }) : null;
    const slope = fit ? c.num(fit.slope_frac_per_cm_s, `${fp}.slope_frac_per_cm_s`) : null;
    const icFrac = fit ? c.num(fit.intercept_frac, `${fp}.intercept_frac`, { gt: 0, max: 1 }) : null;
    if (fit) {
      c.num(fit.slope_se, `${fp}.slope_se`, { min: 0 });
      c.num(fit.intercept_se, `${fp}.intercept_se`, { min: 0 });
      c.num(fit.r2, `${fp}.r2`, { min: 0, max: 1 });
      const mf = c.num(fit.min_flow_cm_s, `${fp}.min_flow_cm_s`, { min: 0 });
      if (mf !== null && minFit !== null && mf !== minFit) c.fail(`${fp}.min_flow_cm_s`, "must equal settings.min_fit_flow_cm_s");
      c.range(fit.flow_range_cm_s, `${fp}.flow_range_cm_s`, { min: 0 });
      prov(fit.provenance, `${fp}.provenance`);
    }

    // slope check against Table 2
    const sp = `${p}.slope_check`;
    const sc = c.obj(m.slope_check, sp, ["reference_slope_frac_per_cm_s", "reference_source", "relative_difference", "tolerance", "within_tolerance", "passed", "status"]);
    if (sc) {
      const ref = c.num(sc.reference_slope_frac_per_cm_s, `${sp}.reference_slope_frac_per_cm_s`, { gt: 0 });
      c.str(sc.reference_source, `${sp}.reference_source`, { minLen: 1 });
      const rd = c.num(sc.relative_difference, `${sp}.relative_difference`, { min: 0 });
      const tol = c.num(sc.tolerance, `${sp}.tolerance`, { gt: 0 });
      if (ref !== null && slope !== null && rd !== null && !near(rd, Math.abs(slope - ref) / ref, 1e-6))
        c.fail(`${sp}.relative_difference`, `must be |fit slope − reference| / reference = ${(Math.abs(slope - ref) / ref).toFixed(4)}`);
      if (typeof sc.within_tolerance !== "boolean") c.fail(`${sp}.within_tolerance`, "expected true or false");
      if (sc.passed !== sc.within_tolerance) c.fail(`${sp}.passed`, "must equal within_tolerance");
      if (rd !== null && tol !== null && sc.within_tolerance !== rd <= tol)
        c.fail(`${sp}.within_tolerance`, `must be ${rd <= tol} (relative_difference ${rd <= tol ? "≤" : ">"} tolerance)`);
      const s = c.str(sc.status, `${sp}.status`, { oneOf: SLOPE_CHECK_STATUSES });
      if (s && typeof sc.within_tolerance === "boolean" && (s === "matches_table2") !== sc.within_tolerance)
        c.fail(`${sp}.status`, `must be ${sc.within_tolerance ? "matches_table2" : "documented_discrepancy"}`);
    }

    // zero-flow intercept
    const zp = `${p}.zero_flow`;
    const zf = c.obj(m.zero_flow, zp, ["intercept_pct", "ci95_pct", "provenance"]);
    const intercept = zf ? c.num(zf.intercept_pct, `${zp}.intercept_pct`, { gt: 0, max: 100 }) : null;
    if (zf) {
      if (intercept !== null && icFrac !== null && !near(intercept, 100 * icFrac, TOL))
        c.fail(`${zp}.intercept_pct`, "must equal 100 × fit.intercept_frac");
      contains(c.range(zf.ci95_pct, `${zp}.ci95_pct`), intercept, `${zp}.ci95_pct`, "intercept_pct");
      prov(zf.provenance, `${zp}.provenance`);
    }

    // curve: the fit line with its band, from zero flow
    const cp = `${p}.curve`;
    const cv = c.obj(m.curve, cp, ["flow_cm_s", "o2_pct", "lower_pct", "upper_pct", "provenance"]);
    if (cv) {
      const f = nums(cv.flow_cm_s, `${cp}.flow_cm_s`, 2);
      const y = nums(cv.o2_pct, `${cp}.o2_pct`, 2);
      const lo = nums(cv.lower_pct, `${cp}.lower_pct`, 2);
      const hi = nums(cv.upper_pct, `${cp}.upper_pct`, 2);
      if (new Set([f.length, y.length, lo.length, hi.length]).size !== 1) c.fail(cp, "flow_cm_s, o2_pct, lower_pct and upper_pct must have the same length");
      else {
        if (f[0] !== 0) c.fail(`${cp}.flow_cm_s[0]`, "the curve must start at flow 0");
        for (let i = 1; i < f.length; i++) if (!(f[i] > f[i - 1])) { c.fail(`${cp}.flow_cm_s`, "flows must increase"); break; }
        for (let i = 0; i < f.length; i++)
          if (!(lo[i] <= y[i] + 1e-9 && y[i] <= hi[i] + 1e-9)) { c.fail(`${cp}[${i}]`, "lower ≤ o2 ≤ upper"); break; }
        if (intercept !== null && !near(y[0], intercept, TOL)) c.fail(`${cp}.o2_pct[0]`, "must equal zero_flow.intercept_pct");
        if (icFrac !== null && slope !== null)
          for (let i = 0; i < f.length; i++)
            if (!near(y[i], 100 * (icFrac + slope * f[i]), 1e-6 * 100)) { c.fail(`${cp}.o2_pct[${i}]`, "must lie on the fit line"); break; }
      }
      prov(cv.provenance, `${cp}.provenance`);
    }

    // WSTF points used in the fit
    const wp = `${p}.wstf_points`;
    const ws = c.obj(m.wstf_points, wp, ["flow_cm_s", "o2_pct", "provenance"]);
    if (ws) {
      const f = nums(ws.flow_cm_s, `${wp}.flow_cm_s`, 2);
      const y = nums(ws.o2_pct, `${wp}.o2_pct`, 2);
      if (f.length !== y.length) c.fail(wp, "flow_cm_s and o2_pct must have the same length");
      if (n !== null && f.length !== n) c.fail(wp, `must hold fit.n = ${n} points`);
      // Points are read off an image, so a 60 cm/s test can read as 59.98: allow a small reading tolerance.
      if (minFit !== null && f.some((x) => x < minFit - FLOW_READING_TOL_CM_S))
        c.fail(`${wp}.flow_cm_s`, `every fitted point must be at or above settings.min_fit_flow_cm_s (± ${FLOW_READING_TOL_CM_S} reading tolerance)`);
      prov(ws.provenance, `${wp}.provenance`);
    }

    // lunar limit: a level only
    const lp = `${p}.lunar`;
    const lu = c.obj(m.lunar, lp, ["limit_pct", "provenance"]);
    const lunar = lu ? c.num(lu.limit_pct, `${lp}.limit_pct`, { gt: 0, max: 100 }) : null;
    if (lu) prov(lu.provenance, `${lp}.provenance`);

    // headline gap at zero flow
    const gp = `${p}.gap`;
    const g = c.obj(m.gap, gp, ["gap_pct", "ci95_pct", "lunar_limit_treated_as_exact", "reading_error_pct", "provenance"], ["verdict"]);
    if (g) {
      const gap = c.num(g.gap_pct, `${gp}.gap_pct`);
      if (gap !== null && intercept !== null && lunar !== null && !near(gap, intercept - lunar, TOL))
        c.fail(`${gp}.gap_pct`, `must be zero_flow.intercept_pct − lunar.limit_pct = ${(intercept - lunar).toFixed(4)}`);
      const ci = c.range(g.ci95_pct, `${gp}.ci95_pct`);
      contains(ci, gap, `${gp}.ci95_pct`, "gap_pct");
      if (typeof g.lunar_limit_treated_as_exact !== "boolean") c.fail(`${gp}.lunar_limit_treated_as_exact`, "expected true or false");
      c.num(g.reading_error_pct, `${gp}.reading_error_pct`, { min: 0, nullable: true });
      if (g.verdict !== undefined) {
        const v = c.str(g.verdict, `${gp}.verdict`, { oneOf: ["above_zero", "below_zero", "includes_zero"] });
        if (v && ci) {
          const want = ci[0] > 0 ? "above_zero" : ci[1] < 0 ? "below_zero" : "includes_zero";
          if (v !== want) c.fail(`${gp}.verdict`, `must be "${want}" for ci95_pct [${ci[0]}, ${ci[1]}]`);
        }
      }
      prov(g.provenance, `${gp}.provenance`);
      if (gap !== null) okGaps.set(key, { gap, ci });
    }

    // cross-check at the Earth buoyant-flow reference
    const rp = `${p}.gap_at_ref_flow`;
    const r = c.obj(m.gap_at_ref_flow, rp, ["flow_cm_s", "label", "note", "earth_pct", "gap_pct", "ci95_pct", "reading_error_pct", "provenance"]);
    if (r) {
      const rf = c.num(r.flow_cm_s, `${rp}.flow_cm_s`, { gt: 0 });
      if (rf !== null && refFlow !== null && rf !== refFlow) c.fail(`${rp}.flow_cm_s`, "must equal settings.ref_flow_cm_s");
      c.str(r.label, `${rp}.label`, { minLen: 1 });
      const note = c.str(r.note, `${rp}.note`, { minLen: 1 });
      if (note && !/earth|1 ?g/i.test(note)) c.fail(`${rp}.note`, "must say this flow is an Earth (1 g) reference");
      const earth = c.num(r.earth_pct, `${rp}.earth_pct`, { gt: 0, max: 100 });
      if (earth !== null && rf !== null && icFrac !== null && slope !== null && !near(earth, 100 * (icFrac + slope * rf), TOL))
        c.fail(`${rp}.earth_pct`, "must be the fit line at flow_cm_s");
      const rg = c.num(r.gap_pct, `${rp}.gap_pct`);
      if (rg !== null && earth !== null && lunar !== null && !near(rg, earth - lunar, TOL))
        c.fail(`${rp}.gap_pct`, "must be earth_pct − lunar.limit_pct");
      contains(c.range(r.ci95_pct, `${rp}.ci95_pct`), rg, `${rp}.ci95_pct`, "gap_pct");
      c.num(r.reading_error_pct, `${rp}.reading_error_pct`, { min: 0, nullable: true });
      prov(r.provenance, `${rp}.provenance`);
    }
  }

  // excluded list = materials with status "excluded"
  const ex = c.arr(o.excluded, "excluded") ?? [];
  const exNames = new Set<string>();
  ex.forEach((e, i) => {
    const x = c.obj(e, `excluded[${i}]`, ["material", "reason"]);
    if (!x) return;
    const name = c.str(x.material, `excluded[${i}].material`, { oneOf: MATERIALS });
    c.str(x.reason, `excluded[${i}].reason`, { minLen: 1 });
    if (name) exNames.add(name);
  });
  for (const k of excludedSet) if (!exNames.has(k)) c.fail("excluded", `${k} has status "excluded" but is not listed here`);
  for (const k of exNames) if (!excludedSet.has(k)) c.fail("excluded", `${k} is listed but its status is not "excluded"`);

  // ranking = ok materials, largest gap first, numbers copied from each material's gap
  const rk = c.arr(o.ranking, "ranking", 1) ?? [];
  const ranked = new Set<string>();
  let prevGap = Infinity;
  rk.forEach((e, i) => {
    const p = `ranking[${i}]`;
    const x = c.obj(e, p, ["rank", "material", "gap_pct", "ci95_pct"]);
    if (!x) return;
    if (x.rank !== i + 1) c.fail(`${p}.rank`, `must be ${i + 1}`);
    const name = c.str(x.material, `${p}.material`, { oneOf: MATERIALS });
    const gap = c.num(x.gap_pct, `${p}.gap_pct`);
    const ci = c.range(x.ci95_pct, `${p}.ci95_pct`);
    if (gap !== null) {
      if (gap > prevGap) c.fail(p, "rank 1 must be the largest gap, and ranks must follow gap order");
      prevGap = gap;
    }
    if (!name) return;
    if (ranked.has(name)) c.fail(`${p}.material`, `duplicate material ${name}`);
    ranked.add(name);
    const src = okGaps.get(name);
    if (!src) c.fail(`${p}.material`, `${name} is not an "ok" material`);
    else {
      if (gap !== null && gap !== src.gap) c.fail(`${p}.gap_pct`, `must equal materials.${name}.gap.gap_pct`);
      if (ci && src.ci && (ci[0] !== src.ci[0] || ci[1] !== src.ci[1])) c.fail(`${p}.ci95_pct`, `must equal materials.${name}.gap.ci95_pct`);
    }
  });
  for (const k of okGaps.keys()) if (!ranked.has(k)) c.fail("ranking", `${k} is "ok" but not ranked`);

  return result(issues, value as MoonGap);
}

// ---------------------------------------------------------------------------
// G. /api/ask
// ---------------------------------------------------------------------------

export interface AskRequest {
  /** 1 to 500 characters. */
  question: string;
  mode: AskMode;
  /** Required for summarize: which card. */
  subject?: { kind: "test" | "material"; id: string };
}

export type Citation = { kind: "row"; id: string } | { kind: "paper"; id: PaperId; page?: number };

/** A published number from a paper (the seed facts). */
export interface PaperSource {
  paper: PaperId;
  page: number;
  quote: string;
}

export type NumberSource = Provenance | PaperSource;

export interface GateNumber {
  /** The number as written in the answer, with its unit: "6 mm/s". */
  text: string;
  /** Character offsets into `answer`; null when the gate removed the number. */
  start: number | null;
  end: number | null;
  value: number;
  unit: string | null;
  status: "verified" | "unverified";
  /** Required when verified; null when unverified. */
  source: NumberSource | null;
}

export interface GateResult {
  /** passed: nothing unverified. flagged: unverified numbers kept and marked. removed: unverified numbers cut. */
  action: "passed" | "flagged" | "removed";
  checked: number;
  verified: number;
  unverified: number;
  numbers: GateNumber[];
}

export interface AskResponse {
  contract: "ask/1";
  mock?: boolean;
  _note?: string;
  mode: AskMode;
  /** not_in_data: the sources do not answer the question; the answer says so and cites nothing. */
  status: "answered" | "not_in_data";
  /** The text after gating. */
  answer: string;
  citations: Citation[];
  gate: GateResult;
}

/** Body of any 4xx/5xx response from /api/ask. */
export interface AskError {
  error: { code: string; message: string };
}

export const ASK_QUESTION_MAX = 500;

export function validateAskRequest(value: unknown): Result<AskRequest> {
  const issues: Issue[] = [];
  const c = new Checker(issues);
  const o = c.obj(value, "", ["question", "mode"], ["subject"]);
  if (!o) return result(issues, value as AskRequest);
  const q = c.str(o.question, "question", { maxLen: ASK_QUESTION_MAX });
  if (q !== null && q.trim() === "") c.fail("question", "must not be empty");
  c.str(o.mode, "mode", { oneOf: ASK_MODES });
  if ("subject" in o) {
    const s = c.obj(o.subject, "subject", ["kind", "id"]);
    if (s) {
      c.str(s.kind, "subject.kind", { oneOf: ["test", "material"] });
      c.str(s.id, "subject.id", { minLen: 1 });
    }
  }
  // summarize without a subject summarizes what the sources say about the question (the site's
  // Summarize button sends a typed question with no subject, which used to get a 400)
  return result(issues, value as AskRequest);
}

function checkSource(c: Checker, v: unknown, path: string) {
  if (typeof v === "object" && v !== null && "paper" in v) {
    const s = c.obj(v, path, ["paper", "page", "quote"]);
    if (!s) return;
    c.str(s.paper, `${path}.paper`, { oneOf: PAPER_IDS });
    c.num(s.page, `${path}.page`, { int: true, min: 1 });
    c.str(s.quote, `${path}.quote`, { minLen: 1 });
    return;
  }
  // The proof layer's Provenance: rows are 0-based data rows (0 for JSON files), and a number
  // computed from several rows (the validation headline) also lists them and says how.
  const s = c.obj(v, path, ["file", "row", "column", "sha256"], ["rows", "derived"]);
  if (!s) return;
  c.str(s.file, `${path}.file`, { minLen: 1 });
  c.num(s.row, `${path}.row`, { int: true, min: 0 });
  c.str(s.column, `${path}.column`, { minLen: 1 });
  c.str(s.sha256, `${path}.sha256`, { pattern: SHA256 });
  if ("rows" in s) {
    if (!Array.isArray(s.rows) || s.rows.length === 0) c.fail(`${path}.rows`, "expected a non-empty list of row numbers");
    else s.rows.forEach((r, i) => c.num(r, `${path}.rows[${i}]`, { int: true, min: 0 }));
  }
  if ("derived" in s) c.str(s.derived, `${path}.derived`, { minLen: 1 });
}

function checkAskResponse(c: Checker, value: unknown, path: string) {
  const o = c.obj(value, path, ["contract", "mode", "status", "answer", "citations", "gate"], HEADER_KEYS);
  if (!o) return;
  const p = (k: string) => join(path, k);
  if (o.contract !== "ask/1") c.fail(p("contract"), 'expected "ask/1"');
  if ("mock" in o && typeof o.mock !== "boolean") c.fail(p("mock"), "expected true or false");
  if ("_note" in o) c.str(o._note, p("_note"));
  if (o.mock !== true && hasMockId(o)) c.fail(p("mock"), "contains MOCK- IDs but is not flagged as mock");
  c.str(o.mode, p("mode"), { oneOf: ASK_MODES });
  const status = c.str(o.status, p("status"), { oneOf: ["answered", "not_in_data"] });
  const answer = c.str(o.answer, p("answer")) ?? "";

  const cites = c.arr(o.citations, p("citations")) ?? [];
  cites.forEach((cv, i) => {
    const cp = `${p("citations")}[${i}]`;
    const kind = (cv as Obj | null)?.kind;
    if (kind === "row") {
      const ci = c.obj(cv, cp, ["kind", "id"]);
      if (ci) c.str(ci.id, `${cp}.id`, { pattern: ROW_CITATION_ID });
    } else if (kind === "paper") {
      const ci = c.obj(cv, cp, ["kind", "id"], ["page"]);
      if (ci) {
        c.str(ci.id, `${cp}.id`, { oneOf: PAPER_IDS });
        if ("page" in ci) c.num(ci.page, `${cp}.page`, { int: true, min: 1 });
      }
    } else c.fail(`${cp}.kind`, 'expected "row" or "paper"');
  });
  if (status === "not_in_data" && cites.length > 0) c.fail(p("citations"), "must be empty when status is not_in_data");
  if (status === "answered" && cites.length === 0) c.fail(p("citations"), "an answer must cite at least one row or paper");

  const gp = p("gate");
  const g = c.obj(o.gate, gp, ["action", "checked", "verified", "unverified", "numbers"]);
  if (!g) return;
  const action = c.str(g.action, `${gp}.action`, { oneOf: ["passed", "flagged", "removed"] });
  const checked = c.num(g.checked, `${gp}.checked`, { int: true, min: 0 });
  const verified = c.num(g.verified, `${gp}.verified`, { int: true, min: 0 });
  const unverified = c.num(g.unverified, `${gp}.unverified`, { int: true, min: 0 });
  const nums = c.arr(g.numbers, `${gp}.numbers`) ?? [];
  let nVerified = 0;
  nums.forEach((nv, i) => {
    const np = `${gp}.numbers[${i}]`;
    const n = c.obj(nv, np, ["text", "start", "end", "value", "unit", "status", "source"]);
    if (!n) return;
    const text = c.str(n.text, `${np}.text`, { minLen: 1 });
    const start = c.num(n.start, `${np}.start`, { int: true, min: 0, nullable: true });
    const end = c.num(n.end, `${np}.end`, { int: true, min: 0, nullable: true });
    c.num(n.value, `${np}.value`);
    c.str(n.unit, `${np}.unit`, { nullable: true });
    const st = c.str(n.status, `${np}.status`, { oneOf: ["verified", "unverified"] });
    if ((start === null) !== (end === null)) c.fail(np, "start and end must both be set or both be null");
    if (start !== null && end !== null && text !== null && answer.slice(start, end) !== text)
      c.fail(np, `answer[${start}:${end}] is "${answer.slice(start, end)}", not "${text}"`);
    if (start === null && !(st === "unverified" && action === "removed"))
      c.fail(`${np}.start`, "only numbers removed by the gate may have no position");
    if (st === "verified") {
      nVerified++;
      if (n.source === null) c.fail(`${np}.source`, "a verified number needs its source");
      else checkSource(c, n.source, `${np}.source`);
    } else if (st === "unverified" && n.source !== null) c.fail(`${np}.source`, "must be null when unverified");
  });
  if (checked !== null && checked !== nums.length) c.fail(`${gp}.checked`, `must equal numbers.length (${nums.length})`);
  if (verified !== null && verified !== nVerified) c.fail(`${gp}.verified`, `must be ${nVerified}`);
  if (verified !== null && unverified !== null && checked !== null && verified + unverified !== checked)
    c.fail(gp, "verified + unverified must equal checked");
  if (action === "passed" && unverified) c.fail(`${gp}.action`, "cannot be passed with unverified numbers");
  if ((action === "flagged" || action === "removed") && unverified === 0)
    c.fail(`${gp}.action`, `${action} needs at least one unverified number`);
}

export function validateAskResponse(value: unknown): Result<AskResponse> {
  const issues: Issue[] = [];
  checkAskResponse(new Checker(issues), value, "");
  return result(issues, value as AskResponse);
}

export function validateAskError(value: unknown): Result<AskError> {
  const issues: Issue[] = [];
  const c = new Checker(issues);
  const o = c.obj(value, "", ["error"]);
  const e = o && c.obj(o.error, "error", ["code", "message"]);
  if (e) {
    c.str(e.code, "error.code", { minLen: 1 });
    c.str(e.message, "error.message", { minLen: 1 });
  }
  return result(issues, value as AskError);
}

/** Fixture file data/mock/ask/examples.json: request/response pairs for building the Ask panel. */
export interface AskExamples {
  mock: true;
  _note?: string;
  examples: { request: AskRequest; response: AskResponse }[];
}

export function validateAskExamples(value: unknown): Result<AskExamples> {
  const issues: Issue[] = [];
  const c = new Checker(issues);
  const o = c.obj(value, "", ["mock", "examples"], ["_note"]);
  if (!o) return result(issues, value as AskExamples);
  if (o.mock !== true) c.fail("mock", "ask examples are fixtures and must be flagged mock");
  (c.arr(o.examples, "examples", 1) ?? []).forEach((ev, i) => {
    const e = c.obj(ev, `examples[${i}]`, ["request", "response"]);
    if (!e) return;
    const rq = validateAskRequest(e.request);
    if (!rq.ok) for (const is of rq.issues) c.fail(`examples[${i}].request.${is.path}`, is.message);
    checkAskResponse(c, e.response, `examples[${i}].response`);
    const req = e.request as Obj | null;
    const res = e.response as Obj | null;
    if (req && res && req.mode !== res.mode) c.fail(`examples[${i}]`, "response.mode must match request.mode");
  });
  return result(issues, value as AskExamples);
}

// ---------------------------------------------------------------------------
// H. control_result.json: Plan B, tracker against hand measurement
// ---------------------------------------------------------------------------

export interface ControlResult {
  contract: "control/1";
  mock?: boolean;
  _note?: string;
  /** Also names edges/<test_id>.csv and overlays/<test_id>.mp4 for the clip. */
  test_id: string;
  clip: { fps: number; recorded_at: string; camera: string; scale_px_per_mm: number };
  /** Frame-stepped ruler-mark crossings. */
  hand: { crossings: { mark_mm: number; t_s: number }[]; rate_mm_s: number; ci95_mm_s: number };
  tracker: {
    rate_mm_s: number;
    ci95_mm_s: number;
    threshold_spread_mm_s: number;
    n_frames: number;
    t_start_s: number;
    t_end_s: number;
  };
  /** 100 · (tracker − hand) / hand. */
  diff_pct: number;
  notes: string;
}

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function validateControlResult(value: unknown): Result<ControlResult> {
  const issues: Issue[] = [];
  const c = new Checker(issues);
  const o = c.obj(value, "", ["contract", "test_id", "clip", "hand", "tracker", "diff_pct", "notes"], HEADER_KEYS);
  if (!o) return result(issues, value as ControlResult);
  c.header(o, "control/1");
  c.str(o.test_id, "test_id", { pattern: CONTROL_ID });
  c.str(o.notes, "notes");

  const clip = c.obj(o.clip, "clip", ["fps", "recorded_at", "camera", "scale_px_per_mm"]);
  if (clip) {
    c.num(clip.fps, "clip.fps", { gt: 0 });
    c.str(clip.recorded_at, "clip.recorded_at", { pattern: ISO_8601 });
    c.str(clip.camera, "clip.camera", { minLen: 1 });
    c.num(clip.scale_px_per_mm, "clip.scale_px_per_mm", { gt: 0 });
  }

  let handRate: number | null = null;
  const hand = c.obj(o.hand, "hand", ["crossings", "rate_mm_s", "ci95_mm_s"]);
  if (hand) {
    let lastT = -Infinity;
    (c.arr(hand.crossings, "hand.crossings", 2) ?? []).forEach((xv, i) => {
      const xp = `hand.crossings[${i}]`;
      const x = c.obj(xv, xp, ["mark_mm", "t_s"]);
      if (!x) return;
      c.num(x.mark_mm, `${xp}.mark_mm`);
      const tt = c.num(x.t_s, `${xp}.t_s`, { min: 0 });
      if (tt !== null) {
        if (tt <= lastT) c.fail(`${xp}.t_s`, "crossings must be in time order");
        lastT = tt;
      }
    });
    handRate = c.num(hand.rate_mm_s, "hand.rate_mm_s", { gt: 0 });
    c.num(hand.ci95_mm_s, "hand.ci95_mm_s", { min: 0 });
  }

  let trackerRate: number | null = null;
  const tr = c.obj(o.tracker, "tracker", [
    "rate_mm_s",
    "ci95_mm_s",
    "threshold_spread_mm_s",
    "n_frames",
    "t_start_s",
    "t_end_s",
  ]);
  if (tr) {
    trackerRate = c.num(tr.rate_mm_s, "tracker.rate_mm_s", { min: 0 });
    c.num(tr.ci95_mm_s, "tracker.ci95_mm_s", { min: 0 });
    c.num(tr.threshold_spread_mm_s, "tracker.threshold_spread_mm_s", { min: 0 });
    c.num(tr.n_frames, "tracker.n_frames", { int: true, min: 2 });
    const t0 = c.num(tr.t_start_s, "tracker.t_start_s", { min: 0 });
    const t1 = c.num(tr.t_end_s, "tracker.t_end_s", { min: 0 });
    if (t0 !== null && t1 !== null && !(t0 < t1)) c.fail("tracker.t_end_s", "must be after t_start_s");
  }

  const diff = c.num(o.diff_pct, "diff_pct");
  if (diff !== null && handRate !== null && trackerRate !== null) {
    const want = (100 * (trackerRate - handRate)) / handRate;
    if (!near(diff, want, 0.1)) c.fail("diff_pct", `must be 100·(tracker − hand)/hand = ${want.toFixed(2)} (±0.1)`);
  }
  return result(issues, value as ControlResult);
}

// ---------------------------------------------------------------------------
// C. overlays/<test_id>.mp4 (name, size and container only; codec is checked by eye/ffprobe)
// ---------------------------------------------------------------------------

export const OVERLAY_PATH = /(^|\/)overlays\/([^/]+)\.mp4$/;

/** `head` = the first bytes of the file (at least 12). */
export function checkOverlay(path: string, sizeBytes: number, head: Uint8Array): Issue[] {
  const issues: Issue[] = [];
  const m = OVERLAY_PATH.exec(path);
  if (!m) issues.push({ path, message: "overlays live at overlays/<test_id>.mp4" });
  else if (!TRACKED_ID.test(m[2])) issues.push({ path, message: `"${m[2]}" is not a test or control ID` });
  if (sizeBytes > OVERLAY_MAX_BYTES)
    issues.push({ path, message: `${(sizeBytes / 1048576).toFixed(1)} MB is over the ${OVERLAY_MAX_BYTES / 1048576} MB limit` });
  const brand = String.fromCharCode(...head.slice(4, 8));
  if (brand !== "ftyp") issues.push({ path, message: "not an MP4 file (no ftyp box)" });
  return issues;
}

// ---------------------------------------------------------------------------
// I. frames_<test_id>.csv: one row per photo, from EXIF (tools/exif_dump.py)
// ---------------------------------------------------------------------------

export const FRAMES_COLUMNS = [
  "file",
  "datetime_original",
  "subsec",
  "t_s",
  "t_burn_s",
  "f_number",
  "exposure_s",
  "iso",
  "width_px",
  "height_px",
  "link_id",
  "phase",
  "gap_prev_s",
  "long_gap",
  "exposure_scale",
] as const;

export const FRAME_PHASES = ["pretest", "burn"] as const;
/** A gap to the previous photo longer than this many seconds is flagged in `long_gap`. */
export const FRAMES_LONG_GAP_S = 20;
/** `frames_<test_id>.csv`; the test ID is the NASA PSI test number (P16), a mock one, or a control clip. */
export const FRAMES_PATH = /(^|\/)frames_([^/]+)\.csv$/;

export interface FrameRow {
  /** Photo file name (no folder), unique within the file. */
  file: string;
  /** EXIF DateTimeOriginal exactly as stored: `YYYY:MM:DD HH:MM:SS`. Empty: the photo has no usable EXIF time. */
  datetime_original: string;
  /** EXIF SubSecTimeOriginal: the digits after the decimal point of the second (`08` = 0.08 s). */
  subsec: string;
  /** Seconds since the test's first photo. Same clock as spread_rates and edges. Null: no EXIF time. */
  t_s: number | null;
  /** Seconds since the first photo of the burn sequence; negative before it. Null: no EXIF time or no burn start set. */
  t_burn_s: number | null;
  f_number: number | null;
  /** Shutter time in seconds. */
  exposure_s: number | null;
  iso: number | null;
  /** Full-resolution raw size from the NEF, not the thumbnail and not the cropped TIFF. */
  width_px: number | null;
  height_px: number | null;
  /** The same test's sample ID in Link et al. Table S1 (B16 for P16). Same on every row. */
  link_id: string;
  /** `pretest` before the burn sequence, `burn` from its first photo on. */
  phase: string;
  /** Seconds since the previous photo. Null on the first row and on rows without a time. */
  gap_prev_s: number | null;
  /** `true` when gap_prev_s is over FRAMES_LONG_GAP_S. A flag only; the row keeps its phase. */
  long_gap: string;
  /** f_number² / (exposure_s · iso). Corrected brightness = linear pixel value · exposure_scale. */
  exposure_scale: number | null;
}

const FRAME_CELLS: Cell[] = [
  { name: "file", type: "string", required: true, pattern: /^[^/\\]+\.[A-Za-z0-9]+$/ },
  { name: "datetime_original", type: "string", pattern: /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/ },
  { name: "subsec", type: "string", pattern: /^\d+$/ },
  { name: "t_s", type: "number", min: 0 },
  { name: "t_burn_s", type: "number" },
  { name: "f_number", type: "number", gt: 0 },
  { name: "exposure_s", type: "number", gt: 0 },
  { name: "iso", type: "number", integer: true, gt: 0 },
  { name: "width_px", type: "number", integer: true, min: 1 },
  { name: "height_px", type: "number", integer: true, min: 1 },
  { name: "link_id", type: "string", pattern: SAMPLE_ID },
  { name: "phase", type: "string", oneOf: FRAME_PHASES },
  { name: "gap_prev_s", type: "number", min: 0 },
  { name: "long_gap", type: "string", oneOf: ["true", "false"] },
  { name: "exposure_scale", type: "number", gt: 0 },
];

export function validateFrames(text: string, path?: string): Result<{ mock: boolean; rows: FrameRow[] }> {
  const issues: Issue[] = [];
  if (path !== undefined) {
    const id = FRAMES_PATH.exec(path)?.[2];
    if (!id || !TRACKED_ID.test(id))
      issues.push({ path: "file name", message: `expected frames_<test_id>.csv with a test ID like P16, got "${path.split("/").pop()}"` });
  }
  const t = readTable(text, FRAME_CELLS, issues);
  if (!t) return result(issues, { mock: false, rows: [] });
  const rows = t.rows as unknown as FrameRow[];

  const TOL = 1e-6;
  const seen = new Set<string>();
  let prevT: number | null = null; // t_s of the previous timed row
  let untimedLine: number | null = null;
  let burnOffset: number | null = null; // t_s - t_burn_s, the same on every row
  rows.forEach((r, i) => {
    const at = (col: string) => `line ${t.lines[i]}, ${col}`;
    const key = r.file.toLowerCase();
    if (seen.has(key)) issues.push({ path: at("file"), message: `${r.file} is listed twice` });
    seen.add(key);
    if (r.link_id !== rows[0].link_id) issues.push({ path: at("link_id"), message: "link_id must be the same on every row" });

    if (r.exposure_scale !== null && r.f_number !== null && r.exposure_s !== null && r.iso !== null) {
      const want = (r.f_number * r.f_number) / (r.exposure_s * r.iso);
      if (!near(r.exposure_scale, want, 1e-6 * want))
        issues.push({ path: at("exposure_scale"), message: `expected f_number² / (exposure_s · iso) = ${want}` });
    }

    if (r.t_s === null) {
      // No EXIF time: the photo is kept, after the timed rows, with every time column empty.
      untimedLine ??= t.lines[i];
      for (const col of ["t_burn_s", "gap_prev_s"] as const)
        if (r[col] !== null) issues.push({ path: at(col), message: "must be empty when t_s is empty" });
      for (const col of ["phase", "long_gap"] as const)
        if (r[col] !== "") issues.push({ path: at(col), message: "must be empty when t_s is empty" });
      return;
    }
    if (untimedLine !== null)
      issues.push({ path: at("t_s"), message: `rows without a time go last (line ${untimedLine} has no t_s)` });

    if (prevT === null) {
      if (r.t_s !== 0) issues.push({ path: at("t_s"), message: "the first photo must have t_s = 0 (seconds since the test's first photo)" });
      if (r.gap_prev_s !== null) issues.push({ path: at("gap_prev_s"), message: "must be empty on the first photo" });
      if (r.long_gap !== "") issues.push({ path: at("long_gap"), message: "must be empty on the first photo" });
    } else {
      if (r.t_s < prevT) issues.push({ path: at("t_s"), message: "rows must be in time order" });
      if (r.gap_prev_s === null) issues.push({ path: at("gap_prev_s"), message: "required after the first photo" });
      else {
        if (!near(r.gap_prev_s, r.t_s - prevT, TOL))
          issues.push({ path: at("gap_prev_s"), message: `expected t_s minus the previous t_s = ${r.t_s - prevT}` });
        const want = r.gap_prev_s > FRAMES_LONG_GAP_S ? "true" : "false";
        if (r.long_gap !== want)
          issues.push({ path: at("long_gap"), message: `expected ${want} (true when gap_prev_s is over ${FRAMES_LONG_GAP_S} s)` });
      }
    }
    prevT = r.t_s;

    if (r.t_burn_s === null) {
      if (r.phase !== "") issues.push({ path: at("phase"), message: "must be empty when t_burn_s is empty" });
      if (burnOffset !== null) issues.push({ path: at("t_burn_s"), message: "set on some timed rows but not this one" });
    } else {
      const offset = r.t_s - r.t_burn_s;
      if (burnOffset === null) {
        burnOffset = offset;
        if (i > 0 && rows.slice(0, i).some((p) => p.t_s !== null))
          issues.push({ path: at("t_burn_s"), message: "set on this row but empty on an earlier timed row" });
      } else if (!near(offset, burnOffset, TOL))
        issues.push({ path: at("t_burn_s"), message: "t_s minus t_burn_s must be the same on every row" });
      const want = r.t_burn_s < 0 ? "pretest" : "burn";
      if (r.phase !== want) issues.push({ path: at("phase"), message: `expected ${want} (pretest only when t_burn_s is negative)` });
    }
  });

  if (burnOffset !== null && !rows.some((r) => r.t_burn_s === 0))
    issues.push({ path: "file", message: "no row has t_burn_s = 0: the first burn photo must be in the file" });
  return result(issues, { mock: t.mock, rows });
}

// ---------------------------------------------------------------------------
// J. psi_investigations.json: the PSI combustion investigations at a glance
// ---------------------------------------------------------------------------
//
// Generated by scripts/build-investigations.mjs from docs/research/psi_investigations.json. Text
// fields are as the research catalog wrote them. Relevance scores are the team's judgment, not
// NASA's, and the file carries no ranking: the UI ranks from the scores.

export const INVESTIGATION_SETTINGS = ["spacecraft_cabin", "iss", "lunar_base", "mars_base", "pressurized_rover"] as const;
export type InvestigationSetting = (typeof INVESTIGATION_SETTINGS)[number];

export const PSI_ACCESSION = /^(MOCK-)?PSI-\d+$/;
const DOI = /^10\.\d{4,9}\/\S+$/;

export interface Investigation {
  accession: string;
  /** null for the ground grants, which have none. */
  acronym: string | null;
  full_name: string;
  psi_doi: string;
  psi_url: string;
  investigation_type: string;
  research_subarea: string;
  fire_safety_theme: string;
  years: { psi_investigation_dates: string; operations: string };
  platform: string;
  hardware: string;
  fuel_sample: string;
  atmosphere: { o2: string; pressure: string };
  flow: string;
  gravity: string;
  diagnostics: string[];
  /** `n_files` is null when PSI's file list could not be read. */
  psi_data: { total_size_gb: number; n_files: number | null; file_types: string; source: string };
  pi: string;
  key_finding: string;
  key_finding_source: string;
  /** `doi` is null when no DOI exists or none was verified. */
  key_papers: { citation: string; doi: string | null; doi_verified: boolean; note?: string }[];
  /** Whole number 1 to 5 per setting, with the reason. */
  relevance: Record<InvestigationSetting, { score: number; why: string }>;
  notes_unverified: string[];
}

export interface Investigations {
  contract: "investigations/1";
  mock?: boolean;
  _note?: string;
  /** Says the relevance scores are the team's judgment, not NASA's. */
  relevance_note: string;
  derived_from: { file: string; sha256: string; generated_by: string; rubric?: string };
  investigations: Investigation[];
}

/** A key naming a Moon/Mars airflow, anywhere on its path (`relevance.lunar_base.airflow_cm_s`). */
const PARTIAL_G_FLOW_PATH = /(lunar|moon|mars|martian).*(flow|velocity|speed)/i;
/** Moon/Mars and an airflow speed in the same clause, in either order ("lunar airflow of 5 cm/s"). */
const PARTIAL_G_FLOW_TEXT = [
  /\b(lunar|moon|mars|martian)\b[^.;:]*?\d+(\.\d+)?\s*(cm\/s|m\/s|ft\/min)/i,
  /\d+(\.\d+)?\s*(cm\/s|m\/s|ft\/min)[^.;:]*?\b(lunar|moon|mars|martian)\b/i,
];

function findPartialGFlows(v: unknown, path: string, out: Issue[]) {
  if (typeof v === "string") {
    if (PARTIAL_G_FLOW_TEXT.some((re) => re.test(v)))
      out.push({ path, message: "pairs the Moon or Mars with an airflow speed: a Moon/Mars airflow is never stated" });
  } else if (Array.isArray(v)) v.forEach((x, i) => findPartialGFlows(x, `${path}[${i}]`, out));
  else if (typeof v === "object" && v !== null)
    for (const [k, x] of Object.entries(v)) {
      const p = join(path, k);
      if (PARTIAL_G_FLOW_PATH.test(p.replace(/\[\d+\]/g, "")))
        out.push({ path: p, message: "a Moon or Mars airflow is never stated: remove this field" });
      findPartialGFlows(x, p, out);
    }
}

const INVESTIGATION_TEXT = [
  "full_name",
  "investigation_type",
  "research_subarea",
  "fire_safety_theme",
  "platform",
  "hardware",
  "fuel_sample",
  "flow",
  "gravity",
  "pi",
  "key_finding",
  "key_finding_source",
] as const;

export function validateInvestigations(value: unknown): Result<Investigations> {
  const issues: Issue[] = [];
  const c = new Checker(issues);
  const o = c.obj(value, "", ["contract", "relevance_note", "derived_from", "investigations"], HEADER_KEYS);
  if (!o) return result(issues, value as Investigations);
  c.header(o, "investigations/1");

  const partialG: Issue[] = [];
  findPartialGFlows(o, "", partialG);
  for (const is of partialG) c.fail(is.path, is.message);

  const text = (v: unknown, p: string) => {
    const s = c.str(v, p);
    if (s !== null && s.trim() === "") c.fail(p, "must not be empty");
    return s;
  };

  const note = text(o.relevance_note, "relevance_note");
  if (note !== null && !(/judgment/i.test(note) && /not\b[^.]*\bNASA/i.test(note)))
    c.fail("relevance_note", "must say the relevance scores are the team's judgment, not NASA's");

  const from = c.obj(o.derived_from, "derived_from", ["file", "sha256", "generated_by"], ["rubric"]);
  if (from) {
    text(from.file, "derived_from.file");
    c.str(from.sha256, "derived_from.sha256", { pattern: SHA256 });
    text(from.generated_by, "derived_from.generated_by");
    if ("rubric" in from) text(from.rubric, "derived_from.rubric");
  }

  const seen = new Set<string>();
  (c.arr(o.investigations, "investigations", 1) ?? []).forEach((iv, i) => {
    const ip = `investigations[${i}]`;
    const r = c.obj(iv, ip, [
      "accession",
      "acronym",
      ...INVESTIGATION_TEXT,
      "psi_doi",
      "psi_url",
      "years",
      "atmosphere",
      "diagnostics",
      "psi_data",
      "key_papers",
      "relevance",
      "notes_unverified",
    ]);
    if (!r) return;
    const acc = c.str(r.accession, `${ip}.accession`, { pattern: PSI_ACCESSION });
    if (acc !== null) {
      if (seen.has(acc)) c.fail(`${ip}.accession`, `${acc} appears twice`);
      seen.add(acc);
    }
    if (r.acronym !== null) text(r.acronym, `${ip}.acronym`);
    for (const k of INVESTIGATION_TEXT) text(r[k], `${ip}.${k}`);
    c.str(r.psi_doi, `${ip}.psi_doi`, { pattern: DOI });
    c.str(r.psi_url, `${ip}.psi_url`, { pattern: /^https:\/\/\S+$/ });

    const years = c.obj(r.years, `${ip}.years`, ["psi_investigation_dates", "operations"]);
    if (years) for (const k of ["psi_investigation_dates", "operations"]) text(years[k], `${ip}.years.${k}`);
    const atm = c.obj(r.atmosphere, `${ip}.atmosphere`, ["o2", "pressure"]);
    if (atm) for (const k of ["o2", "pressure"]) text(atm[k], `${ip}.atmosphere.${k}`);
    (c.arr(r.diagnostics, `${ip}.diagnostics`, 1) ?? []).forEach((d, j) => text(d, `${ip}.diagnostics[${j}]`));

    const data = c.obj(r.psi_data, `${ip}.psi_data`, ["total_size_gb", "n_files", "file_types", "source"]);
    if (data) {
      c.num(data.total_size_gb, `${ip}.psi_data.total_size_gb`, { min: 0 });
      c.num(data.n_files, `${ip}.psi_data.n_files`, { int: true, min: 0, nullable: true });
      c.str(data.file_types, `${ip}.psi_data.file_types`);
      text(data.source, `${ip}.psi_data.source`);
    }

    (c.arr(r.key_papers, `${ip}.key_papers`, 1) ?? []).forEach((kv, j) => {
      const kp = `${ip}.key_papers[${j}]`;
      const k = c.obj(kv, kp, ["citation", "doi", "doi_verified"], ["note"]);
      if (!k) return;
      text(k.citation, `${kp}.citation`);
      const doi = c.str(k.doi, `${kp}.doi`, { pattern: DOI, nullable: true });
      if (typeof k.doi_verified !== "boolean") c.fail(`${kp}.doi_verified`, "expected true or false");
      else if (k.doi_verified && doi === null) c.fail(`${kp}.doi_verified`, "cannot be true without a doi");
      if ("note" in k) text(k.note, `${kp}.note`);
    });

    const rel = c.obj(r.relevance, `${ip}.relevance`, INVESTIGATION_SETTINGS);
    if (rel)
      for (const s of INVESTIGATION_SETTINGS) {
        if (!(s in rel)) continue;
        const sp = `${ip}.relevance.${s}`;
        const cell = c.obj(rel[s], sp, ["score", "why"]);
        if (!cell) continue;
        c.num(cell.score, `${sp}.score`, { int: true, min: 1, max: 5 });
        text(cell.why, `${sp}.why`);
      }

    (c.arr(r.notes_unverified, `${ip}.notes_unverified`) ?? []).forEach((n, j) => text(n, `${ip}.notes_unverified[${j}]`));
  });
  return result(issues, value as Investigations);
}

// ---------------------------------------------------------------------------
// Registry: which contract applies to which file
// ---------------------------------------------------------------------------

export interface ContractInfo {
  id: string;
  /** Where the real file lives. Mock copies live under data/mock with the same name. */
  file: string;
  match: RegExp;
  validate(text: string, path: string): Result<unknown>;
}

function jsonContract(fn: (v: unknown) => Result<unknown>) {
  return (text: string): Result<unknown> => {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch (e) {
      return { ok: false, issues: [{ path: "file", message: `not valid JSON: ${(e as Error).message}` }] };
    }
    return fn(v);
  };
}

// ---------------------------------------------------------------------------
// envelope/1: data/derived/envelope.json (scripts/build-envelope.mjs)
// Roughly what gravity is low enough that low airflow alone can let a flame die: the Ignos
// team's order-of-magnitude reading of a NASA schematic. Gravity levels and ratios only: a world may
// carry no airflow field at all (never state a Moon airflow number), every world carries
// `estimate: true`, and the file says it is not a NASA measurement.
// ---------------------------------------------------------------------------

export const ENVELOPE_PATH = /(^|\/)envelope\.json$/;

export interface EnvelopeWorld {
  id: string;
  label: string;
  estimate: true;
  g_earth: number;
  times_threshold_at_least: number;
  times_threshold_at_most: number;
  provenance: Record<string, unknown>;
}

export interface Envelope {
  contract: "envelope/1";
  mock?: boolean;
  _note?: string;
  estimate_note: string;
  model: { law: string; exponent: number; source: string };
  anchors: { low: { flow_1g_cm_s: number; provenance: unknown }; high: { flow_1g_cm_s: number; provenance: unknown } };
  sustaining_flow: { sample_id: string; o2_pct: number; rod_d_cm: number; lowest_flow_with_spread_cm_s: number; provenance: unknown }[];
  threshold: { flow_low_cm_s: number; flow_high_cm_s: number; g_low: number; g_high: number; bound: "at most"; provenance: unknown };
  worlds: EnvelopeWorld[];
  checks: { id: string; what: string; result: string; [k: string]: unknown }[];
  caveats: string[];
  derived_from: { file: string; sha256: string }[];
}

export function validateEnvelope(value: unknown): Result<Envelope> {
  const issues: Issue[] = [];
  const c = new Checker(issues);
  const o = c.obj(value, "", ["contract", "estimate_note", "model", "anchors", "sustaining_flow", "threshold", "worlds", "checks", "caveats", "derived_from"], HEADER_KEYS);
  if (!o) return result(issues, value as Envelope);
  c.header(o, "envelope/1");
  const note = c.str(o.estimate_note, "estimate_note", { minLen: 1 });
  if (note !== null && !/not a NASA measurement/i.test(note)) c.fail("estimate_note", 'must say the numbers are "not a NASA measurement"');

  const m = c.obj(o.model, "model", ["law", "exponent", "source"]);
  if (m) {
    c.str(m.law, "model.law", { minLen: 1 });
    c.num(m.exponent, "model.exponent", { gt: 0, max: 1 });
    c.str(m.source, "model.source", { minLen: 1 });
  }
  const a = c.obj(o.anchors, "anchors", ["low", "high"]);
  const anchor = (k: "low" | "high") => {
    const x = a ? c.obj(a[k], `anchors.${k}`, ["flow_1g_cm_s", "provenance"]) : null;
    return x ? c.num(x.flow_1g_cm_s, `anchors.${k}.flow_1g_cm_s`, { gt: 0 }) : null;
  };
  const lo = anchor("low");
  const hi = anchor("high");
  if (lo !== null && hi !== null && lo > hi) c.fail("anchors", "low must not exceed high");

  const flows = c.arr(o.sustaining_flow, "sustaining_flow", 1) ?? [];
  flows.forEach((r, i) => {
    const p = `sustaining_flow[${i}]`;
    const x = c.obj(r, p, ["sample_id", "o2_pct", "rod_d_cm", "lowest_flow_with_spread_cm_s", "provenance"]);
    if (!x) return;
    c.str(x.sample_id, `${p}.sample_id`, { minLen: 1 });
    c.num(x.o2_pct, `${p}.o2_pct`, { gt: 0, max: 100 });
    c.num(x.rod_d_cm, `${p}.rod_d_cm`, { gt: 0 });
    c.num(x.lowest_flow_with_spread_cm_s, `${p}.lowest_flow_with_spread_cm_s`, { gt: 0 });
    c.obj(x.provenance, `${p}.provenance`, ["file", "row", "column", "derived"], ["step"]);
  });

  const t = c.obj(o.threshold, "threshold", ["flow_low_cm_s", "flow_high_cm_s", "g_low", "g_high", "bound", "provenance"]);
  let gHigh: number | null = null;
  if (t) {
    const fl = c.num(t.flow_low_cm_s, "threshold.flow_low_cm_s", { gt: 0 });
    const fh = c.num(t.flow_high_cm_s, "threshold.flow_high_cm_s", { gt: 0 });
    const gl = c.num(t.g_low, "threshold.g_low", { gt: 0, max: 1 });
    gHigh = c.num(t.g_high, "threshold.g_high", { gt: 0, max: 1 });
    if (fl !== null && fh !== null && fl > fh) c.fail("threshold", "flow_low_cm_s must not exceed flow_high_cm_s");
    if (gl !== null && gHigh !== null && gl > gHigh) c.fail("threshold", "g_low must not exceed g_high");
    c.str(t.bound, "threshold.bound", { oneOf: ["at most"] });
  }

  const worlds = c.arr(o.worlds, "worlds", 1) ?? [];
  worlds.forEach((w, i) => {
    const p = `worlds[${i}]`;
    // Any airflow on a world would be a lunar (or other world's) airflow number: refused by name.
    if (typeof w === "object" && w !== null)
      for (const k of Object.keys(w)) if (/flow|wind|velocity|speed|_cm_s|_mm_s|_m_s/i.test(k)) c.fail(`${p}.${k}`, "no airflow may be stated for a world");
    // A fans-off outcome (does a flame die?) at any gravity is untested: the threshold compares a
    // schematic with the lowest flows where orbit tests still measured spread (relay 2026-11-15).
    if (typeof w === "object" && w !== null)
      for (const k of Object.keys(w)) if (/fans_off|extinct|starv|quench|die|verdict/i.test(k)) c.fail(`${p}.${k}`, "no fans-off outcome may be stated for a world: it is untested");
    const x = c.obj(w, p, ["id", "label", "estimate", "g_earth", "times_threshold_at_least", "times_threshold_at_most", "provenance"]);
    if (!x) return;
    c.str(x.id, `${p}.id`, { pattern: /^[a-z_]+$/ });
    c.str(x.label, `${p}.label`, { minLen: 1 });
    if (x.estimate !== true) c.fail(`${p}.estimate`, "must be true: everything about a world here is the team's reading, not NASA's");
    c.num(x.g_earth, `${p}.g_earth`, { gt: 0 });
    c.num(x.times_threshold_at_least, `${p}.times_threshold_at_least`, { gt: 0 });
    c.num(x.times_threshold_at_most, `${p}.times_threshold_at_most`, { gt: 0 });
    c.obj(x.provenance, `${p}.provenance`, ["g_earth", "times_threshold_at_least", "times_threshold_at_most"]);
  });

  (c.arr(o.checks, "checks") ?? []).forEach((k, i) => {
    const x = c.obj(k, `checks[${i}]`, ["id", "what", "result"], ["rows", "exponent_from_axis", "ratio"]);
    if (x) {
      c.str(x.id, `checks[${i}].id`, { minLen: 1 });
      c.str(x.result, `checks[${i}].result`, { minLen: 1 });
    }
  });
  const cav = c.arr(o.caveats, "caveats", 1) ?? [];
  cav.forEach((v, i) => c.str(v, `caveats[${i}]`, { minLen: 1 }));
  (c.arr(o.derived_from, "derived_from", 1) ?? []).forEach((d, i) => {
    const x = c.obj(d, `derived_from[${i}]`, ["file", "sha256"]);
    if (x) c.str(x.sha256, `derived_from[${i}].sha256`, { pattern: SHA256 });
  });
  return result(issues, value as Envelope);
}


// ---------------------------------------------------------------------------
// flame_model/1: data/derived/flame_model.json (pipeline/flame_model/build.py)
// A flame-spread model for black PMMA rods fitted to Link 2018 Tables S1 (0 g) and S2 (1 g), kept as a
// validation result only (team decision, 2026-11-15): no prediction at the Moon or any gravity
// between 0 g and 1 g may be stored, so the file refuses `grid`, `points` and `moon_vs_earth`.
// ---------------------------------------------------------------------------

export const FLAME_MODEL_PATH = /(^|\/)flame_model\.json$/;
const FLAME_MODEL_LABEL = /model, not a NASA measurement/;
const FLAME_MODEL_FORBIDDEN = ["grid", "points", "moon_vs_earth", "predictions"];

export interface FlameModel {
  contract: "flame_model/1";
  mock?: boolean;
  _note?: string;
  label: string;
  scope: string;
  model: { equations: string[]; gravity_note: string; fit: string; parameters: Record<string, Record<string, unknown>> };
  validation: Record<string, unknown>;
  caveats: string[];
  derived_from: { file: string; sha256: string }[];
}

export function validateFlameModel(value: unknown): Result<FlameModel> {
  const issues: Issue[] = [];
  const c = new Checker(issues);
  if (typeof value === "object" && value !== null)
    for (const k of FLAME_MODEL_FORBIDDEN) if (k in (value as Obj)) c.fail(k, "no model prediction at the Moon or between 0 g and 1 g may be stored");
  const o = c.obj(value, "", ["contract", "label", "scope", "model", "validation", "caveats", "derived_from"], [...HEADER_KEYS, ...FLAME_MODEL_FORBIDDEN]);
  if (!o) return result(issues, value as FlameModel);
  c.header(o, "flame_model/1");
  const label = c.str(o.label, "label", { minLen: 1 });
  if (label !== null && !FLAME_MODEL_LABEL.test(label)) c.fail("label", 'must say "model, not a NASA measurement"');
  c.str(o.scope, "scope", { minLen: 1 });
  const m = c.obj(o.model, "model", ["equations", "gravity_note", "fit", "parameters"]);
  if (m) {
    (c.arr(m.equations, "model.equations", 1) ?? []).forEach((e, i) => c.str(e, `model.equations[${i}]`, { minLen: 1 }));
    c.str(m.gravity_note, "model.gravity_note", { minLen: 1 });
    const ps = m.parameters;
    if (typeof ps !== "object" || ps === null || Array.isArray(ps)) c.fail("model.parameters", "expected an object");
    else
      for (const [name, v] of Object.entries(ps as Obj)) {
        const p = `model.parameters.${name}`;
        if (typeof v !== "object" || v === null) { c.fail(p, "expected an object"); continue; }
        const keys = Object.keys(v as Obj);
        const val = keys.find((k) => k.startsWith("value"));
        const lohi = keys.find((k) => k.startsWith("ci95"));
        if (!val) c.fail(p, "needs a value (value, value_pct or value_cm_s)");
        else c.num((v as Obj)[val], `${p}.${val}`);
        if (!lohi) c.fail(p, "needs a ci95 interval");
        else {
          const a = c.arr((v as Obj)[lohi], `${p}.${lohi}`);
          if (a && a.length !== 2) c.fail(`${p}.${lohi}`, "expected [low, high]");
        }
      }
  }
  const val = c.obj(o.validation, "validation", ["fit_all", "leave_one_group_out", "cross_domain", "bootstrap", "remeasurement_cross_check"]);
  if (val) {
    const logo = val.leave_one_group_out as Obj | undefined;
    if (logo) {
      c.num(logo.median_abs_error_pct, "validation.leave_one_group_out.median_abs_error_pct", { min: 0 });
      c.num(logo.rows_with_rate_scored, "validation.leave_one_group_out.rows_with_rate_scored", { int: true, min: 0 });
      c.num(logo.always_burns_baseline_correct, "validation.leave_one_group_out.always_burns_baseline_correct", { int: true, min: 0 });
    }
    const cross = c.obj(val.cross_domain, "validation.cross_domain", ["orbit_only_to_earth", "earth_only_to_orbit"]);
    if (cross)
      for (const k of ["orbit_only_to_earth", "earth_only_to_orbit"]) {
        const x = cross[k] as Obj | undefined;
        if (!x || typeof x.passed !== "boolean") c.fail(`validation.cross_domain.${k}.passed`, "expected true or false");
      }
  }
  (c.arr(o.caveats, "caveats", 1) ?? []).forEach((v, i) => c.str(v, `caveats[${i}]`, { minLen: 1 }));
  (c.arr(o.derived_from, "derived_from", 1) ?? []).forEach((d, i) => {
    const x = c.obj(d, `derived_from[${i}]`, ["file", "sha256"]);
    if (x) c.str(x.sha256, `derived_from[${i}].sha256`, { pattern: SHA256 });
  });
  return result(issues, value as FlameModel);
}

export const CONTRACTS: readonly ContractInfo[] = [
  {
    id: "spread_rates",
    file: "data/derived/spread_rates.csv",
    match: /(^|\/)spread_rates\.csv$/,
    validate: (text) => validateSpreadRates(text),
  },
  {
    id: "edges",
    file: "data/derived/edges/<test_id>.csv",
    match: /(^|\/)edges\/[^/]+\.csv$/,
    validate: (text, path) => validateEdges(text, path.split("/").pop()!.replace(/\.csv$/, "")),
  },
  {
    id: "frames",
    file: "data/derived/frames_<test_id>.csv",
    match: FRAMES_PATH,
    validate: (text, path) => validateFrames(text, path),
  },
  {
    id: "ices2025_digitized",
    file: "data/reference/ices2025_digitized.csv",
    match: /(^|\/)ices2025_digitized(_repeat)?\.csv$/,
    validate: (text) => validateDigitized(text),
  },
  {
    id: "table_s1",
    file: "data/reference/link2018_table_s1.csv",
    match: /(^|\/)link2018_table_s1\.csv$/,
    validate: (text) => validateTableS1(text),
  },
  {
    id: "moongap",
    file: "web/src/data/moongap.json",
    match: /(^|\/)moongap\.json$/,
    validate: jsonContract(validateMoonGap),
  },
  {
    id: "control",
    file: "data/derived/control_result.json",
    match: /(^|\/)control_result\.json$/,
    validate: jsonContract(validateControlResult),
  },
  {
    id: "investigations",
    file: "data/reference/psi_investigations.json",
    match: /(^|\/)psi_investigations\.json$/,
    validate: jsonContract(validateInvestigations),
  },
  {
    id: "envelope",
    file: "data/derived/envelope.json",
    match: ENVELOPE_PATH,
    validate: jsonContract(validateEnvelope),
  },
  {
    id: "flame_model",
    file: "data/derived/flame_model.json",
    match: FLAME_MODEL_PATH,
    validate: jsonContract(validateFlameModel),
  },
  {
    id: "ask_examples",
    file: "data/mock/ask/examples.json",
    match: /(^|\/)ask\/examples\.json$/,
    validate: jsonContract(validateAskExamples),
  },
];

/** The contract for a repo-relative path (forward slashes), if any. */
export function findContract(path: string): ContractInfo | undefined {
  return CONTRACTS.find((c) => c.match.test(path));
}

/** True if a text file is flagged mock: a leading `# mock: true` line (CSV) or `"mock": true` (JSON). */
export function isMockText(text: string): boolean {
  return /^﻿?(#[^\n]*\n)*#\s*mock\s*:\s*true\b/.test(text) || /"mock"\s*:\s*true\b/.test(text);
}
