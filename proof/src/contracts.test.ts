// Written with AI assistance (Claude Code)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkOverlay,
  findContract,
  isMockText,
  OVERLAY_PATH,
  tableS1RateMmS,
  validateAskRequest,
  validateAskResponse,
  validateControlResult,
  validateDigitized,
  validateEdges,
  validateEnvelope,
  validateFlameModel,
  validateFrames,
  validateInvestigations,
  validateMoonGap,
  validateSpreadRates,
  validateTableS1,
  type Result,
} from "./contracts.js";
import { CsvSyntaxError, parseCsv } from "./csv.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const mockDir = join(repo, "data", "mock");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = join(dir, n);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const mockFiles = walk(mockDir)
  .map((f) => relative(repo, f).split("\\").join("/"))
  .filter((f) => !/(^|\/)(\.gitkeep|\.DS_Store)$/.test(f));
const read = (rel: string) => readFileSync(join(repo, rel), "utf8");
const json = (rel: string) => JSON.parse(read(rel)) as Record<string, any>;

function messages(r: Result<unknown>): string {
  return r.ok ? "" : r.issues.map((i) => `${i.path}: ${i.message}`).join("\n");
}

describe("mock files", () => {
  it("cover every contract", () => {
    const ids = new Set(mockFiles.map((f) => findContract(f)?.id).filter(Boolean));
    expect([...ids].sort()).toEqual(
      ["ask_examples", "control", "edges", "envelope", "flame_model", "frames", "ices2025_digitized", "investigations", "moongap", "spread_rates", "table_s1"].sort(),
    );
    expect(mockFiles.some((f) => OVERLAY_PATH.test(f))).toBe(true);
  });

  for (const rel of mockFiles) {
    it(`${rel} matches its contract and is flagged mock`, () => {
      if (OVERLAY_PATH.test(rel)) {
        const buf = readFileSync(join(repo, rel));
        expect(checkOverlay(rel, buf.length, new Uint8Array(buf.subarray(0, 12)))).toEqual([]);
        return;
      }
      const text = read(rel);
      const contract = findContract(rel);
      expect(contract, `no contract for ${rel}`).toBeDefined();
      const res = contract!.validate(text, rel);
      expect(messages(res)).toBe("");
      expect(isMockText(text)).toBe(true);
      // The production guard scans built bundles for MOCK- IDs, so every mock must carry one.
      expect(text).toMatch(/MOCK-[A-Z0-9]/);
    });
  }
});

describe("envelope.json", () => {
  const real = () => json("data/derived/envelope.json");
  it("the built file matches envelope/1 and finds the threshold below the Moon", () => {
    const e = real();
    expect(messages(validateEnvelope(e))).toBe("");
    expect(e.threshold.g_low).toBeLessThan(e.threshold.g_high);
    const moon = e.worlds.find((w: { id: string }) => w.id === "moon");
    expect(moon.g_earth).toBeGreaterThan(e.threshold.g_high);
    expect(Object.keys(moon).some((k) => /fans_off|verdict/.test(k))).toBe(false);
  });
  it("refuses a fans-off outcome on a world (untested)", () => {
    const e = real();
    e.worlds[0].fans_off_can_end_flame = "no";
    expect(messages(validateEnvelope(e))).toMatch(/no fans-off outcome may be stated/);
  });
  it("refuses a world that is not marked as the team's reading", () => {
    const e = real();
    e.worlds[0].estimate = false;
    expect(messages(validateEnvelope(e))).toMatch(/estimate: must be true/);
  });
  it("refuses any airflow on a world: no Moon airflow number, by name or by unit", () => {
    for (const key of ["wind_low_cm_s", "airflow", "buoyant_velocity", "flow_estimate"]) {
      const e = real();
      e.worlds[0][key] = 1;
      expect(messages(validateEnvelope(e)), key).toMatch(/no airflow may be stated for a world/);
    }
    expect(JSON.stringify(real().worlds)).not.toMatch(/cm_s|wind|flow/i);
  });
  it("refuses a file that does not say it is not a NASA measurement", () => {
    const e = real();
    e.estimate_note = "Lunar airflow from NASA.";
    expect(messages(validateEnvelope(e))).toMatch(/not a NASA measurement/);
  });
  it("refuses an inverted threshold band", () => {
    const e = real();
    [e.threshold.g_low, e.threshold.g_high] = [e.threshold.g_high, e.threshold.g_low];
    expect(messages(validateEnvelope(e))).toMatch(/g_low must not exceed g_high/);
  });
});

describe("flame_model.json", () => {
  const real = () => json("data/derived/flame_model.json");
  it("the built file matches flame_model/1, is labelled a model, and reports the failed cross-gravity tests", () => {
    const m = real();
    expect(messages(validateFlameModel(m))).toBe("");
    expect(m.label).toMatch(/model, not a NASA measurement/);
    expect(m.validation.cross_domain.orbit_only_to_earth.passed).toBe(false);
  });
  it("refuses any stored prediction at the Moon or between 0 g and 1 g", () => {
    for (const key of ["grid", "points", "moon_vs_earth"]) {
      const m = real();
      m[key] = [];
      expect(messages(validateFlameModel(m)), key).toMatch(/no model prediction at the Moon or between 0 g and 1 g/);
    }
  });
  it("refuses a file without the model label", () => {
    const a = real();
    a.label = "Lunar flame results";
    expect(messages(validateFlameModel(a))).toMatch(/model, not a NASA measurement/);
  });
});

describe("csv parser", () => {
  it("handles quotes, escaped quotes, CRLF, comments and blank lines", () => {
    const p = parseCsv('\uFEFF# mock: true\r\n# note\r\na,b\r\n"x, y","say ""hi"""\r\n\r\n1,\r\n');
    expect(p.meta).toEqual({ mock: "true" });
    expect(p.header).toEqual(["a", "b"]);
    expect(p.records.map((r) => r.cells)).toEqual([
      ["x, y", 'say "hi"'],
      ["1", ""],
    ]);
    expect(p.records[0].line).toBe(4);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a\n"oops\n')).toThrow(CsvSyntaxError);
  });
});

describe("spread_rates.csv", () => {
  const good = read("data/mock/spread_rates.csv");

  it("gives every row a citation ID by segment", () => {
    const r = validateSpreadRates(good);
    expect(r.ok && r.value.ids.slice(0, 4)).toEqual([
      "spread_rates:MOCK-B01/1",
      "spread_rates:MOCK-B01/2",
      "spread_rates:MOCK-B01/3",
      "spread_rates:MOCK-B02/1",
    ]);
  });

  it("rejects columns out of order", () => {
    const bad = good.replace("rate_mm_s,ci95_mm_s", "ci95_mm_s,rate_mm_s");
    expect(messages(validateSpreadRates(bad))).toMatch(/header: expected exactly/);
  });

  it("rejects NaN and units in cells", () => {
    const bad = good.replace(",0.111,0.011,", ",NaN,0.011,").replace(",22.2,1.11,", ",22.2,1.11 cm/s,");
    const m = messages(validateSpreadRates(bad));
    expect(m).toMatch(/"NaN" is not a plain number/);
    expect(m).toMatch(/"1.11 cm\/s" is not a plain number/);
  });

  it("rejects a pct_error that does not match the rates", () => {
    const bad = good.replace(",0.1,11,", ",0.1,12,");
    expect(messages(validateSpreadRates(bad))).toMatch(/pct_error: must be 100·\(rate − nasa\)\/nasa = 11.00/);
  });

  it("rejects mock IDs in a file that is not flagged mock", () => {
    const bad = good.replace(/^#.*\n/gm, "");
    expect(messages(validateSpreadRates(bad))).toMatch(/MOCK- IDs but is not flagged as mock/);
  });

  it("rejects comment lines in a real file", () => {
    const bad = good.replace("# mock: true", "# hello");
    expect(messages(validateSpreadRates(bad))).toMatch(/comment lines are only allowed in mock files/);
  });

  it("requires notes on an unusable segment", () => {
    const bad = good.replace("MOCK: fake values; unusable segment, edge lost", "");
    expect(messages(validateSpreadRates(bad))).toMatch(/unusable segment .* must say why in notes/);
  });
});

describe("edges/<test_id>.csv", () => {
  const good = read("data/mock/edges/MOCK-B01.csv");

  it("requires the file name to match test_id", () => {
    expect(messages(validateEdges(good, "MOCK-B02"))).toMatch(/expected MOCK-B02/);
  });

  it("requires t_s to increase", () => {
    const bad = good.replace("MOCK-B01,2,", "MOCK-B01,1,");
    expect(messages(validateEdges(bad))).toMatch(/t_s must strictly increase/);
  });
});

describe("frames_<test_id>.csv", () => {
  const rel = "data/mock/frames_MOCK-P01.csv";
  const good = read(rel);
  const bad = (from: string, to: string) => {
    expect(good, `mock no longer contains "${from}"`).toContain(from);
    return messages(validateFrames(good.replace(from, to), rel));
  };

  it("accepts the real P16 and P19 tables", () => {
    for (const f of ["data/derived/frames_P16.csv", "data/derived/frames_P19.csv"])
      expect(messages(findContract(f)!.validate(read(f), f))).toBe("");
  });

  it("starts the t_s clock at the test's first photo and keeps the burn clock separate", () => {
    const r = validateFrames(good, rel);
    expect(messages(r)).toBe("");
    if (!r.ok) return;
    const timed = r.value.rows.filter((x) => x.t_s !== null);
    expect(timed[0].t_s).toBe(0);
    expect(timed[0].phase).toBe("pretest");
    expect(timed[0].t_burn_s).toBeLessThan(0);
    expect(timed.filter((x) => x.t_burn_s === 0)).toHaveLength(1);
  });

  it("keeps a photo with no EXIF time as an empty last row", () => {
    const r = validateFrames(good, rel);
    if (!r.ok) return;
    const last = r.value.rows[r.value.rows.length - 1];
    expect(last.t_s).toBeNull();
    expect(last.phase).toBe("");
  });

  it("rejects a file name without a test ID", () => {
    expect(messages(validateFrames(good, "data/derived/frames_sixteen.csv"))).toMatch(/expected frames_<test_id>\.csv/);
  });

  it("rejects a t_s that does not start at the first photo", () => {
    expect(bad("11:11:11,11,0,-111.11,", "11:11:11,11,5,-106.11,")).toMatch(/first photo must have t_s = 0/);
  });

  it("rejects a gap, a long_gap flag or a phase that does not match the times", () => {
    expect(bad(",burn,111.11,true,", ",burn,100,true,")).toMatch(/expected t_s minus the previous t_s/);
    expect(bad(",burn,111.11,true,", ",burn,111.11,false,")).toMatch(/expected true/);
    expect(bad(",pretest,,,", ",burn,,,")).toMatch(/expected pretest/);
  });

  it("rejects an exposure_scale that does not match f_number, exposure_s and iso", () => {
    expect(bad(",burn,111.11,true,0.016", ",burn,111.11,true,0.02")).toMatch(/expected f_number² \/ \(exposure_s · iso\)/);
  });

  it("rejects rows out of time order and a duplicate file", () => {
    const lines = good.trimEnd().split("\n");
    const swapped = [...lines.slice(0, 4), lines[5], lines[4], ...lines.slice(6)].join("\n") + "\n";
    expect(messages(validateFrames(swapped, rel))).toMatch(/rows must be in time order/);
    expect(bad("mock_0003.NEF", "mock_0002.NEF")).toMatch(/listed twice/);
  });
});

describe("ices2025_digitized.csv", () => {
  const good = read("data/mock/ices2025_digitized.csv");

  it("accepts the mock and the real files", () => {
    expect(messages(validateDigitized(good))).toBe("");
    expect(messages(validateDigitized(read("data/reference/ices2025_digitized.csv")))).toBe("");
    expect(messages(validateDigitized(read("data/reference/ices2025_digitized_repeat.csv")))).toBe("");
  });

  it("refuses a flow on a lunar row: the lunar airflow is not determined", () => {
    const bad = good.replace("pmma,lunar,,", "pmma,lunar,25,");
    expect(messages(validateDigitized(bad))).toMatch(/lunar rows must leave flow_cm_s empty/);
  });

  it("rejects an unknown material and a lunar row that is not a line end", () => {
    expect(messages(validateDigitized(good.replace("p213,wstf", "kapton,wstf")))).toMatch(/"kapton" is not one of/);
    expect(messages(validateDigitized(good.replace("pmma,lunar,,10,line_end", "pmma,lunar,,10,marker")))).toMatch(/lunar rows are line_end/);
  });

  it("allows the AI-assistance header comment in a real file, and no other comment", () => {
    const real = good.replace(/^#.*\n/gm, "");
    expect(messages(validateDigitized("# Written with AI assistance (Claude Code)\n" + real))).toBe("");
    expect(messages(validateDigitized("# anything else\n" + real))).toMatch(/comment lines are only allowed in mock files/);
  });
});

describe("link2018_table_s1.csv", () => {
  const good = read("data/mock/link2018_table_s1.csv");

  it("requires steps 1..n per sample", () => {
    const bad = good.replace("MOCK-B01,1.11,22.2,2,", "MOCK-B01,1.11,22.2,5,");
    expect(messages(validateTableS1(bad))).toMatch(/expected step 2/);
  });

  it("requires a second checker on real rows", () => {
    const real = good.replace(/^#.*\n/gm, "").replace(/MOCK-/g, "").replace(/QA,/g, ",").replace(/B0(\d)/g, "B$1");
    expect(messages(validateTableS1(real))).toMatch(/needs a second person's check/);
  });

  it("converts the printed V_f × 10³ (cm/s) to mm/s", () => {
    expect(tableS1RateMmS({ rate_x1e3: 12.3 })).toBeCloseTo(0.123, 10);
  });
});

describe("moongap.json", () => {
  const good = () => json("data/mock/moongap.json");

  it("accepts the mock and the real file", () => {
    expect(messages(validateMoonGap(good()))).toBe("");
    expect(messages(validateMoonGap(json("web/src/data/moongap.json")))).toBe("");
  });

  it("checks gap.verdict against the 95% range (from 1.4.0)", () => {
    const real = json("web/src/data/moongap.json");
    const ok = Object.values(real.materials).filter((m: any) => m.status === "ok") as any[];
    for (const m of ok) {
      const [lo, hi] = m.gap.ci95_pct;
      expect(m.gap.verdict).toBe(lo > 0 ? "above_zero" : hi < 0 ? "below_zero" : "includes_zero");
    }
    const v = good();
    v.materials.pmma.gap.verdict = "above_zero";
    v.materials.pmma.gap.ci95_pct = [-1, 1];
    v.materials.pmma.gap.gap_pct = 0;
    expect(messages(validateMoonGap(v))).toMatch(/gap\.verdict/);
  });

  it("refuses any lunar or Moon airflow field, anywhere", () => {
    const v = good();
    v.materials.pmma.lunar.flow_cm_s = 25;
    v.context_bands.moon_airflow = { label: "x", min_cm_s: 1, max_cm_s: 2, source: "y" };
    const m = messages(validateMoonGap(v));
    expect(m).toMatch(/materials\.pmma\.lunar\.flow_cm_s: unknown field/);
    expect(m).toMatch(/context_bands\.moon_airflow: a lunar or Moon airflow is never stated/);
  });

  it("rejects a gap that is not intercept minus lunar limit, and a ranking out of gap order", () => {
    const v = good();
    v.materials.pmma.gap.gap_pct += 1;
    [v.ranking[0], v.ranking[1]] = [v.ranking[1], v.ranking[0]];
    const m = messages(validateMoonGap(v));
    expect(m).toMatch(/gap_pct: must be zero_flow\.intercept_pct − lunar\.limit_pct/);
    expect(m).toMatch(/rank: must be 1/);
  });

  it("requires the curve to start at zero flow and every context band to carry a source", () => {
    const v = good();
    v.materials.pmma.curve.flow_cm_s[0] = 10;
    v.context_bands.wstf.source = "";
    const m = messages(validateMoonGap(v));
    expect(m).toMatch(/the curve must start at flow 0/);
    expect(m).toMatch(/context_bands\.wstf\.source: must be at least 1 characters/);
  });

  it("keeps the slope check honest and the excluded list in step", () => {
    const v = good();
    v.materials.p213.slope_check.status = "matches_table2";
    v.excluded = [];
    const m = messages(validateMoonGap(v));
    expect(m).toMatch(/slope_check\.status: must be documented_discrepancy/);
    expect(m).toMatch(/cotton_flaming has status "excluded" but is not listed/);
  });

  it("requires the reference-flow note to say it is an Earth reference", () => {
    const v = good();
    v.materials.pmma.gap_at_ref_flow.note = "Flow used for comparison.";
    expect(messages(validateMoonGap(v))).toMatch(/must say this flow is an Earth \(1 g\) reference/);
  });
});

describe("/api/ask", () => {
  const examples = () => json("data/mock/ask/examples.json").examples as { request: any; response: any }[];

  it("rejects an unknown mode, and accepts a summarize with or without a subject", () => {
    expect(messages(validateAskRequest({ question: "x", mode: "guess" }))).toMatch(/mode: "guess" is not one of/);
    // the site's Summarize button sends a typed question with no subject; it must not get a 400
    expect(validateAskRequest({ question: "What did BASS-II find?", mode: "summarize" }).ok).toBe(true);
    expect(validateAskRequest({ question: "x", mode: "summarize", subject: { kind: "test", id: "B16" } }).ok).toBe(true);
    expect(messages(validateAskRequest({ question: " ", mode: "rank" }))).toMatch(/question: must not be empty/);
  });

  it("rejects offsets that do not point at the number", () => {
    const res = examples()[0].response;
    res.gate.numbers[0].start += 1;
    expect(messages(validateAskResponse(res))).toMatch(/answer\[\d+:\d+\] is/);
  });

  it("rejects counts that do not add up and a passed gate with unverified numbers", () => {
    const res = examples()[2].response;
    res.gate.action = "passed";
    res.gate.checked = 5;
    const m = messages(validateAskResponse(res));
    expect(m).toMatch(/gate.checked: must equal numbers.length/);
    expect(m).toMatch(/cannot be passed with unverified numbers/);
  });

  it("requires citations on answers and none on not_in_data", () => {
    const [ans, , , , none] = examples().map((e) => e.response);
    ans.citations = [];
    none.citations = [{ kind: "paper", id: "link2018" }];
    expect(messages(validateAskResponse(ans))).toMatch(/must cite at least one/);
    expect(messages(validateAskResponse(none))).toMatch(/must be empty when status is not_in_data/);
  });

  it("rejects a malformed row citation", () => {
    const res = examples()[0].response;
    res.citations = [{ kind: "row", id: "row 7" }];
    expect(messages(validateAskResponse(res))).toMatch(/citations\[0\]\.id/);
  });
});

describe("control_result.json", () => {
  it("rejects a diff_pct that does not match tracker and hand rates", () => {
    const v = json("data/mock/control_result.json");
    v.diff_pct = 1;
    expect(messages(validateControlResult(v))).toMatch(/diff_pct: must be 100·\(tracker − hand\)\/hand/);
  });
});

describe("psi_investigations.json", () => {
  const good = () => json("data/mock/psi_investigations.json");

  it("accepts the mock and the real file", () => {
    expect(messages(validateInvestigations(good()))).toBe("");
    expect(messages(validateInvestigations(json("data/reference/psi_investigations.json")))).toBe("");
  });

  it("requires a whole-number score from 1 to 5 with a reason for every setting", () => {
    const v = good();
    const rel = v.investigations[0].relevance;
    rel.iss.score = 6;
    rel.lunar_base.score = 2.5;
    rel.mars_base.score = 0;
    rel.spacecraft_cabin.why = " ";
    const m = messages(validateInvestigations(v));
    expect(m).toMatch(/relevance\.iss\.score: 6 is above 5/);
    expect(m).toMatch(/relevance\.lunar_base\.score: expected a whole number/);
    expect(m).toMatch(/relevance\.mars_base\.score: 0 is below 1/);
    expect(m).toMatch(/relevance\.spacecraft_cabin\.why: must not be empty/);
  });

  it("requires exactly the five crew settings", () => {
    const v = good();
    delete v.investigations[0].relevance.pressurized_rover;
    v.investigations[0].relevance.moon_village = { score: 3, why: "x" };
    const m = messages(validateInvestigations(v));
    expect(m).toMatch(/relevance\.pressurized_rover: missing/);
    expect(m).toMatch(/relevance\.moon_village: unknown field/);
  });

  it("requires a source for every key finding", () => {
    const v = good();
    v.investigations[1].key_finding_source = "";
    delete v.investigations[0].key_finding_source;
    const m = messages(validateInvestigations(v));
    expect(m).toMatch(/investigations\[1\]\.key_finding_source: must not be empty/);
    expect(m).toMatch(/investigations\[0\]\.key_finding_source: missing/);
  });

  it("requires the note saying the scores are the team's judgment, not NASA's", () => {
    const v = good();
    v.relevance_note = "Scores from 1 to 5.";
    expect(messages(validateInvestigations(v))).toMatch(/relevance_note: must say the relevance scores are the team's judgment, not NASA's/);
    delete v.relevance_note;
    expect(messages(validateInvestigations(v))).toMatch(/relevance_note: missing/);
  });

  it("refuses a Moon or Mars airflow in a field name or a value", () => {
    const v = good();
    v.investigations[0].relevance.lunar_base.airflow_cm_s = 5;
    v.investigations[0].moon_flow = "x";
    v.investigations[1].relevance.mars_base.why = "Martian habitat airflow is 12 cm/s.";
    v.investigations[1].key_finding = "Spread stopped at 0.5 cm/s under lunar gravity.";
    const m = messages(validateInvestigations(v));
    expect(m).toMatch(/relevance\.lunar_base\.airflow_cm_s: a Moon or Mars airflow is never stated/);
    expect(m).toMatch(/investigations\[0\]\.moon_flow: a Moon or Mars airflow is never stated/);
    expect(m).toMatch(/relevance\.mars_base\.why: pairs the Moon or Mars with an airflow speed/);
    expect(m).toMatch(/investigations\[1\]\.key_finding: pairs the Moon or Mars with an airflow speed/);
  });

  it("rejects unknown top-level fields and a ranking", () => {
    const v = good();
    v.ranking = [];
    v.investigations[0].overall_rank = 1;
    const m = messages(validateInvestigations(v));
    expect(m).toMatch(/^ranking: unknown field/m);
    expect(m).toMatch(/investigations\[0\]\.overall_rank: unknown field/);
  });

  it("rejects a verified paper without a DOI, a duplicate accession and an unflagged mock", () => {
    const v = good();
    v.investigations[1].key_papers[0].doi_verified = true;
    v.investigations[1].accession = v.investigations[0].accession;
    delete v.mock;
    const m = messages(validateInvestigations(v));
    expect(m).toMatch(/doi_verified: cannot be true without a doi/);
    expect(m).toMatch(/appears twice/);
    expect(m).toMatch(/mock: contains MOCK- IDs but is not flagged as mock/);
  });
});

describe("overlays", () => {
  it("rejects a bad name, an oversized file and a non-MP4", () => {
    const issues = checkOverlay("web/public/overlays/flame.mp4", 20 * 1048576, new Uint8Array(12));
    expect(issues.map((i) => i.message).join("\n")).toMatch(/not a test or control ID[\s\S]*over the 15 MB[\s\S]*not an MP4/);
  });
});
