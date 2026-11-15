// Written with AI assistance (Claude Code)
// The opener of the Ask page: one real BASS-II burn photo (test B16) redrawn as a field of mono characters in
// the site's ink and flame colours, with the page's heading and its one-line purpose over the calm side.
// A few characters change a few times a second so the field reads alive, and the characters under the
// pointer re-roll. The photo's pixels are read once on load; each step redraws only the cells that changed.
// Under the characters lies the photo itself: the pointer melts a soft, uneven hole through the characters
// that shows it, and the hole closes slowly once the pointer leaves (a tap opens one briefly).
// Reduced motion, the Pause switch, a hidden tab or the opener being off screen leave a still drawing, no hole.
import { useEffect, useRef } from "react";
import { PageHeading } from "./PageHeading";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./display-type.css";
import "./flame-glyphs.css";

const PHOTO = "/frames/B16/photo-071-raw.jpg";
// Ramp from empty paper to the densest mark; brightness of the photo picks the level.
const RAMP = [" ", ".", "·", ":", "|", "+", "▪"];
// For a re-roll, the glyphs a cell may swap to at each level (neighbours on the ramp, so tone holds).
const ROLL: string[][] = RAMP.map((_, i) => RAMP.slice(Math.max(1, i - 1), Math.min(RAMP.length, i + 2)));
const STEP_MS = 100;      // ten steps a second
const AMBIENT = 0.02;     // share of drawn cells that change per step
const REACH = 6;          // pointer radius, in cells
const MELT_PX = 64;       // hole radius around the pointer, in CSS pixels (phones use less)
const MELT_GAIN = 0.09;   // how fast a hole opens per frame
const MELT_KEEP = 0.975;  // share of the hole left after each frame (closes slowly)
const LEVELS = 12;        // steps of glyph fade inside a hole

type Tone = "flame" | "warm" | "char" | "faint";
type Cell = { level: number; tone: Tone; warm: string; glyph: string };

function fit(width: number) {
  const phone = width < 640;
  return { cw: phone ? 7 : 8, ch: phone ? 10 : 12, font: phone ? 10 : 13, fx: phone ? 0.5 : 0.72, fy: 0.52, scale: phone ? 0.3 : 0.4 };
}

export function FlameGlyphs() {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current, under = photoRef.current;
    if (!root || !canvas || !under) return;
    const ctx = canvas.getContext("2d");
    const uctx = under.getContext("2d");
    if (!ctx || !uctx) return;
    const mask = document.createElement("canvas");
    const mctx = mask.getContext("2d");
    if (!mctx) return;
    let photo: HTMLImageElement | null = null;
    let place = { x: 0, y: 0, w: 0, h: 0 };          // where the photo sits, in CSS pixels
    let hole = new Float32Array(0);                   // how open each cell is, 0..1
    let shown = new Uint8Array(0);                    // the fade step each cell was last painted with
    let melting = false;                              // any hole still open
    let tapTimer = 0;

    let pixels: ImageData | null = null;
    let cells: Cell[] = [];
    let cols = 0, rows = 0, dpr = 1, layout = fit(1024);
    let colours: Record<Tone, string> = { flame: "#000", warm: "#000", char: "#000", faint: "#000" };
    let raf = 0, last = 0, onScreen = true, alive = true;
    let pointer: { c: number; r: number; x: number; y: number } | null = null;

    const still = () => prefersReduced() || motionPaused();
    const token = (name: string) => getComputedStyle(root).getPropertyValue(name).trim() || "#000";

    function sample(img: ImageData, x: number, y: number) {
      // a 2x2 average around the point, inside the photo; outside it the cell is blank paper
      const xi = Math.floor(x), yi = Math.floor(y);
      if (xi < 0 || yi < 0 || xi >= img.width - 1 || yi >= img.height - 1) return null;
      let r = 0, g = 0, b = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const o = ((yi + dy) * img.width + xi + dx) * 4;
        r += img.data[o]; g += img.data[o + 1]; b += img.data[o + 2];
      }
      return [r / 4, g / 4, b / 4];
    }

    function build() {
      const w = canvas!.clientWidth, h = canvas!.clientHeight;
      layout = fit(root!.clientWidth);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.round(w * dpr); canvas!.height = Math.round(h * dpr);
      cols = Math.ceil(w / layout.cw); rows = Math.ceil(h / layout.ch);
      colours = { flame: token("--flame"), warm: token("--flame-ink"), char: token("--char"), faint: token("--rule") };
      cells = [];
      under!.width = canvas!.width; under!.height = canvas!.height;
      mask.width = Math.max(1, cols); mask.height = Math.max(1, rows);
      hole = new Float32Array(cols * rows); shown = new Uint8Array(cols * rows); melting = false;
      if (!pixels) return;
      // The flame sits near the middle of the frame; scale the photo so its height is a share of the field.
      const s = (h / pixels.height) / layout.scale;
      const cx = pixels.width * 0.38, cy = pixels.height * 0.5;
      place = { x: layout.fx * w - cx * s, y: layout.fy * h - cy * s, w: pixels.width * s, h: pixels.height * s };
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * layout.cw, y = (r + 0.5) * layout.ch;
        const px = sample(pixels, cx + (x - layout.fx * w) / s, cy + (y - layout.fy * h) / s);
        if (!px) { cells.push({ level: 0, tone: "faint", warm: "", glyph: " " }); continue; }
        const [R, G, B] = px;
        const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        let level: number, tone: Tone;
        if (lum < 26) {
          // the dark chamber: a sparse dotted ground, so the photo's frame still reads
          level = (c * 7 + r * 13) % 5 === 0 ? 1 : 0; tone = "faint";
        } else {
          level = Math.min(RAMP.length - 1, 1 + Math.floor(Math.pow((lum - 26) / 229, 0.6) * (RAMP.length - 1)));
          const sat = Math.max(R, G, B) - Math.min(R, G, B);
          tone = sat < 40 ? "char" : B > R ? "flame" : "warm";
        }
        // warm cells keep the photo's own hue, darkened enough to sit on paper
        const warm = tone === "warm" ? `rgb(${Math.round(R * 0.62)},${Math.round(G * 0.42)},${Math.round(B * 0.36)})` : "";
        cells.push({ level, tone, warm, glyph: RAMP[level] });
      }
    }

    function paint(i: number, clear: boolean) {
      const cell = cells[i];
      const c = i % cols, r = (i / cols) | 0;
      const x = c * layout.cw, y = r * layout.ch;
      if (clear) ctx!.clearRect(x, y, layout.cw, layout.ch);
      if (cell.glyph === " " || shown[i] >= LEVELS) return;
      ctx!.globalAlpha = 1 - shown[i] / LEVELS;
      ctx!.fillStyle = cell.tone === "warm" ? cell.warm : colours[cell.tone];
      ctx!.fillText(cell.glyph, x + layout.cw / 2, y + layout.ch / 2);
      ctx!.globalAlpha = 1;
    }

    const ease = (v: number) => { const t = Math.min(1, Math.max(0, (v - 0.18) / 0.5)); return t * t * (3 - 2 * t); };

    // One frame of the hole: open around the pointer with a wobbling edge, close everywhere else,
    // fade the characters by how open their cell is, and show the photo through the same soft mask.
    function melt(now: number) {
      if (!pointer && !melting) return;
      const t = now * 0.001;
      let open = false;
      if (pointer) {
        const R = (layout.cw < 8 ? 0.75 : 1) * MELT_PX;
        const rc = Math.ceil(R * 1.35 / layout.cw), rr = Math.ceil(R * 1.35 / layout.ch);
        for (let r = pointer.r - rr; r <= pointer.r + rr; r++) for (let c = pointer.c - rc; c <= pointer.c + rc; c++) {
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          const dx = (c + 0.5) * layout.cw - pointer.x, dy = (r + 0.5) * layout.ch - pointer.y;
          const a = Math.atan2(dy, dx);
          const edge = R * (1 + 0.22 * Math.sin(a * 3 + t * 1.7) + 0.14 * Math.sin(a * 5 - t * 2.3) + 0.08 * Math.sin(c * 1.7 + r * 2.9));
          const d = Math.sqrt(dx * dx + dy * dy) / edge;
          if (d >= 1) continue;
          const i = r * cols + c;
          hole[i] = Math.min(1, hole[i] + MELT_GAIN * (1 - d) * (1 - d) * 2);
        }
      }
      const img = mctx!.createImageData(cols, rows);
      for (let i = 0; i < hole.length; i++) {
        let v = hole[i];
        if (v > 0) { v *= MELT_KEEP; if (v < 0.01) v = 0; hole[i] = v; if (v > 0) open = true; }
        const e = ease(v);
        img.data[i * 4 + 3] = Math.round(e * 255);
        const q = Math.round(e * LEVELS);
        if (q !== shown[i]) { shown[i] = q; paint(i, true); }
      }
      melting = open;
      mctx!.putImageData(img, 0, 0);
      uctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      uctx!.globalCompositeOperation = "source-over";
      uctx!.clearRect(0, 0, under!.width, under!.height);
      if (!open || !photo) return;
      uctx!.imageSmoothingEnabled = true;
      uctx!.drawImage(mask, 0, 0, cols * layout.cw, rows * layout.ch);
      uctx!.globalCompositeOperation = "source-in";
      uctx!.drawImage(photo, place.x, place.y, place.w, place.h);
      uctx!.globalCompositeOperation = "source-over";
    }

    function closeAll() {
      hole.fill(0); shown.fill(0); melting = false; pointer = null;
      uctx!.setTransform(1, 0, 0, 1, 0, 0);
      uctx!.clearRect(0, 0, under!.width, under!.height);
    }

    function drawAll(reset: boolean) {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.font = `${layout.font}px ${token("--mono") || "monospace"}`;
      ctx!.textAlign = "center"; ctx!.textBaseline = "middle";
      for (let i = 0; i < cells.length; i++) {
        if (reset) cells[i].glyph = RAMP[cells[i].level];
        paint(i, false);
      }
    }

    const roll = (i: number) => {
      const cell = cells[i];
      if (!cell || cell.level === 0) return;
      const opts = ROLL[cell.level];
      cell.glyph = opts[(Math.random() * opts.length) | 0];
      paint(i, true);
    };

    function step() {
      const n = Math.round(cells.length * AMBIENT);
      for (let k = 0; k < n; k++) roll((Math.random() * cells.length) | 0);
      if (pointer) {
        for (let dr = -REACH; dr <= REACH; dr++) for (let dc = -REACH; dc <= REACH; dc++) {
          const c = pointer.c + dc, r = pointer.r + dr;
          if (c < 0 || r < 0 || c >= cols || r >= rows || dc * dc + dr * dr > REACH * REACH) continue;
          if (Math.random() < 0.45) roll(r * cols + c);
        }
      }
    }

    function tick(now: number) {
      raf = 0;
      if (!running()) return;
      if (now - last >= STEP_MS) { last = now; step(); }
      melt(now);
      raf = requestAnimationFrame(tick);
    }
    const running = () => alive && onScreen && !document.hidden && !still() && cells.length > 0;
    function sync() {
      if (running()) { if (!raf) raf = requestAnimationFrame(tick); return; }
      cancelAnimationFrame(raf); raf = 0;
      if (still()) { closeAll(); drawAll(true); } // the calm still: every cell back on its own glyph, no hole
    }

    const relayout = () => { build(); drawAll(true); sync(); };
    const ro = new ResizeObserver(relayout);
    ro.observe(root);
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
    io.observe(root);
    const stopWatch = watchMotion(sync);

    const move = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      const x = e.clientX - b.left, y = e.clientY - b.top;
      const c = Math.floor(x / layout.cw), r = Math.floor(y / layout.ch);
      pointer = c >= -REACH && r >= -REACH && c < cols + REACH && r < rows + REACH ? { c, r, x, y } : null;
    };
    const leave = (e: PointerEvent) => { if (e.pointerType !== "touch") pointer = null; };
    // On touch there is no hover: a tap opens a hole for a moment, then it closes on its own.
    const tap = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || still()) return;
      move(e);
      clearTimeout(tapTimer);
      tapTimer = window.setTimeout(() => { pointer = null; }, 450);
    };
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("pointerdown", tap);

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!alive) return;
      photo = img;
      const off = document.createElement("canvas");
      off.width = img.naturalWidth; off.height = img.naturalHeight;
      const octx = off.getContext("2d");
      if (!octx) return;
      octx.drawImage(img, 0, 0);
      pixels = octx.getImageData(0, 0, off.width, off.height); // read once, never in the loop
      const go = () => { if (alive) relayout(); };
      (document.fonts?.ready ?? Promise.resolve()).then(go, go);
    };
    img.src = PHOTO;

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(tapTimer);
      ro.disconnect(); io.disconnect(); stopWatch();
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("pointerdown", tap);
    };
  }, []);

  return (
    <header ref={rootRef} className="fg-open" data-element="flame-glyphs">
      <div className="fg-field" aria-hidden="true">
        <canvas ref={photoRef} className="fg-photo" />
        <canvas ref={canvasRef} className="fg-chars" />
      </div>
      <div className="fg-words">
        <PageHeading as="h1" meta="Questions" className="t-display-xl" id="ask-title">Ask NASA's fire data</PageHeading>
        <p className="fg-line">Ask in plain words. Answers cite NASA's data and papers, and every number is checked against its source.</p>
        <p className="fg-credit">Drawn from a BASS-II burn photo, test B16, NASA's space-station flame experiment.</p>
      </div>
    </header>
  );
}
