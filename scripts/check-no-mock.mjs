// Written with AI assistance (Claude Code)
// Fails a production build if mock data would ship. Runs as the last step of `npm run build`.
// It fails only when VERCEL_ENV=production (or with --strict); elsewhere it warns, because
// preview deploys and local dev may use mocks (VITE_USE_MOCK=1).
//
// It flags:
//   1. VITE_USE_MOCK set to anything but "" / "0" / "false".
//   2. Any shipped file (data/ outside data/mock, web/src, web/public, api, web/dist) that is
//      flagged mock (`# mock: true` or `"mock": true`), contains a MOCK- ID, or has one in its name.
//   3. Non-test api/ code that references data/mock.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MOCK_ID = /MOCK-[A-Z0-9][A-Za-z0-9-]*/;
const CSV_FLAG = /^\uFEFF?(#[^\n]*\n)*#\s*mock\s*:\s*true\b/;
const JSON_FLAG = /"mock"\s*:\s*true\b/;
const TEXT_EXT = new Set([".csv", ".json", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".css", ".txt", ".svg", ".map", ".md"]);

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * @param {{ root: string, env?: Record<string, string | undefined>, includeDist?: boolean }} opts
 * @returns {string[]} one line per problem; empty means no mock data would ship
 */
export function findMockUsage({ root, env = process.env, includeDist = true }) {
  const problems = [];
  const flag = env.VITE_USE_MOCK;
  if (flag && flag !== "0" && flag !== "false") problems.push(`VITE_USE_MOCK=${flag} is set`);

  const areas = [
    { dir: "data", skip: (rel) => rel.startsWith("data/mock/") || rel === "data/README.md" },
    { dir: "web/src" },
    { dir: "web/public" },
    { dir: "api", skip: (rel) => rel.endsWith(".test.ts") || rel === "api/_build-info.ts" },
  ];
  if (includeDist) areas.push({ dir: "web/dist" });

  for (const { dir, skip } of areas) {
    for (const full of walk(join(root, dir))) {
      const rel = relative(root, full).split("\\").join("/");
      if (basename(rel) === ".DS_Store" || basename(rel) === ".gitkeep" || skip?.(rel)) continue;
      if (MOCK_ID.test(basename(rel))) {
        problems.push(`${rel}: mock file name`);
        continue;
      }
      if (!TEXT_EXT.has(extname(rel))) continue;
      const text = readFileSync(full, "utf8");
      if (CSV_FLAG.test(text) || JSON_FLAG.test(text)) problems.push(`${rel}: flagged as mock data`);
      else {
        const m = MOCK_ID.exec(text);
        if (m) problems.push(`${rel}: contains mock ID "${m[0]}"`);
      }
      if (rel.startsWith("api/") && text.includes("data/mock")) problems.push(`${rel}: references data/mock`);
    }
  }
  return problems;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const strict = process.env.VERCEL_ENV === "production" || process.argv.includes("--strict");
  const problems = findMockUsage({ root });
  if (problems.length === 0) {
    console.log("check-no-mock: no mock data in shipped files");
  } else if (strict) {
    console.error("check-no-mock: production build refused, mock data would ship:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  } else {
    console.warn("check-no-mock: mock data in use (allowed outside production):");
    for (const p of problems) console.warn(`  - ${p}`);
  }
}
