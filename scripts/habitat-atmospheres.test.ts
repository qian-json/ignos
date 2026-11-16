// Written with AI assistance (Claude Code)
// data/reference/habitat_atmospheres.json: every number appears in its own quote, and the FM2 quotes are
// on the cited page of the slides (scripts/ask-index/pdf_pages.json).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const doc = read("data/reference/habitat_atmospheres.json");
const NUMERIC = ["o2_pct", "pressure_psi", "o2_pct_at_least", "pressure_psi_at_most"];

describe("habitat_atmospheres.json", () => {
  it("has every number in a quote that is tagged for it", () => {
    for (const a of doc.atmospheres) {
      for (const k of NUMERIC) {
        if (!(k in a)) continue;
        const tagged = a.quotes.filter((q: { for: string }) => q.for.split(" ").includes(k));
        expect(tagged.length, `${a.id}.${k} has no quote`).toBeGreaterThan(0);
        expect(tagged.some((q: { text: string }) => new RegExp(`(^|[^\\d.])${String(a[k]).replace(".", "\\.")}(?![\\d])`).test(q.text)), `${a.id}.${k}`).toBe(true);
      }
    }
  });

  it("quotes the FM2 slides and ICES paper word for word from the cited page", () => {
    const pages = read("scripts/ask-index/pdf_pages.json").pages;
    const page = (paper: string, n: number) => (pages.find((p: { paper: string; page: number }) => p.paper === paper && p.page === n)?.text ?? "").replace(/\s+/g, " ");
    const present = new Set(pages.map((p: { paper: string }) => p.paper));
    for (const a of doc.atmospheres)
      for (const q of a.quotes) {
        if (q.source === "challenge" || !present.has(q.source)) continue; // ICES pages are left out of the public export
        expect(page(q.source, doc.sources[q.source].page), a.id).toContain(q.text);
      }
  });
});
