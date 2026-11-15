// Written with AI assistance (Claude Code)
// A pool of light that slides along the border of the habitat rows with a mouse pointer. The pointer
// is tracked over the whole panel, so the light reaches a row's edge just before the pointer does and
// spills onto a neighbour's edge as it passes. Keyboard focus inside a row lights its whole border,
// still. Touch draws nothing. Reduced motion and the Pause switch: the light doesn't follow; the row
// under the pointer shows the still border instead.
import { useEffect, useRef } from "react";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./row-spotlight.css";

const RADIUS = 170; // px, the pool of light

/** Attach to the list (<ol>/<ul>) whose <li> rows get the light. */
export function useRowSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const field = list.closest("section") ?? list;
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    let raf = 0, x = 0, y = 0;
    const rows = () => [...list.children].filter((c) => c.tagName === "LI") as HTMLElement[];
    const clear = () => rows().forEach((li) => li.removeAttribute("data-lit"));
    const paint = () => {
      raf = 0;
      for (const li of rows()) {
        const r = li.getBoundingClientRect();
        const near = x > r.left - RADIUS * 0.75 && x < r.right + RADIUS * 0.75 && y > r.top - RADIUS * 0.75 && y < r.bottom + RADIUS * 0.75;
        if (!near) { li.removeAttribute("data-lit"); continue; }
        li.style.setProperty("--rs-x", `${(x - r.left).toFixed(1)}px`);
        li.style.setProperty("--rs-y", `${(y - r.top).toFixed(1)}px`);
        li.setAttribute("data-lit", "");
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !fine.matches || prefersReduced() || motionPaused()) return;
      x = e.clientX; y = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const leave = () => { cancelAnimationFrame(raf); raf = 0; clear(); };
    field.addEventListener("pointermove", move as EventListener, { passive: true });
    field.addEventListener("pointerleave", leave);
    // the light must not hang in place: Pause, reduced motion or a hidden tab put it out
    const unwatch = watchMotion(() => { if (prefersReduced() || motionPaused() || document.hidden) leave(); });
    return () => {
      field.removeEventListener("pointermove", move as EventListener);
      field.removeEventListener("pointerleave", leave);
      unwatch();
      leave();
    };
  }, []);
  return ref;
}
