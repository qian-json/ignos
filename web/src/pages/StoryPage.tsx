// Written with AI assistance (Claude Code)
// Story: a guided tour of Ignos in five scenes that show, not tell. 1 a stylized Earth with the space
// station at its live position (fetched in the browser from wheretheiss.at); 2 NASA's own photos of a
// BASS-II flame; 3 the tracker's edge track and the headline error, read from the data files;
// 4 a stylized Moon and the open question; 5 an example walk-through of Ask with the real number
// checker. The 3D views load in their own chunk; every number on the page comes from a data file
// (with its source) or from the live feed (with its name on screen).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { gateAnswer, type NumberSource } from "@still-air/proof";
import { RESEARCH_QUESTIONS } from "../AskBar";
import { Num } from "../Num";
import { FACTS, SPREAD_FILE, S1_FILE, cell, edges, fmt, median, spread, validated } from "../data";
import { useMotion } from "../motion";
import type { LiveFix, SpaceMode, SpaceScene } from "../three/spaceScene";
import { useNearViewport } from "../three/useNearViewport";
import "./story.css";

// ---------- the data every scene reads ----------
const OK = spread.filter(validated);
const MED = median(OK.map((r) => Math.abs(Number(r.pct_error))));
const WORST = OK.reduce((a, b) => (Math.abs(Number(b.pct_error)) > Math.abs(Number(a.pct_error)) ? b : a));
const N_TESTS = new Set(OK.map((r) => r.test_id)).size;
/** The first test with a validated step: its photos play in scene 2 and its edge track draws in scene 3. */
const TEST = (OK[0] ?? spread[0]).test_id;
const RULE = "validated rows only (low airflow, not flagged low confidence)";
const over = (how: string): NumberSource => ({ ...cell(SPREAD_FILE, OK[0]?._row ?? 0, "pct_error"), rows: OK.map((r) => r._row), derived: `${how}, ${RULE}` });
const SRC = {
  median: over("median absolute error against NASA's published rate"),
  count: over("number of validated fan steps"),
  tests: over("number of tests with a validated step"),
};

const SCENES = (["Earth", "Station", "Measure", "Moon", "Ask"] as const).map((short) => ({ id: `s-${short.toLowerCase()}`, short }));
const pad = (i: number) => String(i + 1).padStart(2, "0");

// ---------- the live station position ----------
const ISS_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const REFRESH_MS = 10_000;
interface IssFix extends LiveFix { alt: number | null; vel: number | null; units: string; at: number }
type Iss = { kind: "loading" } | { kind: "unavailable" } | { kind: "live"; fix: IssFix; trail: { lat: number; lon: number }[] };

function parseFix(j: unknown): IssFix | null {
  const o = (j ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : null);
  const lat = n("latitude"), lon = n("longitude"), at = n("timestamp");
  if (lat === null || lon === null || at === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, at, sunLat: n("solar_lat"), sunLon: n("solar_lon"), alt: n("altitude"), vel: n("velocity"), units: typeof o.units === "string" ? o.units : "" };
}

/** Polls the feed while the page is open; a failed fetch shows as unavailable, never as a guessed position. */
function useIss(): Iss {
  const [s, setS] = useState<Iss>({ kind: "loading" });
  useEffect(() => {
    let dead = false, timer = 0, trail: { lat: number; lon: number }[] = [], lastAt = 0;
    const get = async () => {
      if (document.hidden) { timer = window.setTimeout(get, REFRESH_MS); return; }
      const ac = new AbortController();
      const stop = setTimeout(() => ac.abort(), REFRESH_MS * 0.8);
      try {
        const r = await fetch(ISS_URL, { signal: ac.signal, cache: "no-store" });
        const fix = r.ok ? parseFix(await r.json()) : null;
        if (!fix) throw new Error("no fix");
        if (dead) return;
        // a gap (a hidden tab) would draw the trail as a chord through the globe: start it again
        if (fix.at - lastAt > (REFRESH_MS / 1000) * 3) trail = [];
        lastAt = fix.at;
        trail = [...trail, { lat: fix.lat, lon: fix.lon }].slice(-120);
        setS({ kind: "live", fix, trail });
      } catch {
        trail = [];
        if (!dead) setS({ kind: "unavailable" });
      } finally {
        clearTimeout(stop);
        if (!dead) timer = window.setTimeout(get, REFRESH_MS);
      }
    };
    void get();
    return () => { dead = true; clearTimeout(timer); };
  }, []);
  return s;
}

const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
const UNITS: Record<string, [string, string]> = { kilometers: ["km", "km/h"], miles: ["mi", "mph"] };

function IssReadout({ iss }: { iss: Iss }) {
  if (iss.kind === "loading") return <div className="iss-read"><p className="iss-k">Fetching the live position…</p></div>;
  if (iss.kind === "unavailable")
    return <div className="iss-read off"><p className="iss-k">Live ISS position unavailable</p><p className="iss-t">Retrying every {REFRESH_MS / 1000} s. No marker is drawn until a live fix arrives.</p></div>;
  const { fix } = iss;
  const u = UNITS[fix.units];
  const time = new Date(fix.at * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" });
  return (
    <div className="iss-read">
      <p className="iss-k"><span className="live-dot" aria-hidden="true" />International Space Station · live, wheretheiss.at</p>
      <dl className="num">
        <div><dt>Latitude</dt><dd>{deg(fix.lat, "N", "S")}</dd></div>
        <div><dt>Longitude</dt><dd>{deg(fix.lon, "E", "W")}</dd></div>
        {u && fix.alt !== null && <div><dt>Altitude</dt><dd>{Math.round(fix.alt).toLocaleString("en-US")} {u[0]}</dd></div>}
        {u && fix.vel !== null && <div><dt>Speed</dt><dd>{Math.round(fix.vel).toLocaleString("en-US")} {u[1]}</dd></div>}
      </dl>
      <p className="iss-t">Position at {time} UTC · refreshes every {REFRESH_MS / 1000} s · trail: fixes fetched this visit</p>
    </div>
  );
}

// ---------- the 3D views ----------
function SpaceView({ mode, iss, children }: { mode: SpaceMode; iss?: Iss; children?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = { earth: useRef<HTMLSpanElement>(null), moon: useRef<HTMLSpanElement>(null), iss: useRef<HTMLSpanElement>(null) };
  const scene = useRef<SpaceScene | null>(null);
  const [gl, setGl] = useState<"wait" | "on" | "off">("wait");
  const { paused } = useMotion();
  const state = useRef({ paused, iss });
  state.current = { paused, iss };

  const push = () => {
    const s = state.current.iss;
    scene.current?.setLive(s?.kind === "live" ? s.fix : null, s?.kind === "live" ? s.trail : []);
  };

  // the 3D scene: alive only while the view is near the viewport (and WebGL 2 exists), put away (its GPU
  // context released) once the reader is far from it; it draws only while some of it is on screen (built
  // near, it is ready the moment it scrolls in)
  const near = useNearViewport(host, { enter: "240px" });
  const noGL = useRef(false);
  useEffect(() => {
    const el = host.current;
    if (!el || !near || noGL.current) return;
    let dead = false, inView = false;
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; scene.current?.setVisible(inView); });
    io.observe(el);
    void (async () => {
      // the flat view shows when the chunk fails to load, there is no WebGL 2, or the scene cannot start
      try {
        const mod = await import("../three/spaceScene");
        if (dead) return;
        if (!mod.webglAvailable()) { noGL.current = true; setGl("off"); return; }
        const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#93a8ff";
        scene.current = new mod.SpaceScene(el, {
          mode, still: state.current.paused,
          colors: { marker: css("--accent"), glow: css("--flame-glow"), grid: css("--pay") },
          labels: { earth: labels.earth.current, moon: labels.moon.current, iss: labels.iss.current },
          onContext: (ok) => { if (!dead) setGl(ok ? "on" : "off"); },
        });
        push();
        scene.current.setVisible(inView);
        setGl("on");
      } catch {
        scene.current = null;
        el.querySelectorAll("canvas").forEach((c) => c.remove());
        noGL.current = true;
        if (!dead) setGl("off");
      }
    })();
    return () => { dead = true; io.disconnect(); scene.current?.dispose(); scene.current = null; };
  }, [mode, near]);

  useEffect(push, [iss]);
  useEffect(() => { scene.current?.setStill(paused); }, [paused]);

  return (
    <div className="space" data-gl={gl} data-mode={mode}>
      <div className="space-stage" ref={host}>
        {/* without WebGL: a flat disc turned to face the station, as the 3D globe is, with the marker at its middle */}
        {gl === "off" && (
          <div className="space-flat" aria-hidden="true">
            <span className="flat-earth" />
            {mode === "moon" && <span className="flat-moon" />}
            {mode === "earth" && iss?.kind === "live" && <span className="flat-iss">ISS · live</span>}
          </div>
        )}
        {/* visual only (the caption and readout say the same): the ISS pin stays in the DOM while hidden */}
        <span ref={labels.earth} className="pin" aria-hidden="true">Earth · stylized</span>
        {mode === "moon" && <span ref={labels.moon} className="pin" aria-hidden="true">Moon · stylized</span>}
        {mode === "earth" && <span ref={labels.iss} className="pin pin-iss" aria-hidden="true">ISS · live</span>}
      </div>
      {children}
      <p className="caption space-note">{mode === "moon"
        ? "Stylized Earth and Moon, drawn in code. Not to scale: neither the sizes nor the distance are true."
        : gl === "off"
          ? "Stylized Earth, drawn flat because this browser has no 3D support, turned to face the station. Not map data."
          : `Stylized Earth, drawn in code: its oceans, clouds and grid are not map data. ${iss?.kind !== "live" ? "Lighting is stylized until a live fix arrives." : iss.fix.sunLat !== null && iss.fix.sunLon !== null ? "The station marker and the day and night sides are placed from the live feed." : "The station marker is placed from the live feed; the lighting is stylized."}`}</p>
    </div>
  );
}

// ---------- scene 2: NASA's photos ----------
function FlameFilm() {
  const v = useRef<HTMLVideoElement>(null);
  const { paused } = useMotion();
  useEffect(() => {
    const el = v.current!;
    el.muted = true;
    if (paused) { el.pause(); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.preload = "auto"; void el.play().catch(() => {}); } else el.pause();
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [paused]);
  return (
    <figure className="porthole">
      <div className="porthole-glass">
        <video ref={v} src={`/overlays/${TEST}.mp4`} muted loop playsInline preload="none" controls={paused} aria-label={`NASA's photos of BASS-II test ${TEST}, played in order, with the tracker's lines drawn on top`} />
        <span className="porthole-tag num">NASA photos · BASS-II test {TEST}</span>
      </div>
      <figcaption className="caption">Real photos, not a render: NASA's camera aboard the station, one frame per photo, played in a loop. Our tracker's lines are drawn on top: solid, the edge we measure; dashed, the blue-light front. Photos: NASA PSI, BASS-II (CC0).</figcaption>
    </figure>
  );
}

// ---------- scene 3: the edge track ----------
function EdgeTrack() {
  const W = 640, H = 360, M = 26;
  const pts = (edges[TEST] ?? []).filter((r) => r.edge_mm !== "").map((r) => ({ t: Number(r.t_s), e: Number(r.edge_mm) }));
  const steps = spread.filter((r) => r.test_id === TEST);
  if (pts.length < 2) return null;
  const ts = [...pts.map((p) => p.t), ...steps.flatMap((s) => [Number(s.t_start_s), Number(s.t_end_s)])];
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const e0 = Math.min(...pts.map((p) => p.e)), e1 = Math.max(...pts.map((p) => p.e));
  const x = (t: number) => M + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * M);
  const y = (e: number) => H - M - ((e - e0) / (e1 - e0 || 1)) * (H - 2 * M);
  return (
    <figure className="track">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Leading edge of the flame in every NASA photo of test ${TEST}, over time, with its fan steps shaded`}>
        {steps.map((s) => (
          <rect key={s._row} className={validated(s) ? "band ok" : "band"} x={x(Number(s.t_start_s))} y={M / 2} width={Math.max(0, x(Number(s.t_end_s)) - x(Number(s.t_start_s)))} height={H - M * 1.5} />
        ))}
        <line className="axis" x1={M} y1={H - M} x2={W - M} y2={H - M} />
        <line className="axis" x1={M} y1={M / 2} x2={M} y2={H - M} />
        {pts.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.e)} r={3.4} style={{ "--d": ((x(p.t) - M) / (W - 2 * M)).toFixed(3) } as CSSProperties} />)}
        <line className="scan" x1={M} y1={M / 2} x2={M} y2={H - M} style={{ "--scan": `${W - 2 * M}px` } as CSSProperties} />
        <text x={W - M} y={H - 8} textAnchor="end">time →</text>
        <text x={M + 6} y={M / 2 + 14}>edge position along the rod ↑</text>
      </svg>
      <figcaption className="track-key">
        <span><i className="k-dot" />the leading edge in one NASA photo</span>
        <span><i className="k-band ok" />fan step at low airflow, validated</span>
        <span><i className="k-band" />fan step not validated</span>
      </figcaption>
    </figure>
  );
}

// ---------- scene 5: the Ask walk-through ----------
const QUESTION = RESEARCH_QUESTIONS.find((q) => q.label === "Our rates vs NASA's")?.question ?? "How closely do your low-flow spread rates match NASA's published ones?";
const say = (med: string) => `At low airflow, our tracker's speeds stay close to NASA's published rates: across ${OK.length} validated fan steps in ${N_TESTS} tests, the median error is ${med}% and the largest is ${fmt(Math.abs(Number(WORST.pct_error)), 1)}%.`;
const PASSAGES = [[SPREAD_FILE, "our measured speeds, every fan step"], [S1_FILE, "NASA's published rates (Link et al. 2018, Table S1)"], ["pipeline/METHOD.md", "the validation rule"]].map(([file, what]) => ({ file, what }));
// the walk-through's clock, in ms from when it comes into view (presentation timing only)
const T = { retrieve: 500, passage: 380, answer: 1800, cps: 110, gap: 350, mark: 420 };

function AskWalk() {
  const box = useRef<HTMLDivElement>(null);
  const { paused } = useMotion();
  const [changed, setChanged] = useState(false);
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const text = say(changed ? fmt(MED * 1.5, 1) : fmt(MED, 1));
  const numbers = useMemo(() => gateAnswer(text, { facts: FACTS }).gate.numbers.filter((n) => n.start !== null).sort((a, b) => a.start! - b.start!), [text]);
  const typeEnd = T.answer + (text.length / T.cps) * 1000;
  const checkAt = typeEnd + T.gap;
  const total = checkAt + numbers.length * T.mark;

  useEffect(() => {
    const el = box.current!;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStart((s) => s ?? performance.now()); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (start === null || paused) return;
    let raf = 0;
    const tick = () => { const t = performance.now() - start; setNow(t); if (t < total) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, paused, total]);

  const t = paused ? Infinity : start === null ? -1 : now;
  const passages = Math.max(0, Math.min(PASSAGES.length, Math.floor((t - T.retrieve) / T.passage) + 1));
  const typed = t < T.answer ? 0 : Math.min(text.length, Math.floor(((t - T.answer) / 1000) * T.cps));
  const marked = t < checkAt ? 0 : Math.min(numbers.length, Math.floor((t - checkAt) / T.mark) + 1);
  const done = t >= total;
  const verified = numbers.filter((n) => n.status === "verified").length;
  const stage = done ? 3 : t >= checkAt ? 2 : t >= T.answer ? 1 : t >= T.retrieve ? 0 : -1;

  /** The whole answer with its numbers marked up to `upTo`; with `plain`, no links (the sizing copy). */
  const full = (upTo: number, plain = false): ReactNode[] => {
    const out: ReactNode[] = [];
    let at = 0;
    numbers.forEach((n, i) => {
      out.push(text.slice(at, n.start!));
      const s = text.slice(n.start!, n.end!);
      const cls = i >= upTo ? "w-num" : n.status === "verified" ? "w-num ok" : "w-num no";
      out.push(!plain && i < upTo && n.status === "verified" && n.source ? <span key={i} className={cls}><Num source={n.source} label={`${s}, verified`}>{s}</Num></span> : <span key={i} className={cls}>{s}</span>);
      at = n.end!;
    });
    out.push(text.slice(at));
    return out;
  };
  const answer: ReactNode[] = typed < text.length ? [text.slice(0, typed), <span key="c" className="caret" aria-hidden="true" />] : full(marked);

  return (
    <div className="walk" ref={box}>
      <p className="walk-tag num">Example walk-through</p>
      <p className="walk-q"><span className="walk-k">Question</span>{QUESTION}</p>
      <ol className="walk-steps">
        <li data-on={stage >= 0} data-done={stage > 0}>
          <span className="walk-k">1 · Retrieve sourced passages</span>
          {/* every line is laid out from the start and shown in turn (data-on), so the page never grows while it plays */}
          <ul className="walk-docs">{PASSAGES.map((p, i) => <li key={p.file} data-on={i < passages}><code>{p.file}</code> {p.what}</li>)}</ul>
        </li>
        <li data-on={stage >= 1} data-done={stage > 1}>
          <span className="walk-k">2 · Answer from those passages only</span>
          <p className="walk-a">
            <span className="walk-a-fit" aria-hidden="true">{full(numbers.length, true)}</span>
            <span className="walk-a-text">{stage >= 1 ? answer : null}</span>
          </p>
        </li>
        <li data-on={stage >= 2} data-done={done}>
          <span className="walk-k">3 · Check every number against the data</span>
          <ul className="walk-checks">
            {numbers.map((n, i) => (
              <li key={i} className={n.status === "verified" ? "ok" : "no"} data-on={stage >= 2 && i < marked}>
                <b className="num">{n.text}</b> {n.status === "verified" && n.source ? <>verified · <code>{"file" in n.source ? n.source.file : n.source.paper}</code></> : "not found in our data or sources: flagged"}
              </li>
            ))}
          </ul>
          <p className="walk-sum num" data-on={done}>{verified} of {numbers.length} numbers verified{verified < numbers.length ? `; ${numbers.length - verified} flagged` : ""}</p>
        </li>
      </ol>
      <div className="walk-actions">
        <a className="btn primary" href={`/ask?ask=${encodeURIComponent(QUESTION)}`}>Ask this live</a>
        <button type="button" className="btn ghost" aria-pressed={changed} onClick={() => { setChanged(!changed); setStart(performance.now() - T.answer - (text.length / T.cps) * 1000); }}>{changed ? "Restore the number" : "Change one number"}</button>
        <button type="button" className="btn ghost" onClick={() => setStart(performance.now())} disabled={paused}>Replay</button>
      </div>
      <p className="caption">Example: the question and answer are a sample sentence built from our data files, not a live AI reply; the three steps are the ones the live system takes. The check is real: the same checker every live answer passes, run here in your browser on {FACTS.length} source-traced numbers. “Change one number” scales the median by half again, so you can watch it get flagged.</p>
    </div>
  );
}

// ---------- the page ----------
function Scene({ i, title, visual, children }: { i: number; title: string; visual: ReactNode; children: ReactNode }) {
  const s = SCENES[i], next = SCENES[i + 1];
  return (
    <section id={s.id} className="scene" data-scene={i} aria-labelledby={`${s.id}-h`}>
      <div className="scene-visual">{visual}</div>
      <div className="scene-copy">
        <p className="scene-k num">{pad(i)} / {pad(SCENES.length - 1)} · {s.short}</p>
        <h2 id={`${s.id}-h`} className="scene-h">{title}</h2>
        {children}
        {next && <a className="scene-next" href={`#${next.id}`}>Next: {next.short} <span aria-hidden="true">↓</span></a>}
      </div>
    </section>
  );
}

export function StoryPage() {
  const root = useRef<HTMLDivElement>(null);
  const iss = useIss();
  const { paused } = useMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    const els = [...root.current!.querySelectorAll<HTMLElement>(".scene")];
    const enter = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      (e.target as HTMLElement).dataset.in = "true";
      enter.unobserve(e.target);
    }), { threshold: 0.12 });
    const spot = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.scene)); }), { rootMargin: "-45% 0px -50% 0px" });
    els.forEach((el) => { enter.observe(el); spot.observe(el); });
    return () => { enter.disconnect(); spot.disconnect(); };
  }, []);

  return (
    <div className="page page-story" ref={root} data-bar-tone="dark" data-arrive-skip="" data-anim={paused ? "off" : "on"}>
      <header className="story-head">
        <p className="t-meta on-night">Story · a guided tour in five scenes</p>
        <h1 id="story-title" className="t-display-xl">From orbit to the Moon</h1>
        <p className="story-lede">See what Ignos does: where NASA's flames burned, how we turn their photos into speeds, the question they leave for a Moon base, and how every answer gets checked.</p>
        <a className="btn primary" href="#s-earth">Begin the tour <span aria-hidden="true">↓</span></a>
      </header>

      <nav className="story-rail" aria-label="Scenes">
        <ol>
          {SCENES.map((s, i) => (
            <li key={s.id}><a href={`#${s.id}`} aria-label={`Scene ${i + 1}: ${s.short}`} aria-current={i === active ? "step" : undefined}><span className="num">{pad(i)}</span><span className="rl">{s.short}</span></a></li>
          ))}
        </ol>
        <span className="rail-fill" style={{ transform: `scaleX(${(active + 1) / SCENES.length})` }} aria-hidden="true" />
      </nav>

      <Scene i={0} title="The flames burned up there" visual={<SpaceView mode="earth" iss={iss}><IssReadout iss={iss} /></SpaceView>}>
        <p>{iss.kind === "live" ? "That marker is the International Space Station, where it is right now." : `The International Space Station circles this planet; its live position is ${iss.kind === "loading" ? "still loading" : "unavailable right now"}, so no marker is drawn.`} NASA's BASS-II flames burned aboard this station, where nothing makes hot gas rise, so a flame lives on whatever air drifts or is blown past it.</p>
        <p className="caption">The position comes live from wheretheiss.at each time you open the page; if the feed fails, the page says so and draws no marker.</p>
      </Scene>

      <Scene i={1} title="Into the station" visual={<FlameFilm />}>
        <p>This is NASA's photo record of a flame in microgravity: a burning acrylic rod in a small duct, with fans setting a gentle airflow against it. No buoyant plume, no flicker; the flame creeps along the rod.</p>
        <p>Ignos starts from these raw photos, not from a summary of them.</p>
      </Scene>

      <Scene i={2} title="Photos in, speeds out" visual={<EdgeTrack />}>
        <div className="kpi">
          <span className="kpi-v"><Num source={SRC.median} label={`${fmt(MED, 1)}% median error at low airflow, show its source`}>{fmt(MED, 1)}%</Num></span>
          <span className="kpi-k">median error against NASA's published rates, at low airflow</span>
        </div>
        <p>Our tracker finds the flame's leading edge in every photo and fits one speed for each fan setting. Across <Num source={SRC.count}>{OK.length}</Num> validated low-airflow steps in <Num source={SRC.tests}>{N_TESTS}</Num> tests, those speeds land close to the rates NASA published (Link et al. 2018, Table S1). The early high-flow steps are unreliable, and we show them as such.</p>
        <p><a href="/research#measure">See every step and its source</a></p>
      </Scene>

      <Scene i={3} title="The Moon question" visual={<SpaceView mode="moon" />}>
        <p>On the Moon, weak gravity still makes hot gas rise, slowly. That faint draft changes how a flame gets its oxygen: neither the still air of orbit nor the strong plume of Earth.</p>
        <p>On the station, crews cut the ventilation to slow a fire. Whether turning the fans off does the same in a lunar habitat has not been tested.</p>
        <p><a className="btn primary" href="/habitats">Rank NASA's fire experiments for a habitat</a></p>
      </Scene>

      <Scene i={4} title="Ask, and every number is checked" visual={<AskWalk />}>
        <p>Ask answers questions from NASA's data and papers only. Before an answer is shown, a checker looks up every number in it against our source-traced data and marks each one verified or flagged.</p>
        <p className="caption">Hover or tap a green number to see the file, row and column it came from.</p>
      </Scene>
    </div>
  );
}
