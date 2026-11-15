// Written with AI assistance (Claude Code)
// The overview's headline figures roll up like a mechanical counter the first time the row scrolls in.
// Each figure keeps its text exactly as computed from the data files; only its digits roll, as true
// carry wheels (a wheel turns only while the wheel to its right passes 9 -> 0), and they always come to
// rest on that text. Reduced motion, the Pause switch, a hidden tab or the row leaving the screen
// mid-roll all show the final figures at once. Screen readers get the plain figure, never the wheels.
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./stat-odometer.css";

type Setter = (v: number | null) => void; // null = rest on the final figure
interface Row { add: (s: Setter) => () => void }
const RowCtx = createContext<Row | null>(null);

const STEP = 1.1; // em per digit on a wheel
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - t) ** 4;

/** Split a figure into digit wheels and fixed glyphs ("6.4%" -> wheels 6, 4 with "." and "%" fixed). */
function parse(text: string) {
  type Part = { d: number; ch?: undefined } | { d?: undefined; ch: string };
  const parts: Part[] = [...text].map((ch) => (/\d/.test(ch) ? { d: Number(ch) } : { ch }));
  const digits = parts.flatMap((p) => (p.d === undefined ? [] : [p.d]));
  return { parts, target: digits.length ? Number(digits.join("")) : 0, n: digits.length };
}

/** Position every wheel for a value in units of the last digit; fractions turn the ones wheel smoothly. */
function turn(cols: HTMLElement[], v: number) {
  // cols[0] is the ones wheel
  const whole = Math.floor(v);
  cols.forEach((c, d) => {
    const p = 10 ** d;
    const base = Math.floor(v / p) % 10;
    const roll = d === 0 ? v - whole : clamp01((v % p) - (p - 1));
    c.style.transform = `translateY(${(-(base + roll) * STEP).toFixed(4)}em)`;
    // a leading wheel that still reads zero sits back, so a rolling 007 reads as 7
    c.parentElement!.style.opacity = d > 0 && v < p ? "0.28" : "";
  });
}

/** A figure that rolls to its text. `text` is the figure exactly as the page computed it. */
export function Rolling({ text }: { text: string }) {
  const row = useContext(RowCtx);
  const { parts, target } = useMemo(() => parse(text), [text]);
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || !row) return;
    const cols = [...el.querySelectorAll<HTMLElement>(".odo-wheel > span")].reverse();
    return row.add((v) => turn(cols, v === null ? target : v * target));
  }, [row, target]);

  return (
    <span className="odo" ref={host}>
      <span className="sr">{text}</span>
      <span className="odo-face" aria-hidden="true">
        {parts.map((p, i) =>
          p.d !== undefined ? (
            <span key={i} className="odo-wheel">
              <span style={{ transform: `translateY(${-p.d * STEP}em)` }}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((k, j) => <span key={j}>{k}</span>)}
              </span>
            </span>
          ) : (
            <span key={i} className="odo-fixed">{p.ch}</span>
          ),
        )}
      </span>
    </span>
  );
}

/** The row: watches itself come on screen once and drives every figure inside it on one clock. */
export function RollingRow({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDListElement>(null);
  const setters = useRef(new Set<Setter>());
  const ctx = useMemo<Row>(() => ({ add: (s) => { setters.current.add(s); return () => setters.current.delete(s); } }), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const DUR = 1500; // ms per figure
    const STAGGER = 140; // ms between figures
    let raf = 0;
    let t0 = 0;
    let state: "wait" | "roll" | "done" = "wait";
    const still = () => prefersReduced() || motionPaused() || document.hidden;
    const all = () => [...setters.current];
    const finish = () => { cancelAnimationFrame(raf); raf = 0; state = "done"; all().forEach((s) => s(null)); io.disconnect(); stop(); };
    const frame = (now: number) => {
      const list = all();
      let busy = false;
      list.forEach((s, i) => {
        const k = clamp01((now - t0 - i * STAGGER) / DUR);
        if (k < 1) busy = true;
        s(k < 1 ? easeOut(k) : null);
      });
      if (busy) raf = requestAnimationFrame(frame);
      else finish();
    };
    const io = new IntersectionObserver(([e]) => {
      if (state === "wait" && e.isIntersecting) {
        if (still()) return finish();
        state = "roll";
        t0 = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (state === "roll" && !e.isIntersecting) finish(); // left the screen mid-roll: rest on the figures
    }, { threshold: 0.35 });
    const stop = watchMotion(() => { if (state !== "done" && still()) finish(); });

    // before the row is seen, the wheels wait at zero (unless motion is off, then they never move)
    if (still()) finish();
    else { all().forEach((s) => s(0)); io.observe(el); }
    return () => { cancelAnimationFrame(raf); io.disconnect(); stop(); };
  }, []);

  return (
    <RowCtx.Provider value={ctx}>
      <dl ref={ref} className={className} data-element="stat-odometer">{children}</dl>
    </RowCtx.Provider>
  );
}
