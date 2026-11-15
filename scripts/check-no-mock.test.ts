// Written with AI assistance (Claude Code)
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error: plain .mjs build script without type declarations
import { findMockUsage } from "./check-no-mock.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
let dirs: string[] = [];

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "no-mock-"));
  dirs.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

const MOCK_CSV = "# mock: true\ntest_id,t_s\nMOCK-B01,0\n";

describe("check-no-mock (production build guard)", () => {
  it("passes when mocks stay in data/mock", () => {
    const root = tree({
      "data/mock/spread_rates.csv": MOCK_CSV,
      "data/derived/spread_rates.csv": "test_id,t_s\nB16,0\n",
      "web/dist/assets/index.js": 'console.log("ok")',
    });
    expect(findMockUsage({ root, env: {} })).toEqual([]);
  });

  it("fails when a flagged mock file is copied into data/derived", () => {
    const root = tree({ "data/derived/spread_rates.csv": MOCK_CSV });
    expect(findMockUsage({ root, env: {} })).toEqual(["data/derived/spread_rates.csv: flagged as mock data"]);
  });

  it("fails when mock JSON is in web/src/data", () => {
    const root = tree({ "web/src/data/moongap.json": '{ "contract": "moongap/1", "mock": true }' });
    expect(findMockUsage({ root, env: {} })[0]).toMatch(/moongap.json: flagged as mock data/);
  });

  it("fails when a mock ID reaches the built bundle", () => {
    const root = tree({ "web/dist/assets/index-abc.js": 'const t={test_id:"MOCK-B01"};' });
    expect(findMockUsage({ root, env: {} })).toEqual(['web/dist/assets/index-abc.js: contains mock ID "MOCK-B01"']);
  });

  it("fails on a mock overlay in web/public", () => {
    const root = tree({ "web/public/overlays/MOCK-B01.mp4": "binary" });
    expect(findMockUsage({ root, env: {} })).toEqual(["web/public/overlays/MOCK-B01.mp4: mock file name"]);
  });

  it("fails when VITE_USE_MOCK is set", () => {
    const root = tree({});
    expect(findMockUsage({ root, env: { VITE_USE_MOCK: "1" } })).toEqual(["VITE_USE_MOCK=1 is set"]);
    expect(findMockUsage({ root, env: { VITE_USE_MOCK: "0" } })).toEqual([]);
  });

  it("fails when API code reads data/mock", () => {
    const root = tree({ "api/ask.ts": 'import x from "../data/mock/ask/examples.json";' });
    expect(findMockUsage({ root, env: {} })).toEqual(["api/ask.ts: references data/mock"]);
  });

  it("the repo itself has no mock data in shipped source", () => {
    // web/dist is skipped here: it is git-ignored and may be a stale local preview build.
    // The real build runs the full check, dist included, right after building it.
    expect(findMockUsage({ root: repo, env: {}, includeDist: false })).toEqual([]);
  });
});
