// Written with AI assistance (Claude Code)
// "Replay the burn": the rod test played back from our tracker's per-photo edge positions.
// The flat drawing renders first (it is the fallback with no WebGL and with reduced motion);
// the 3D scene loads after, in its own chunk, and takes over at the same framing.
import { useEffect, useMemo, useRef, useState } from "react";
import { Num } from "../Num";
import { SPREAD_FILE, cell, edges, spread, type Row } from "../data";
import { useMotion } from "../motion";
import type { BurnScene, BurnState } from "./burnScene";

export const EDGE_FILE = (test: string) => `data/derived/edges/${test}.csv`;
/** Seconds of screen time for a whole test at 1×. A presentation choice, not a measurement. */
const PLAY_SECONDS = 16;

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export interface Track {
  test: string;
  photos: Row[];
  t0: number;
  t1: number;
  edgeMin: number;
  edgeMax: number;
  rodMm: number;
  rodLengthMm: number;
}

export function track(test: string): Track | null {
  const photos = (edges[test] ?? []).filter((r) => r.edge_mm !== "").sort((a, b) => Number(a.t_s) - Number(b.t_s));
  if (photos.length < 2) return null;
  const e = photos.map((r) => Number(r.edge_mm));
  const rodMm = Number(spread.find((r) => r.test_id === test)?.rod_d_mm);
  const edgeMax = Math.max(...e);
  return {
    test,
    photos,
    t0: Number(photos[0].t_s),
    t1: Number(photos[photos.length - 1].t_s),
    edgeMin: Math.min(...e),
    edgeMax,
    rodMm,
    // framing only: the tracked span plus a margin up to the next 10 mm, never so short that
    // the rod reads as a stub
    rodLengthMm: Math.max(Math.ceil((edgeMax + 6) / 10) * 10, 50),
  };
}

/** The photo at or before `t`, and the edge between photos (linear, for smooth playback). */
export function sample(tr: Track, t: number) {
  const ps = tr.photos;
  let i = 0;
  while (i + 1 < ps.length && Number(ps[i + 1].t_s) <= t) i++;
  const a = ps[i];
  const b = ps[Math.min(i + 1, ps.length - 1)];
  const ta = Number(a.t_s);
  const tb = Number(b.t_s);
  const f = tb > ta ? Math.min(Math.max((t - ta) / (tb - ta), 0), 1) : 0;
  const edge = Number(a.edge_mm) + f * (Number(b.edge_mm) - Number(a.edge_mm));
  const step = spread.find((r) => r.test_id === tr.test && Number(r.t_start_s) <= t && t < Number(r.t_end_s)) ?? null;
  return { photo: a, index: i, edge, step };
}

/** The flat drawing: the same rod, front and flame, in SVG. Also the no-WebGL view. */
function Flat({ tr, edge, flameLen }: { tr: Track; edge: number; flameLen: number | null }) {
  const L = tr.rodLengthMm;
  const r = tr.rodMm / 2;
  const W = L + 16;
  const H = r * 8;
  const y = H / 2 - r * 0.6;
  const e = Math.min(Math.max(edge, 0), L);
  const len = Math.min(flameLen ?? 0, e + 2);
  return (
    <svg className="flat" viewBox={`-8 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="flat-flame" x1="0" x2="1">
          <stop offset="0" style={{ stopColor: "var(--flame)" }} stopOpacity="0" />
          <stop offset="0.75" style={{ stopColor: "var(--flame)" }} stopOpacity="0.35" />
          <stop offset="1" style={{ stopColor: "var(--flame)" }} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {len > 0 && <rect x={e - len} y={y - r * 1.9} width={len} height={r * 3.8} rx={r * 1.9} fill="url(#flat-flame)" />}
      <rect x={0} y={y - r * 0.9} width={e} height={r * 1.8} style={{ fill: "var(--char)" }} />
      <rect x={e} y={y - r} width={L - e} height={r * 2} rx={0.6} style={{ fill: "var(--rod)" }} />
      <rect x={L} y={y - r * 2.1} width={6} height={r * 4.2} style={{ fill: "var(--rule)" }} />
      <line x1={e} x2={e} y1={y - r * 2.2} y2={y + r * 2.2} style={{ stroke: "var(--accent)" }} strokeWidth={0.5} />
      {Array.from({ length: Math.floor(L / 5) + 1 }, (_, k) => (
        <line key={k} x1={k * 5} x2={k * 5} y1={y + r * 2.6} y2={y + r * 2.6 + (k % 2 ? 1.2 : 2.4)} style={{ stroke: "var(--mute)" }} strokeWidth={0.25} />
      ))}
      <line x1={0} x2={L} y1={y + r * 2.6} y2={y + r * 2.6} style={{ stroke: "var(--mute)" }} strokeWidth={0.25} />
    </svg>
  );
}

export function BurnReplay({ test, onTime, compact = false }: { test: string; onTime?: (t: number) => void; compact?: boolean }) {
  const tr = useMemo(() => track(test), [test]);
  const [t, setT] = useState(() => tr?.t1 ?? 0);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<BurnScene | null>(null);
  const played = useRef(false);
  const { paused } = useMotion();
  useEffect(() => { scene.current?.setPaused(paused); }, [paused, live]);

  // the 3D scene: loaded only when the panel is near the viewport and WebGL exists
  useEffect(() => {
    if (!tr || !stage.current) return;
    let dead = false;
    const host = stage.current;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const mod = await import("./burnScene");
      if (dead || !mod.webglAvailable()) return;
      scene.current = new mod.BurnScene(host, {
        rodLengthMm: tr.rodLengthMm,
        rodDiameterMm: tr.rodMm,
        edgeMinMm: tr.edgeMin,
        edgeMaxMm: tr.edgeMax,
        colors: { flame: css("--flame"), front: css("--accent"), rod: css("--rod"), char: css("--char"), ink: css("--ink"), rule: css("--rule") },
        reducedMotion: reduced(),
      });
      setLive(true);
      // play once on first view, unless the reader asked for less motion
      if (!played.current && !reduced()) {
        played.current = true;
        setT(tr.t0);
        setPlaying(true);
      }
    }, { rootMargin: "200px" });
    io.observe(host);
    return () => {
      dead = true;
      io.disconnect();
      scene.current?.dispose();
      scene.current = null;
      setLive(false);
    };
  }, [tr]);

  useEffect(() => { if (tr) { setT(tr.t1); setPlaying(false); } }, [tr]);

  // playback clock
  useEffect(() => {
    if (!playing || !tr) return;
    let raf = 0;
    let last = performance.now();
    const rate = (tr.t1 - tr.t0) / PLAY_SECONDS;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => {
        const next = prev + dt * rate;
        if (next >= tr.t1) { setPlaying(false); return tr.t1; }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, tr]);

  const s = tr ? sample(tr, t) : null;
  const flameLen = s?.step ? Number(s.step.flame_len_mm) : null;
  const flow = s?.step ? Number(s.step.flow_cm_s) : null;
  const lit = !!tr && t < tr.t1;
  useEffect(() => {
    if (!s) return;
    const state: BurnState = { edgeMm: s.edge, flameLenMm: lit ? flameLen : null, flowCmS: flow };
    scene.current?.update(state);
    onTime?.(Number(s.photo.t_s));
  }, [t, live]);

  if (!tr || !s) return <p className="caption">No edge track for test {test} yet.</p>;
  const elapsed = Number(s.photo.t_s) - tr.t0;

  return (
    <div className={`replay${compact ? " compact" : ""}`}>
      <div className="stage-wrap">
      <div className="stage" ref={stage} data-live={live}>
        <Flat tr={tr} edge={s.edge} flameLen={lit ? flameLen : null} />
      </div>
        <div className="hud" aria-live="off">
          <div><span className="k">Photo</span><span className="v num">{s.index + 1}/{tr.photos.length}</span></div>
          <div><span className="k">Elapsed</span><span className="v num"><Num source={cell(EDGE_FILE(test), s.photo._row, "t_s")}>{elapsed.toFixed(0)} s</Num></span></div>
          <div><span className="k">Edge</span><span className="v num"><Num source={cell(EDGE_FILE(test), s.photo._row, "edge_mm")}>{s.photo.edge_mm} mm</Num></span></div>
          <div>
            <span className="k">Airflow</span>
            <span className="v num">{s.step ? <Num source={cell(SPREAD_FILE, s.step._row, "flow_cm_s")}>{s.step.flow_cm_s} cm/s</Num> : "between steps"}</span>
          </div>
          <div>
            <span className="k">Fitted speed</span>
            <span className="v num">{s.step ? <Num source={cell(SPREAD_FILE, s.step._row, "rate_mm_s")}>{s.step.rate_mm_s} mm/s</Num> : "–"}</span>
          </div>
        </div>
      </div>
      <div className="scrub">
        <button type="button" className="btn play" onClick={() => { if (t >= tr.t1) setT(tr.t0); setPlaying((p) => !p); }} aria-label={playing ? "Pause the replay" : "Play the replay"}>
          {playing ? "Pause" : t >= tr.t1 ? "Replay" : "Play"}
        </button>
        <input
          type="range"
          min={tr.t0}
          max={tr.t1}
          step="any"
          value={t}
          onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
          aria-label={`Time in test ${test}`}
          aria-valuetext={`${elapsed.toFixed(0)} seconds, edge at ${s.photo.edge_mm} millimetres`}
        />
      </div>
      <p className="caption">Illustration driven by measured data: the front sits where our tracker found the flame's leading edge in each of NASA's photos (between photos, it moves in a straight line). Flame length and airflow come from the fitted fan step. The rod and duct are drawn, not photographed.</p>
    </div>
  );
}
