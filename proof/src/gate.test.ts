// Written with AI assistance (Claude Code)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FACT_FILES, checkSeedFacts, factsFromFile, factsFromSeed, isValidatedStep, type Fact } from "./facts.js";
import { REMOVED_MARK, gateAnswer } from "./gate.js";
import { findNumbers } from "./numbers.js";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(repo, rel), "utf8");

const fact = (value: number, unit: string | null, extra: Partial<Fact> = {}): Fact => ({
  id: `t:${value}:${unit}`,
  value,
  unit,
  label: "test fact",
  dataset: "spread_rates",
  cite: "spread_rates:B16/1",
  source: { file: "data/derived/spread_rates.csv", row: 0, column: "rate_mm_s", sha256: "a".repeat(64) },
  ...extra,
});
const statuses = (answer: string, facts: Fact[], citations = undefined as any) =>
  gateAnswer(answer, { facts, citations }).gate.numbers.map((n) => [n.text, n.status]);

describe("findNumbers", () => {
  it("reads values, units and the written precision", () => {
    const [a, b, c] = findNumbers("It spread at 0.0568 mm/s, 18.2% O2 and 8.2 psia.");
    expect([a.text, a.value, a.unit, a.tolerance]).toEqual(["0.0568 mm/s", 0.0568, "mm/s", 0.00005]);
    expect([b.text, b.unit]).toEqual(["18.2% O2", "%"]);
    expect([c.text, c.unit]).toEqual(["8.2 psia", "psia"]);
  });

  it("skips a confidence level: it names an interval, it isn't a claim", () => {
    expect(findNumbers("The 95% interval is 1.8 to 3.7 points; a 95 % CI and a 90% confidence band.").map((n) => n.text)).toEqual(["1.8", "3.7"]);
  });

  it("checks a number with a unit even after a reference word like No.", () => {
    expect(findNumbers("No. 15 cm/s is the Moon airflow.").map((n) => n.text)).toEqual(["15 cm/s"]);
    expect(findNumbers("On the Moon, no 15 cm/s flow was measured.").map((n) => n.text)).toEqual(["15 cm/s"]);
    expect(findNumbers("See No. 7 and Fig. 9.").map((n) => n.text)).toEqual([]);
  });

  it("skips numbers that only name things", () => {
    const text = "See Fig. 7, Table 2, p. 8 and [2] in ICES-2025-392 (Link 2018): test B16 at 1/6 g and 1 g, step 3.";
    expect(findNumbers(text)).toEqual([]);
  });

  it("reads ranges, signs and powers of ten", () => {
    const n = findNumbers("Ventilation is 15–20 cm/s; the gap is −2.47%; Table S1 prints 5.68 × 10⁻³ cm/s.");
    expect(n.map((x) => [x.value, x.unit])).toEqual([
      [15, "cm/s"],
      [20, "cm/s"],
      [-2.47, "%"],
      [0.00568, "cm/s"],
    ]);
  });
});

describe("gateAnswer", () => {
  it("matches across units: 6 mm/s is 0.6 cm/s", () => {
    expect(statuses("The flame moved 6 mm/s.", [fact(0.6, "cm/s")])).toEqual([["6 mm/s", "verified"]]);
  });

  it("checks to the precision written", () => {
    const facts = [fact(0.0568, "mm/s")];
    expect(statuses("About 0.06 mm/s.", facts)).toEqual([["0.06 mm/s", "verified"]]);
    expect(statuses("Exactly 0.060 mm/s.", facts)).toEqual([["0.060 mm/s", "unverified"]]);
    expect(statuses("Exactly 0.0568 mm/s.", facts)).toEqual([["0.0568 mm/s", "verified"]]);
  });

  it("fails closed: unknown numbers, wrong units and bare numbers stay unverified", () => {
    const facts = [fact(0.6, "cm/s"), fact(12, "%")];
    expect(statuses("It took 0.6 s and about 12 tries.", facts)).toEqual([
      ["0.6 s", "unverified"],
      ["12", "unverified"],
    ]);
  });

  it("never verifies a speed stated about the Moon, even when the number exists elsewhere", () => {
    const facts = [fact(15, "cm/s"), fact(35, "cm/s")];
    expect(statuses("Moon airflow is about 15 cm/s.", facts)).toEqual([["15 cm/s", "unverified"]]);
    expect(statuses("On Earth the buoyant flow is about 35 cm/s.", facts)).toEqual([["35 cm/s", "verified"]]);
  });

  it("counts only the facts behind the answer's citations when there are any", () => {
    const facts = [fact(0.0699, "mm/s", { cite: "spread_rates:B16/3" })];
    expect(statuses("0.07 mm/s", facts, [{ kind: "row", id: "spread_rates:B16/3" }])).toEqual([["0.07 mm/s", "verified"]]);
    expect(statuses("0.07 mm/s", facts, [{ kind: "row", id: "spread_rates:B19/3" }])).toEqual([["0.07 mm/s", "unverified"]]);
    expect(statuses("0.07 mm/s", facts, [{ kind: "row", id: "spread_rates" }])).toEqual([["0.07 mm/s", "verified"]]);
  });

  it("flags by default and can remove, keeping offsets right", () => {
    const facts = [fact(0.6, "cm/s")];
    const text = "It took 9 s at 6 mm/s.";
    const flagged = gateAnswer(text, { facts });
    expect(flagged.answer).toBe(text);
    expect(flagged.gate).toMatchObject({ action: "flagged", checked: 2, verified: 1, unverified: 1 });

    const removed = gateAnswer(text, { facts, mode: "remove" });
    expect(removed.answer).toBe(`It took ${REMOVED_MARK} at 6 mm/s.`);
    expect(removed.gate.action).toBe("removed");
    const [gone, kept] = removed.gate.numbers;
    expect([gone.start, gone.end]).toEqual([null, null]);
    expect(removed.answer.slice(kept.start!, kept.end!)).toBe("6 mm/s");
  });

  it("passes an answer with no numbers", () => {
    expect(gateAnswer("Not in our data.", { facts: [] }).gate).toEqual({ action: "passed", checked: 0, verified: 0, unverified: 0, numbers: [] });
  });
});

describe("fact index from the real files", () => {
  const facts: Fact[] = [];
  for (const rel of FACT_FILES) {
    let text: string;
    try {
      text = read(rel);
    } catch {
      continue;
    }
    facts.push(...factsFromFile(rel, text, createHash("sha256").update(text).digest("hex")));
  }
  const seed = JSON.parse(read("data/reference/seed_facts.json"));
  facts.push(...factsFromSeed(seed.facts));

  it("has a usable seed file with no lunar or Moon airflow", () => {
    expect(checkSeedFacts(seed)).toEqual([]);
    for (const f of seed.facts) if (f.unit === "cm/s" || f.unit === "mm/s") expect(f.quote + f.label).not.toMatch(/moon|lunar|mars/i);
  });

  it("verifies published numbers against their paper and page", () => {
    const { gate } = gateAnswer("ICES-2025-392 Table 2 gives a PMMA slope of 0.00022 s/cm and a worst-case delta of 2.3% at 35 cm/s.", {
      facts,
      citations: [{ kind: "paper", id: "ices2025" }],
    });
    expect(gate.numbers.map((n) => n.status)).toEqual(["verified", "verified", "verified"]);
    expect(gate.numbers[0].source).toMatchObject({ paper: "ices2025", page: 11 });
  });

  it("verifies Moon Gap numbers against moongap.json, and refuses mock files", () => {
    const { gate } = gateAnswer("For P-213 tape the gap is 2.7% O2.", { facts, citations: [{ kind: "row", id: "moongap:p213" }] });
    expect(gate.numbers.map((n) => [n.status, (n.source as any)?.column])).toEqual([["verified", "materials.p213.gap.gap_pct"]]);
    expect(factsFromFile("data/mock/moongap.json", read("data/mock/moongap.json"), "0".repeat(64))).toEqual([]);
  });

  it("catches an invented Moon airflow against the real index", () => {
    const { gate } = gateAnswer("With the fans off, lunar airflow is about 35 cm/s.", { facts });
    expect(gate).toMatchObject({ action: "flagged", verified: 0, unverified: 1 });
  });
  it("verifies the tracker headline against the method's summary facts", () => {
    const { gate } = gateAnswer("8 low-flow steps from 4 NASA tests: median error 6.8%, all within 15%, mean signed error +1%.", {
      facts,
      citations: [{ kind: "row", id: "method:validation" }],
    });
    expect(gate.numbers.map((n) => [n.text, n.status])).toEqual([
      ["8", "verified"],
      ["4", "verified"],
      ["6.8%", "verified"],
      ["15%", "verified"],
      ["1%", "verified"],
    ]);
    const median = gate.numbers[2].source as { rows?: number[]; derived?: string };
    expect(median.rows?.length).toBe(8);
    expect(median.derived).toMatch(/median/);
  });

  it("verifies the team's investigation scores, and a ranking citation covers its dataset", () => {
    const doc = JSON.parse(read("data/reference/psi_investigations.json"));
    const iv = doc.investigations[0];
    const score = iv.relevance.lunar_base.score;
    const one = gateAnswer(`${iv.accession} scores ${score} for a lunar base.`, { facts, citations: [{ kind: "row", id: `investigations:${iv.accession}` }] });
    expect(one.gate.numbers.map((n) => n.status)).toEqual(["verified"]);
    const ranked = gateAnswer(`It scores ${score} for a lunar base.`, { facts, citations: [{ kind: "row", id: "investigations:ranking-lunar_base" }] });
    expect(ranked.gate.numbers.map((n) => n.status)).toEqual(["verified"]);
    const gap = gateAnswer("P-213 tape leads with a gap of 2.7% O2.", { facts, citations: [{ kind: "row", id: "moongap:ranking" }] });
    expect(gap.gate.numbers.map((n) => n.status)).toEqual(["verified"]);
  });

  it("reads 'points' as percentage points in a gap or oxygen sentence, and not elsewhere", () => {
    const { gate } = gateAnswer("First is the figure captioned P-213 tape with a gap of 2.75 points. Nomex Velcro has a gap of -2.95 points.", { facts, citations: [{ kind: "row", id: "moongap:ranking" }] });
    expect(gate.numbers.map((n) => [n.text, n.status])).toEqual([["2.75 points", "verified"], ["-2.95 points", "verified"]]);
    const count = gateAnswer("The tracker read 52 points along the rod.", { facts, citations: [] });
    expect(count.gate.numbers.map((n) => n.text)).toEqual(["52"]);
  });

  it("treats a confidence level as a label, not a number: '95% range', '95% CI', '95% interval'", () => {
    for (const phrase of ["95% range", "95% CI", "95% confidence interval", "95% bootstrap interval", "95%-CI"]) {
      const { gate } = gateAnswer(`The gap is 2.75 points (${phrase} 1.84 to 3.66).`, { facts, citations: [{ kind: "row", id: "moongap:p213" }] });
      expect(gate.numbers.map((n) => n.text), phrase).not.toContain("95%");
    }
    // a percentage that is a measurement still counts
    const { gate } = gateAnswer("Oxygen was 95% in that range.", { facts, citations: [] });
    expect(gate.numbers.map((n) => n.text)).toContain("95%");
  });

  it("verifies an investigation's condition numbers from its own record, and only when that record is cited", () => {
    const ans = "BASS-II ran 129 tests with oxygen between 13.6% and 22.2%, fan flow from 0 cm/s to 53 cm/s, and opposed flow from 0.4 to 8 cm/s; spread was sustained down to 17% O2 versus 18%.";
    const own = gateAnswer(ans, { facts, citations: [{ kind: "row", id: "investigations:PSI-25" }] });
    expect(own.gate.numbers.map((n) => n.status).every((s) => s === "verified")).toBe(true);
    expect(own.gate.checked).toBe(9);
    // another investigation's citation does not vouch for PSI-25's numbers
    const other = gateAnswer("Fan flow reached 53 cm/s.", { facts, citations: [{ kind: "row", id: "investigations:PSI-98" }] });
    expect(other.gate.numbers.map((n) => n.status)).toEqual(["unverified"]);
  });

  it("verifies each step's error against NASA, from the pct_error column", () => {
    const { gate } = gateAnswer("B19 at 0.83 cm/s was off by -1.3%, and B16 at 0.72 cm/s by +1.4%.", { facts, citations: [{ kind: "row", id: "spread_rates:ranking" }] });
    expect(gate.numbers.filter((n) => n.unit === "%").map((n) => n.status)).toEqual(["verified", "verified"]);
  });

  it("applies one validation rule: under 1 cm/s and not flagged", () => {
    expect(isValidatedStep({ flow_cm_s: "0.72", notes: "" })).toBe(true);
    expect(isValidatedStep({ flow_cm_s: "7.55", notes: "" })).toBe(false);
    expect(isValidatedStep({ flow_cm_s: "0.82", notes: "LOW CONFIDENCE (ci95 > 30% of rate)" })).toBe(false);
  });
});
