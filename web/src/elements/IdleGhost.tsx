// Written with AI assistance (Claude Code)
// After about 8 s with no input, a faint line surfaces near the bottom of the screen, "the air is
// still now", and sinks again on any movement. Decoration only (aria-hidden). Once per visit, only
// where nothing to read sits under it, and never under reduced motion or Pause, in a hidden tab, over
// the opening scene, while a field has focus or while a dialog or menu is open.
import { useEffect, useRef } from "react";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./idle-ghost.css";

const IDLE_MS = 8000;
const SEEN = "ignos:still-line";
const TYPING = "input, textarea, select, [contenteditable]:not([contenteditable=false])";
const INPUTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

/** True when the first painted background under (x, y) is dark. */
function darkUnder(x: number, y: number, self: Element): boolean {
  let el: Element | null = document.elementsFromPoint(x, y).find((e) => e !== self && !self.contains(e)) ?? null;
  while (el) {
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    if (m && (m.length < 4 || Number(m[3]) > 0.5)) {
      const [r, g, b] = m.map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
    }
    el = el.parentElement;
  }
  return false;
}

/** True when words, a control, a chart or a picture sit under the line: it waits for a quiet stretch instead. */
function busyUnder(self: HTMLElement): boolean {
  const range = document.createRange();
  range.selectNodeContents(self);
  const r = range.getBoundingClientRect();
  const pad = 12;
  const box = { l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad };
  const meets = (q: DOMRect) => q.width > 0 && q.right > box.l && q.left < box.r && q.bottom > box.t && q.top < box.b;
  const hits = new Set<Element>();
  for (const fy of [0, 0.5, 1]) for (const fx of [0, 0.25, 0.5, 0.75, 1]) {
    const top = document.elementsFromPoint(box.l + (box.r - box.l) * fx, box.t + (box.b - box.t) * fy).find((e) => e !== self && !self.contains(e));
    if (top) hits.add(top);
  }
  for (const top of hits) {
    if (top.closest("svg, canvas, img, video, table, figure, .js-plotly-plot, input, button, select, textarea")) return true;
    // any words inside what sits there that reach the line's box
    const walk = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent!.trim()) continue;
      range.selectNodeContents(n);
      if ([...range.getClientRects()].some(meets)) return true;
    }
  }
  return false;
}

export function IdleGhost() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN) === "1"; } catch { /* storage blocked: once per page load */ }
    if (seen) return;

    let timer = 0, shown = false, done = false, heroInView = true;
    const blocked = () => prefersReduced() || motionPaused() || document.hidden || heroInView
      || !!document.querySelector("dialog[open]") || !!document.activeElement?.matches?.(TYPING);
    const arm = () => { clearTimeout(timer); if (!done) timer = window.setTimeout(surface, IDLE_MS); };
    const surface = () => {
      if (blocked() || busyUnder(el)) { arm(); return; }
      el.dataset.tone = darkUnder(innerWidth / 2, el.getBoundingClientRect().top + el.offsetHeight / 2, el) ? "dark" : "light";
      el.classList.add("is-on");
      shown = true; done = true;
      try { sessionStorage.setItem(SEEN, "1"); } catch { /* once per page load */ }
    };
    const sink = () => {
      el.classList.remove("is-on");
      shown = false;
      INPUTS.forEach((ev) => removeEventListener(ev, onInput));
    };
    const onInput = () => { if (shown) sink(); else arm(); };
    const onMotion = () => { if (shown && blocked()) sink(); else if (!done) arm(); };

    // the opening scene has its own moving flame and headline: the line never joins them
    const hero = document.querySelector(".journey");
    const io = hero ? new IntersectionObserver(([e]) => { heroInView = e.isIntersecting; }) : null;
    if (hero && io) io.observe(hero); else heroInView = false;

    INPUTS.forEach((ev) => addEventListener(ev, onInput, { passive: true }));
    const unwatch = watchMotion(onMotion);
    arm();
    return () => {
      clearTimeout(timer);
      INPUTS.forEach((ev) => removeEventListener(ev, onInput));
      unwatch();
      io?.disconnect();
    };
  }, []);
  return <div ref={ref} className="still-line" aria-hidden="true" data-element="idle-ghost">the air is still now</div>;
}
