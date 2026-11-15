// Written with AI assistance (Claude Code)
// The open test's burn, scrubbed by the page's own scroll: the tracker's overlay photos, oldest first,
// one photo per step of scroll, with the leading edge drawn where data/derived/edges/<test>.csv puts it.
// The photos are the frame strip's sheet (web/public/frames/<test>/sheet.jpg, cut from the overlay
// video by scripts/build-frame-strips.mjs; photo i = edges row i), and the edge mark is placed through
// the same mm -> column fit as the strip (web/src/data/frames.json). A small trace below draws the
// whole edge track with a cursor on the photo shown.
// Reduced motion or the Pause switch: no scroll binding and no tall track; the photo is chosen with the
// slider (or arrow keys) instead. The slider also works while scrolling: moving it scrolls the page there.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useReplay } from "../replay";
import { Num } from "../Num";
import { cell, edges } from "../data";
import frames from "../data/frames.json";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./burn-scrub.css";

interface Strip { frames: number; cols: number; tile: [number, number]; a: number; b: number }
const STRIPS = frames.strips as unknown as Record<string, Strip>;
const edgeFile = (t: string) => `data/derived/edges/${t}.csv`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const still = () => prefersReduced() || motionPaused();

export function BurnScrub() {
  const { test } = useReplay();
  const rows = edges[test] ?? [];
  const strip = STRIPS[test];
  const n = rows.length;

  const [scrub, setScrub] = useState(() => !still());
  const [idx, setIdx] = useState(0);
  const [sheet, setSheet] = useState<HTMLImageElement | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const idxRef = useRef(0);
  idxRef.current = idx;

  // follow the two motion switches
  useEffect(() => watchMotion(() => setScrub(!still())), []);
  // scrolling starts at the first photo; held still, the picker opens on the middle photo with an edge
  useEffect(() => {
    const withEdge = rows.flatMap((r, i) => (r.edge_mm === "" ? [] : [i]));
    setIdx(scrub || !withEdge.length ? 0 : withEdge[withEdge.length >> 1]);
    // only when the test changes (a Pause mid-scroll keeps the photo on screen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test]);

  // fetch the sheet only once the element comes near the screen
  useEffect(() => {
    const el = track.current;
    if (!el || !strip) return;
    setSheet(null);
    let img: HTMLImageElement | null = null;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || img) return;
      io.disconnect();
      img = new Image();
      img.decoding = "async";
      img.onload = () => setSheet(img);
      img.src = `/frames/${test}/sheet.jpg`;
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => { io.disconnect(); if (img) img.onload = null; };
  }, [test, strip]);

  // draw the picked photo, crisp at the device's pixel ratio
  useEffect(() => {
    const c = canvas.current;
    if (!c || !strip) return;
    const draw = () => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext("2d");
      if (!g) return;
      g.imageSmoothingQuality = "high";
      g.clearRect(0, 0, c.width, c.height);
      if (!sheet) return;
      const [tw, th] = strip.tile;
      const i = idxRef.current;
      g.drawImage(sheet, (i % strip.cols) * tw, Math.floor(i / strip.cols) * th, tw, th, 0, 0, c.width, c.height);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [idx, sheet, strip]);

  // scroll -> photo: the photo follows the track's pinned travel, eased a little so wheel steps don't jump
  useEffect(() => {
    const el = track.current;
    const st = stage.current;
    if (!scrub || !el || !st || !n) return;
    let raf = 0;
    let near = false;
    let cur = idxRef.current;
    const target = () => {
      const r = el.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(st).top) || 0;
      const run = r.height - st.offsetHeight;
      return run > 0 ? clamp01((top - r.top) / run) * (n - 1) : 0;
    };
    const tick = () => {
      raf = 0;
      if (!near || document.hidden) return;
      const t = target();
      cur += (t - cur) * 0.2;
      if (Math.abs(t - cur) < 0.02) cur = t;
      const i = Math.round(cur);
      if (i !== idxRef.current) setIdx(i);
      if (cur !== t) raf = requestAnimationFrame(tick);
    };
    const ask = () => { if (near && !raf && !document.hidden) raf = requestAnimationFrame(tick); };
    const io = new IntersectionObserver(([e]) => { near = e.isIntersecting; ask(); }, { rootMargin: "20% 0px" });
    io.observe(el);
    addEventListener("scroll", ask, { passive: true });
    addEventListener("resize", ask);
    document.addEventListener("visibilitychange", ask);
    return () => { cancelAnimationFrame(raf); io.disconnect(); removeEventListener("scroll", ask); removeEventListener("resize", ask); document.removeEventListener("visibilitychange", ask); };
  }, [scrub, n, test]);

  /** The slider: in scroll mode it moves the page to that photo's place; when still, it picks directly. */
  const pick = (i: number) => {
    const el = track.current;
    const st = stage.current;
    if (!scrub || !el || !st) return setIdx(i);
    const r = el.getBoundingClientRect();
    const top = parseFloat(getComputedStyle(st).top) || 0;
    const run = r.height - st.offsetHeight;
    window.scrollTo({ top: scrollY + r.top - top + (n > 1 ? (i / (n - 1)) * run : 0), behavior: "instant" as ScrollBehavior });
    setIdx(i);
  };

  // the whole edge track as a trace: x = photo number, y = edge position (mm)
  const trace = useMemo(() => {
    const pts = rows.map((r, i) => (r.edge_mm === "" ? null : { i, mm: Number(r.edge_mm) })).filter((p): p is { i: number; mm: number } => p !== null);
    if (pts.length < 2) return null;
    const lo = Math.min(...pts.map((p) => p.mm));
    const hi = Math.max(...pts.map((p) => p.mm));
    const y = (mm: number) => 40 - ((mm - lo) / (hi - lo || 1)) * 36 - 2;
    // break the line where photos have no edge
    let d = "";
    let prev = -2;
    for (const p of pts) { d += `${p.i === prev + 1 ? "L" : "M"}${p.i} ${y(p.mm).toFixed(2)}`; prev = p.i; }
    return { d, y, lo, hi };
  }, [rows]);

  if (!strip || !n || strip.frames !== n) return null;
  const cur = rows[Math.min(idx, n - 1)];
  const has = cur.edge_mm !== "";
  const markX = has ? (strip.a + strip.b * Number(cur.edge_mm)) * 100 : null;
  const showMark = markX !== null && markX >= 0 && markX <= 100;
  const vars = { "--aspect": strip.tile[0] / strip.tile[1] } as CSSProperties;

  return (
    <section className="bscrub" data-element="burn-scrub" data-mode={scrub ? "scroll" : "pick"} aria-labelledby="bscrub-h">
      <div ref={track} className="bscrub-track">
        <div ref={stage} className="bscrub-stage">
          <h3 id="bscrub-h" className="bscrub-h">{scrub ? "Scroll through the burn" : "Step through the burn"}, test {test}</h3>
          <div className="bscrub-frame" style={vars}>
            <canvas ref={canvas} role="img" aria-label={`Tracker overlay photo ${idx + 1} of ${n}, test ${test}`} />
            {showMark && <span className="bscrub-edge" style={{ left: `${markX}%` }} aria-hidden="true" />}
          </div>
          {trace && (
            <svg className="bscrub-trace" viewBox={`0 0 ${n - 1} 40`} preserveAspectRatio="none" aria-hidden="true">
              <path d={trace.d} />
              <line x1={idx} x2={idx} y1={0} y2={40} />
              {has && <circle cx={idx} cy={trace.y(Number(cur.edge_mm))} r={1} />}
            </svg>
          )}
          <div className="bscrub-read">
            <input
              type="range" min={0} max={n - 1} step={1} value={idx}
              onChange={(e) => pick(Number(e.target.value))}
              aria-label={`Photo of test ${test}`}
              aria-valuetext={`Photo ${idx + 1} of ${n}${has ? `, edge ${cur.edge_mm} mm` : ", no edge"}`}
            />
            <p>
              <span className="bscrub-count">{String(idx + 1).padStart(String(n).length, "0")}/{n}</span>
              <span>t <Num source={cell(edgeFile(test), cur._row, "t_s")}>{cur.t_s} s</Num></span>
              <span>{has ? <>edge <Num source={cell(edgeFile(test), cur._row, "edge_mm")}>{cur.edge_mm} mm</Num></> : "no edge kept"}</span>
            </p>
          </div>
        </div>
        {scrub && <div className="bscrub-run" aria-hidden="true" />}
      </div>
    </section>
  );
}
