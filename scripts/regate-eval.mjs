// Written with AI assistance (Claude Code)
// Re-checks recorded /api/ask answers against today's fact index, so a change to the proof layer
// can be measured on real answers: how many numbers verified when they were recorded, how many now.
// Usage (after `npm run build -w proof`): node scripts/regate-eval.mjs <eval.json> [runKey] [--out file.json]
// With --out it writes the summary the Method page shows (part of the build; an absent eval file
// writes an empty summary instead of failing).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { FACT_FILES, factsFromFile, factsFromSeed, gateAnswer } from "../proof/dist/index.js";

const argv = process.argv.slice(2);
const outAt = argv.indexOf("--out");
const out = outAt >= 0 ? argv.splice(outAt, 2)[1] : null;
const [file, runKey] = argv;
if (!file) {
  console.error("usage: node scripts/regate-eval.mjs <eval.json> [runKey] [--out file.json]");
  process.exit(1);
}
const write = (summary) => {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(summary, null, 1) + "\n");
};
if (out && !existsSync(file)) {
  write({ source: null, runs: [] });
  process.exit(0);
}
const facts = [];
for (const rel of FACT_FILES) {
  if (!existsSync(rel)) continue;
  const text = readFileSync(rel, "utf8");
  facts.push(...factsFromFile(rel, text, createHash("sha256").update(text).digest("hex")));
}
facts.push(...factsFromSeed(JSON.parse(readFileSync("data/reference/seed_facts.json", "utf8")).facts));

const raw = readFileSync(file, "utf8");
const doc = JSON.parse(raw);
const runs = runKey ? [runKey] : Object.keys(doc).filter((k) => Array.isArray(doc[k]?.results));
const summaries = [];
for (const k of runs) {
  const t = { questions: 0, answered: 0, abstained: 0, then: { checked: 0, verified: 0 }, now: { checked: 0, verified: 0 }, stillFlagged: [] };
  for (const r of doc[k].results) {
    t.questions++;
    const resp = r.response ?? {};
    if (resp.status === "answered") t.answered++;
    else if (resp.status === "not_in_data") t.abstained++;
    if (!resp.answer || !resp.gate) continue;
    t.then.checked += resp.gate.checked;
    t.then.verified += resp.gate.verified;
    const { gate } = gateAnswer(resp.answer, { facts, citations: resp.citations ?? [] });
    t.now.checked += gate.checked;
    t.now.verified += gate.verified;
    for (const n of gate.numbers) if (n.status === "unverified") t.stillFlagged.push(`${r.id}: ${n.text}`);
  }
  // a graded run (scripts/ask-eval.ts) carries its grades; the counts below are copied, not re-derived
  const g = doc[k].summary;
  const graded = g && typeof g.correct === "number"
    ? { answerable: g.answerable, correct: g.correct, partial: g.partial, wrong: g.wrong, wrong_abstain: g.wrong_abstain, unanswerable: g.unanswerable, correct_abstain: g.correct_abstain, moon_airflow_numbers: g.moon_airflow_numbers }
    : null;
  summaries.push({ run: k, commit: doc[k].commit ?? null, ...t, graded });
}
if (out) {
  const model = /model ([\w-]+(?:\.[\w-]+)*)/.exec(doc._note ?? "")?.[1] ?? null;
  // the note stays out: the site ships this file, and the note names team members
  // the site ships this file: counts only. The flagged texts stay out, since a plain chatbot's invented numbers
  // (a Moon airflow among them) must never reach the page's code.
  const shipped = summaries.map(({ stillFlagged: _flagged, ...rest }) => rest);
  write({ source: { file, sha256: createHash("sha256").update(raw).digest("hex"), model }, runs: shipped });
} else for (const x of summaries) console.log(JSON.stringify(x, null, 1));
