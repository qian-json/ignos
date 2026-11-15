// Written with AI assistance (Claude Code)
// The panel a checked result sits in. When the checker really verified a number in that result, a
// flame front runs once round the panel's edge at an even speed along the edge (whatever the panel's
// shape) and leaves the edge green. Once per result: a new `result` key runs it again, the same key
// never does. Reduced motion and the Pause switch get the green edge at once; off screen or in a
// hidden tab the run waits until the panel is seen.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./verify-spark.css";

const SPEED = 2.4;   // edges a second; one edge = a quarter of the perimeter, so a lap takes 4 / SPEED s
const HEAD = 0.35;   // length of the bright front, in edges

/** Clockwise angle (deg, 0 = top centre) of the point `s` px along the edge of a w × h box, from the top centre. */
function angleAlong(s: number, w: number, h: number): number {
  const P = 2 * (w + h);
  const lap = Math.floor(s / P);
  let r = s - lap * P;
  let x: number, y: number;
  const hw = w / 2, hh = h / 2;
  if (r < hw) { x = r; y = -hh; }
  else if ((r -= hw) < h) { x = hw; y = -hh + r; }
  else if ((r -= h) < w) { x = hw - r; y = hh; }
  else if ((r -= w) < h) { x = -hw; y = hh - r; }
  else { r -= h; x = -hw + r; y = -hh; }
  let a = (Math.atan2(x, -y) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a + 360 * lap;
}

/** Keyframes for one run: the front's angle from where it started, and the front's length, both even in px. */
function runFrames(w: number, h: number) {
  const P = 2 * (w + h), edge = P / 4, lap = 4 / SPEED, total = lap * (1 + HEAD / 4);
  const s0 = P * (0.08 + Math.random() * 0.3);   // start somewhere along the top-right
  const a0 = angleAlong(s0, w, h);
  const N = 64, frames: Keyframe[] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * total;
    const went = Math.min(P, (t / lap) * P);
    const run = angleAlong(s0 + went, w, h) - a0;
    // the front grows in over its first stretch and burns out into the green once the lap closes
    const tailFrom = Math.max(0, (t / lap) * P - HEAD * edge);
    const head = Math.max(0, run - (angleAlong(s0 + Math.min(tailFrom, P), w, h) - a0));
    frames.push({ "--vs-run": `${Math.min(360, run).toFixed(2)}deg`, "--vs-head": `${head.toFixed(2)}deg` } as Keyframe);
  }
  return { frames, ms: total * 1000, from: a0 % 360 };
}

export function VerifySpark({ verified, result, delay = 0, children, className }: {
  /** true only when the checker's result has at least one verified number */
  verified: boolean;
  /** identifies the result; the run happens once per distinct value */
  result: string;
  /** ms to wait before the run (for panels that reveal themselves first) */
  delay?: number;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef<string | null>(null);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const el = ref.current!;
    if (!verified) { setLit(false); return; }
    if (done.current === result) { setLit(true); return; }
    const canRun = typeof CSS !== "undefined" && "registerProperty" in CSS && typeof el.animate === "function";
    let anim: Animation | null = null, timer = 0, seen = false, cancelled = false;

    const settle = () => { done.current = result; setLit(true); };
    const stop = () => { clearTimeout(timer); if (anim) { anim.cancel(); anim = null; } el.classList.remove("is-running"); };
    const still = () => !canRun || prefersReduced() || motionPaused();

    const start = () => {
      if (cancelled || anim || done.current === result) return;
      if (still()) { stop(); settle(); return; }
      if (!seen || document.hidden) return;   // wait until it is on screen in a shown tab
      const { width, height } = el.getBoundingClientRect();
      if (width < 4 || height < 4) { settle(); return; }
      const { frames, ms, from } = runFrames(width, height);
      el.style.setProperty("--vs-from", `${from.toFixed(2)}deg`);
      el.classList.add("is-running");
      anim = el.animate(frames, { duration: ms, easing: "linear" });
      anim.onfinish = () => { el.classList.remove("is-running"); anim = null; settle(); };
    };
    const check = () => {
      if (still()) { stop(); settle(); return; }
      if (anim && (!seen || document.hidden)) { anim.pause(); return; }
      if (anim && anim.playState === "paused") { anim.play(); return; }
      clearTimeout(timer);
      timer = window.setTimeout(start, delay);
    };

    setLit(false);
    const io = new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; check(); }, { threshold: 0.4 });
    io.observe(el);
    const unwatch = watchMotion(check);
    if (still()) settle();
    return () => { cancelled = true; stop(); io.disconnect(); unwatch(); };
  }, [verified, result, delay]);

  return (
    <div ref={ref} className={`vs${lit ? " is-lit" : ""}${className ? ` ${className}` : ""}`} data-element="verify-spark">
      {children}
    </div>
  );
}
