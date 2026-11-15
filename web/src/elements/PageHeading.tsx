// Written with AI assistance (Claude Code)
// A page's opening heading whose letters rise out of a vertical stretch once, when the page opens. It reuses
// the section-heading element (HeadingRise.tsx: same split, same letter curve, data-element="heading-rise"),
// but it is played by time, not by the scroll: the whole line lands in about a second.
// The heading keeps its id and role, and a visually hidden copy carries its words; the letters are aria-hidden.
// Reduced motion and the Pause switch show it whole at once; a hidden tab holds the clock.
//
//   <PageHeading as="h1" meta="Research" className="t-display-xl" id="research-title">Flames in orbit</PageHeading>
//   or on any heading you render yourself: const ref = useRef<HTMLHeadingElement>(null); usePageHeadingRise(ref);
import { createElement, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { T, split, render, type Char } from "./HeadingRise";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./display-type.css";

const SPEED = 1.2;   // the opening plays a little faster than the scroll-played section headings
const DELAY = 0.12;  // seconds before the first letter moves, so it starts after the page has painted

export function usePageHeadingRise(ref: RefObject<HTMLElement>, key: unknown = null) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !(el.textContent ?? "").trim()) return;
    // keep the nodes React owns, so they can go back exactly as they were
    const owned = [...el.childNodes];
    const { chars } = split(el);
    if (!chars.length) { el.replaceChildren(...owned); delete el.dataset.element; return; }
    const head = { chars: chars as Char[], total: (chars.length - 1) * T.stagger + T.duration, lastAt: 0, backward: false };
    const still = () => prefersReduced() || motionPaused();
    const length = head.total / SPEED + DELAY;
    let clock = 0, raf = 0, last = 0, done = false;

    const finish = () => { done = true; render(head, 1, true); };
    function tick(now: number) {
      raf = 0;
      if (done) return;
      if (still()) { finish(); return; }
      if (document.hidden) { last = 0; return; }
      clock += last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      const at = Math.min(1, Math.max(0, (clock - DELAY) / (length - DELAY)));
      render(head, at, false);
      if (at >= 1) { done = true; return; }
      raf = requestAnimationFrame(tick);
    }
    const kick = () => { if (!raf && !done) raf = requestAnimationFrame(tick); };
    const stop = watchMotion(() => { if (still()) { cancelAnimationFrame(raf); raf = 0; finish(); } else kick(); });

    if (still()) finish(); else { render(head, 0, false); kick(); }
    return () => {
      cancelAnimationFrame(raf); stop();
      el.replaceChildren(...owned); delete el.dataset.element;
    };
  }, [ref, key]);
}

type Level = "h1" | "h2";
export function PageHeading({ as = "h1", children, meta, className = "t-display-xl", id }: {
  as?: Level; children: string; meta?: ReactNode; className?: string; id?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  usePageHeadingRise(ref, children);
  return (
    <>
      {createElement(as, { ref, id, className }, children)}
    </>
  );
}
