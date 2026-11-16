// Written with AI assistance (Claude Code)
// Retrieval for /api/ask: picks the passages of the index (api/_ask_index.ts, built by
// scripts/build-ask-index.mjs) that the model may use for one question. Hybrid search: keyword
// search (BM25) and, when the question's embedding is given, meaning search (cosine similarity of
// gemini-embedding-001 vectors), merged by reciprocal rank fusion. Three rules come first:
//   - summarize: passages about the subject (a test ID or a material) come first;
//   - rank: the matching ranking, computed in code at build time, comes first, so the model
//     explains an order it was given and never makes one up;
//   - no keyword overlap at all means no sources, and the endpoint answers "Not in our data."
//     Meaning search only re-orders and adds to questions that share words with the index, so an
//     off-topic question never gets its "nearest" passages.
// This file starts with "_", so Vercel does not deploy it as an endpoint.
import type { AskRequest } from "@still-air/proof";
import { ASK_INDEX, type IndexPassage } from "./_ask_index.js";
import { cosine, decodeVector, type StoredVector } from "./_embed.js";
import type { SourcePassage } from "./ask.js";

export const MAX_SOURCES = 10;
const MAX_SUBJECT_SOURCES = 6;
const K1 = 1.2;
const B = 0.75;
/**
 * Meaning search ignores passages less similar than this. Calibrated on 2026-11-15: off-topic
 * questions ("What is the capital of France?", "xyzzy plugh") reach at most 0.59 against any
 * passage; on-topic questions' best passages score 0.75 to 0.84.
 */
export const MIN_COSINE = 0.65;
/** How many of each list's best passages enter the fusion (both lists get the same depth). */
const SEMANTIC_TOP = 20;
/** Reciprocal rank fusion constant (Cormack et al. 2009): a passage scores 1/(RRF_K + rank) per list. */
const RRF_K = 60;

const STOP = new Set(
  (
    "a an and are as at be been by can could did do does for from had has have how i if in is it its of on or our " +
    "per should so than that the their them then there these they this to was we were what when where which who why " +
    "will with would you your about into over under between than vs versus tell me please give list show explain " +
    "summarize summarise rank ranking interpret much many most more less does doesn't"
  ).split(" "),
);

/** Same spelling for things people write in different ways. */
const ALIASES: Record<string, string> = {
  moon: "lunar",
  mars: "mars",
  martian: "mars",
  studies: "study",
  acrylic: "pmma",
  plexiglass: "pmma",
  oxygen: "o2",
  speed: "rate",
  speeds: "rate",
  fans: "fan",
  airflow: "flow",
  flows: "flow",
  velcro: "nomex",
  smoldering: "smolder",
  smouldering: "smolder",
  investigations: "investigation",
  experiments: "experiment",
  measured: "measure",
  measuring: "measure",
  measurement: "measure",
  measurements: "measure",
};

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])-(\d)/g, "$1$2") // P-213 -> p213, PSI-25 -> psi25
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => ALIASES[t] ?? (t.length > 3 && t.endsWith("s") && !/(ss|us|is)$/.test(t) && !/\d/.test(t) ? t.slice(0, -1) : t));
}

interface Doc {
  passage: IndexPassage;
  tf: Map<string, number>;
  length: number;
  /** The passage's subjects, tokenized like a question. */
  about: Set<string>;
  /** Its stored embedding, if the index has one. */
  vec: StoredVector | null;
}

/** Words that name one test, investigation or material, so a question that uses them is about it. */
const MATERIAL_WORDS = new Set(["pmma", "p213", "polycarbonate", "nomex", "cotton"]);
const isIdWord = (t: string) => /\d/.test(t) || MATERIAL_WORDS.has(t);

const DOCS: Doc[] = ASK_INDEX.map((passage) => {
  const toks = tokens(`${passage.text} ${passage.subjects.join(" ")}`);
  const tf = new Map<string, number>();
  for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
  return { passage, tf, length: toks.length, about: new Set(passage.subjects.flatMap(tokens)), vec: passage.vec ? decodeVector(passage.vec) : null };
});
/** True when meaning search can run, so the endpoint only pays for a question embedding then. */
export const HAS_VECTORS = DOCS.some((d) => d.vec !== null);
const AVG_LENGTH = DOCS.reduce((s, d) => s + d.length, 0) / Math.max(1, DOCS.length);
const DF = new Map<string, number>();
for (const d of DOCS) for (const t of d.tf.keys()) DF.set(t, (DF.get(t) ?? 0) + 1);

/**
 * True when the question shares at least one word with the index. Without that, retrieve() never
 * uses meaning search (an off-topic question gets no "nearest" passages), so the endpoint can skip
 * the embedding call and answer "Not in our data." with no network round trip.
 */
export function hasKeywordMatch(ask: Pick<AskRequest, "question" | "subject">): boolean {
  return tokens(`${ask.question} ${ask.subject?.id ?? ""}`).some((t) => DF.has(t));
}

function bm25(doc: Doc, query: string[]): number {
  let score = 0;
  for (const t of new Set(query)) {
    const f = doc.tf.get(t);
    if (!f) continue;
    const n = DF.get(t) ?? 0;
    const idf = Math.log(1 + (DOCS.length - n + 0.5) / (n + 0.5));
    score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.length) / AVG_LENGTH)));
  }
  return score;
}

const toSource = (p: IndexPassage): SourcePassage => ({ citation: p.citation, text: p.text });

/** The ranking passage a rank question asks for, chosen by keywords, or null. */
function rankingFor(question: string[]): IndexPassage | null {
  const has = (...words: string[]) => words.some((w) => question.includes(w));
  let id: string | null = null;
  if (has("segment", "step", "test", "match", "matched", "closely", "agreement", "error", "accurate", "accuracy")) id = "spread_rates:ranking";
  if (has("material", "materials", "gap", "p213", "pmma", "polycarbonate", "nomex", "cotton", "flammable", "flammability")) id = "moongap:ranking";
  // "least / lowest oxygen", "lowest limit": the lunar-limit order, not the gap order
  if (id === "moongap:ranking" || has("lunar")) if (has("least", "lowest", "limit", "minimum") && !has("gap")) id = "moongap:ranking-lunar-limit";
  if (has("investigation", "experiment", "psi", "studies", "study")) {
    id = has("mars")
      ? "investigations:ranking-mars_base"
      : has("lunar")
        ? "investigations:ranking-lunar_base"
        : has("rover")
          ? "investigations:ranking-pressurized_rover"
          : has("iss", "station")
            ? "investigations:ranking-iss"
            : has("cabin", "spacecraft")
              ? "investigations:ranking-spacecraft_cabin"
              : "investigations:ranking-total";
  }
  if (!id && has("lunar")) id = "moongap:ranking";
  if (id === "moongap:ranking" && has("least", "lowest", "limit", "minimum") && !has("gap")) id = "moongap:ranking-lunar-limit";
  return id ? (ASK_INDEX.find((p) => p.citation.kind === "row" && p.citation.id === id) ?? null) : null;
}

/**
 * The passages the model may use for this question, best first, at most MAX_SOURCES.
 * `queryVector` is the question's embedding (see api/_embed.ts); without it, keyword search only.
 */
export function retrieve(ask: AskRequest, queryVector: Float32Array | null = null): SourcePassage[] {
  const index = DOCS;
  const query = tokens(`${ask.question} ${ask.subject?.id ?? ""}`);
  const picked: IndexPassage[] = [];
  const take = (p: IndexPassage | null | undefined) => {
    if (p && !picked.includes(p) && picked.length < MAX_SOURCES) picked.push(p);
  };

  if (ask.subject) {
    const id = ask.subject.id.toLowerCase();
    const about = index
      .filter((d) => d.passage.subjects.includes(id))
      .sort((a, b) => kindOrder(a.passage) - kindOrder(b.passage) || bm25(b, query) - bm25(a, query))
      .slice(0, MAX_SUBJECT_SOURCES);
    for (const d of about) take(d.passage);
  }

  if (ask.mode === "rank") {
    const ranking = rankingFor(query);
    take(ranking);
    // The rows behind a ranking come along, so the gate can check its numbers against them.
    const rankId = ranking?.citation.kind === "row" ? ranking.citation.id : "";
    if (rankId === "moongap:ranking" || rankId === "moongap:ranking-lunar-limit") {
      for (const d of index) if (d.passage.kind === "moongap" && d.passage.citation.kind === "row" && d.passage.citation.id !== "moongap:caveats") take(d.passage);
    }
    if (rankId === "spread_rates:ranking") {
      const named = query.filter(isIdWord);
      for (const d of index) if (d.passage.kind === "measurement" && (named.length === 0 || named.some((t) => d.about.has(t)))) take(d.passage);
    }
  }

  // Tests, investigations or materials named in the question: up to two passages each.
  const named = [...new Set(query.filter(isIdWord))];
  for (const t of named.slice(0, 3)) {
    index
      .filter((d) => d.about.has(t))
      .sort((a, b) => bm25(b, query) - bm25(a, query))
      .slice(0, 2)
      .forEach((d) => take(d.passage));
  }

  if (query.length > 0) {
    // Rankings answer rank questions; elsewhere they crowd out the rows and sections that answer the question.
    const allowed = (d: Doc) => ask.mode === "rank" || d.passage.kind !== "ranking";
    const keyword = index
      .map((d) => ({ d, s: bm25(d, query) }))
      .filter((x) => x.s > 0 && allowed(x.d))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.d);
    const semantic =
      queryVector && keyword.length > 0
        ? index
            .filter((d) => d.vec && allowed(d))
            .map((d) => ({ d, s: cosine(queryVector, d.vec!) }))
            .filter((x) => x.s >= MIN_COSINE)
            .sort((a, b) => b.s - a.s)
            .slice(0, SEMANTIC_TOP)
            .map((x) => x.d)
        : [];
    // The best keyword match always stays: it is usually the passage with the exact term asked for.
    take(keyword[0]?.passage);
    // Lists of equal depth: fusing the whole keyword list (often 100-250 passages, since one shared
    // word is enough) would give every meaning-search hit a second vote from the keyword tail and
    // push strong keyword matches out. The rest of the keyword list follows, for short lists.
    for (const d of fuse([keyword.slice(0, SEMANTIC_TOP), semantic])) take(d.passage);
    for (const d of keyword.slice(SEMANTIC_TOP)) take(d.passage);
  }
  return picked.map(toSource);
}

/**
 * Reciprocal rank fusion: each list gives a passage 1/(RRF_K + rank), and the sums decide the
 * order. It uses ranks only, so BM25 scores and cosine similarities need no common scale. With
 * one list it keeps that list's order.
 */
export function fuse<T>(lists: readonly (readonly T[])[]): T[] {
  const score = new Map<T, number>();
  const first = new Map<T, number>();
  let seen = 0;
  for (const list of lists) {
    list.forEach((item, rank) => {
      score.set(item, (score.get(item) ?? 0) + 1 / (RRF_K + rank + 1));
      if (!first.has(item)) first.set(item, seen++);
    });
  }
  return [...score.keys()].sort((a, b) => score.get(b)! - score.get(a)! || first.get(a)! - first.get(b)!);
}

/** For a subject: our measurements first, then NASA's rates, then everything else. */
function kindOrder(p: IndexPassage): number {
  return ["measurement", "nasa_rate", "moongap", "investigation"].indexOf(p.kind) >>> 0;
}
