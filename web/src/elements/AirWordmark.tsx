// Written with AI assistance (Claude Code)
// "Ignos" signed off in slats at the foot of the close. The word itself is real text (read by screen
// readers, selectable, and the still version everyone sees under reduced motion or without WebGL2);
// a canvas laid exactly over it lets a passing pointer push the slats sideways, after which they
// settle still. Without a pointer the slats take one gentle breath the first time the mark scrolls
// into view. The loop runs only on screen, in a visible tab, and while motion is not paused.
import { useEffect, useRef, useState } from "react";
import { motionPaused, prefersReduced, useReducedMotion, watchMotion } from "./motionState";
import { useNearViewport } from "../three/useNearViewport";
import "./air-wordmark.css";

export function AirWordmark() {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLParagraphElement>(null);
  const [live, setLive] = useState(false);
  const breathed = useRef(false);
  // the live mark (and its GPU context) exists only while the sign-off is near the screen
  const near = useNearViewport(box);
  // live: the mark comes back to life when the system's reduced-motion setting is turned off again
  const reduced = useReducedMotion();

  useEffect(() => {
    const b = box.current;
    const t = text.current;
    if (!b || !t || !near || reduced) return;
    let dead = false;
    let cleanup = () => {};
    // a fresh canvas each time: a disposed draught gives its GPU context back, so a canvas is never reused
    const c = document.createElement("canvas");
    c.className = "airmark-canvas";
    c.setAttribute("aria-hidden", "true");
    b.appendChild(c);
    (async () => {
      await document.fonts.ready.catch(() => undefined);
      const { startDraught } = await import("./airDraught");
      if (dead) return;
      // a lost GPU context shows the text mark until the browser gives the context back
      let glOk = true;
      const d = (() => {
        try { return startDraught(c, b, t, (ok) => { glOk = ok; if (!dead) update(); }); } catch { return null; }
      })();
      if (!d) return;
      setLive(true);
      let onScreen = false;
      const update = () => {
        if (prefersReduced() || !glOk) {
          d.setRunning(false);
          setLive(false);
          return;
        }
        setLive(true);
        d.setRunning(onScreen && !document.hidden && !motionPaused());
      };
      const io = new IntersectionObserver(([e]) => {
        onScreen = e.isIntersecting;
        update();
        // the one-time breath, once most of the word is in view
        if (!breathed.current && e.intersectionRatio >= 0.6) {
          breathed.current = true;
          d.sweep();
        }
      }, { threshold: [0, 0.6] });
      io.observe(b);
      const ro = new ResizeObserver(() => d.resize());
      ro.observe(b);
      const unwatch = watchMotion(update);
      cleanup = () => {
        io.disconnect();
        ro.disconnect();
        unwatch();
        d.dispose();
      };
    })();
    return () => {
      dead = true;
      cleanup();
      c.remove();
      setLive(false);
    };
  }, [near, reduced]);

  return (
    <div className="airmark" data-element="air-wordmark" data-live={live} ref={box}>
      <p className="airmark-word" ref={text}>Ignos</p>
    </div>
  );
}
