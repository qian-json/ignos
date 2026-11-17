// Written with AI assistance (Claude Code)
// Site-wide glide: a mouse wheel or trackpad moves a target, and the page eases toward it every frame
// (about 90 % of the way in 0.4 s), so steps of a wheel become one continuous travel. The page still
// scrolls the window itself: the scrollbar, keys, find-in-page, anchors and touch all stay native, and
// any scroll we did not write takes over at once. Off under reduced motion and the Pause switch, on
// touch-only screens (their own momentum is better) and inside anything that scrolls on its own.
//
// Every frame the page moves, subscribers get one snapshot { y, velocity, max, direction }, the same
// value for everyone in that frame, whether the glide or native scrolling moved it. Scroll-driven
// pieces read that instead of window.scrollY so they follow one continuous position.
import { motionPaused, prefersReduced, watchMotion } from "../elements/motionState";

export interface ScrollFrame {
  /** The page's scroll position this frame, in CSS px. */
  y: number;
  /** Damped speed in px per 60 Hz frame; positive while moving down. */
  velocity: number;
  /** The furthest the page can scroll. */
  max: number;
  direction: -1 | 0 | 1;
  /** True while the glide (not the browser) is moving the page. */
  gliding: boolean;
}

type Listener = (f: ScrollFrame) => void;

const LERP = 0.1;              // share of the remaining distance per 60 Hz frame
const VELOCITY_DAMP = 0.85;    // per 60 Hz frame
const SETTLE = 0.4;            // px: close enough to stop
const STEADY = 4;              // frames with no movement before the loop sleeps

const listeners = new Set<Listener>();
const frame: ScrollFrame = { y: 0, velocity: 0, max: 0, direction: 0, gliding: false };

type Mode = { kind: "idle" } | { kind: "glide"; target: number } | { kind: "tween"; from: number; to: number; t0: number; dur: number; done?: () => void };
let mode: Mode = { kind: "idle" };
let written = -1;              // the last position this module wrote, to tell our scrolls from others'
let raf = 0, last = 0, quiet = 0, held = false, enabled = false;

const maxY = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
const clamp = (v: number) => Math.min(maxY(), Math.max(0, v));
const write = (y: number) => { written = y; window.scrollTo({ top: y, left: scrollX, behavior: "instant" as ScrollBehavior }); };
const easeOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

function tick(now: number) {
  raf = 0;
  const dt = last ? Math.min(64, now - last) : 16.67;
  last = now;
  const steps = dt / 16.67;
  const before = frame.y;

  if (mode.kind === "glide") {
    const m = mode;
    m.target = clamp(m.target);
    const k = 1 - Math.pow(1 - LERP, steps);
    let y = frame.y + (m.target - frame.y) * k;
    if (Math.abs(m.target - y) < SETTLE) { y = m.target; mode = { kind: "idle" }; }
    frame.y = y;
    write(y);
  } else if (mode.kind === "tween") {
    const m = mode;
    const t = Math.min(1, (now - m.t0) / m.dur);
    const y = m.from + (clamp(m.to) - m.from) * easeOut(t);
    frame.y = y;
    write(y);
    if (t >= 1) { mode = { kind: "idle" }; m.done?.(); }
  } else {
    frame.y = scrollY;
  }

  const raw = (frame.y - before) / steps;
  frame.velocity = raw + (frame.velocity - raw) * Math.pow(VELOCITY_DAMP, steps);
  if (Math.abs(frame.velocity) < 0.01) frame.velocity = 0;
  frame.direction = frame.y > before ? 1 : frame.y < before ? -1 : 0;
  frame.max = maxY();
  frame.gliding = mode.kind !== "idle";
  listeners.forEach((fn) => fn(frame));

  quiet = frame.y === before ? quiet + 1 : 0;
  if (mode.kind !== "idle" || frame.velocity !== 0 || quiet < STEADY) raf = requestAnimationFrame(tick);
  else last = 0;
}
const wake = () => { if (!raf) { quiet = 0; raf = requestAnimationFrame(tick); } };

/** Any scroll we did not write (keys, scrollbar, an anchor, another script) wins over the glide. */
function onScroll() {
  if (mode.kind !== "idle" && Math.abs(scrollY - written) > 2) mode = { kind: "idle" };
  wake();
}

/** True when something under the pointer can still scroll this way on its own. */
function innerScroller(start: EventTarget | null, dy: number): boolean {
  for (let el = start instanceof Element ? start : null; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if ((el as HTMLElement).dataset?.nativeScroll !== undefined) return true;
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") continue;
    if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
  }
  return false;
}

function onWheel(e: WheelEvent) {
  if (!enabled || e.defaultPrevented || e.ctrlKey || e.metaKey) return;
  let dy = e.deltaY, dx = e.deltaX;
  if (e.deltaMode === 1) { dy *= 16; dx *= 16; } else if (e.deltaMode === 2) { dy *= innerHeight; dx *= innerWidth; }
  if (Math.abs(dx) > Math.abs(dy) || dy === 0) return;
  if (document.querySelector("dialog[open]") || getComputedStyle(document.documentElement).overflowY === "hidden") return;
  if (innerScroller(e.target, dy)) return;
  e.preventDefault();
  if (held) return;
  const from = mode.kind === "glide" ? mode.target : mode.kind === "tween" ? frame.y : scrollY;
  if (mode.kind !== "glide") frame.y = scrollY;
  mode = { kind: "glide", target: clamp(from + dy) };
  wake();
}

const canGlide = () => !prefersReduced() && !motionPaused() && !matchMedia("(hover: none)").matches;

/** Start the glide and the per-frame snapshot. Returns a function that stops both. */
export function startScroll(): () => void {
  frame.y = scrollY;
  frame.max = maxY();
  const sync = () => {
    enabled = canGlide();
    if (!enabled && mode.kind !== "idle") mode = { kind: "idle" };
    document.documentElement.classList.toggle("glide-on", enabled);
  };
  sync();
  const unwatch = watchMotion(sync);
  const hover = matchMedia("(hover: none)");
  hover.addEventListener("change", sync);
  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", wake, { passive: true });
  return () => {
    unwatch();
    hover.removeEventListener("change", sync);
    removeEventListener("wheel", onWheel);
    removeEventListener("scroll", onScroll);
    removeEventListener("resize", wake);
    cancelAnimationFrame(raf); raf = 0; mode = { kind: "idle" }; enabled = false;
    document.documentElement.classList.remove("glide-on");
  };
}

/** Follow the page's scroll: fn gets the snapshot now and on every frame the page moves. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn({ ...frame, y: scrollY, max: maxY() });
  return () => { listeners.delete(fn); };
}

/** The latest snapshot (read it in your own frame loop instead of subscribing). */
export const getScroll = (): Readonly<ScrollFrame> => frame;

/** Hold the glide still (page transitions): wheel input is swallowed, nothing moves. */
export function holdScroll(on: boolean) {
  held = on;
  if (on) mode = { kind: "idle" };
}

/** Move the page to y: eased when motion is on, at once otherwise or when asked. */
export function scrollToY(y: number, { instant = false } = {}): Promise<void> {
  const to = clamp(y);
  if (instant || !enabled || Math.abs(to - scrollY) < 2) {
    mode = { kind: "idle" };
    write(to);
    frame.y = to;
    wake();
    return Promise.resolve();
  }
  return new Promise((done) => {
    const dist = Math.abs(to - scrollY);
    mode = { kind: "tween", from: scrollY, to, t0: performance.now(), dur: Math.min(1200, 600 + dist * 0.12), done };
    frame.y = scrollY;
    wake();
  });
}

/**
 * Where an element's top sits once the room above it is left: the page's scroll-padding-top (the fixed
 * top bar) or the element's own scroll-margin-top (e.g. a scene under Story's sticky rail), whichever is larger.
 */
export function elementY(el: Element): number {
  const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  return el.getBoundingClientRect().top + scrollY - Math.max(pad, margin);
}

export const scrollToElement = (el: Element, opts?: { instant?: boolean }) => scrollToY(elementY(el), opts);

/** Bring an element into view with the least travel (like block: "nearest"); no move when it already fits. */
export function revealElement(el: Element, opts?: { instant?: boolean }): Promise<void> {
  const r = el.getBoundingClientRect();
  const top = elementY(el);
  const room = r.top + scrollY - top;
  if (r.top < room) return scrollToY(top, opts);
  if (r.bottom > innerHeight) return scrollToY(Math.min(top, scrollY + r.bottom - innerHeight), opts);
  return Promise.resolve();
}
