// Written with AI assistance (Claude Code)
// The Moon band fills with night from below as it scrolls in, the way warm air rises in lunar
// gravity. Three layers share one wave surface (a back wave in a thin tint, a lighter rim, the night
// body) and the band's content is clipped to the same surface, so its light text only ever sits on
// night. The level is set by the scroll alone: no loop, nothing moves while the page is still.
// Once full, every layer and clip is dropped and the band is exactly its ordinary self.
// Reduced motion and the Pause switch: the band is simply full.
import "./rising-fill.css";

const F = {
  start: 1.0,       // the band's top, in viewport heights, where the fill begins
  end: 0.28,        // ... and where it is full
  lag: 1.7,         // the surface trails the band's top, then catches up (power of the fill)
  crest: [56, 34],  // wave height in px: wide, phone
  tile: [1400, 760],// one wave period in px: wide, phone
  back: { lift: 0.42, phase: 1.1 },
  front: { phase: -1.6 },
  rim: 3,
  points: 40,
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;
// one period of the 2nd, 3rd and 5th harmonics: repeats without a kink, peaks at about ±1
const wave = (t: number) => (0.52 * Math.sin(2 * TAU * t + 0.4) + 0.3 * Math.sin(3 * TAU * t + 1.9) + 0.18 * Math.sin(5 * TAU * t + 0.7));

export function risingFill(band: HTMLElement): () => void {
  const html = document.documentElement;
  const rmq = matchMedia("(prefers-reduced-motion: reduce)");
  const isStill = () => rmq.matches || html.dataset.motion === "paused";
  const inner = band.querySelector<HTMLElement>(".band-inner");

  const layer = (name: string) => { const d = document.createElement("div"); d.className = `rf-layer rf-${name}`; d.setAttribute("aria-hidden", "true"); return d; };
  const back = layer("back"), rim = layer("rim"), body = layer("body");
  band.prepend(back, rim, body);

  let active = false, lastKey = "", raf = 0, near = false;
  const setActive = (on: boolean) => {
    if (on === active) return;
    active = on; band.classList.toggle("rf-on", on);
    if (!on) { for (const el of [back, rim, body]) el.style.clipPath = ""; if (inner) inner.style.clipPath = ""; lastKey = ""; }
  };

  function poly(xs: number[], ys: number[], dx: number, dy: number) {
    let s = "polygon(";
    for (let i = 0; i < xs.length; i++) s += `${(xs[i] - dx).toFixed(1)}px ${(ys[i] - dy).toFixed(1)}px, `;
    return `${s}${(xs[xs.length - 1] - dx).toFixed(1)}px calc(100% + 2px), ${(xs[0] - dx).toFixed(1)}px calc(100% + 2px))`;
  }

  function frame() {
    raf = 0;
    if (isStill()) { setActive(false); return; }
    const r = band.getBoundingClientRect(), vh = innerHeight || 1, vw = html.clientWidth || innerWidth;
    const f = clamp((vh * F.start - r.top) / (vh * (F.start - F.end)), 0, 1);
    if (f >= 1) { setActive(false); return; }
    setActive(true);
    const phone = vw < 700, crest = F.crest[+phone], tile = F.tile[+phone];
    const amp = crest * Math.max(0.16, Math.sin(Math.PI * f)) * 0.5;
    // where the surface sits on screen: from below the screen to just over the band's top
    const g = f ** F.lag, yv = (1 - g) * (vh + crest) + g * (r.top - crest), s = yv - r.top;
    const key = `${f.toFixed(4)}|${vw}|${vh}`;
    if (key === lastKey) return;
    lastKey = key;
    const xs: number[] = [], yf: number[] = [], yb: number[] = [], yr: number[] = [];
    for (let i = 0; i <= F.points; i++) {
      const xv = (vw * i) / F.points, x = xv - r.left, t = xv / tile;   // band coordinates; the wave is pinned to the screen
      const front = s + amp * wave(t + F.front.phase * f);
      xs.push(i === 0 ? x - 4 : i === F.points ? x + 4 : x);
      yf.push(front); yr.push(front - F.rim);
      yb.push(s - F.back.lift * crest + amp * wave(t + F.back.phase * f + 0.37));
    }
    body.style.clipPath = poly(xs, yf, 0, 0);
    rim.style.clipPath = poly(xs, yr, 0, 0);
    back.style.clipPath = poly(xs, yb, 0, 0);
    if (inner) { const ir = inner.getBoundingClientRect(); inner.style.clipPath = poly(xs, yf, ir.left - r.left, ir.top - r.top); }
  }
  const kick = () => { if (!raf && (near || active)) raf = requestAnimationFrame(frame); };

  const io = new IntersectionObserver(([e]) => {
    near = e.isIntersecting;
    if (!near && !isStill()) {
      // off screen: below, wait empty; above, stay full
      if (e.boundingClientRect.top > 0) { setActive(true); body.style.clipPath = rim.style.clipPath = back.style.clipPath = "inset(100% 0 0 0)"; if (inner) inner.style.clipPath = "inset(100% 0 0 0)"; lastKey = ""; }
      else setActive(false);
    }
    kick();
  }, { rootMargin: "0px 0px 20% 0px" });
  io.observe(band);
  const ac = new AbortController();
  const sig = { signal: ac.signal, passive: true } as AddEventListenerOptions;
  addEventListener("scroll", kick, sig);
  addEventListener("resize", () => { lastKey = ""; kick(); }, sig);
  rmq.addEventListener("change", () => { near = true; kick(); }, sig);
  const mo = new MutationObserver(() => { lastKey = ""; if (isStill()) setActive(false); else { near = true; kick(); } });
  mo.observe(html, { attributes: true, attributeFilter: ["data-motion"] });
  near = true; kick();

  return () => { cancelAnimationFrame(raf); ac.abort(); io.disconnect(); mo.disconnect(); setActive(false); back.remove(); rim.remove(); body.remove(); };
}
