// Written with AI assistance (Claude Code)
/**
 * Proof layer: every number stamped with its source, every AI-written number checked
 * against the data before it is shown.
 *
 * - Build step (scripts/build-facts.mjs + facts.ts): data files and seed facts become a fact
 *   index; each fact carries {file, row, column, sha256} or {paper, page, quote}.
 * - Verifier (numbers.ts + units.ts): finds numbers in text with their units and written
 *   precision; 6 mm/s matches 0.6 cm/s, "0.06 mm/s" matches 0.0568 mm/s.
 * - gateAnswer() (gate.ts): flags or removes every number it can't verify. Fails closed.
 */

export const PROOF_LAYER_VERSION = "1.0.0";

/** Where a number in one of our data files came from. */
export interface Provenance {
  file: string;
  /** 0-based data row for CSV files; 0 for JSON files. */
  row: number;
  /** Column name for CSV files; JSON path for JSON files. */
  column: string;
  /** For a number computed from several rows (a median, a count): every row it used. */
  rows?: number[];
  /** For a computed number: how it was computed, in words. */
  derived?: string;
  sha256: string;
}

export type ProofStatus = "stub" | "ready";

export * from "./contracts.js";
export { CsvSyntaxError, parseCsv, type CsvRecord, type ParsedCsv } from "./csv.js";
export { FACT_FILES, VALIDATED_BELOW_CM_S, checkSeedFacts, factsFromFile, factsFromSeed, isValidatedStep, spreadSummary, type Fact, type SeedFact } from "./facts.js";
export { REMOVED_MARK, gateAnswer, verifyNumber, type GateOptions } from "./gate.js";
export { findNumbers, type FoundNumber } from "./numbers.js";
export { UNITS, convert, dimensionOf, readUnit, unitFromName, type Dimension } from "./units.js";

export function proofLayerStatus(): ProofStatus {
  return "ready";
}
