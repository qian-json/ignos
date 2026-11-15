// Written with AI assistance (Claude Code)
// One shape that follows an Ask request: the question going out, the sources the answer read, each
// number the gate checked, green or flagged, then "Open the data". It never runs on a clock of its
// own: a step is shown only once the request has really reached it (the caller passes the steps the
// response supports), and the shape moves on as soon as the previous morph has landed. Size, corners
// and tone are closed-form springs summed per change, so each frame is a pure function of time; the
// content swaps under a short blur. Reduced motion, the Pause switch, off screen and a hidden tab all
// cut straight to the latest step with no frames running.

export type Tone = "ink" | "card" | "ok" | "flag" | "flame" | "quiet";
export interface Step {
  key: string;
  tone: Tone;
  text: string;
  icon?: "spin" | "doc" | "tick" | "flag" | "stop" | "down";
  /** One dot per checked number, coloured by what the gate found. */
  dots?: ("verified" | "unverified")[];
  /** The step is a real button. */
  action?: boolean;
  /** Read out when this step is the newest one. */
  say: string;
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
// unit step response of a damped spring, 0 → 1 (z < 1 overshoots a hair, z = 1 never does)
const spring = (x: number, w = 18, z = 0.86) => {
  if (x <= 0) return 0;
  if (z >= 1) return 1 - Math.exp(-w * x) * (1 + w * x);
  const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * x);
  return 1 - e * (Math.cos(wd * x) + ((z * w) / wd) * Math.sin(wd * x));
};
const cut = (x: number) => (x > 0 ? 1 : 0);
type Ease = (x: number, w?: number, z?: number) => number;

/** A value that changes target many times: the sum of one spring per change. */
class Track {
  private ch: [number, number][] = [];
  constructor(private v0: number, private w = 18, private z = 0.86) {}
  get target() { return this.ch.reduce((v, c) => v + c[1], this.v0); }
  to(t: number, v: number) { const d = v - this.target; if (Math.abs(d) > 1e-6) this.ch.push([t, d]); }
  at(t: number, S: Ease) { return this.ch.reduce((v, [ti, d]) => v + d * S(t - ti, this.w, this.z), this.v0); }
  settled(t: number) { return this.ch.every(([ti]) => t - ti > 1.2); }
  /** fold settled changes into the base so the list stays short */
  fold(t: number) { const keep: [number, number][] = []; for (const c of this.ch) { if (t - c[0] > 1.2) this.v0 += c[1]; else keep.push(c); } this.ch = keep; }
  jump(v: number) { this.v0 = v; this.ch = []; }
}

const ICON: Record<NonNullable<Step["icon"]>, string> = {
  spin: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="2"/><path d="M12 4a8 8 0 0 1 8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  doc: '<path d="M7 3.5h7l4 4V20.5H7z M14 3.5v4h4 M10 12h5 M10 15.5h5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>',
  tick: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  flag: '<path d="M12 4v10 M12 18.5v.5" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"/>',
  stop: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M8.5 15.5l7-7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
  down: '<path d="M12 5v13 M6.5 12.5L12 18l5.5-5.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
};

interface Layer { step: Step; el: HTMLElement; w: number; tIn: number; tOut: number | null }

const H = 48, HOLD = 0.45, PAD = 18;

export function askMorph(root: HTMLElement, onAction: () => void) {
  const html = document.documentElement;
  const rmq = matchMedia("(prefers-reduced-motion: reduce)");
  const shape = document.createElement("div");
  shape.className = "amx-shape";
  const status = document.createElement("p");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  root.append(shape, status);

  // tones come from the site's tokens
  const css = getComputedStyle(root);
  const tok = (n: string) => css.getPropertyValue(n).trim();
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const g = cv.getContext("2d", { willReadFrequently: true })!;
  const rgb = (c: string): [number, number, number] => { g.clearRect(0, 0, 1, 1); g.fillStyle = "#000"; g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
  const TONE: Record<Tone, { bg: [number, number, number]; line: [number, number, number] }> = {
    ink: { bg: rgb(tok("--ink")), line: rgb(tok("--ink")) },
    card: { bg: rgb(tok("--surface")), line: rgb(tok("--rule")) },
    ok: { bg: rgb(tok("--verified-bg")), line: rgb(tok("--verified")) },
    flag: { bg: rgb(tok("--unverified-bg")), line: rgb(tok("--unverified")) },
    flame: { bg: rgb(tok("--flame")), line: rgb(tok("--flame")) },
    quiet: { bg: rgb(tok("--well")), line: rgb(tok("--rule")) },
  };

  const w = new Track(H), r = new Track(H / 2), bg = [0, 1, 2].map(() => new Track(0, 20, 1)), ln = [0, 1, 2].map(() => new Track(0, 20, 1));
  let steps: Step[] = [], shown = -1, layers: Layer[] = [], raf = 0, onScreen = true, said = "";
  const now = () => performance.now() / 1000;
  const allowed = () => !rmq.matches && html.dataset.motion !== "paused" && onScreen && !document.hidden;

  function build(s: Step): HTMLElement {
    const el = document.createElement(s.action ? "button" : "div");
    el.className = "amx-layer";
    el.dataset.tone = s.tone;
    if (s.action) { (el as HTMLButtonElement).type = "button"; el.addEventListener("click", onAction); }
    if (s.icon) { const i = document.createElementNS("http://www.w3.org/2000/svg", "svg"); i.setAttribute("viewBox", "0 0 24 24"); i.setAttribute("aria-hidden", "true"); i.classList.add("amx-ic"); if (s.icon === "spin") i.classList.add("amx-spin"); i.innerHTML = ICON[s.icon]; el.append(i); }
    const t = document.createElement("span"); t.className = "amx-t"; t.textContent = s.text; el.append(t);
    if (s.dots?.length) {
      const d = document.createElement("span"); d.className = "amx-dots"; d.setAttribute("aria-hidden", "true");
      s.dots.slice(0, 16).forEach((st) => { const b = document.createElement("i"); b.dataset.st = st; d.append(b); });
      el.append(d);
    }
    return el;
  }

  /** natural width of a step, held inside the room the card gives it */
  function widthOf(el: HTMLElement) {
    el.style.width = "max-content";
    // the unscaled used width, rounded up: a fraction short and the text would ellipsize
    const nat = Math.ceil(parseFloat(getComputedStyle(el).width) || el.scrollWidth) + 1;
    el.style.width = "";
    return Math.min(Math.max(H, nat), Math.max(H, root.clientWidth));
  }

  function enter(i: number, t: number) {
    const s = steps[i];
    layers.forEach((L) => { if (L.tOut === null) { L.tOut = t; L.el.inert = true; L.el.setAttribute("aria-hidden", "true"); } });
    const el = build(s);
    shape.append(el);
    const L: Layer = { step: s, el, w: widthOf(el), tIn: t + 0.05, tOut: null };
    layers.push(L);
    w.to(t, L.w); r.to(t, H / 2);
    const tn = TONE[s.tone];
    bg.forEach((k, j) => k.to(t, tn.bg[j])); ln.forEach((k, j) => k.to(t, tn.line[j]));
    shown = i;
    if (i === steps.length - 1 && said !== s.say) { said = s.say; status.textContent = s.say; }
  }

  function draw(t: number, S: Ease) {
    const ww = w.at(t, S), rr = clamp(r.at(t, S), 0, H / 2);
    const c = (k: Track[]) => k.map((x) => Math.round(clamp(x.at(t, S), 0, 255))).join(",");
    shape.style.width = `${ww.toFixed(2)}px`;
    shape.style.borderRadius = `${rr.toFixed(2)}px`;
    shape.style.backgroundColor = `rgb(${c(bg)})`;
    shape.style.boxShadow = `inset 0 0 0 1px rgb(${c(ln)})`;
    const hard = S === cut;
    layers = layers.filter((L) => {
      const pin = S(t - L.tIn, 24, 1), pout = L.tOut === null ? 0 : S(t - L.tOut, 40, 1);
      const p = clamp(pin * (1 - pout));
      if (L.tOut !== null && (pout > 0.995 || hard)) { L.el.remove(); return false; }
      L.el.style.width = `${L.w}px`;
      L.el.style.opacity = p.toFixed(3);
      L.el.style.filter = hard || p > 0.995 ? "none" : `blur(${((1 - p) * 10).toFixed(2)}px)`;
      L.el.style.transform = hard ? "none" : `scale(${(0.94 + 0.06 * p).toFixed(4)})`;
      return true;
    });
  }

  function busy(t: number) {
    return shown < steps.length - 1 || !w.settled(t) || !r.settled(t) || !bg.every((k) => k.settled(t)) || layers.some((L) => L.tOut !== null || t - L.tIn < 1);
  }

  function frame() {
    raf = 0;
    const t = now();
    if (!allowed()) return still();
    const cur = layers[layers.length - 1];
    if (shown < steps.length - 1 && cur && t - cur.tIn >= HOLD) enter(shown + 1, t);
    draw(t, spring);
    [w, r, ...bg, ...ln].forEach((k) => k.fold(t));
    if (busy(t)) raf = requestAnimationFrame(frame);
  }

  /** no frames: cut to the newest step and draw it at rest */
  function still() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    root.dataset.live = "0";
    if (!steps.length) return;
    const t = now();
    if (shown !== steps.length - 1) enter(steps.length - 1, t);
    const L = layers[layers.length - 1];
    w.jump(L.w); r.jump(H / 2);
    const tn = TONE[L.step.tone];
    bg.forEach((k, j) => k.jump(tn.bg[j])); ln.forEach((k, j) => k.jump(tn.line[j]));
    L.tIn = t - 10;
    draw(t, cut);
  }

  function kick() {
    if (!allowed()) return still();
    root.dataset.live = "1";
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function set(next: Step[]) {
    const same = next.length > 0 && shown >= 0 && next.slice(0, shown + 1).every((s, i) => steps[i] && steps[i].key === s.key);
    const first = shown < 0;
    steps = next;
    root.hidden = !next.length;
    if (!next.length) { layers.forEach((L) => L.el.remove()); layers = []; shown = -1; said = ""; return; }
    if (!same) {
      // a new question: morph from wherever the shape is into its first step
      if (first) { const tn = TONE[next[0].tone]; bg.forEach((k, j) => k.jump(tn.bg[j])); ln.forEach((k, j) => k.jump(tn.line[j])); }
      shown = -1; said = "";
      enter(0, now());
      if (first) { w.jump(layers[0].w); }
    }
    kick();
  }

  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; kick(); });
  io.observe(root);
  const mo = new MutationObserver(() => kick());
  mo.observe(html, { attributes: true, attributeFilter: ["data-motion"] });
  const vis = () => kick();
  document.addEventListener("visibilitychange", vis);
  rmq.addEventListener("change", vis);
  const ro = new ResizeObserver(() => { const L = layers[layers.length - 1]; if (!L) return; const nw = widthOf(L.el); if (Math.abs(nw - L.w) > 0.5) { L.w = nw; w.to(now(), nw); kick(); } });
  ro.observe(root);

  return {
    set,
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect(); mo.disconnect(); ro.disconnect();
      document.removeEventListener("visibilitychange", vis);
      rmq.removeEventListener("change", vis);
      shape.remove(); status.remove();
    },
  };
}
