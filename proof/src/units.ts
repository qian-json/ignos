// Written with AI assistance (Claude Code)
/**
 * Units the verifier understands. A number is compared with a fact only when both carry
 * units of the same dimension (6 mm/s matches 0.6 cm/s); a number with no unit matches only
 * facts with no unit. Conversion factors are definitions, not scientific values.
 */

export type Dimension = "speed" | "length" | "time" | "percent" | "pressure" | "slope";

interface UnitDef {
  dim: Dimension;
  /** Multiply a value in this unit by `factor` to get the dimension's base unit. */
  factor: number;
}

/** Canonical unit names. Base units: mm/s, mm, s, %, psi, s/cm. */
export const UNITS: Record<string, UnitDef> = {
  "mm/s": { dim: "speed", factor: 1 },
  "cm/s": { dim: "speed", factor: 10 },
  "m/s": { dim: "speed", factor: 1000 },
  mm: { dim: "length", factor: 1 },
  cm: { dim: "length", factor: 10 },
  m: { dim: "length", factor: 1000 },
  in: { dim: "length", factor: 25.4 },
  s: { dim: "time", factor: 1 },
  min: { dim: "time", factor: 60 },
  "%": { dim: "percent", factor: 1 },
  psi: { dim: "pressure", factor: 1 },
  psia: { dim: "pressure", factor: 1 },
  kPa: { dim: "pressure", factor: 1 / 6.894757293168361 },
  "s/cm": { dim: "slope", factor: 1 },
};

/**
 * How units are written in prose, longest first so "mm/s" wins over "mm". Each maps to a
 * canonical unit. `in` (inch) is left out on purpose: in prose it is almost always the word "in".
 */
const ALIASES: [RegExp, string][] = [
  [/^(?:mm\s*\/\s*s|mm\s*s(?:-1|⁻¹)|millimet(?:er|re)s?\s+per\s+second)\b/i, "mm/s"],
  [/^(?:cm\s*\/\s*s|cm\s*s(?:-1|⁻¹)|centimet(?:er|re)s?\s+per\s+second)\b/i, "cm/s"],
  [/^(?:m\s*\/\s*s|met(?:er|re)s?\s+per\s+second)\b/i, "m/s"],
  [/^s\s*\/\s*cm\b/i, "s/cm"],
  [/^%\s*O(?:2|₂)\b/, "%"],
  [/^%/, "%"],
  [/^percent(?:age points?)?\b/i, "%"],
  [/^psia\b/i, "psia"],
  [/^psi\b/i, "psi"],
  [/^kPa\b/, "kPa"],
  [/^(?:mm|millimet(?:er|re)s?)\b/i, "mm"],
  [/^(?:cm|centimet(?:er|re)s?)\b/i, "cm"],
  [/^(?:inch(?:es)?)\b/i, "in"],
  [/^(?:minutes?|mins?)\b/i, "min"],
  [/^(?:seconds?|secs?|s)\b/, "s"],
  [/^(?:met(?:er|re)s?|m)\b/, "m"],
];

/** Gravity labels ("1 g", "1/6 g", "0 g") are conditions, not measured claims. */
export const GRAVITY_UNIT = /^g\b/;

/** Reads a unit at the start of `text` (after optional spaces). */
export function readUnit(text: string): { unit: string; length: number } | null {
  const lead = /^[ \t ]*/.exec(text)![0].length;
  const rest = text.slice(lead);
  for (const [re, unit] of ALIASES) {
    const m = re.exec(rest);
    if (m) return { unit, length: lead + m[0].length };
  }
  return null;
}

export function dimensionOf(unit: string | null): Dimension | null {
  return unit === null ? null : (UNITS[unit]?.dim ?? null);
}

/** Converts `value` from unit `from` to unit `to`; null when the dimensions differ. */
export function convert(value: number, from: string, to: string): number | null {
  const a = UNITS[from];
  const b = UNITS[to];
  if (!a || !b || a.dim !== b.dim) return null;
  return (value * a.factor) / b.factor;
}

/**
 * Unit implied by a data column or JSON key name: `rate_mm_s` is mm/s, `o2_pct` is %.
 * Returns `scale` when the stored value must be scaled to that unit (fractions become %).
 */
export function unitFromName(name: string): { unit: string; scale: number } | null {
  const n = name.toLowerCase();
  if (/_frac_per_cm_s$/.test(n)) return { unit: "s/cm", scale: 1 };
  if (/(^|_)frac$/.test(n)) return { unit: "%", scale: 100 };
  if (/_mm_s$/.test(n)) return { unit: "mm/s", scale: 1 };
  if (/_cm_s$/.test(n)) return { unit: "cm/s", scale: 1 };
  // o2_pct, gap_pct, and pct_error (a percentage difference)
  if (/_pct$|^pct$|^pct_/.test(n)) return { unit: "%", scale: 1 };
  if (/_psia$/.test(n)) return { unit: "psia", scale: 1 };
  if (/_mm$/.test(n)) return { unit: "mm", scale: 1 };
  if (/_cm$/.test(n)) return { unit: "cm", scale: 1 };
  if (/_s$/.test(n)) return { unit: "s", scale: 1 };
  return null;
}
