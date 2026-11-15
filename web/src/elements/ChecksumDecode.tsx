// Written with AI assistance (Claude Code)
// A file's sha256, read in like a checksum being computed: hex digits flicker and settle left to right
// into the real hash, once, when the line comes into view (which includes its section being opened,
// since closed sections mount nothing). The real hash is in the DOM the whole time and is what screen
// readers read and copy-paste takes; the flicker is an aria-hidden copy laid over it in the same
// monospace, so nothing moves. Reduced motion and the Pause switch show the hash still.
import { useEffect, useRef, useState } from "react";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./checksum-decode.css";

const HEX = "0123456789abcdef";
const DURATION = 0.9;    // s, longest settle of one digit
const STAGGER = 0.012;   // s per digit, left to right

export function ChecksumDecode({ hash }: { hash: string }) {
  const ref = useRef<HTMLElement>(null);
  const overlay = useRef<HTMLSpanElement>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const el = ref.current!;
    let raf = 0, seen = false, played = false, t0 = 0, elapsed = 0;
    const queue = [...hash].map((to, i) => {
      const start = i * STAGGER + Math.random() * 0.1;
      return { to, end: start + DURATION * (0.35 + Math.random() * 0.65) };
    });
    const still = () => prefersReduced() || motionPaused();

    const frame = (now: number) => {
      const t = elapsed + (now - t0) / 1000;
      let out = "", done = 0;
      for (const q of queue) {
        if (t >= q.end) { out += q.to; done++; }
        else out += HEX[(Math.random() * 16) | 0];
      }
      if (overlay.current) overlay.current.textContent = out;
      if (done < queue.length) raf = requestAnimationFrame(frame);
      else finish();
    };
    const finish = () => { cancelAnimationFrame(raf); raf = 0; played = true; setRunning(false); };
    const halt = () => { if (raf) { elapsed += (performance.now() - t0) / 1000; cancelAnimationFrame(raf); raf = 0; } };
    const check = () => {
      if (played) return;
      if (still()) { halt(); finish(); return; }          // the designed still state: the hash itself
      if (!seen || document.hidden) { halt(); return; }    // off screen or hidden tab: hold where it is
      if (!raf) { setRunning(true); t0 = performance.now(); raf = requestAnimationFrame(frame); }
    };

    const io = new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; check(); }, { threshold: 0.6 });
    io.observe(el);
    const unwatch = watchMotion(check);
    if (still()) played = true;
    return () => { cancelAnimationFrame(raf); io.disconnect(); unwatch(); };
  }, [hash]);

  return (
    <code ref={ref} className={`ckd${running ? " is-running" : ""}`} data-element="checksum-decode">
      <span className="ckd-real">{hash}</span>
      {running && <span ref={overlay} className="ckd-flicker" aria-hidden="true">{hash}</span>}
    </code>
  );
}
