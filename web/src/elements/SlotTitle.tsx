// Written with AI assistance (Claude Code)
// A heading whose words roll like slot reels: each word sits in a one-line window, a short strip of copies
// spins up through it with a vertical motion smear that fades as the reel slows, and the word locks in place.
// It plays once, the first time the heading scrolls into view.
// The heading keeps its id, classes and its words as plain text; the spinning copies are drawn by CSS and are
// never read out. Reduced motion and the Pause switch: the words stand still. Off screen or in a hidden tab
// the clock holds.
//
//   <SlotTitle as="h1" meta="Research" id="research-title" className="t-display-xl">What we measured ourselves</SlotTitle>
import { createElement, Fragment, useLayoutEffect, useRef, type ReactNode } from "react";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./display-type.css";
import "./slot-title.css";

const DURATION = 1.5;   // seconds one reel takes to lock
const STAGGER = 0.09;   // seconds between reels, in a shuffled order
const DELAY = 0;        // after the heading comes into view
const SMEAR = 0.0012;   // blur (in px) per px/s of reel speed
const SMEAR_MAX = 3;
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const expoRate = (t: number) => (t >= 1 ? 0 : 10 * Math.LN2 * Math.pow(2, -10 * t));
// spins per word: a fixed little pattern, so every visit looks the same
const spinsFor = (i: number) => 4 + ((i * 3) % 4);
// a fixed shuffled order for the start times: the rank of a scrambled key per word
const orderFor = (n: number) => {
  const key = (i: number) => (i * 7 + 3) % 11;
  const byKey = [...Array(n).keys()].sort((a, b) => key(a) - key(b));
  return [...Array(n).keys()].map((i) => byKey.indexOf(i));
};

function slotRoll(root: HTMLElement): () => void {
  const reels = [...root.querySelectorAll<HTMLElement>(".slt-strip")];
  const order = orderFor(reels.length);
  const delays = reels.map((_, i) => DELAY + order[i] * STAGGER);
  const total = Math.max(...delays) + DURATION;
  const still = () => prefersReduced() || motionPaused();
  let clock = 0, last = 0, raf = 0, seen = false, near = false, done = false;

  const place = (i: number, p: number, speed: number) => {
    const r = reels[i], n = +(r.dataset.spins ?? 4);
    // starts one line past the last copy, so the window is empty until the reel spins in
    const y = -(n + 1) * (1 - p) * 100;
    r.style.transform = p >= 1 ? "" : `translateY(${y.toFixed(3)}%)`;
    const sd = Math.min(SMEAR_MAX, speed * SMEAR);
    r.style.filter = sd > 0.1 ? `blur(${sd.toFixed(2)}px)` : "";
  };
  const finish = () => {
    done = true; cancelAnimationFrame(raf); raf = 0;
    reels.forEach((_, i) => place(i, 1, 0));
    root.classList.remove("is-rolling");
  };
  function tick(now: number) {
    raf = 0;
    if (done) return;
    if (still()) { finish(); return; }
    if (document.hidden || !near) { last = 0; return; }
    clock += last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    reels.forEach((r, i) => {
      const t = Math.max(0, (clock - delays[i]) / DURATION);
      const h = r.offsetHeight, n = +(r.dataset.spins ?? 4);
      place(i, expoOut(t), (n * h * expoRate(t)) / DURATION);
    });
    if (clock >= total) { finish(); return; }
    raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf && !done && seen) raf = requestAnimationFrame(tick); };

  const io = new IntersectionObserver(([e]) => {
    near = e.isIntersecting;
    if (near && !seen) seen = true;
    if (near) kick();
  }, { threshold: 0.2 });
  const stop = watchMotion(() => { if (still()) finish(); else kick(); });

  if (still()) finish();
  else {
    // the start state goes on before the first paint, so the finished words never flash first
    root.classList.add("is-rolling");
    reels.forEach((_, i) => place(i, 0, 0));
    const b = root.getBoundingClientRect();
    if (b.bottom > 0 && b.top < innerHeight) { seen = near = true; kick(); }
    io.observe(root);
  }
  return () => { cancelAnimationFrame(raf); io.disconnect(); stop(); reels.forEach((_, i) => place(i, 1, 0)); };
}

type Level = "h1" | "h2" | "h3";
export function SlotTitle({ as = "h2", children, meta, className = "t-display-l", id }: {
  as?: Level; children: string; meta?: ReactNode; className?: string; id?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const words = children.trim().split(/\s+/);
  useLayoutEffect(() => (ref.current ? slotRoll(ref.current) : undefined), [children]);
  // The real words are plain text in the heading. The copies that spin past are drawn by CSS from data-rep,
  // so the heading's text, its accessible name and a copy-paste stay exactly the words.
  const heading = createElement(as, { ref, id, className: `${className} slt`.trim(), "data-element": "slot-title" },
    words.map((w, i) => (
      <Fragment key={i}>
        {i > 0 && " "}
        <span className="slt-win">
          <span className="slt-strip" data-spins={spinsFor(i)} data-rep={Array(spinsFor(i)).fill(w).join("\n")}>{w}</span>
        </span>
      </Fragment>
    )),
  );
  return (
    <>
      {heading}
    </>
  );
}

