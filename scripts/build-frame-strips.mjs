// Written with AI assistance (Claude Code)
// Builds the Measure panel's photo strip: one JPEG sheet per test of every photo the tracker read,
// cut from the tracker's own overlay video (frame i = row i of data/derived/edges/<test>.csv), plus
// web/src/data/frames.json with the sheet layout and the mm -> column mapping the page uses to place each edge
// mark. The mapping is recovered from the overlay itself: in every frame with an edge_mm, find the
// column of the solid v1 line the tracker drew, then fit column = a + b * edge_mm. The page draws
// each mark from the CSV's edge_mm through that fit; nothing is typed in by hand.
// Also copies the five raw P16 photos decoded from NASA's .NEF files (docs/plan-images) with the
// matching overlay frames, for the raw-versus-tracker comparison. Needs ffmpeg on PATH (or FFMPEG).
//
// Usage: node scripts/build-frame-strips.mjs
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FF = process.env.FFMPEG || "ffmpeg";
const FP = process.env.FFPROBE || FF.replace(/ffmpeg$/, "ffprobe");
const OUT = join(ROOT, "web/public/frames");
const BAR_H = 60;      // caption bar under the photo in every overlay frame (pipeline overlay.py)
const HALF = 100;      // rows kept above and below the rod axis
const TH = 64;         // sheet tile height in px
const COLS = 8;        // tiles per sheet row

function probe(file) {
  const out = execFileSync(FP, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).toString().trim();
  const [w, h] = out.split(",").map(Number);
  return { w, h };
}

function csvRows(file) {
  const [head, ...lines] = readFileSync(file, "utf8").replace(/\r\n/g, "\n").trim().split("\n");
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
}

/** Column of the solid cyan v1 line in one RGB frame, or null. Where the dashed magenta front sits on
 *  the same column, the cyan shows only in the dash gaps, so cyan and magenta together must fill the
 *  column and cyan alone at least a quarter of it. */
function cyanColumn(buf, w, y0, y1) {
  const cyan = new Uint32Array(w), line = new Uint32Array(w);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3, r = buf[i], g = buf[i + 1], b = buf[i + 2];
      const c = r < 90 && g > 190 && b > 190, m = r > 200 && g < 150 && b > 200;
      if (c) cyan[x]++;
      if (c || m) line[x]++;
    }
  }
  const n = y1 - y0;
  let best = -1, max = 0;
  for (let x = 0; x < w; x++) if (cyan[x] >= n * 0.25 && line[x] >= n * 0.6 && cyan[x] > max) { max = cyan[x]; best = x; }
  if (best < 0) return null;
  let s = 0, k = 0;
  for (let x = best - 3; x <= best + 3; x++) if (x >= 0 && x < w && cyan[x] >= n * 0.25 && line[x] >= n * 0.6) { s += x * cyan[x]; k += cyan[x]; }
  return s / k;
}

async function columns(file, w, h, y0, y1) {
  const size = w * h * 3;
  const out = [];
  await new Promise((resolve, reject) => {
    const p = spawn(FF, ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    let pending = Buffer.alloc(0);
    p.stdout.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= size) {
        out.push(cyanColumn(pending.subarray(0, size), w, y0, y1));
        pending = pending.subarray(size);
      }
    });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${FF} exited ${code}`))));
  });
  return out;
}

function fit(pairs) {
  const n = pairs.length;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n, my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  const worst = Math.max(...pairs.map(([x, y]) => Math.abs(a + b * x - y)));
  return { a, b, worst };
}

const tests = readdirSync(join(ROOT, "data/derived/edges")).filter((f) => f.endsWith(".csv")).map((f) => f.replace(/\.csv$/, "")).sort();
const index = {};
for (const t of tests) {
  const video = join(ROOT, "web/public/overlays", `${t}.mp4`);
  const cfgPath = join(ROOT, "pipeline/configs", `${t}.json`);
  if (!existsSync(video) || !existsSync(cfgPath)) { console.log(`${t}: no overlay video or config, skipped`); continue; }
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  const rows = csvRows(join(ROOT, "data/derived/edges", `${t}.csv`));
  const { w, h } = probe(video);
  const ph = h - BAR_H;
  const axis = cfg.axis_row - (cfg.cache_rows ? cfg.cache_rows[0] : 0);
  const top = Math.max(0, Math.min(ph - 2 * HALF, axis - HALF));
  const band = Math.min(2 * HALF, ph);

  // 1. the v1 line's column in every frame, against the CSV's edge_mm
  const cols = await columns(video, w, h, top, top + band);
  if (cols.length !== rows.length) throw new Error(`${t}: ${cols.length} video frames, ${rows.length} CSV rows`);
  const pairs = rows.flatMap((r, i) => (r.edge_mm !== "" && cols[i] !== null ? [[Number(r.edge_mm), cols[i]]] : []));
  // The overlay draws the line at a linear function of edge_mm (pipeline run.mm_to_px), so frames where the
  // line is clean are enough to recover it; frames where the dashed front covers it are left out.
  const kept = pairs, f = fit(kept);
  if (kept.length < 3) throw new Error(`${t}: only ${kept.length} clean line columns`);
  if (f.worst > 4) throw new Error(`${t}: mm -> column fit misses by ${f.worst.toFixed(1)} px`);

  // 2. the sheet: the band around the rod axis, every frame, COLS per row
  const tw = Math.round((w * TH) / band / 2) * 2;
  const sheetRows = Math.ceil(rows.length / COLS);
  mkdirSync(join(OUT, t), { recursive: true });
  execFileSync(FF, ["-v", "error", "-y", "-i", video, "-vf", `crop=${w}:${band}:0:${top},scale=${tw}:${TH}:flags=area,tile=${COLS}x${sheetRows}`, "-frames:v", "1", "-q:v", "6", join(OUT, t, "sheet.jpg")]);
  index[t] = { frames: rows.length, cols: COLS, tile: [tw, TH], a: f.a / w, b: f.b / w, fitted: kept.length };
  console.log(`${t}: ${rows.length} frames, ${kept.length} clean line columns fitted of ${rows.filter((r) => r.edge_mm !== "").length} edge rows, worst ${f.worst.toFixed(2)} px`);
}

// 3. raw P16 photos (test B16) and the overlay frame of the same photo, cut to the same picture
const RAW = join(ROOT, "docs/plan-images");
const pairsOut = [];
const b16 = csvRows(join(ROOT, "data/derived/edges/B16.csv"));
for (const file of readdirSync(RAW).filter((x) => /^p16-frame\d+\.png$/.test(x)).sort()) {
  const photo = Number(file.match(/\d+/g).pop());
  if (!b16[photo - 1] || b16[photo - 1].edge_mm === "") continue;   // only photos where the tracker drew an edge
  const { w, h } = probe(join(ROOT, "web/public/overlays/B16.mp4"));
  const rw = probe(join(RAW, file)).w;
  const name = `photo-${String(photo).padStart(3, "0")}`;
  execFileSync(FF, ["-v", "error", "-y", "-i", join(RAW, file), "-q:v", "4", join(OUT, "B16", `${name}-raw.jpg`)]);
  execFileSync(FF, ["-v", "error", "-y", "-i", join(ROOT, "web/public/overlays/B16.mp4"), "-vf", `select=eq(n\\,${photo - 1}),crop=${w}:${h - BAR_H}:0:0,scale=${rw}:-2:flags=area`, "-frames:v", "1", "-q:v", "4", join(OUT, "B16", `${name}-tracked.jpg`)]);
  pairsOut.push({ photo, row: photo - 1, raw: `/frames/B16/${name}-raw.jpg`, tracked: `/frames/B16/${name}-tracked.jpg`, source: `docs/plan-images/${file}` });
}
writeFileSync(join(ROOT, "web/src/data/frames.json"), JSON.stringify({
  _note: "Generated by scripts/build-frame-strips.mjs, do not edit. strips: one sheet per test, frame i = edges row i; a, b: the mark's column = (a + b * edge_mm) * width, fitted to the tracker's own v1 line. pairs: raw P16 photos and the overlay frame of the same photo.",
  strips: index, pairs: { test: "B16", photos: pairsOut } }, null, 1) + "\n");
console.log(`B16: ${pairsOut.length} raw/tracked pairs with an edge`);
