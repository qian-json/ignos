// Written with AI assistance (Claude Code)
// The Model page's header picture: one real burn photo from NASA's B16 run, rebuilt from its own pixels as
// points of light. Moving the pointer over the header lets an airflow (left to right) lift the flame
// away as glowing dust; when the pointer rests, the dust settles back into the photo. With nothing
// happening, the flame's downstream edge sheds a little, so the picture is never quite still.
// Reduced motion or the Pause switch: one calm still, the photo half-dissolved. The loop stops off screen
// and in hidden tabs. Canvas 2D, written straight into an ImageData buffer, so it runs without WebGL.
import { useEffect, useRef } from "react";
import frames from "../data/frames.json";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./gold-dust.css";

interface FramePhoto { photo: number; raw: string }
const PAIRS = (frames as unknown as { pairs: { test: string; photos: FramePhoto[] } }).pairs;
/** The middle photo of the pair set: the flame fully developed. */
const PHOTO = PAIRS.photos[Math.floor(PAIRS.photos.length / 2)];

const REST = 0.16;       // how far the picture is dissolved with nobody moving
const STILL_LEVEL = 0.5; // the reduced-motion still: half-dissolved
const MAX_POINTS = 26000;

interface Cloud {
  n: number;
  hx: Float32Array; hy: Float32Array;       // home, in buffer pixels
  r: Uint8Array; g: Uint8Array; b: Uint8Array;
  thr: Float32Array; seed: Float32Array; speed: Float32Array;
  w: number; h: number; drift: number;
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Lays the photo into a buffer of w × h and keeps every pixel bright enough to be part of the flame. */
function buildCloud(img: HTMLImageElement, w: number, h: number, phone: boolean): Cloud {
  // where the flame sits in the photo (fraction of its width and height) and where it goes on screen
  const fx = 0.37, fy = 0.5;
  // phone: the flame gets its own band under the text (the stylesheet reserves it), 190 buffer px tall
  const ph = phone ? 190 : h * 1.05;
  const pw = ph * (img.naturalWidth / img.naturalHeight);
  const cx = phone ? w * 0.4 : w * 0.7, cy = phone ? h - 62 : h * 0.5;
  const left = cx - fx * pw, top = cy - fy * ph;
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const c = off.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(img, left, top, pw, ph);
  const px = c.getImageData(0, 0, w, h).data;
  // count first, so the step keeps the point count bounded
  let bright = 0, bx0 = w, bx1 = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (Math.max(px[i], px[i + 1], px[i + 2]) <= 46) continue;
    bright++;
    const x = (i >> 2) % w;
    if (x < bx0) bx0 = x;
    if (x > bx1) bx1 = x;
  }
  const step = Math.max(1, Math.ceil(Math.sqrt(bright / MAX_POINTS)));
  const cap = Math.ceil(bright / (step * step)) + w + h;
  const hx = new Float32Array(cap), hy = new Float32Array(cap);
  const r = new Uint8Array(cap), g = new Uint8Array(cap), b = new Uint8Array(cap);
  const thr = new Float32Array(cap), seed = new Float32Array(cap), speed = new Float32Array(cap);
  let n = 0;
  const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(w, Math.ceil(left + pw));
  const span = Math.max(1, bx1 - bx0);
  for (let y = 0; y < h; y += step) {
    for (let x = x0; x < x1; x += step) {
      const k = (y * w + x) * 4;
      const m = Math.max(px[k], px[k + 1], px[k + 2]);
      if (m <= 46 || n >= cap) continue;
      hx[n] = x; hy[n] = y;
      r[n] = px[k]; g[n] = px[k + 1]; b[n] = px[k + 2];
      const s = Math.random();
      // the downstream (right) edge lets go first, the upstream edge last
      thr[n] = Math.max(0, 1 - (x - bx0) / span) * 0.62 + s * 0.3;
      seed[n] = Math.random();
      speed[n] = 0.05 + Math.random() * 0.09;
      n++;
    }
  }
  return { n, hx, hy, r, g, b, thr, seed, speed, w, h, drift: w - (left + fx * pw) };
}

/** Draws the cloud at dissolve level `level` and time `t` (seconds) into `out`. */
function paint(cl: Cloud, out: ImageData, level: number, t: number, phone: boolean) {
  const d = out.data, w = cl.w, h = cl.h;
  d.fill(0);
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  const amp = h * (phone ? 0.05 : 0.07);
  const gain = phone ? 0.55 : 0.9;
  for (let i = 0; i < cl.n; i++) {
    const p = smooth(cl.thr[i], cl.thr[i] + 0.22, level);
    let x = cl.hx[i], y = cl.hy[i], a = gain, glow = 0;
    if (p > 0) {
      const ph = (t * cl.speed[i] + cl.seed[i]) % 1;           // where this mote is on its trip downstream
      const travel = p * ph;
      x += travel * cl.drift * (0.55 + cl.seed[i] * 0.6);
      y += Math.sin(ph * 5.5 + cl.seed[i] * 40 + t * 0.6) * amp * travel;
      a *= 1 - travel * 0.92;
      glow = p;
    }
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= w || yi >= h || a <= 0.01) continue;
    // loose dust warms toward gold
    const rr = (cl.r[i] + (255 - cl.r[i]) * glow * 0.55) * a;
    const gg = (cl.g[i] + (196 - cl.g[i]) * glow * 0.55) * a;
    const bb = (cl.b[i] + (96 - cl.b[i]) * glow * 0.55) * a;
    const k = (yi * w + xi) * 4;
    d[k] += rr; d[k + 1] += gg; d[k + 2] += bb; // Uint8ClampedArray: additive, clamped at white
  }
}

export function GoldDust() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const host = root.parentElement ?? root;
    let cloud: Cloud | null = null, out: ImageData | null = null, phone = false;
    let img: HTMLImageElement | null = null;
    let raf = 0, visible = true, alive = true;
    let level = 1, target = REST, lastMove = -1e9, t0 = performance.now();

    const still = () => prefersReduced() || motionPaused();
    const running = () => visible && !document.hidden && !still();

    const layout = () => {
      if (!img) return;
      const rect = root.getBoundingClientRect();
      // half resolution: the browser's upscale softens every point into a small glow
      const w = Math.max(2, Math.round(rect.width / 2)), h = Math.max(2, Math.round(rect.height / 2));
      phone = rect.width < 700;
      canvas.width = w; canvas.height = h;
      cloud = buildCloud(img, w, h, phone);
      out = ctx.createImageData(w, h);
    };

    const drawStill = () => {
      if (!cloud || !out) return;
      paint(cloud, out, STILL_LEVEL, 3.2, phone);
      ctx.putImageData(out, 0, 0);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive || !cloud || !out) return;
      if (!running()) { drawStill(); return; }
      const t = (now - t0) / 1000;
      // the pointer at rest: the dust drifts home
      if (now - lastMove > 450) target += (REST - target) * 0.035;
      level += (target - level) * (target > level ? 0.08 : 0.025);
      paint(cloud, out, level, t, phone);
      ctx.putImageData(out, 0, 0);
      raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!alive) return;
      if (running()) { if (!raf) raf = requestAnimationFrame(frame); }
      else { if (raf) { cancelAnimationFrame(raf); raf = 0; } drawStill(); }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const v = Math.min(1, Math.hypot(e.movementX, e.movementY) / 40);
      target = Math.min(0.95, target + v * 0.09);
      lastMove = performance.now();
    };
    // a tap on a phone stirs the dust once, then it settles
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      target = Math.min(0.95, target + 0.45);
      lastMove = performance.now();
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerdown", onDown);

    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; kick(); })
      : null;
    io?.observe(root);
    let resizeT = 0;
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => { clearTimeout(resizeT); resizeT = window.setTimeout(() => { layout(); kick(); if (!running()) drawStill(); }, 120); })
      : null;
    const stopWatch = watchMotion(kick);

    const load = new Image();
    load.decoding = "async";
    load.onload = () => {
      if (!alive) return;
      img = load;
      layout();
      t0 = performance.now();
      level = still() ? STILL_LEVEL : 1; // arrives as dust and gathers into the photo
      ro?.observe(root);
      root.dataset.ready = "";
      kick();
    };
    load.src = PHOTO.raw;

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(resizeT);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onDown);
      io?.disconnect(); ro?.disconnect(); stopWatch();
    };
  }, []);

  return (
    <div ref={rootRef} className="gdust" data-element="gold-dust">
      <canvas ref={canvasRef} className="gdust-canvas" aria-hidden="true" />
      <p className="gdust-cap t-meta">Burn {PAIRS.test}, NASA photo {PHOTO.photo}, redrawn as points of light</p>
    </div>
  );
}
