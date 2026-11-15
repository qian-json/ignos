// Written with AI assistance (Claude Code)
// The Home page's film: a Blender render (an illustration, not a measurement) of a flame creeping
// along an acrylic rod in a small flow duct while the fans run, slow down and stop. A sticky stage
// sits over a tall scroll track and scroll position maps linearly to a fractional frame, so every
// pixel of scroll moves the film (no dead zones, no snapping). A critically damped spring smooths the
// playhead so wheel notches and trackpads both feel continuous, and the two nearest frames are
// cross-blended on one canvas. Frames load progressively (frame 1 at once as the poster, then every
// 8th, every 4th, every 2nd, the rest) and the nearest loaded frame is always drawn, so it never waits.
// Reduced motion or the site's Pause switch: no scrubbing; the poster and the chapters as a list.
// Scenes and anchors come from scripts/film/scene.py; frames and manifest from scripts/film/encode.py.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import "./film.css";

export const FILM_BASE = "/film";
/** First frame of the film (the poster), as WebP for the page and JPEG for link previews. */
export const FILM_POSTER = `${FILM_BASE}/desktop/001.webp`;
export const FILM_POSTER_JPG = `${FILM_BASE}/poster.jpg`;

export type FilmAnchorName = "fan" | "rod" | "duct" | "airflow" | "flame";
/** Per frame: [x, y, inFrame], x and y in 0..1 of the rendered frame (y down). */
type AnchorTrack = [number, number, number][];
type FrameSet = { dir: string; width: number; height: number; poster: string; anchors: Record<string, AnchorTrack>; bytes?: number };
export type FilmManifest = FrameSet & {
  illustration: true;
  frames: number;
  fps: number;
  ext: string;
  pad: number;
  posterJpg: string;
  beats: { name: string; frame: number }[];
  labelFrames: Record<string, [number, number]>;
  phone?: FrameSet;
};

export type FilmChapter = {
  /** A beat name from the manifest ("approach", "fans-full", "fans-down", "fans-off", "calm") or a 1-based frame. */
  atBeat: string | number;
  node: ReactNode;
};

/** Where an anchor sits on the stage right now, in CSS pixels from the stage's top left. */
export type FilmAnchor = { x: number; y: number; visible: boolean };
export type FilmFrameState = { frame: number; progress: number; anchors: Record<FilmAnchorName, FilmAnchor> };

const DEFAULT_LABELS: Record<FilmAnchorName, string> = {
  duct: "Flow duct",
  fan: "Fan",
  airflow: "Airflow",
  rod: "Acrylic rod",
  flame: "Flame front",
};
const NAMES = Object.keys(DEFAULT_LABELS) as FilmAnchorName[];
/** When labels collide, the earlier one wins. */
const PRIORITY: FilmAnchorName[] = ["flame", "duct", "airflow", "rod", "fan"];

let manifestPromise: Promise<FilmManifest> | null = null;
/** The film's manifest (fetched once, shared). */
export function loadFilmManifest(): Promise<FilmManifest> {
  manifestPromise ??= fetch(`${FILM_BASE}/manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`film manifest ${r.status}`);
    return r.json() as Promise<FilmManifest>;
  });
  manifestPromise.catch(() => { manifestPromise = null; });
  return manifestPromise;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** An anchor at a fractional frame, mapped to stage pixels for a cover-fitted frame. */
export function anchorAt(set: FrameSet, name: string, frame: number, stageW: number, stageH: number): FilmAnchor {
  const tr = set.anchors[name];
  if (!tr || !tr.length) return { x: 0, y: 0, visible: false };
  const i0 = clamp(Math.floor(frame), 0, tr.length - 1), i1 = Math.min(tr.length - 1, i0 + 1), t = frame - i0;
  const a = tr[i0], b = tr[i1];
  const fx = a[0] + (b[0] - a[0]) * t, fy = a[1] + (b[1] - a[1]) * t;
  const s = Math.max(stageW / set.width, stageH / set.height);
  const x = (stageW - set.width * s) / 2 + fx * set.width * s;
  const y = (stageH - set.height * s) / 2 + fy * set.height * s;
  const visible = !!a[2] && !!b[2] && x > 12 && x < stageW - 12 && y > 12 && y < stageH - 12;
  return { x, y, visible };
}

/** True while the film should hold still: the reader asked for less motion, or paused the site's motion. */
function useHoldStill(): boolean {
  const read = () =>
    (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) ||
    (typeof document !== "undefined" && document.documentElement.dataset.motion === "paused");
  const [still, setStill] = useState(read);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(read());
    mq.addEventListener("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    update();
    return () => { mq.removeEventListener("change", update); mo.disconnect(); };
  }, []);
  return still;
}

/** Progressive frame loader: poster first, then coarse-to-fine, a few requests at a time. */
class FrameStore {
  imgs: (HTMLImageElement | null)[];
  private order: number[];
  private next = 0;
  private inflight = 0;
  private stopped = false;
  constructor(private urls: string[], private onReady: (i: number) => void, private parallel = 6) {
    const n = urls.length;
    this.imgs = new Array(n).fill(null);
    const seen = new Set<number>(), order: number[] = [];
    for (const step of [8, 4, 2, 1]) for (let i = 0; i < n; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
    if (!seen.has(n - 1)) order.splice(1, 0, n - 1);
    this.order = order;
  }
  /** Load frame 1 only (the poster). */
  first() { this.load(this.order[0]); this.next = Math.max(this.next, 1); }
  /** Load the rest, never more than `parallel` at once. */
  all() { this.pump(); }
  stop() { this.stopped = true; }
  private pump() {
    while (!this.stopped && this.inflight < this.parallel && this.next < this.order.length) this.load(this.order[this.next++]);
  }
  private load(i: number) {
    if (this.imgs[i] || this.stopped) return;
    this.inflight++;
    const img = new Image();
    img.decoding = "async";
    img.src = this.urls[i];
    const done = (ok: boolean) => {
      this.inflight--;
      if (this.stopped) return;
      if (ok) { this.imgs[i] = img; this.onReady(i); }
      this.pump();
    };
    img.decode().then(() => done(true), () => done(img.complete && img.naturalWidth > 0));
  }
  /** The loaded frame nearest to i (searching outward), or null when nothing has loaded. */
  nearest(i: number): HTMLImageElement | null {
    const n = this.imgs.length;
    if (this.imgs[i]) return this.imgs[i];
    for (let d = 1; d < n; d++) {
      const a = this.imgs[i - d], b = this.imgs[i + d];
      if (a) return a;
      if (b) return b;
    }
    return null;
  }
}

type Props = {
  chapters: FilmChapter[];
  /** Smoothed progress through the film, 0..1. */
  onProgress?: (p: number) => void;
  /** Every drawn frame: the frame, progress and the anchors in stage pixels (for custom labels). */
  onFrame?: (s: FilmFrameState) => void;
  /** Draw the built-in labels that ride the film (true by default). */
  labels?: boolean;
  /** Replace the built-in label text. */
  labelText?: Partial<Record<FilmAnchorName, string>>;
  /** Scroll length of the film in viewport heights, including the one it's pinned for (default 5). */
  length?: number;
  /** Described for screen readers. */
  ariaLabel?: string;
  className?: string;
  /** Extra content pinned on the stage with the film (a live readout, say). */
  overlay?: ReactNode;
};

const DESCRIPTION =
  "Illustration: a small flow duct floating in orbit. The camera moves in through its open end and along a thin acrylic rod to a blue flame creeping against the airflow. As the fans slow and stop, the flame shortens and dims to a small glow.";

export function ScrollFilm({ chapters, onProgress, onFrame, labels = true, labelText, length = 5, ariaLabel = DESCRIPTION, className, overlay }: Props) {
  const still = useHoldStill();
  const [manifest, setManifest] = useState<FilmManifest | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadFilmManifest().then((m) => live && setManifest(m), () => live && setFailed(true));
    return () => { live = false; };
  }, []);

  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const endId = `film-end-${uid}`;

  // chapter windows in 0-based frames: from its beat to the next chapter's beat
  const windows = useMemo(() => {
    const n = manifest?.frames ?? 1;
    const at = (b: string | number) => {
      if (typeof b === "number") return clamp(b - 1, 0, n - 1);
      const beat = manifest?.beats.find((x) => x.name === b);
      return beat ? clamp(beat.frame - 1, 0, n - 1) : 0;
    };
    const starts = chapters.map((c) => at(c.atBeat));
    return chapters.map((_, i) => {
      const later = starts.filter((s) => s > starts[i]);
      return [starts[i], later.length ? Math.min(...later) : n - 1 + 1e-6] as [number, number];
    });
  }, [chapters, manifest]);

  // held still, the first chapter (the opening words) leads, above the poster; the rest follow it
  const lists = (
    <ol className="film-still-list">
      {chapters.slice(1).map((c, i) => <li key={i}>{c.node}</li>)}
    </ol>
  );

  if (still || failed) {
    return (
      <div className={`film film-still${className ? ` ${className}` : ""}`}>
        {chapters[0] && <div className="film-still-lead">{chapters[0].node}</div>}
        <figure className="film-still-figure">
          <img src={manifest ? `${FILM_BASE}/${manifest.poster}` : FILM_POSTER} alt={ariaLabel} width={1600} height={900} />
        </figure>
        {overlay}
        {lists}
      </div>
    );
  }

  return (
    <Scrubber
      manifest={manifest}
      chapters={chapters}
      windows={windows}
      onProgress={onProgress}
      onFrame={onFrame}
      labels={labels}
      labelText={{ ...DEFAULT_LABELS, ...labelText }}
      length={length}
      ariaLabel={ariaLabel}
      className={className}
      endId={endId}
      overlay={overlay}
    />
  );
}

type ScrubProps = {
  manifest: FilmManifest | null;
  chapters: FilmChapter[];
  windows: [number, number][];
  onProgress?: (p: number) => void;
  onFrame?: (s: FilmFrameState) => void;
  labels: boolean;
  labelText: Record<FilmAnchorName, string>;
  length: number;
  ariaLabel: string;
  className?: string;
  endId: string;
  overlay?: ReactNode;
};

function Scrubber({ manifest, chapters, windows, onProgress, onFrame, labels, labelText, length, ariaLabel, className, endId, overlay }: ScrubProps) {
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const chapterEls = useRef<(HTMLDivElement | null)[]>([]);
  const labelEls = useRef<Partial<Record<FilmAnchorName, HTMLDivElement | null>>>({});
  const [drawn, setDrawn] = useState(false);
  // callbacks change every render; the loop reads the latest through refs
  const cb = useRef({ onProgress, onFrame, windows });
  cb.current = { onProgress, onFrame, windows };

  // the set is picked once: the portrait set on narrow portrait screens when it exists
  const set: FrameSet | null = useMemo(() => {
    if (!manifest) return null;
    const portrait = typeof window !== "undefined" && window.innerWidth < 720 && window.innerHeight > window.innerWidth;
    return portrait && manifest.phone ? manifest.phone : manifest;
  }, [manifest]);

  useEffect(() => {
    if (!manifest || !set) return;
    const tr = track.current!, st = stage.current!, cv = canvas.current!;
    const ctx = cv.getContext("2d", { alpha: false });
    if (!ctx) return;
    const n = manifest.frames;
    const url = (i: number) => `${FILM_BASE}/${set.dir}/${String(i + 1).padStart(manifest.pad, "0")}.${manifest.ext}`;
    const urls = Array.from({ length: n }, (_, i) => url(i));

    // spring state, in frames
    let x = 0, v = 0, target = 0, first = true;
    let raf = 0, last = 0, onScreen = true, dirty = true;
    let drawnX = -1, w = 0, h = 0;
    const OMEGA = 12;   // critically damped: settles in about a third of a second

    const store = new FrameStore(urls, (i) => {
      if (Math.abs(i - x) < 12 || i === 0) { dirty = true; kick(); }
    });
    store.first();

    const resize = () => {
      const r = st.getBoundingClientRect();
      w = r.width; h = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // no point drawing much past the frames' own resolution
      const scale = Math.min(dpr, (set.width * 1.25) / Math.max(1, w));
      cv.width = Math.max(1, Math.round(w * Math.max(1, scale)));
      cv.height = Math.max(1, Math.round(h * Math.max(1, scale)));
      dirty = true;
      kick();
    };

    const readTarget = () => {
      const r = tr.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? clamp(-r.top / span) : 0;
      return p * (n - 1);
    };

    const cover = (img: HTMLImageElement, alpha: number) => {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const s = Math.max(cv.width / iw, cv.height / ih);
      const dw = iw * s, dh = ih * s;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
    };

    const draw = () => {
      const i0 = clamp(Math.floor(x), 0, n - 1), i1 = Math.min(n - 1, i0 + 1), t = x - i0;
      const a = store.nearest(i0), b = store.nearest(i1);
      if (!a) return;
      cover(a, 1);
      if (b && b !== a && t > 0.004) cover(b, t);
      ctx.globalAlpha = 1;
      if (!drawnFlag) { drawnFlag = true; setDrawn(true); }
      st.dataset.frame = x.toFixed(2);

      // chapters: rise and fade inside their windows
      const ws = cb.current.windows;
      chapterEls.current.forEach((el, i) => {
        if (!el || !ws[i]) return;
        const [s, e] = ws[i];
        const span = e - s, F = Math.max(2, Math.min(9, span / 4));
        const fin = s <= 0 ? 1 : clamp((x - s) / F);
        const fout = e >= n - 1 ? 1 : clamp((e - x) / F);
        const o = Math.min(fin, fout) * (x >= s - 0.001 && x < e ? 1 : 0);
        const rise = (1 - fin) * 18 - (1 - fout) * 10;
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translate3d(0, ${rise.toFixed(1)}px, 0)`;
        el.dataset.active = o > 0.5 ? "true" : "false";
      });

      // labels riding the film, placed in priority order; one that would overlap a label already
      // shown stays hidden (on a phone the apparatus is small and the names would pile up)
      const anchors = {} as Record<FilmAnchorName, FilmAnchor>;
      const placed: [number, number, number, number][] = [];
      // the chapter text on screen counts as taken, so no label sits under a heading
      if (labels) {
        const sr = st.getBoundingClientRect();
        chapterEls.current.forEach((el) => {
          if (!el || el.style.opacity === "0" || el.style.opacity === "0.000") return;
          for (const c of el.children) {
            const r = c.getBoundingClientRect();
            if (r.width && r.height) placed.push([r.left - sr.left - 8, r.top - sr.top - 8, r.right - sr.left + 8, r.bottom - sr.top + 8]);
          }
        });
      }
      for (const name of PRIORITY) {
        const an = anchorAt(set, name, x, w, h);
        anchors[name] = an;
        const el = labelEls.current[name];
        if (!el) continue;
        const win = manifest.labelFrames[name];
        const fx = x + 1;
        // fade over 5 frames at a window's edges, except at the film's own start and end
        const inWin = win ? Math.min(win[0] <= 1 ? 1 : clamp((fx - win[0]) / 5), win[1] >= n ? 1 : clamp((win[1] - fx) / 5)) : 1;
        let o = an.visible ? inWin : 0;
        const left = an.x > w * 0.66;
        if (o > 0.01) {
          const bw = (labelWidth[name] ||= (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) + 10;
          const box: [number, number, number, number] = [left ? an.x - bw : an.x - 4, an.y - 10, left ? an.x + 4 : an.x + bw, an.y + 10];
          if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) o = 0;
          else placed.push(box);
        }
        el.style.opacity = o.toFixed(3);
        el.style.visibility = o > 0.01 ? "visible" : "hidden";
        el.dataset.side = left ? "left" : "right";
        el.style.transform = `translate3d(${an.x.toFixed(1)}px, ${an.y.toFixed(1)}px, 0)`;
      }
      const progress = n > 1 ? x / (n - 1) : 0;
      cb.current.onProgress?.(progress);
      cb.current.onFrame?.({ frame: x, progress, anchors });
    };
    let drawnFlag = false;
    const labelWidth: Partial<Record<FilmAnchorName, number>> = {};

    const tick = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.064, (now - last) / 1000) : 1 / 60;
      last = now;
      target = readTarget();
      if (first) { x = target; v = 0; first = false; dirty = true; }
      else {
        // exact step of a critically damped spring toward the target
        const d = x - target, e = Math.exp(-OMEGA * dt), c = v + OMEGA * d;
        x = target + (d + c * dt) * e;
        v = (v - OMEGA * c * dt) * e;
      }
      const settled = Math.abs(x - target) < 0.002 && Math.abs(v) < 0.01;
      if (settled) { x = target; v = 0; }
      if (dirty || Math.abs(x - drawnX) > 0.0005) { draw(); drawnX = x; dirty = false; }
      if (!settled && onScreen && !document.hidden) raf = requestAnimationFrame(tick);
      else last = 0;
    };
    function kick() {
      if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver((es) => {
      onScreen = es.some((e) => e.isIntersecting);
      if (onScreen) { store.all(); kick(); }
    }, { rootMargin: "100% 0px" });
    io.observe(tr);
    const ro = new ResizeObserver(resize);
    ro.observe(st);
    const onScroll = () => kick();
    const onVis = () => { if (!document.hidden) { dirty = true; kick(); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    resize();
    return () => {
      store.stop();
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [manifest, set, labels]);

  // keyboard: focusing something inside a chapter scrolls the film to that chapter
  const focusChapter = (i: number) => {
    const tr = track.current, ws = windows[i];
    if (!tr || !ws || !manifest) return;
    const r = tr.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    const s = ws[0], e = Math.min(ws[1], manifest.frames - 1);
    const mid = s + Math.min(8, (e - s) / 2);
    const top = window.scrollY + r.top + (mid / Math.max(1, manifest.frames - 1)) * span;
    if (Math.abs(window.scrollY - top) > 4) window.scrollTo({ top, behavior: "auto" });
  };

  const poster = set ? `${FILM_BASE}/${set.poster}` : FILM_POSTER;
  return (
    <div className={`film${className ? ` ${className}` : ""}`}>
      <div className="film-track" ref={track} style={{ ["--film-length" as string]: length }}>
        <div className="film-stage" ref={stage} data-drawn={drawn ? "" : undefined}>
          <div className="film-media" role="img" aria-label={ariaLabel}>
            <img className="film-poster" src={poster} alt="" decoding="async" />
            <canvas className="film-canvas" ref={canvas} aria-hidden="true" />
          </div>
          <div className="film-shade" aria-hidden="true" />
          {labels && (
            <div className="film-labels" aria-hidden="true">
              {NAMES.map((name) => (
                <div key={name} className="film-label" ref={(el) => { labelEls.current[name] = el; }}>
                  <span className="film-label-body">
                    <span className="film-label-line" />
                    <span className="film-label-text">{labelText[name]}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {overlay}
          <a className="film-skip" href={`#${endId}`}>Skip the film</a>
          <div className="film-chapters">
            {chapters.map((c, i) => (
              <div
                key={i}
                className="film-chapter"
                data-active={i === 0 ? "true" : "false"}
                style={{ opacity: i === 0 ? 1 : 0 }}
                ref={(el) => { chapterEls.current[i] = el; }}
                onFocus={() => focusChapter(i)}
              >
                {c.node}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div id={endId} className="film-end" tabIndex={-1} />
    </div>
  );
}
