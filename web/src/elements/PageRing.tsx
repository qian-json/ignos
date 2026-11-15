// Written with AI assistance (Claude Code)
// The way out of Home: the site's other pages as five cards (name, one line on what it is for, a real
// picture from the project). The first time the section scrolls into view the cards are dealt from a deck
// into a tilted ring, the ring turns a little, then each card flies to its place in a plain row of links.
// The row is the real layout the whole time; the deal is only a transform over it, so the links work from
// the first frame and the keyboard order is the row's order. Any key, focus or press in the section ends
// the deal at once. Reduced motion and the Pause switch: the row, still. Off screen or in a hidden tab the
// clock holds.
import { useEffect, useRef, type MouseEvent } from "react";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import { PAGES, type PageId } from "../router/routes";
import "./display-type.css";
import "./page-ring.css";

type Card = { id: PageId; purpose: string; image: string };
const CARDS: Card[] = [
  { id: "habitats", purpose: "Pick a habitat and see NASA's fire investigations ranked for it.", image: "/film/desktop/080.webp" },
  { id: "ask", purpose: "Ask NASA's fire data a question in plain words, with every figure cited.", image: "/film/poster.jpg" },
  { id: "research", purpose: "Flame spread read from raw space-station photos, and Moon versus Earth oxygen limits.", image: "/frames/B16/photo-071-raw.jpg" },
  { id: "model", purpose: "A small formula fitted to published flame-spread rates, kept only to test the data.", image: "/frames/B16/photo-071-tracked.jpg" },
  { id: "method", purpose: "How we know: the sources and the checks behind every figure on the site.", image: "/frames/P17/sheet.jpg" },
];

// timeline, seconds
const T = { wait: 0.1, each: 0.16, fly: 0.6, turnEnd: 1.55, settle: 0.85, stagger: 0.07 };
const TILT = -16;   // degrees the ring leans towards the viewer
const TURN = 54;    // degrees the ring turns while it is dealt
const ease3 = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const inOut = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function pageRing(root: HTMLElement): () => void {
  const stage = root.querySelector<HTMLElement>(".pr-row")!;
  const cards = [...root.querySelectorAll<HTMLElement>(".pr-card")];
  const n = cards.length;
  const still = () => prefersReduced() || motionPaused();
  const end = T.turnEnd + (n - 1) * T.stagger + T.settle;
  let clock = 0, last = 0, raf = 0, near = false, started = false, done = false;
  let offs: { dx: number; dy: number }[] = [], radius = 0, scale = 1;

  const measure = () => {
    const sr = stage.getBoundingClientRect();
    const cx = sr.left + sr.width / 2, cy = sr.top + sr.height / 2;
    offs = cards.map((c) => {
      // the layout box, without the transform on it
      const x = c.offsetLeft + c.offsetWidth / 2, y = c.offsetTop + c.offsetHeight / 2;
      return { dx: cx - (sr.left + x), dy: cy - (sr.top + y) };
    });
    const w = cards[0]?.offsetWidth ?? 200;
    scale = Math.min(1, (sr.width * 0.34) / w);
    radius = Math.min(sr.width * 0.36, (w * scale * n) / (2 * Math.PI) * 1.25);
  };
  const clear = () => cards.forEach((c) => { c.style.transform = ""; c.style.opacity = ""; c.style.zIndex = ""; });
  const finish = () => {
    done = true; cancelAnimationFrame(raf); raf = 0; clear();
    root.classList.remove("is-dealing"); root.classList.add("is-dealt");
  };

  function draw() {
    const turn = TURN * ease3(clock / T.turnEnd);
    cards.forEach((c, i) => {
      const deal = ease3((clock - T.wait - i * T.each) / T.fly);           // deck -> ring
      const back = inOut((clock - T.turnEnd - i * T.stagger) / T.settle);  // ring -> row
      const slot = (360 / n) * i - turn;
      const yaw = lerp(lerp(-180, slot, deal), Math.round(slot / 360) * 360, back);
      const r = lerp(radius * deal, 0, back);
      const k = 1 - back;
      const s = lerp(scale * lerp(0.7, 1, deal), 1, back);
      const lift = (1 - deal) * 80;
      c.style.transform =
        `translate3d(${(offs[i].dx * k).toFixed(1)}px, ${(offs[i].dy * k + lift * k).toFixed(1)}px, 0) ` +
        `rotateX(${(TILT * k).toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg) translateZ(${r.toFixed(1)}px) scale(${s.toFixed(3)})`;
      c.style.opacity = Math.min(1, deal * 2.5).toFixed(3);
      // nearer cards on top while in the ring
      c.style.zIndex = String(Math.round(100 + 50 * Math.cos((yaw * Math.PI) / 180) * k));
    });
  }
  function tick(now: number) {
    raf = 0;
    if (done) return;
    if (still()) { finish(); return; }
    if (document.hidden || !near) { last = 0; return; }
    clock += last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    draw();
    if (clock >= end) { finish(); return; }
    raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf && !done && started) raf = requestAnimationFrame(tick); };

  const io = new IntersectionObserver(([e]) => {
    near = e.isIntersecting;
    if (near && !started) { started = true; measure(); }
    if (near) kick();
  }, { rootMargin: "0px 0px -30% 0px" });
  const skip = () => { if (!done) finish(); };
  const ac = new AbortController();
  root.addEventListener("focusin", skip, { signal: ac.signal });
  root.addEventListener("pointerdown", skip, { signal: ac.signal });
  root.addEventListener("keydown", skip, { signal: ac.signal });
  const ro = new ResizeObserver(() => { if (started && !done) measure(); });
  ro.observe(stage);
  const stop = watchMotion(() => { if (still()) skip(); else kick(); });

  if (still()) finish();
  else {
    root.classList.add("is-dealing");
    cards.forEach((c) => { c.style.opacity = "0"; });
    io.observe(stage);
  }
  return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); ac.abort(); stop(); clear(); };
}

export function PageRing({ meta = "Keep going", title = "Explore the site", onPick }: {
  meta?: string; title?: string;
  /** For a client-side router: called on click; call e.preventDefault() to take over. */
  onPick?: (href: string, e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => (ref.current ? pageRing(ref.current) : undefined), []);
  return (
    <section ref={ref} className="pr" data-element="page-ring" aria-labelledby="page-ring-title">
      <h2 id="page-ring-title" className="t-display-l">{title}</h2>
      <ul className="pr-row">
        {CARDS.map((c) => {
          const page = PAGES.find((p) => p.id === c.id);
          if (!page) return null;
          return (
            <li className="pr-card" key={c.id}>
              <a className="pr-link" href={page.path} onClick={onPick ? (e) => onPick(page.path, e) : undefined}>
                <span className="pr-pic"><img src={c.image} alt="" loading="lazy" decoding="async" /></span>
                <span className="pr-text">
                  <span className="pr-name">{page.label}</span>
                  <span className="pr-purpose">{c.purpose}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
