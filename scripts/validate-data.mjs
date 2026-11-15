// Written with AI assistance (Claude Code)
// Checks data files against proof/src/contracts.ts. For teammates: `npm run validate -- <file> ...`.
// With no arguments it checks every known file under data/, web/src/data and web/public/overlays.
import { openSync, readFileSync, readSync, closeSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkOverlay, findContract, isMockText, OVERLAY_PATH } from "../proof/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
}

const args = process.argv.slice(2);
const explicit = args.length > 0;
const files = explicit
  ? args.map((a) => resolve(process.cwd(), a))
  : ["data", "web/src/data", "web/public/overlays"].flatMap((d) => walk(join(root, d)));

let failed = 0;
let checked = 0;
for (const full of files) {
  const rel = relative(root, full).split("\\").join("/");
  let issues;
  let mock = false;
  if (OVERLAY_PATH.test(rel)) {
    const head = new Uint8Array(12);
    const fd = openSync(full, "r");
    readSync(fd, head, 0, 12, 0);
    closeSync(fd);
    issues = checkOverlay(rel, statSync(full).size, head);
  } else {
    const contract = findContract(rel);
    if (!contract) {
      if (explicit) {
        console.log(`?? ${rel}: no contract matches this path (see docs/DATA_CONTRACTS.md)`);
        failed++;
      }
      continue;
    }
    const text = readFileSync(full, "utf8");
    mock = isMockText(text);
    const res = contract.validate(text, rel);
    issues = res.ok ? [] : res.issues;
  }
  checked++;
  if (issues.length === 0) {
    console.log(`ok ${rel}${mock ? " (mock)" : ""}`);
  } else {
    failed++;
    console.log(`FAIL ${rel}`);
    for (const i of issues.slice(0, 50)) console.log(`  ${i.path}: ${i.message}`);
    if (issues.length > 50) console.log(`  ... and ${issues.length - 50} more`);
  }
}
console.log(`${checked} file(s) checked, ${failed} failed`);
process.exit(failed ? 1 : 0);
