// Written with AI assistance (Claude Code)
// "Ignos" signed off in slats at the foot of the close. The word itself is real text (read by screen
// readers, selectable, and the still version everyone sees under reduced motion or without WebGL2);
// a canvas laid exactly over it lets a passing pointer push the slats sideways, after which they
// settle still. Without a pointer the slats take one gentle breath the first time the mark scrolls
// into view. The loop runs only on screen, in a visible tab, and while motion is not paused.
import { useEffect, useRef, useState } from "react";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./air-wordmark.css";

export function AirWordmark() {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLParagraphElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const b = box.current;
    const t = text.current;
    const c = canvas.current;
    if (!b || !t || !c || prefersReduced()) return;
    let dead = false;
    let cleanup = () => {};
    (async () => {
      await document.fonts.ready.catch(() => undefined);
      const { startDraught } = await import("./airDraught");
      if (dead) return;
      const d = startDraught(c, b, t);
      if (!d) return;
      setLive(true);
      let onScreen = false;
      let breathed = false;
      const update = () => {
        if (prefersReduced()) {
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
        if (!breathed && e.intersectionRatio >= 0.6) {
          breathed = true;
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
    };
  }, []);

  return (
    <div className="airmark" data-element="air-wordmark" data-live={live} ref={box}>
      <p className="airmark-word" ref={text}>Ignos</p>
      <canvas className="airmark-canvas" ref={canvas} aria-hidden="true" />
    </div>
  );
}
