// Written with AI assistance (Claude Code)
// The team's gravity envelope (data/derived/envelope.json, built by scripts/build-envelope.mjs) as one
// gravity scale: a log axis in g, the threshold band read from the space station's slowest spreading
// fan flows, and the Moon and Earth placed by their own gravity. Dimension keylines draw as the figure
// scrolls in (the band, then the Moon's distance above it, then Earth's), and each number fades in once
// its line is complete. Every value is read from the file; nothing here is an airflow on the Moon.
// Reduced motion and the Pause switch draw everything at once.
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Num } from "../Num";
import { cell } from "../data";
import envelopeJson from "../../../data/derived/envelope.json";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./envelope-scale.css";

interface World { id: string; label: string; g_earth: number; times_threshold_at_least: number }
interface Envelope { estimate_note: string; threshold: { g_low: number; g_high: number; bound: string }; worlds: World[] }
const ENV = envelopeJson as unknown as Envelope;
const FILE = "data/derived/envelope.json";
const at = (path: string) => cell(FILE, 0, path);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** A stored gravity as mantissa x 10^exp, printed at the precision the file stores. */
function Sci({ v }: { v: number }) {
  const [m, e] = v.toExponential().split("e");
  const exp = Number(e);
  return exp === 0 ? <>{m}</> : <>{m} × 10<sup>{exp < 0 ? `−${-exp}` : exp}</sup></>;
}
const times = (v: number) => v.toLocaleString("en-US");

export function EnvelopeScale() {
  const ref = useRef<HTMLElement>(null);
  const th = ENV.threshold;
  const worlds = ENV.worlds.map((w, i) => ({ ...w, i })).sort((a, b) => a.g_earth - b.g_earth);

  // the axis: whole decades from below the band to the highest world
  const lo = Math.floor(Math.log10(th.g_low));
  const hi = Math.ceil(Math.log10(Math.max(...worlds.map((w) => w.g_earth))));
  const x = (g: number) => ((Math.log10(g) - lo) / (hi - lo)) * 100; // % of width
  const decades: number[] = [];
  for (let k = lo; k <= hi; k++) decades.push(k);

  // scroll -> drawing: band, then one keyline per world, in order
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const steps = 1 + worlds.length;
    const set = (p: number) => {
      const s = el.style;
      for (let k = 0; k < steps; k++) {
        const a = k / steps;
        const b = (k + 0.8) / steps;
        s.setProperty(`--k${k}`, ease(clamp01((p - a) / (b - a))).toFixed(4));
        s.setProperty(`--k${k}-end`, clamp01((p - b) / (0.12 / steps)).toFixed(3));
      }
    };
    let raf = 0;
    let near = false;
    const still = () => prefersReduced() || motionPaused();
    // 0 when the figure's top meets the bottom 10% of the screen, 1 once it has risen 55% of the screen
    const frame = () => { raf = 0; const r = el.getBoundingClientRect(); set(clamp01((innerHeight * 0.9 - r.top) / (innerHeight * 0.55))); };
    const ask = () => { if (near && !raf && !document.hidden && !still()) raf = requestAnimationFrame(frame); };
    const io = new IntersectionObserver(([e]) => { near = e.isIntersecting; ask(); }, { rootMargin: "10% 0px" });
    const mode = () => { if (still()) { cancelAnimationFrame(raf); raf = 0; set(1); } else ask(); };
    io.observe(el);
    addEventListener("scroll", ask, { passive: true });
    addEventListener("resize", ask);
    const stop = watchMotion(mode);
    if (still()) set(1);
    else { set(0); frame(); }
    return () => { cancelAnimationFrame(raf); io.disconnect(); removeEventListener("scroll", ask); removeEventListener("resize", ask); stop(); };
  }, [worlds.length]);

  const xl = x(th.g_low);
  const xh = x(th.g_high);
  // keyline rows from the axis upward: the nearest world gets the lowest row
  const AXIS = 140;
  const BAND = [112, AXIS] as const; // the band stands on the axis
  const KEY0 = 100; // the band's own keyline, just above it
  const rowY = (k: number) => 74 - k * 40; // world keylines, nearest world lowest
  const H = 172;

  const label = (left: number, right: number, top: number, k: number, children: ReactNode) => (
    <span className={`env-label k${k}`} style={{ left: `${left}%`, right: `${100 - right}%`, top } as CSSProperties}>{children}</span>
  );

  return (
    <figure ref={ref} className="envscale" data-element="envelope-scale" aria-labelledby="envscale-h">
      <figcaption>
        <h3 id="envscale-h">Gravity scale: the station's lowest spreading flows, the Moon and Earth</h3>
      </figcaption>
      <div className="env-plot" style={{ height: H }}>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {decades.map((k) => <line key={k} className="env-tick" x1={x(10 ** k)} x2={x(10 ** k)} y1={AXIS - 5} y2={AXIS + 5} />)}
          <rect className="env-band" x={xl} y={BAND[0]} width={xh - xl} height={BAND[1] - BAND[0]} />
          <line className="env-axis" x1={0} x2={100} y1={AXIS} y2={AXIS} />
          {/* the band's own width */}
          <line className="env-key" style={{ ["--k" as string]: "var(--k0)" }} x1={xl} x2={xh} y1={KEY0} y2={KEY0} />
          {[xl, xh].map((v) => <line key={v} className="env-cap k0e" x1={v} x2={v} y1={KEY0 - 6} y2={KEY0 + 6} />)}
          {worlds.map((w, j) => {
            const wx = x(w.g_earth);
            const y = rowY(j);
            const k = j + 1;
            return (
              <g key={w.id}>
                <line className="env-world" x1={wx} x2={wx} y1={y} y2={AXIS + 6} />
                <line className="env-key" style={{ ["--k" as string]: `var(--k${k})` }} x1={xh} x2={wx} y1={y} y2={y} />
                {[xh, wx].map((v) => <line key={v} className={`env-cap k${k}e`} x1={v} x2={v} y1={y - 6} y2={y + 6} />)}
              </g>
            );
          })}
        </svg>
        {/* labels sit in HTML so they keep their size at any width */}
        {decades.map((k) => (
          <span key={k} className={`env-dec${k === lo ? " start" : k === hi ? " end" : ""}`} style={{ left: `${x(10 ** k)}%`, top: AXIS + 8 }} aria-hidden="true">{k === 0 ? "1 g" : <>10<sup>{k < 0 ? `−${-k}` : k}</sup></>}</span>
        ))}
        <span className="env-inband" style={{ left: `${xl}%`, width: `${xh - xl}%`, top: BAND[0], height: BAND[1] - BAND[0] }}>ISS rods</span>
        {worlds.map((w, j) => label(0, x(w.g_earth), rowY(j) - 24, j + 1, <>
          {w.label} <span className="env-x">≥ <Num source={at(`worlds[${w.i}].times_threshold_at_least`)}>{times(w.times_threshold_at_least)}×</Num></span>
        </>))}
      </div>
      <p className="env-read k0">
        Band: <Num source={at("threshold.g_low")}><Sci v={th.g_low} /></Num> to <Num source={at("threshold.g_high")}><Sci v={th.g_high} /> g</Num>, {th.bound}
      </p>
      <p className="caption">The band marks the gravity at which buoyant flow would equal the lowest opposed flows that still sustained spread on the station's rods. Each line runs from the band's top to a world and gives how many times more gravity that world has. {ENV.estimate_note}</p>
    </figure>
  );
}
