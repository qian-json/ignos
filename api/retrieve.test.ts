// Written with AI assistance (Claude Code)
import { describe, expect, it } from "vitest";
import { PAPER_IDS, ROW_CITATION_ID, type AskRequest } from "@still-air/proof";
import { ASK_INDEX } from "./_ask_index.js";
import { EMBED_DIMS, decodeVector } from "./_embed.js";
import { HAS_VECTORS, MAX_SOURCES, fuse, hasKeywordMatch, retrieve, tokens } from "./_retrieve.js";

const ids = (ask: AskRequest, vector: Float32Array | null = null) =>
  retrieve(ask, vector).map((s) => (s.citation.kind === "row" ? s.citation.id : `${s.citation.id}@${s.citation.page ?? ""}`));

/** A stored passage vector, as a query vector: the most similar thing to that passage is itself. */
const vectorOf = (i: number) => Float32Array.from(decodeVector(ASK_INDEX[i].vec!)!.values);
/** Any passage that has a stored vector (the build allows some to have none). */
const anyWithVector = () => ASK_INDEX.findIndex((p) => p.vec !== undefined);

describe("the /api/ask index", () => {
  it("holds passages from every source", () => {
    const kinds = new Set(ASK_INDEX.map((p) => p.kind));
    for (const k of ["measurement", "nasa_rate", "moongap", "ranking", "investigation", "method", "published_fact", "paper", "envelope"]) expect(kinds).toContain(k);
    const papers = new Set(ASK_INDEX.filter((p) => p.citation.kind === "paper").map((p) => p.citation.id));
    for (const id of ["link2018", "link2018_si", "ices2025", "fm2_2026"]) expect(papers).toContain(id);
  });

  it("gives every passage a citation the ask/1 contract accepts", () => {
    for (const p of ASK_INDEX) {
      if (p.citation.kind === "row") expect(p.citation.id).toMatch(ROW_CITATION_ID);
      else {
        expect(PAPER_IDS).toContain(p.citation.id);
        if (p.citation.page !== undefined) expect(Number.isInteger(p.citation.page) && p.citation.page >= 1).toBe(true);
      }
    }
  });

  it("never pairs the Moon, lunar gravity or Mars with a speed in one sentence", () => {
    const place = /\b(moon|lunar|1\/6\s*g|mars|martian)\b/i;
    const speed = /\d[\d.,]*\s*(cm\/s|mm\/s|m\/s|ft\/min)/i;
    for (const p of ASK_INDEX) {
      for (const sentence of p.text.split(/(?<=[.!?])\s+/)) {
        expect(place.test(sentence) && speed.test(sentence), `${p.citation.id}: ${sentence}`).toBe(false);
      }
    }
  });

  it("uses the fact index's citation IDs, so the gate can check numbers against the cited rows", () => {
    expect(ASK_INDEX.some((p) => p.citation.kind === "row" && p.citation.id === "spread_rates:B16/3")).toBe(true);
    expect(ASK_INDEX.some((p) => p.citation.kind === "row" && p.citation.id === "table_s1:B16/3")).toBe(true);
    expect(ASK_INDEX.some((p) => p.citation.kind === "row" && p.citation.id === "moongap:pmma")).toBe(true);
    const s1 = ASK_INDEX.find((p) => p.citation.kind === "row" && p.citation.id === "table_s1:B16/3")!;
    // Table S1's printed value is read as cm/s x 10^3, so 6.99 means 0.0699 mm/s.
    expect(s1.text).toContain("0.0699 mm/s");
  });

  it("says the investigation scores are the team's judgment", () => {
    for (const p of ASK_INDEX.filter((x) => x.kind === "investigation" || (x.citation.kind === "row" && x.citation.id.startsWith("investigations:ranking"))))
      expect(p.text).toContain("Ignos team's judgment, not NASA's");
  });
});

describe("retrieve()", () => {
  it("returns at most MAX_SOURCES passages, and none when no word of the question is in the index", () => {
    expect(retrieve({ question: "How fast did the flame spread over the PMMA rods in microgravity?", mode: "interpret" }).length).toBeLessThanOrEqual(MAX_SOURCES);
    expect(retrieve({ question: "xyzzy plugh", mode: "interpret" })).toEqual([]);
    expect(retrieve({ question: "what is the", mode: "interpret" })).toEqual([]);
  });

  it("puts a summarized test's own rows first: our measurements, then NASA's", () => {
    const got = ids({ question: "Summarize this test", mode: "summarize", subject: { kind: "test", id: "B19" } });
    expect(got.slice(0, 4).every((id) => id.startsWith("spread_rates:B19/"))).toBe(true);
    expect(got).toContain("table_s1:B19/1");
  });

  it("pulls in a test named in the question", () => {
    expect(ids({ question: "What oxygen concentration was used for B16?", mode: "interpret" })).toContain("table_s1:B16/1");
  });

  it("starts a rank answer with the ranking computed in code, plus the rows behind it", () => {
    const materials = ids({ question: "Rank the materials by Moon Gap", mode: "rank" });
    expect(materials[0]).toBe("moongap:ranking");
    expect(materials).toContain("moongap:pmma");
    expect(ids({ question: "Which investigations matter most for a lunar base?", mode: "rank" })[0]).toBe("investigations:ranking-lunar_base");
    expect(ids({ question: "Which PSI experiments matter most for a Mars base?", mode: "rank" })[0]).toBe("investigations:ranking-mars_base");
    const steps = ids({ question: "Rank the B16 and B19 steps by how closely our rate matches Table S1", mode: "rank" });
    expect(steps[0]).toBe("spread_rates:ranking");
    expect(steps).toContain("spread_rates:B19/3");
  });

  it("keeps rankings out of questions that don't ask for a ranking", () => {
    const got = ids({ question: "Across all tests, how closely do our low-flow spread rates match NASA's published values?", mode: "interpret" });
    expect(got.some((id) => id.endsWith(":ranking") || id.includes(":ranking-"))).toBe(false);
    expect(got.some((id) => id.startsWith("method:"))).toBe(true);
  });

  it("finds the method for how-did-you-measure questions, and the published Table 2 slope by its words", () => {
    expect(ids({ question: "How did you measure the spread rate and how accurate is it?", mode: "interpret" }).some((id) => id.startsWith("method:"))).toBe(true);
    expect(ids({ question: "What PMMA slope does ICES Table 2 give?", mode: "interpret" })).toContain("ices2025@11");
  });

  it("adds what meaning search finds to what keyword search finds", () => {
    expect(HAS_VECTORS).toBe(true);
    const ask: AskRequest = { question: "What oxygen concentrations were investigated?", mode: "interpret" };
    const keywordOnly = new Set(retrieve(ask).map((s) => s.text));
    // a passage keyword search left out, used as the question's meaning
    const i = ASK_INDEX.findIndex((p) => p.vec && p.kind !== "ranking" && !keywordOnly.has(p.text) && /oxygen|o2/i.test(p.text));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(retrieve(ask, vectorOf(i)).map((s) => s.text)).toContain(ASK_INDEX[i].text);
  });

  it("ignores meaning search for off-topic questions and for vectors below the similarity floor", () => {
    expect(retrieve({ question: "xyzzy plugh", mode: "interpret" }, vectorOf(anyWithVector()))).toEqual([]);
    const ask: AskRequest = { question: "How fast did the flame spread over the PMMA rods in microgravity?", mode: "interpret" };
    const unrelated = Float32Array.from({ length: EMBED_DIMS }, (_, k) => (k % 2 ? 1 : -1));
    expect(ids(ask, unrelated)).toEqual(ids(ask));
  });

  it("keeps the best keyword match when meaning search points elsewhere", () => {
    // Regression: fusing the whole keyword list let meaning-search hits from its long tail push the
    // only "34 pixels/mm" passage out of the sources.
    for (const question of ["What approximate image resolution in pixels per millimeter did the paper report?", "Which supplementary table contains normal-gravity measurements?"]) {
      const ask: AskRequest = { question, mode: "interpret" };
      const best = retrieve(ask)[0];
      // a vector pointing at a passage far from the best keyword match
      const far = ASK_INDEX.findIndex((p) => p.vec && p.kind === "investigation");
      expect(retrieve(ask, vectorOf(far)).map((s) => s.text)).toContain(best.text);
    }
  });

  it("stores a usable vector for passages that have one", () => {
    for (const p of ASK_INDEX) if (p.vec) expect(decodeVector(p.vec)?.values.length).toBe(EMBED_DIMS);
  });

  it("fuses rankings by rank: one list keeps its order, and agreement between lists goes first", () => {
    expect(fuse([["a", "b", "c"]])).toEqual(["a", "b", "c"]);
    expect(fuse([["a", "b", "c"], ["c", "d"]])[0]).toBe("c");
    expect(fuse([["a", "b"], []])).toEqual(["a", "b"]);
  });

  it("reads IDs and units the way people write them", () => {
    expect(tokens("P-213 tape and PSI-25")).toEqual(expect.arrayContaining(["p213", "psi25"]));
    expect(tokens("the Moon")).toEqual(["lunar"]);
  });
});

describe("hasKeywordMatch()", () => {
  it("is true when the question shares a word with the index, false for an off-topic one", () => {
    expect(hasKeywordMatch({ question: "What oxygen concentration was used for B16?" })).toBe(true);
    expect(hasKeywordMatch({ question: "xyzzy plugh qwertyuiop" })).toBe(false);
    expect(hasKeywordMatch({ question: "xyzzy", subject: { kind: "test", id: "PSI-25" } })).toBe(true);
  });
});
