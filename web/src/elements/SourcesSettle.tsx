// Written with AI assistance (Claude Code)
// The source list arrives like loose sheets set down on a desk: each item drifts in from below and to
// the right, turned a little, its leading edge landing first, and settles flat, one after another,
// once. It plays when the list is first seen (opening its section mounts it). Reduced motion and the
// Pause switch show the list still; off screen or in a hidden tab it holds where it is.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./sources-settle.css";

const STAGGER = 90;   // ms between sheets
const DURATION = 820; // ms for one sheet

export function SourcesSettle({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const list = ref.current!;
    const still = () => prefersReduced() || motionPaused() || typeof list.animate !== "function";
    if (still()) return;
    const items = [...list.children] as HTMLElement[];
    // created before the first paint, held at the start until the list is seen
    const anims = items.map((li, i) => {
      const a = li.animate(
        [
          { opacity: 0, transform: "perspective(900px) translate3d(22px, 26px, 0) rotate(1.8deg) rotateY(-10deg)" },
          { opacity: 1, offset: 0.55, transform: "perspective(900px) translate3d(2px, 2px, 0) rotate(-0.3deg) rotateY(-1deg)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: DURATION, delay: i * STAGGER, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
      );
      a.pause();
      return a;
    });
    let seen = false, over = false;
    const end = () => { if (over) return; over = true; anims.forEach((a) => a.finish()); };
    anims[anims.length - 1]?.addEventListener("finish", () => { over = true; });
    const check = () => {
      if (over) return;
      if (still()) { end(); return; }
      if (seen && !document.hidden) anims.forEach((a) => a.play());
      else anims.forEach((a) => a.pause());
    };
    const io = new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; check(); }, { threshold: 0.15 });
    io.observe(list);
    const unwatch = watchMotion(check);
    return () => { io.disconnect(); unwatch(); anims.forEach((a) => a.cancel()); };
  }, []);

  return (
    <ul ref={ref} className={`settle${className ? ` ${className}` : ""}`} data-element="sources-settle">
      {children}
    </ul>
  );
}
