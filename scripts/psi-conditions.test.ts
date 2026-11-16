// Written with AI assistance (Claude Code)
// data/derived/psi_conditions.json: every number must be printed in its record's own text, nulls must
// say why, gravity is 0 or 1 only, and the file must match the investigations file it was built from.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url));
const out = JSON.parse(read("data/derived/psi_conditions.json").toString("utf8"));
const src = JSON.parse(read("data/reference/psi_investigations.json").toString("utf8"));
const byAcc = new Map(src.investigations.map((r: { accession: string }) => [r.accession, r]));
const get = (o: unknown, path: string) => path.split(".").reduce((x: any, k) => x?.[k], o);
const RANGES = ["o2_pct", "pressure_atm", "forced_flow_cm_s"] as const;

describe("psi_conditions.json", () => {
  it("is built from the current investigations file and covers all of it", () => {
    expect(out.contract).toBe("psi_conditions/1");
    expect(out.derived_from.sha256).toBe(createHash("sha256").update(read(out.derived_from.file)).digest("hex"));
    expect(out.conditions.map((c: { accession: string }) => c.accession)).toEqual(src.investigations.map((r: { accession: string }) => r.accession));
  });

  it("takes every value from text that is in the record", () => {
    for (const c of out.conditions) {
      const rec = byAcc.get(c.accession);
      expect(get(rec, "gravity"), c.accession).toBe(c.gravity_source.text);
      expect(get(rec, "fuel_sample"), c.accession).toContain(c.fuel_source.text);
      for (const f of RANGES) {
        const v = c[f];
        if (!v) {
          expect(c.not_reported?.[f], `${c.accession}.${f} is null without a reason`).toBeTruthy();
          continue;
        }
        expect(v.min, `${c.accession}.${f}`).toBeLessThanOrEqual(v.max);
        if (v.values) expect([Math.min(...v.values), Math.max(...v.values)], `${c.accession}.${f}`).toEqual([v.min, v.max]);
        for (const s of v.sources) expect(get(rec, s.field), `${c.accession}.${f}`).toContain(s.text);
      }
    }
  });

  it("states gravity as 0 or 1 only, and no Moon or Mars airflow anywhere", () => {
    for (const c of out.conditions) for (const g of c.gravity_g) expect([0, 1]).toContain(g);
    expect(JSON.stringify(out)).not.toMatch(/(lunar|moon|mars|martian)[^"]{0,40}cm\/s/i);
  });

  it("matches hand-checked values", () => {
    const c = (a: string) => out.conditions.find((x: { accession: string }) => x.accession === a);
    expect(c("PSI-25").o2_pct).toMatchObject({ min: 13.6, max: 22.2 });
    expect(c("PSI-25").forced_flow_cm_s).toMatchObject({ min: 0, max: 53, approx: true });
    expect(c("PSI-69").o2_pct).toMatchObject({ min: 12, max: 34 }); // mole fraction 0.12-0.34
    expect(c("PSI-69").pressure_atm).toMatchObject({ min: 0.692, max: 3.05 }); // 526-2320 mmHg
    expect(c("PSI-107").o2_pct).toMatchObject({ min: 20, max: 22 }); // 21 +/- 1 %
    expect(c("PSI-26").pressure_atm).toBeNull(); // units not labelled in the As-Run matrix
    expect(c("PSI-47").fuel_phase).toEqual([]); // no combustion
    expect(c("PSI-23").o2_pct.values).toEqual([21, 30]); // separate values: 25% was not tested
    expect(c("PSI-68").o2_pct.values).toEqual([17, 21, 25, 30]);
    expect(c("PSI-25").o2_pct.values).toBeUndefined(); // a continuous range
    expect(c("PSI-25").o2_pct.notes.join(" ")).toMatch(/pre-burn/); // Table S1 O2 labels are starting values
    expect(c("PSI-25").forced_flow_cm_s.notes.join(" ")).toMatch(/fan-off step/); // 0 is not a spread condition
    expect(c("PSI-22").forced_flow_cm_s).toBeNull(); // "e.g., 3.1 cm/s" is an example, not a tested maximum
    expect(c("PSI-22").not_reported.forced_flow_cm_s).toMatch(/not a maximum/);
  });
});

describe("psi_conditions.json hardware groups", () => {
  it("match the challenge statement's grouping, each from the record's own text", () => {
    const by = (g: string) => out.conditions.filter((c: { hardware_group: string }) => c.hardware_group === g).map((c: { accession: string }) => c.accession);
    expect(by("cir_acme")).toEqual(["PSI-10", "PSI-20", "PSI-21", "PSI-22", "PSI-23", "PSI-159"]); // ACME's six
    expect(by("cir_mdca")).toEqual(["PSI-39", "PSI-68", "PSI-69"]); // CFI, FLEX-2, FLEX
    expect(by("msg_duct")).toEqual(["PSI-25", "PSI-26", "PSI-106", "PSI-107"]); // BASS-II, BASS, SLICE, SPICE
    expect(by("saffire")).toEqual(["PSI-98", "PSI-99", "PSI-100"]);
    for (const c of out.conditions) expect(get(byAcc.get(c.accession), c.hardware_source.field)).toContain(c.hardware_source.text);
  });
});

