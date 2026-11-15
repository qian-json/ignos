// Written with AI assistance (Claude Code)
// Section headings on the light sheet: each letter rises half its height out of a vertical stretch,
// left to right, as its section scrolls in, and sinks back as the section scrolls away. Coming back,
// the letters are caught up by a critically damped spring, so they never jump. Mounted once; it finds
// the h2 that labels each section.panel on the sheet (not the opening, not the dark Moon band).
// The h2 keeps its id and role; its words stay readable in a visually hidden copy, the letters are
// aria-hidden. Reduced motion and the Pause switch leave every heading static and whole.
import { useEffect } from "react";
import "./heading-rise.css";

export const T = {
  duration: 1.4, stagger: 0.025, rise: 50, stretch: 1.4,
  fadeU: [0.03, 0.3] as const, fadeF: [0.2, 0.8] as const,
  enter: [0.92, 0.42] as const, leave: [0.75, 0.25] as const, lands: 3,
};
/** 'calm' eases out with no dip below the line; 'spring' rings once (damping .5) before it settles. */
const SETTLE: "calm" | "spring" = "calm";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const win = (x: number, [a, b]: readonly [number, number]) => smooth((x - a) / (b - a));
const out2 = (t: number) => 1 - (1 - t) ** 2;
const out3 = (t: number) => 1 - (1 - t) ** 3;
function spring(zeta = 0.5, settle = 0.85) {
  const k = Math.log(100) / settle, w = (k / zeta) * Math.sqrt(1 - zeta * zeta);
  return (t: number) => {
    if (t <= 0) return 0; if (t >= 1) return 1;
    const e = Math.exp(-k * t) * (Math.cos(w * t) + (k / w) * Math.sin(w * t)), a = Math.max(0, (t - settle) / (1 - settle));
    return 1 - e * (1 - a * a * a * (a * (6 * a - 15) + 10));
  };
}
const ease = SETTLE === "calm" ? out3 : spring();

export type Char = { el: HTMLElement; start: number; u: number; f: number; turned: number; base: number; was: string };
export type Head = {
  section: Element; h2: HTMLElement; text: string; chars: Char[]; total: number;
  near: boolean; lastAt: number; backward: boolean; lag: { x: number; v: number }; target: number; shown: number;
};

export function split(h2: HTMLElement): { text: string; chars: Char[] } {
  const text = (h2.textContent ?? "").replace(/\s+/g, " ").trim();
  const sr = document.createElement("span");
  sr.className = "hr-sr"; sr.textContent = text;
  const vis = document.createElement("span");
  vis.className = "hr-letters"; vis.setAttribute("aria-hidden", "true");
  const chars: Char[] = [];
  text.split(" ").forEach((word, wi) => {
    if (wi) vis.append(" ");
    const w = document.createElement("span"); w.className = "hr-word";
    for (const ch of word) {
      const c = document.createElement("span"); c.className = "hr-char"; c.textContent = ch; w.append(c);
      chars.push({ el: c, start: chars.length * T.stagger, u: 0, f: 0, turned: 0, base: 0, was: "" });
    }
    vis.append(w);
  });
  h2.replaceChildren(sr, vis);
  h2.dataset.element = "heading-rise";
  return { text, chars };
}

export function render(h: Pick<Head, "chars" | "total" | "lastAt" | "backward">, at: number, still: boolean) {
  const time = at * h.total;
  const turn = h.backward ? at > h.lastAt + 0.02 : at < h.lastAt - 0.02;
  if (turn) { h.backward = !h.backward; for (const c of h.chars) { c.turned = c.u; c.base = c.f; } }
  if (h.backward ? at < h.lastAt : at > h.lastAt) h.lastAt = at;
  for (const c of h.chars) {
    const u = clamp((time - c.start) / T.duration, 0, 1);
    let i: number, op: number, tf = "";
    if (still) { i = 1; op = 1; }
    else {
      i = h.backward ? (c.turned > 0 ? c.base * out2(Math.min(1, u / c.turned)) : 0)
        : c.turned >= 1 ? c.base : c.base + (1 - c.base) * ease(Math.max(0, (u - c.turned) / (1 - c.turned)));
      op = win(u, T.fadeU) * win(i, T.fadeF);
      if (i < 1) tf = `translateY(${(T.rise * (1 - i)).toFixed(2)}%) scaleY(${(1 + (T.stretch - 1) * (1 - i)).toFixed(4)})`;
    }
    c.u = u; c.f = i;
    const key = still ? "still" : `${tf}|${op.toFixed(3)}`;
    if (key === c.was) continue;
    c.was = key;
    if (still) { c.el.style.transform = ""; c.el.style.opacity = ""; }
    else { c.el.style.transform = tf; c.el.style.opacity = Math.max(0.001, op).toFixed(3); }
  }
}

function headingRise(): () => void {
  const html = document.documentElement;
  const rmq = matchMedia("(prefers-reduced-motion: reduce)");
  const isStill = () => rmq.matches || html.dataset.motion === "paused";

  const heads: Head[] = [];
  document.querySelectorAll<HTMLElement>(".sheet section.panel:not(.moonband)").forEach((section) => {
    const id = section.getAttribute("aria-labelledby");
    const h2 = id ? document.getElementById(id) : section.querySelector("h2");
    if (!h2 || h2.tagName !== "H2" || h2.children.length) return; // plain-text headings only
    const { text, chars } = split(h2);
    if (!chars.length) return;
    heads.push({
      section, h2, text, chars, total: (chars.length - 1) * T.stagger + T.duration,
      near: false, lastAt: 0, backward: false, lag: { x: 0, v: 0 }, target: 0, shown: -1,
    });
  });
  if (!heads.length) return () => {};

  const visible = (h: Head) => {
    const r = h.section.getBoundingClientRect(), vh = innerHeight || 1, y = r.top / vh, yb = r.bottom / vh;
    const enter = clamp((T.enter[0] - y) / (T.enter[0] - T.enter[1]), 0, 1);
    const leave = clamp((yb - T.leave[1]) / (T.leave[0] - T.leave[1]), 0, 1);
    return Math.min(enter, leave);
  };

  let raf = 0, last = 0, still = isStill();
  function tick(now: number) {
    raf = 0;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0); last = now;
    let moving = false;
    for (const h of heads) {
      if (still) { if (h.shown !== 1) { render(h, 1, true); h.shown = 1; } continue; }
      const t = h.near ? visible(h) : 0;
      if (t > h.target) h.lag.x += t - h.target;   // coming back: the shown value catches up
      h.target = t;
      const k = T.lands, a = h.lag.x, vv = h.lag.v + k * a, e = Math.exp(-k * dt);
      h.lag = { x: (a + vv * dt) * e, v: (h.lag.v - k * vv * dt) * e };
      if (Math.abs(h.lag.x) < 1e-4 && Math.abs(h.lag.v) < 1e-3) h.lag = { x: 0, v: 0 };
      const at = clamp(h.target - h.lag.x, 0, 1);
      if (Math.abs(at - h.shown) > 1e-5) { render(h, at, false); h.shown = at; }
      if (h.lag.x !== 0) moving = true;
    }
    if (moving && !document.hidden) raf = requestAnimationFrame(tick); else last = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  const restyle = () => {
    const s = isStill();
    if (s === still) return;
    still = s;
    // back from a pause: letters on screen stay up; the scroll takes over from there
    if (!still) for (const h of heads) { h.target = h.near ? visible(h) : 0; h.lag = { x: 0, v: 0 }; h.lastAt = 1; h.backward = false; for (const c of h.chars) { c.u = 1; c.f = 1; c.turned = 0; c.base = 0; } h.shown = -1; }
    kick();
  };

  const io = new IntersectionObserver((es) => {
    for (const e of es) { const h = heads.find((x) => x.section === e.target); if (h) h.near = e.isIntersecting; }
    kick();
  }, { rootMargin: "10% 0px 10% 0px" });
  heads.forEach((h) => io.observe(h.section));
  const ac = new AbortController();
  const sig = { signal: ac.signal, passive: true } as AddEventListenerOptions;
  addEventListener("scroll", kick, sig);
  addEventListener("resize", kick, sig);
  document.addEventListener("visibilitychange", kick, sig);
  rmq.addEventListener("change", restyle, sig);
  const mo = new MutationObserver(restyle);
  mo.observe(html, { attributes: true, attributeFilter: ["data-motion"] });
  for (const h of heads) render(h, still ? 1 : 0, still);
  kick();

  return () => {
    cancelAnimationFrame(raf); ac.abort(); io.disconnect(); mo.disconnect();
    for (const h of heads) { h.h2.textContent = h.text; delete h.h2.dataset.element; }
  };
}

/** Mount once, after the panels: it renders nothing of its own. */
export function HeadingRise() {
  useEffect(() => headingRise(), []);
  return null;
}
