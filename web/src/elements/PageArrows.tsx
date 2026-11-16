// Written with AI assistance (Claude Code)
// The way out of Home: the site's pages as a column of big words, each one a link. An arrow walks down the
// column as the visitor scrolls past it (whichever word sits at the middle of the screen), or jumps to the word
// under the pointer or the keyboard focus. The arrow follows on a critically damped spring; the word it points
// at slides its letters right to make room (the last letter leaves first, so the word stretches and closes up);
// the other words fade with their distance from it; a ruler of ticks at the left swells beside it.
// No pinning and no scroll capture: the column scrolls past at the page's own pace.
// Reduced motion and the Pause switch: no spring, the arrow and letters jump. Off screen it does no work.
//
//   <PageArrows items={[{ label: "Habitats", href: "/habitats" }, ...]} meta="Keep going" />
import { useEffect, useRef, type MouseEvent } from "react";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./display-type.css";
import "./page-arrows.css";

export type PageLink = { label: string; href: string };
export const SITE_PAGES: PageLink[] = [
  { label: "Story", href: "/story" },
  { label: "Habitats", href: "/habitats" },
  { label: "Ask", href: "/ask" },
  { label: "Research", href: "/research" },
  { label: "Model", href: "/model" },
  { label: "Method", href: "/method" },
];

const RATE = 9;      // spring rate, per second
const LEAD = 0.2;    // how far behind the last letter the first one starts
const TICK = { pitch: 11, rest: 10, full: 20, least: 88, ramp: 55 };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const fade = (d: number) => (d <= 1 ? 1 - 0.4 * d : Math.max(0.1, 0.7 - 0.1 * d));
const swell = (d: number, least: number, ramp: number) => {
  const r = Math.abs(d) - least / 2;
  return r <= 0 ? 1 : r >= ramp ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * r) / ramp);
};
function rgb(css: string): [number, number, number] {
  const m = css.match(/[\d.]+/g);
  if (css.startsWith("#")) { const h = css.slice(1); const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) as [number, number, number]; }
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
}

function pageArrows(root: HTMLElement): () => void {
  const rows = root.querySelector<HTMLElement>(".pa-rows")!;
  const arrow = root.querySelector<HTMLElement>(".pa-arrow")!;
  const lis = [...root.querySelectorAll<HTMLLIElement>(".pa-rows li")];
  const links = lis.map((li) => li.querySelector<HTMLAnchorElement>("a")!);
  const letters = lis.map((li) => [...li.querySelectorAll<HTMLElement>(".pa-letter")]);
  const cv = root.querySelector<HTMLCanvasElement>(".pa-ruler");
  const cx = cv?.getContext("2d") ?? null;
  const n = lis.length;
  const jump = () => prefersReduced() || motionPaused();

  let tops: number[] = [], heights: number[] = [], room = 0, place = 0, pace = 0, on = 0, picked = -1;
  let raf = 0, last = 0, near = false, shown = "";
  let tick0: [number, number, number] = [217, 221, 228], tick1: [number, number, number] = [91, 99, 117];

  const measure = () => {
    tops = lis.map((li) => li.offsetTop); heights = lis.map((li) => li.offsetHeight);
    room = arrow.offsetWidth;
    const cs = getComputedStyle(root);
    tick0 = rgb(cs.getPropertyValue("--pa-tick").trim() || "#d9dde4");
    tick1 = rgb(cs.getPropertyValue("--pa-tick-on").trim() || "#5b6375");
    shown = ""; draw();
  };
  const at = (p: number) => { const i = clamp(Math.floor(p), 0, n - 1), j = Math.min(n - 1, i + 1); return tops[i] + (tops[j] - tops[i]) * (p - i); };
  // which word sits at the middle of the screen
  const fromScroll = () => {
    const r = rows.getBoundingClientRect(), mid = innerHeight * 0.5;
    if (!r.height) return 0;
    return clamp(Math.floor(((mid - r.top) / r.height) * n), 0, n - 1);
  };

  function draw() {
    const key = place.toFixed(4);
    if (key === shown) return;
    shown = key;
    lis.forEach((li, i) => {
      const d = Math.abs(i - place);
      li.style.opacity = fade(d).toFixed(3);
      const c = Math.max(0, 1 - d), ls = letters[i], u = Math.max(1, ls.length - 1);
      ls.forEach((l, k) => {
        const x = room * smooth(c * (1 + LEAD) - (LEAD * (ls.length - 1 - k)) / u);
        l.style.transform = x > 0.05 ? `translateX(${x.toFixed(2)}px)` : "";
      });
    });
    arrow.style.transform = `translateY(${at(place).toFixed(2)}px)`;
    ruler();
  }
  function ruler() {
    if (!cv || !cx) return;
    const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const unit = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16, pitch = TICK.pitch * unit;
    const rr = rows.getBoundingClientRect(), cr = cv.getBoundingClientRect();
    const mid = rr.top - cr.top + at(place) + (heights[0] || 0) / 2;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, w, h);
    const count = Math.floor((h - 1) / pitch) + 1, first = (h - 1 - (count - 1) * pitch) / 2;
    for (let k = 0; k < count; k++) {
      const y = Math.round((first + k * pitch) * dpr) / dpr, s = swell(y + 0.5 - mid, TICK.least * unit, TICK.ramp * unit);
      cx.fillStyle = `rgb(${tick0.map((v, i) => Math.round(v + (tick1[i] - v) * s)).join(",")})`;
      cx.fillRect(0, y, (w * (TICK.rest + (TICK.full - TICK.rest) * s)) / TICK.full, 1);
    }
  }
  function setOn(i: number) {
    if (i === on) return;
    on = i;
    lis.forEach((li, k) => li.classList.toggle("is-on", k === on));
  }
  function tick(now: number) {
    raf = 0;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 1 / 60); last = now;
    setOn(picked >= 0 ? picked : fromScroll());
    if (jump()) { place = on; pace = 0; }
    else {
      const r = place - on, i = pace + RATE * r, e = Math.exp(-RATE * dt);
      place = on + (r + i * dt) * e; pace = (pace - RATE * i * dt) * e;
      if (Math.abs(place - on) < 1e-4 && Math.abs(pace) < 1e-3) { place = on; pace = 0; }
    }
    draw();
    if ((place !== on || pace !== 0) && !document.hidden) raf = requestAnimationFrame(tick); else last = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  const onScroll = () => { if (near && picked < 0) kick(); };

  const ac = new AbortController();
  const opt = { signal: ac.signal, passive: true } as AddEventListenerOptions;
  addEventListener("scroll", onScroll, opt);
  lis.forEach((li, i) => {
    li.addEventListener("pointerenter", (e) => { if ((e as PointerEvent).pointerType === "mouse") { picked = i; kick(); } }, opt);
    links[i].addEventListener("focus", () => { picked = i; kick(); }, opt);
    links[i].addEventListener("blur", () => { picked = -1; kick(); }, opt);
  });
  rows.addEventListener("pointerleave", () => { if (!rows.contains(document.activeElement)) { picked = -1; kick(); } }, opt);
  const io = new IntersectionObserver(([e]) => { near = e.isIntersecting; if (near) kick(); }, { rootMargin: "20% 0px" });
  io.observe(root);
  const ro = new ResizeObserver(() => { measure(); kick(); });
  ro.observe(root);
  const stop = watchMotion(kick);
  document.fonts?.ready.then(() => { if (!ac.signal.aborted) { measure(); kick(); } });
  measure(); on = fromScroll(); place = on; lis.forEach((li, k) => li.classList.toggle("is-on", k === on)); shown = ""; draw();

  return () => { cancelAnimationFrame(raf); ac.abort(); io.disconnect(); ro.disconnect(); stop(); };
}

export function PageArrows({ items = SITE_PAGES, meta, label = "Pages", id = "page-arrows", onPick }: {
  items?: PageLink[]; meta?: string; label?: string; id?: string;
  /** For a client-side router: called on click; call e.preventDefault() to take over. */
  onPick?: (href: string, e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const sig = items.map((p) => p.label + p.href).join("|");
  useEffect(() => (ref.current ? pageArrows(ref.current) : undefined), [sig]);
  return (
    <nav ref={ref} className="pa" data-element="page-arrows" id={id} aria-label={label}>
      <div className="pa-body">
        <canvas className="pa-ruler" aria-hidden="true" />
        <div className="pa-rows">
          <span className="pa-arrow" aria-hidden="true">{"→"}</span>
          <ul>
            {items.map((p) => (
              <li key={p.href}>
                <a className="pa-link" href={p.href} onClick={onPick ? (e) => onPick(p.href, e) : undefined}>
                  <span className="pa-sr">{p.label}</span>
                  <span className="pa-word" aria-hidden="true">
                    {[...p.label].map((c, i) => <span className="pa-letter" key={i}>{c}</span>)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
