// Written with AI assistance (Claude Code)
// A full-width band of real burn frames (cut from each test's frame sheet, web/public/frames/<test>/sheet.jpg,
// laid out as web/src/data/frames.json says) that drifts sideways and bends like a sheet of paper. Each frame
// is cut into narrow slices; every slice sits on one travelling wave, so the band folds in depth, and the
// wave grows with how fast the page is scrolled, then settles. Decorative, so it is hidden from screen readers.
// Reduced motion and the Pause switch: the band lies flat and still. Off screen or in a hidden tab: no work.
import { useEffect, useRef, type CSSProperties } from "react";
import frames from "../data/frames.json";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./paper-strip.css";

type Strip = { frames: number; cols: number; tile: number[] };
const SLICES = 3;          // slices per frame
const COUNT = 14;          // frames in the loop
const DRIFT = 28;          // px/s sideways at rest
const WAVE = 2.2;          // wavelengths across the viewport
const REST_AMP = 0.18;     // depth of the fold at rest, in band heights
const MAX_AMP = 1.4;       // at full scroll speed
const VEL_NORM = 2400;     // px/s of scroll that counts as full speed

function pickFrames() {
  const strips = frames.strips as Record<string, Strip>;
  const tests = Object.keys(strips);
  const perTest = Math.ceil(COUNT / tests.length);
  return [...Array(COUNT).keys()].map((i) => {
    const t = tests[i % tests.length], s = strips[t];
    const k = Math.floor(i / tests.length);
    const f = Math.round((s.frames - 1) * ((k + 1) / (perTest + 1)));
    return { test: t, col: f % s.cols, row: Math.floor(f / s.cols), cols: s.cols, rows: Math.ceil(s.frames / s.cols), aspect: s.tile[0] / s.tile[1] };
  });
}

export function PaperStrip() {
  const ref = useRef<HTMLDivElement>(null);
  const picks = useRef(pickFrames()).current;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const slices = [...root.querySelectorAll<HTMLElement>(".pps-slice")];
    let raf = 0, last = 0, near = false, offset = 0, vel = 0, amp = REST_AMP, lastY = scrollY, phase = 0;
    const still = () => prefersReduced() || motionPaused();

    const layout = (flat: boolean) => {
      const vw = root.clientWidth, h = root.clientHeight;
      const sw = slices[0]?.offsetWidth ?? 0;
      const L = sw * slices.length;
      const k = (Math.PI * 2 * WAVE) / Math.max(1, vw);
      const A = flat ? 0 : amp * h;
      slices.forEach((el, i) => {
        let x = i * sw - offset;
        x = ((x % L) + L) % L - sw;
        const c = x + sw / 2;
        const z = A * Math.sin(k * c + phase);
        const slope = A * k * Math.cos(k * c + phase);
        const ang = (-Math.atan(slope) * 180) / Math.PI;
        el.style.transform = flat
          ? `translate3d(${x.toFixed(1)}px,0,0)`
          : `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${ang.toFixed(2)}deg)`;
      });
    };

    function tick(now: number) {
      raf = 0;
      if (still()) { layout(true); return; }
      if (document.hidden || !near) { last = 0; return; }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      const y = scrollY, v = dt ? (y - lastY) / dt : 0; lastY = y;
      vel += (v - vel) * Math.min(1, dt * 6);
      const target = REST_AMP + (MAX_AMP - REST_AMP) * Math.min(1, Math.abs(vel) / VEL_NORM);
      amp += (target - amp) * Math.min(1, dt * 4);
      offset += dt * (DRIFT + Math.abs(vel) * 0.25);
      phase += dt * (0.8 + Math.abs(vel) / 600);
      layout(false);
      raf = requestAnimationFrame(tick);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const io = new IntersectionObserver(([e]) => { near = e.isIntersecting; if (near) { lastY = scrollY; kick(); } });
    const stop = watchMotion(kick);
    const onResize = () => (still() ? layout(true) : kick());
    addEventListener("resize", onResize);
    layout(still());
    io.observe(root);
    return () => { cancelAnimationFrame(raf); io.disconnect(); stop(); removeEventListener("resize", onResize); };
  }, []);

  return (
    <div ref={ref} className="pps" aria-hidden="true" data-element="paper-strip">
      <div className="pps-track">
        {picks.flatMap((p, i) =>
          [...Array(SLICES).keys()].map((j) => (
            <span
              key={`${i}-${j}`}
              className="pps-slice"
              style={{
                "--a": p.aspect, "--n": SLICES, "--c": p.col, "--r": p.row, "--cols": p.cols, "--rows": p.rows, "--j": j,
                backgroundImage: `url(/frames/${p.test}/sheet.jpg)`,
              } as CSSProperties}
            />
          )),
        )}
      </div>
    </div>
  );
}
