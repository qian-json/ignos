// Written with AI assistance (Claude Code)
/**
 * gateAnswer(): checks every number in an AI-written answer against the fact index before the
 * answer is shown. A number is verified only when a fact of the same dimension agrees with it
 * to the precision it was written (6 mm/s matches 0.6 cm/s; "0.06 mm/s" matches 0.0568 mm/s).
 * It fails closed: anything it can't match is unverified, and a speed stated about the Moon is
 * never verified, because no lunar airflow is known.
 */
import type { AskResponse, Citation, GateNumber, GateResult } from "./contracts.js";
import type { Fact } from "./facts.js";
import { findNumbers, type FoundNumber } from "./numbers.js";
import { convert, dimensionOf } from "./units.js";

export interface GateOptions {
  /** The facts to check against (the build step's index). */
  facts: readonly Fact[];
  /** Citations kept for this answer. When any are given, only the facts behind them count. */
  citations?: readonly Citation[];
  /** `flag` (default) keeps unverified numbers and marks them; `remove` cuts them out. */
  mode?: "flag" | "remove";
}

/** Sentences about the Moon or lunar gravity: a speed there would be a lunar airflow. */
const MOON = /\b(moon|lunar|1\/6\s*g)\b/i;

/** Text that replaces a removed number. */
export const REMOVED_MARK = "[number removed: not in our data]";

/**
 * Whether fact `f` stands behind citation `c`. A row citation covers its own row's facts and a whole
 * dataset cited by name. A citation of a dataset's ranking, exclusions or caveats
 * (`moongap:ranking`, `investigations:ranking-lunar_base`) covers that dataset's facts, since a ranking
 * quotes them; a method citation (`method:validation`) covers the method's summary facts, the
 * spread-rate rows they were computed from and the Table S1 rows they were checked against.
 */
function inScope(f: Fact, citations: readonly Citation[]): boolean {
  return citations.some((c) => {
    if (c.kind !== "row") return "paper" in f.source && f.source.paper === c.id && (c.page === undefined || f.source.page === c.page);
    if (f.cite === c.id || f.dataset === c.id) return true;
    const [ds, key = ""] = c.id.split(":");
    if (/^(ranking|excluded|caveats)/.test(key) && f.dataset === ds) return true;
    return ds === "method" && (f.dataset === "method" || f.dataset === "spread_rates" || f.dataset === "table_s1");
  });
}

function matches(n: FoundNumber, f: Fact): boolean {
  let expected: number | null;
  if (n.unit === null || f.unit === null) {
    if (n.unit !== f.unit) return false;
    expected = f.value;
  } else expected = convert(f.value, f.unit, n.unit);
  if (expected === null) return false;
  // half a unit in the last written place, plus a hair for floating point
  return Math.abs(expected - n.value) <= n.tolerance * (1 + 1e-9) + 1e-12;
}

/**
 * When several facts agree with a number, credit the one a reader most likely means: a
 * headline value before a secondary cross-check, and either before an interval bound.
 */
function factRank(f: Fact): number {
  const where = "column" in f.source ? f.source.column : f.id;
  if (/ci95|lower|upper|_lo\b|_hi\b/.test(where)) return 2;
  if (/gap_at_ref_flow|repeat|reading_error/.test(where)) return 1;
  return 0;
}

/** Finds the fact that verifies `n`, or null. Prefers headline facts, then the closest match. */
export function verifyNumber(n: FoundNumber, facts: readonly Fact[]): Fact | null {
  if (n.unit !== null && dimensionOf(n.unit) === "speed" && MOON.test(n.sentence)) return null;
  let best: Fact | null = null;
  let bestKey: [number, number] = [Infinity, Infinity];
  for (const f of facts) {
    if (!matches(n, f)) continue;
    const expected = n.unit && f.unit ? convert(f.value, f.unit, n.unit)! : f.value;
    const key: [number, number] = [factRank(f), Math.abs(expected - n.value)];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      best = f;
      bestKey = key;
    }
  }
  return best;
}

export function gateAnswer(answer: string, opts: GateOptions): Pick<AskResponse, "answer" | "gate"> {
  const scoped = opts.citations && opts.citations.length > 0 ? opts.facts.filter((f) => inScope(f, opts.citations!)) : opts.facts;
  const found = findNumbers(answer);
  const checked = found.map((n) => ({ n, fact: verifyNumber(n, scoped) }));
  const unverified = checked.filter((c) => c.fact === null).length;
  const remove = opts.mode === "remove" && unverified > 0;

  let text = answer;
  if (remove)
    for (const c of [...checked].reverse())
      if (c.fact === null) text = text.slice(0, c.n.start) + REMOVED_MARK + text.slice(c.n.end);

  // offsets of kept numbers in the final text
  let shift = 0;
  const numbers: GateNumber[] = checked.map(({ n, fact }) => {
    const removed = remove && fact === null;
    const start = removed ? null : n.start + shift;
    if (removed) shift += REMOVED_MARK.length - (n.end - n.start);
    return {
      text: n.text,
      start,
      end: start === null ? null : start + (n.end - n.start),
      value: n.value,
      unit: n.unit,
      status: fact ? "verified" : "unverified",
      source: fact ? fact.source : null,
    };
  });

  const gate: GateResult = {
    action: unverified === 0 ? "passed" : remove ? "removed" : "flagged",
    checked: checked.length,
    verified: checked.length - unverified,
    unverified,
    numbers,
  };
  return { answer: text, gate };
}
