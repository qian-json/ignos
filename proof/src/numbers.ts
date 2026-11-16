// Written with AI assistance (Claude Code)
/**
 * Finds the numbers in an AI-written answer, with their units and the precision they were
 * written to. Numbers that only name something (Fig. 7, Table S1, B16, ICES-2025-392, a year,
 * [2], 1/6 g) are not claims and are skipped; every other number is returned for checking.
 */
import { GRAVITY_UNIT, readUnit } from "./units.js";

export interface FoundNumber {
  /** The number as written, with its unit: "6 mm/s". */
  text: string;
  /** Offsets of `text` in the answer. */
  start: number;
  end: number;
  value: number;
  unit: string | null;
  /** Half a unit in the last written place, in the written unit: "0.06" allows ±0.005. */
  tolerance: number;
  /** The sentence the number sits in, for context rules. */
  sentence: string;
}

const REFERENCE_WORDS =
  /(?:\b(?:fig|figs|figure|figures|table|tables|page|pages|p|pp|slide|slides|eq|equation|section|ref|refs|reference|step|steps|segment|segments|row|rows|rank|ranked|test|tests|sample|samples|run|runs|chapter|version|v|no|number|appendix|item|line|lines|part|gate)\.?|#)\s*$/i;

const SUPERSCRIPT: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-",
};

// mantissa, then optional scientific part: ×10³, x 10^-3, × 10^(−3), e-3
const NUM = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s*[×x*]\s*10\s*(?:\^\s*\(?\s*([−-]?\d+)\s*\)?|([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))|[eE]([−-]?\d+))?/g;

function sentenceAround(text: string, start: number, end: number): string {
  let a = start;
  while (a > 0 && !/[.!?\n]/.test(text[a - 1]) ) a--;
  // don't stop on decimal points inside numbers
  while (a > 1 && text[a - 1] === "." && /\d/.test(text[a - 2] ?? "") && /\d/.test(text[a] ?? "")) {
    a--;
    while (a > 0 && !/[.!?\n]/.test(text[a - 1])) a--;
  }
  let b = end;
  while (b < text.length && !(/[.!?\n]/.test(text[b]) && !/\d/.test(text[b + 1] ?? ""))) b++;
  return text.slice(a, b + 1).trim();
}

/** True when the number is part of a name or reference rather than a measured claim. */
function isIdentifier(text: string, start: number, end: number, value: number, hasUnit: boolean): boolean {
  const before = text.slice(0, start);
  const after = text.slice(end);
  // glued to a letter: B16, P16a, 3D, 1st
  if (/[A-Za-z_]$/.test(before) || (!hasUnit && /^[A-Za-z_]/.test(after))) return true;
  // inside a hyphenated name that contains letters: ICES-2025-392
  const run = /[A-Za-z0-9_\-–]*$/.exec(before)![0] + /^[A-Za-z0-9_\-–]*/.exec(after)![0];
  if (/[A-Za-z]/.test(run) && /[-–]/.test(run)) return true;
  // reference words just before: Fig. 7, Table 2, p. 8, step 3, #4. Only for a bare number: one
  // with a unit is a measurement whatever precedes it ("No. 15 cm/s", "no 15 cm/s flow").
  if (!hasUnit && REFERENCE_WORDS.test(before)) return true;
  // bracket citations: [2]
  if (/\[\s*$/.test(before) && /^\s*\]/.test(after)) return true;
  // years
  if (!hasUnit && Number.isInteger(value) && value >= 1950 && value <= 2099 && !/\./.test(text.slice(start, end))) return true;
  return false;
}

export function findNumbers(answer: string): FoundNumber[] {
  const out: FoundNumber[] = [];
  NUM.lastIndex = 0;
  for (let m = NUM.exec(answer); m; m = NUM.exec(answer)) {
    let start = m.index;
    let end = start + m[0].length;
    const intPart = m[1].replace(/,/g, "");
    const dec = m[2] ?? "";
    const expText = m[3] ?? (m[4] ? [...m[4]].map((ch) => SUPERSCRIPT[ch]).join("") : undefined) ?? m[5];
    const exp = expText !== undefined ? Number(expText.replace("−", "-")) : 0;
    let value = Number(dec ? `${intPart}.${dec}` : intPart) * 10 ** exp;
    const tolerance = 0.5 * 10 ** (-dec.length) * 10 ** exp;

    // fractions such as 1/6: a ratio label, skip both parts
    if (/^\s*\/\s*\d/.test(answer.slice(end)) || /\d\s*\/\s*$/.test(answer.slice(0, start))) continue;

    // sign: a minus counts only when it isn't joining two numbers (15-20) or a name
    const pre = answer.slice(0, start);
    const sign = /(^|[\s(=:≈~])([−-])$/.exec(pre);
    if (sign) {
      value = -value;
      start -= 1;
    }

    // unit right after the number
    let unit: string | null = null;
    const u = readUnit(answer.slice(end));
    if (u) {
      unit = u.unit;
      end += u.length;
    } else if (GRAVITY_UNIT.test(answer.slice(end).trimStart())) {
      continue; // "1 g", "0 g": gravity labels
    } else {
      // "a gap of 2.75 points": percentage points of oxygen. Only in a sentence about a gap, oxygen or
      // O2, so a count ("52 data points") is never read as a percentage.
      const pts = /^[ \t\u00a0]*(?:points?|pts?|pp)\b/i.exec(answer.slice(end));
      if (pts && /\b(?:gap|oxygen|O2|O₂)\b/i.test(sentenceAround(answer, start, end))) {
        unit = "%";
        end += pts[0].length;
      }
    }
    if (isIdentifier(answer, sign ? start + 1 : start, m.index + m[0].length, Math.abs(value), unit !== null)) continue;
    // a confidence level names an interval, it isn't a measurement: "95% interval", "95 % CI",
    // "95% range" (the Moon Gap passages' wording), "95% bootstrap interval", "95%-CI"
    if (unit === "%" && /^\s*-?\s*(?:confidence|CI\b|credible|prediction|interval|range|bootstrap|uncertainty|bounds?\b)/i.test(answer.slice(end))) continue;

    out.push({ text: answer.slice(start, end), start, end, value, unit, tolerance, sentence: sentenceAround(answer, start, end) });
  }

  // ranges: "15–20 cm/s", "15 to 20 cm/s": the first number takes the second one's unit
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i];
    const b = out[i + 1];
    if (a.unit === null && b.unit !== null && /^\s*(?:[-–—]|to|and)\s*$/i.test(answer.slice(a.end, b.start).replace(/^−/, "-"))) a.unit = b.unit;
  }
  return out;
}
