// Written with AI assistance (Claude Code)
// The two motion switches every moving element obeys: the visitor's reduced-motion setting and the
// site's Pause button (<html data-motion="paused">). watchMotion() calls back whenever either
// changes, and when the tab is hidden or shown again.
import { useEffect, useState } from "react";

const RMQ = "(prefers-reduced-motion: reduce)";

export const prefersReduced = () => typeof matchMedia !== "undefined" && matchMedia(RMQ).matches;
export const motionPaused = () => document.documentElement.dataset.motion === "paused";

export function watchMotion(cb: () => void): () => void {
  const mq = matchMedia(RMQ);
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  mq.addEventListener("change", cb);
  document.addEventListener("visibilitychange", cb);
  return () => { mo.disconnect(); mq.removeEventListener("change", cb); document.removeEventListener("visibilitychange", cb); };
}

/** True while the visitor asks for reduced motion (live). */
export function useReducedMotion(): boolean {
  const [r, setR] = useState(prefersReduced);
  useEffect(() => {
    const mq = matchMedia(RMQ);
    const on = () => setR(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return r;
}
