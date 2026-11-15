// Written with AI assistance (Claude Code)
// Every checkable fact the answer checker knows, drawn as one flame on a rod: one canvas cell per
// fact, coloured by where the fact comes from (our measurements at the hot base, quotes from papers
// at the cool outer edge). Point at a cell, tap it, or focus the picture and use the arrow keys to
// read the fact's file, row and column (or paper, page and quote). The same facts are also a paged
// list below. The cell count is the length of the fact index, never typed.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Fact } from "@still-air/proof";
import { FACTS, SPREAD_FILE, S1_FILE, MOONGAP_FILE, INVESTIGATIONS_FILE } from "../data";
import { SourceCard } from "../Num";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./fact-mosaic.css";

interface Group { key: string; name: string; token: string; alpha: number; has: (f: Fact) => boolean }
const fileOf = (f: Fact) => ("file" in f.source ? f.source.file : null);
// hot to cool: the order the groups fill the flame from its base outward
const GROUPS: Group[] = [
  { key: "ours", name: "Our photo measurements", token: "--on-night", alpha: 1, has: (f) => fileOf(f) === SPREAD_FILE },
  { key: "model", name: "Our model and envelope", token: "--pay", alpha: 1, has: (f) => /^data\/derived\//.test(fileOf(f) ?? "") },
  { key: "s1", name: "Table S1 (NASA)", token: "--flame-glow", alpha: 1, has: (f) => fileOf(f) === S1_FILE },
  { key: "gap", name: "Moon Gap (ICES figures)", token: "--flame", alpha: 1, has: (f) => fileOf(f) === MOONGAP_FILE || /ices2025/.test(fileOf(f) ?? "") },
  { key: "psi", name: "PSI investigation records", token: "--flame-ink", alpha: 1, has: (f) => fileOf(f) === INVESTIGATIONS_FILE },
  { key: "paper", name: "Quoted from papers", token: "--on-night-mute", alpha: 0.55, has: (f) => "paper" in f.source },
  { key: "other", name: "Other data files", token: "--mute", alpha: 1, has: () => true },
];

const PAGE = 24;
const N = FACTS.length;

// the flame's outline in the figure's own units: x 0..1 across, y -1..1 about the rod
const LEAD = 0.07, TAIL = 0.975, ROD = 0.075;
const ENV_PEAK = 0.437; // max of s^.38 (1-s)^1.05
function halfHeight(s: number) { return ROD + (0.86 / ENV_PEAK) * Math.pow(s, 0.38) * Math.pow(1 - s, 1.05); }

export function FactMosaic() {
  // facts in drawing order: grouped hot to cool, each group in index order
  const ordered = useMemo(() => {
    const out: { fact: Fact; g: number }[] = [];
    const seen = new Set<Fact>();
    GROUPS.forEach((grp, g) => FACTS.forEach((f) => { if (!seen.has(f) && grp.has(f)) { seen.add(f); out.push({ fact: f, g }); } }));
    return out;
  }, []);
  const counts = useMemo(() => GROUPS.map((_, g) => ordered.filter((o) => o.g === g).length), [ordered]);

  const figRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const api = useRef<{ mark: (k: number) => void; step: (key: string) => number } | null>(null);
  const [active, setActive] = useState(-1);
  const [pinned, setPinned] = useState(-1);
  const [live, setLive] = useState(false);
  const [page, setPage] = useState(0);
  const pinnedRef = useRef(-1);
  pinnedRef.current = pinned;

  useEffect(() => {
    const fig = figRef.current!, cv = cvRef.current!, ring = ringRef.current!;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let W = 0, H = 0, cols = 0, rows = 0, c = 0, ox = 0, oy = 0;
    let grid = new Int32Array(0), place = new Int32Array(N);
    let shown = 0, revealed = false, raf = 0, onScreen = false;
    let colours: string[] = [], rodColour = "";

    function readColours() {
      const cs = getComputedStyle(fig);
      colours = GROUPS.map((g) => cs.getPropertyValue(g.token).trim() || "#888");
      rodColour = cs.getPropertyValue("--on-night-mute").trim();
    }

    function layout() {
      W = fig.clientWidth; H = fig.clientHeight;
      if (!W || !H) return;
      // the cell size whose grid has at least N cells inside the outline, then the N most-inside cells
      let size = Math.sqrt((0.5 * W * H) / N) * 1.08;
      let inside: { cell: number; r: number; s: number }[] = [];
      for (let tries = 0; tries < 80; tries++, size *= 0.975) {
        cols = Math.floor(W / size); rows = Math.floor(H / size);
        ox = (W - cols * size) / 2; oy = (H - rows * size) / 2;
        inside = [];
        for (let rr = 0; rr < rows; rr++) for (let q = 0; q < cols; q++) {
          const nx = (ox + (q + 0.5) * size) / W, ny = (oy + (rr + 0.5) * size - H / 2) / (H / 2);
          const s = (nx - LEAD) / (TAIL - LEAD), ay = Math.abs(ny);
          if (s <= 0 || s >= 1 || ay < ROD) continue;
          const r = (ay - ROD) / (halfHeight(s) - ROD);
          if (r <= 1) inside.push({ cell: rr * cols + q, r, s });
        }
        if (inside.length >= N) break;
      }
      c = size;
      inside.sort((a, b) => a.r - b.r);
      const chosen = inside.slice(0, N);
      // hot base first: near the rod and near the leading edge
      chosen.sort((a, b) => (0.45 * a.r + 0.55 * a.s) - (0.45 * b.r + 0.55 * b.s));
      grid = new Int32Array(rows * cols).fill(-1);
      place = new Int32Array(N).fill(-1);
      chosen.forEach((ch, k) => { if (k < ordered.length) { grid[ch.cell] = k; place[k] = ch.cell; } });
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      readColours();
      draw();
      const k = pinnedRef.current;
      if (k > -1) mark(k);
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      // the rod: the fuel the flame sits on, across the whole picture
      ctx!.globalAlpha = 0.28; ctx!.fillStyle = rodColour;
      ctx!.fillRect(0, H / 2 - ROD * (H / 2) * 0.55, W, ROD * H * 0.55);
      const gap = c > 7 ? 1 : 0.5;
      for (let k = 0; k < Math.min(shown, ordered.length); k++) {
        const g = place[k]; if (g < 0) continue;
        const grp = ordered[k].g;
        ctx!.globalAlpha = GROUPS[grp].alpha; ctx!.fillStyle = colours[grp];
        ctx!.fillRect(ox + (g % cols) * c, oy + Math.floor(g / cols) * c, c - gap, c - gap);
      }
      ctx!.globalAlpha = 1;
    }

    function mark(k: number) {
      if (k < 0 || place[k] < 0) { ring.hidden = true; return; }
      const g = place[k], pad = Math.max(4, c * 0.9);
      ring.hidden = false;
      Object.assign(ring.style, { left: `${ox + (g % cols) * c - pad / 2}px`, top: `${oy + Math.floor(g / cols) * c - pad / 2}px`, width: `${c + pad}px`, height: `${c + pad}px` });
    }

    const at = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const q = Math.floor((e.clientX - r.left - ox) / c), rr = Math.floor((e.clientY - r.top - oy) / c);
      return q < 0 || q >= cols || rr < 0 || rr >= rows ? -1 : grid[rr * cols + q];
    };
    let hover = -1;
    const onMove = (e: PointerEvent) => { const k = at(e); if (k > -1 && k !== hover) { hover = k; setLive(false); setActive(k); mark(k); } };
    const onLeave = () => { hover = -1; const k = pinnedRef.current; setActive(k); mark(k); };
    const onClick = (e: PointerEvent) => { const k = at(e); if (k > -1) { setPinned(k); setActive(k); mark(k); } };
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerleave", onLeave);
    cv.addEventListener("click", onClick as EventListener);

    // arrow keys walk the picture cell by cell, skipping empty cells in that direction
    function step(key: string): number {
      const cur = pinnedRef.current;
      if (key === "Home") return 0;
      if (key === "End") return ordered.length - 1;
      if (cur < 0) return 0;
      const d = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols } as Record<string, number>)[key];
      if (d === undefined) return -2;
      let n = place[cur] + d;
      while (n >= 0 && n < grid.length && grid[n] < 0) {
        if (Math.abs(d) === 1 && Math.floor(n / cols) !== Math.floor(place[cur] / cols)) return cur;
        n += d;
      }
      return n < 0 || n >= grid.length ? cur : grid[n];
    }
    api.current = { mark, step };

    // the one-off draw-in, from the hot base outward, the first time the picture is on screen
    const still = () => prefersReduced() || motionPaused() || document.hidden;
    function finish() { cancelAnimationFrame(raf); shown = ordered.length; revealed = true; draw(); }
    function reveal() {
      if (revealed) return;
      if (still()) return finish();
      revealed = true;
      const t0 = performance.now(), dur = 1100;
      const frame = (now: number) => {
        if (still() || !onScreen) return finish();
        const p = Math.min(1, (now - t0) / dur);
        shown = Math.ceil(ordered.length * (1 - Math.pow(1 - p, 3)));
        draw();
        if (p < 1) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) reveal(); }, { threshold: 0.25 });
    io.observe(fig);
    const stopWatch = watchMotion(() => { if (revealed && shown < ordered.length) finish(); });
    if (still()) { shown = ordered.length; revealed = true; }

    let lw = 0, lh = 0;
    const ro = new ResizeObserver(() => { if (fig.clientWidth === lw && fig.clientHeight === lh) return; lw = fig.clientWidth; lh = fig.clientHeight; layout(); });
    ro.observe(fig);
    layout();

    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); stopWatch();
      cv.removeEventListener("pointermove", onMove); cv.removeEventListener("pointerleave", onLeave); cv.removeEventListener("click", onClick as EventListener);
      api.current = null;
    };
  }, [ordered]);

  function pick(k: number) { setPinned(k); setActive(k); setLive(true); api.current?.mark(k); }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") { setPinned(-1); setActive(-1); api.current?.mark(-1); return; }
    const k = api.current?.step(e.key) ?? -2;
    if (k === -2) return;
    e.preventDefault();
    pick(k);
  }

  const shown = active > -1 ? ordered[active] : null;
  const pages = Math.ceil(ordered.length / PAGE);
  const slice = ordered.slice(page * PAGE, (page + 1) * PAGE);

  return (
    <figure className="fm" data-element="fact-mosaic" aria-labelledby="fm-cap">
      <figcaption id="fm-cap" className="fm-cap">
        <span className="fm-count">{N} facts</span> the checker can match, one cell each.
      </figcaption>
      <div className="fm-stage">
        <div
          ref={figRef}
          className="fm-fig"
          tabIndex={0}
          role="group"
          aria-label={`${N} checkable facts drawn as a flame. Use the arrow keys to read each one; Home and End jump to the first and last.`}
          onKeyDown={onKey}
          onFocus={() => { if (pinnedRef.current < 0) pick(0); }}
        >
          <canvas ref={cvRef} aria-hidden="true" />
          <span ref={ringRef} className="fm-ring" hidden />
        </div>
        <div className="fm-card" aria-live={live ? "polite" : "off"}>
          {shown ? (
            <>
              <div className="fm-card-g"><i style={{ background: `var(${GROUPS[shown.g].token})`, opacity: GROUPS[shown.g].alpha }} />{GROUPS[shown.g].name}</div>
              <div className="fm-card-label">{shown.fact.label}</div>
              <div className="fm-card-src"><SourceCard source={shown.fact.source} /></div>
            </>
          ) : (
            <p className="fm-card-help">Point at or tap a cell to see its source.</p>
          )}
        </div>
      </div>
      <ul className="fm-legend">
        {GROUPS.map((g, i) => counts[i] > 0 && (
          <li key={g.key}><i style={{ background: `var(${g.token})`, opacity: g.alpha }} />{g.name} <span className="num">{counts[i]}</span></li>
        ))}
      </ul>
      <details className="fm-list">
        <summary>Read all {N} facts as a list</summary>
        <ol start={page * PAGE + 1}>
          {slice.map((o) => (
            <li key={o.fact.id}>
              <span className="fm-li-label">{o.fact.label}</span>
              <span className="fm-li-g">{GROUPS[o.g].name}</span>
              <div className="fm-li-src"><SourceCard source={o.fact.source} /></div>
            </li>
          ))}
        </ol>
        <div className="fm-pager">
          <button type="button" className="btn ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="num" aria-live="polite">{page * PAGE + 1}–{Math.min(ordered.length, (page + 1) * PAGE)} of {ordered.length}</span>
          <button type="button" className="btn ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </details>
    </figure>
  );
}
