// Written with AI assistance (Claude Code)
// One way in for each kind of thing on the page, so the same kind always arrives the same way:
//   charts   fade in while a wipe uncovers them from the left edge
//   figures  the number counts up from 0 to the value already printed (read from the page, never typed)
//   pictures img and canvas inside a figure are uncovered from the bottom edge
//   lists    the first 8 items rise in one after another; the rest come with the 8th
// Mounted once next to <App/>. It scans the page after the first render and watches for content that
// mounts later (an opened "More" toggle, a chart that draws late). Each thing enters once, when it
// scrolls in; whatever is on the first screen at load, or in the opening scene, is left finished.
// While something waits it is only transparent: it keeps its place and screen readers still read it.
// Reduced motion, the Pause switch and hidden tabs: everything shows at its end state at once.
import { useEffect } from "react";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./entrances.css";

type Kind = "chart" | "figure" | "picture" | "list";

/** Places that move on their own (or must never move): nothing inside them is touched. */
const SKIP = [
  ".journey", "header.top", "footer", "nav", "table", ".pop", "[hidden]", "[role=status]", "[aria-live]", "[data-arrive-skip]",
  '[data-element]:not([data-element="rising-fill"]):not([data-element="provenance-line"]):not([data-element="row-spotlight"])',
].join(", ");
const MAX_STAGGER = 8;
const STEP_MS = 55;
const IN_VIEW = 0.9; // a unit whose top is above 90% of the first screen is part of the first screen
// a number standing on its own: never the digit of a name like "O2" or "PSI-25"
const NUM_RE = /(?<![A-Za-z\d.,-])\d[\d,]*(?:\.\d+)?(?![A-Za-z\d])/g;
const FIG_SPACE = " "; // as wide as a digit in tabular figures, so a counting number keeps its width

const skipped = (el: Element) => !!el.closest(SKIP);
const hasDigit = (el: Element) => /\d/.test(el.textContent ?? "");

/** Every unit inside `root` (an element or the whole document), each with its kind. */
function collect(root: ParentNode): [Element, Kind][] {
  const out: [Element, Kind][] = [];
  const all = (sel: string) => [...(root instanceof Element && root.matches(sel) ? [root] : []), ...root.querySelectorAll(sel)];
  for (const el of all(".js-plotly-plot")) if (!skipped(el)) out.push([el, "chart"]);
  for (const el of all("figure img, figure canvas")) if (!skipped(el) && !el.closest(".js-plotly-plot")) out.push([el, "picture"]);
  for (const el of all("main section ul, main section ol")) {
    if (skipped(el) || el.parentElement?.closest("li") || !el.querySelector(":scope > li")) continue;
    out.push([el, "list"]);
  }
  // figures: a .num, or a sourced number standing as a figure (in a dd or a strong), never a number inside a sentence
  for (const el of all(".num, dd > button.src, strong > button.src")) {
    // a rank is a place in a list, not an amount: it never counts
    if (skipped(el) || el.matches(".inv-rank") || el.parentElement?.closest(".num") || !hasDigit(el)) continue;
    out.push([el, "figure"]);
  }
  return out;
}

/** The parts a unit hides while it waits: a list hides its items, anything else hides itself. */
const parts = (el: Element, kind: Kind): HTMLElement[] =>
  kind === "list" ? ([...el.children].filter((c) => c.tagName === "LI") as HTMLElement[]) : [el as HTMLElement];

// ---- counting: rewrite the digits in place, then put the exact printed text back
interface Token { start: number; end: number; value: number; decimals: number; commas: boolean }
interface Slot { node: Text; final: string; last: string; tokens: Token[] }

function slotsOf(el: Element): Slot[] {
  const out: Slot[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    const tokens: Token[] = [];
    for (const m of n.data.matchAll(NUM_RE)) {
      const s = m[0];
      const dot = s.indexOf(".");
      tokens.push({ start: m.index!, end: m.index! + s.length, value: Number(s.replace(/,/g, "")), decimals: dot < 0 ? 0 : s.length - dot - 1, commas: s.includes(",") });
    }
    if (tokens.length) out.push({ node: n, final: n.data, last: n.data, tokens });
  }
  return out;
}
function render(slot: Slot, k: number): string {
  let s = "", at = 0;
  for (const t of slot.tokens) {
    const v = t.value * k;
    let txt = t.commas ? v.toLocaleString("en-US", { minimumFractionDigits: t.decimals, maximumFractionDigits: t.decimals }) : v.toFixed(t.decimals);
    const len = t.end - t.start;
    if (txt.length < len) txt = FIG_SPACE.repeat(len - txt.length) + txt;
    s += slot.final.slice(at, t.start) + txt;
    at = t.end;
  }
  return s + slot.final.slice(at);
}

export function Entrances() {
  useEffect(() => {
    const units = new Map<Element, Kind>();      // waiting to enter
    const seen = new WeakSet<Element>();          // every unit ever handled: each enters once
    const anims = new Set<Animation>();
    const counts = new Set<{ slots: Slot[]; raf: number }>();
    const still = () => prefersReduced() || motionPaused() || document.hidden;

    const release = (el: Element, kind: Kind) => parts(el, kind).forEach((p) => p.removeAttribute("data-arrive"));
    const play = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
      const a = el.animate(frames, { fill: "backwards", ...opts });
      anims.add(a);
      a.onfinish = a.oncancel = () => anims.delete(a);
    };
    const restore = (c: { slots: Slot[]; raf: number }) => {
      cancelAnimationFrame(c.raf);
      for (const s of c.slots) if (s.node.data === s.last) s.node.data = s.final;
      counts.delete(c);
    };
    function count(el: Element) {
      const c = { slots: slotsOf(el), raf: 0 };
      if (!c.slots.length) return;
      const set = (k: number) => { for (const s of c.slots) { if (s.node.data !== s.last) continue; s.last = render(s, k); s.node.data = s.last; } };
      set(0);
      counts.add(c);
      const t0 = performance.now(), dur = 950;
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        // a text React has rewritten since (a live value) is left alone: React's text wins
        c.slots = c.slots.filter((s) => s.node.data === s.last && s.node.isConnected);
        if (p >= 1) return restore(c);
        set(1 - Math.pow(1 - p, 3));
        c.raf = requestAnimationFrame(tick);
      };
      c.raf = requestAnimationFrame(tick);
    }

    function enter(el: Element, kind: Kind) {
      units.delete(el);
      io.unobserve(el);
      const ps = parts(el, kind);
      release(el, kind);
      if (still()) return;
      if (kind === "chart") {
        play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: "cubic-bezier(.33,1,.68,1)" });
        play(el, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 1000, easing: "cubic-bezier(.65,0,.35,1)" });
      } else if (kind === "picture") {
        play(el, [{ clipPath: "inset(0 0 100% 0)", opacity: 0.4 }, { clipPath: "inset(0 0 0 0)", opacity: 1 }], { duration: 1050, easing: "cubic-bezier(.65,0,.35,1)" });
      } else if (kind === "figure") {
        play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
        count(el);
      } else {
        ps.forEach((li, i) => {
          const moved = getComputedStyle(li).transform !== "none";
          const frames: Keyframe[] = moved ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }];
          play(li, frames, { duration: 700, delay: Math.min(i, MAX_STAGGER - 1) * STEP_MS, easing: "cubic-bezier(.16,1,.3,1)" });
        });
        // what waits inside the items comes with them, so no item shows with a hole in it
        for (const [u, k] of [...units]) if (el.contains(u)) enter(u, k);
      }
    }

    /** Hold a unit until it scrolls in; `now` plays it at once if it is already in view. */
    function hold(el: Element, kind: Kind, now: boolean) {
      if (seen.has(el)) return;
      seen.add(el);
      if (still()) return;
      const r = el.getBoundingClientRect();
      const inView = r.top < innerHeight && r.bottom > 0;
      if (inView && now) return enter(el, kind);
      if (inView || r.bottom <= 0) return; // already on screen (or passed): left finished
      parts(el, kind).forEach((p) => p.setAttribute("data-arrive", "wait"));
      units.set(el, kind);
      io.observe(el);
    }

    const onIn = (es: IntersectionObserverEntry[]) => {
      for (const e of es) if (e.isIntersecting && units.has(e.target)) enter(e.target, units.get(e.target)!);
    };
    // a chart starts its one-second wipe a little before it scrolls in, so none sits blank on screen (the Moon
    // Gap and Measure charts did for about half a second); everything else enters once it is 10% into the screen
    const ioRest = new IntersectionObserver(onIn, { rootMargin: "0px 0px -10% 0px" });
    const ioChart = new IntersectionObserver(onIn, { rootMargin: "0px 0px 25% 0px" });
    const io = {
      observe: (el: Element) => (units.get(el) === "chart" ? ioChart : ioRest).observe(el),
      unobserve: (el: Element) => { ioRest.unobserve(el); ioChart.unobserve(el); },
      disconnect: () => { ioRest.disconnect(); ioChart.disconnect(); },
    };

    // first scan: the first screen is finished, the rest waits
    const vh = innerHeight;
    for (const [el, kind] of collect(document)) {
      const r = el.getBoundingClientRect();
      if (r.top < vh * IN_VIEW) { seen.add(el); continue; }
      hold(el, kind, false);
    }

    // later content: whatever an opened toggle mounts enters (even in view); a chart that draws late enters too
    const mo = new MutationObserver((recs) => {
      for (const rec of recs) for (const n of rec.addedNodes) {
        if (!(n instanceof Element)) continue;
        const bodies = [...(n.matches(".more-body") ? [n] : []), ...n.querySelectorAll(".more-body")];
        for (const b of bodies) if (!skipped(b)) for (const [el, kind] of collect(b)) hold(el, kind, true);
        const plot = n.closest(".js-plotly-plot") ?? n.querySelector(".js-plotly-plot");
        if (plot && !seen.has(plot) && !skipped(plot)) hold(plot, "chart", true);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // keyboard: focus landing in something still waiting shows it at once
    const focus = (e: FocusEvent) => {
      const t = e.target as Element | null;
      for (const [el, kind] of units) if (el.contains(t)) { units.delete(el); io.unobserve(el); release(el, kind); }
    };
    document.addEventListener("focusin", focus);

    // Pause or reduced motion: every entrance jumps to its end, and nothing waits any more
    const finishAll = () => {
      for (const [el, kind] of units) release(el, kind);
      units.clear();
      io.disconnect();
      anims.forEach((a) => a.finish());
      counts.forEach(restore);
    };
    // a hidden tab only finishes what is running; what waits below the fold still enters later
    const unwatch = watchMotion(() => {
      if (prefersReduced() || motionPaused()) finishAll();
      else if (document.hidden) { anims.forEach((a) => a.finish()); counts.forEach(restore); }
    });

    return () => {
      unwatch();
      mo.disconnect();
      document.removeEventListener("focusin", focus);
      finishAll();
    };
  }, []);
  return <span hidden data-element="entrances" />;
}
