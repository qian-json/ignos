// Written with AI assistance (Claude Code)
// The Home opening: the Blender film (an illustration) scrubbed by scroll, with the story's chapters
// riding its beats. The headline, one sentence and the way in sit over the first beat; the fan steps,
// still air, the Moon and the data follow. The readout beside the film always shows a true value from
// test B16's rows in spread_rates.csv for the beat on screen, with its source; it never shows a lunar
// airflow (nobody has measured one). The film is the "journey" the top bar and the phone bar look for.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getScroll, subscribe } from "../router/scroll";
import { motionPaused, prefersReduced, watchMotion } from "../elements/motionState";
import { Num } from "../Num";
import { SPREAD_FILE, cell, spread, validated, type Row } from "../data";
import { ScrollFilm, type FilmChapter, type FilmFrameState } from "../film/ScrollFilm";
import "./film-opening.css";

const TEST = spread[0].test_id;
const STEPS = spread.filter((r) => r.test_id === TEST).sort((a, b) => Number(a.t_start_s) - Number(b.t_start_s));
const FIRST = STEPS[0];
const LAST = STEPS[STEPS.length - 1];
const N = STEPS.length;

// film frames (1-based, from the film's manifest beats): the fans run from "fans-full", step down
// through "fans-down" and stop at "fans-off"
const AT = { fans: "fans-full", still: 112, moon: "fans-off", data: 154 } as const;
const MOON_FROM = 131;               // 0-based frame of the "fans-off" beat
const STEP_FROM = 61, STEP_TO = 112;   // 0-based frames over which the readout walks the fan steps

type Shown = { kind: "step"; row: Row; out?: boolean } | { kind: "moon" };

function shownAt(frame: number): Shown {
  if (frame < STEP_FROM) return { kind: "step", row: FIRST };
  if (frame < STEP_TO) {
    const i = Math.min(N - 1, Math.floor(((frame - STEP_FROM) / (STEP_TO - STEP_FROM)) * N));
    return { kind: "step", row: STEPS[i] };
  }
  if (frame < MOON_FROM) return { kind: "step", row: LAST, out: true };
  return { kind: "moon" };
}
const keyOf = (s: Shown) => (s.kind === "step" ? `${s.row._row}${s.out ? "x" : ""}` : s.kind);

function Readout({ shown }: { shown: Shown }) {
  const rows: [string, ReactNode][] = [];
  if (shown.kind === "moon") rows.push(["gravity", "Moon"], ["airflow", "not known"]);
  else {
    const r = shown.row;
    rows.push(
      ["gravity", "orbit"],
      ["fans", <Num source={cell(SPREAD_FILE, r._row, "flow_cm_s")}>{r.flow_cm_s} cm/s</Num>],
      shown.out
        ? ["flame", <>out at <Num source={cell(SPREAD_FILE, r._row, "extinction_s")}>{r.extinction_s} s</Num></>]
        // a high-flow or low-confidence step is shown, but flagged, as on the Research page
        : ["spread", <><Num source={cell(SPREAD_FILE, r._row, "rate_mm_s")}>{r.rate_mm_s} mm/s</Num>{!validated(r) && <>{" "}<span className="tag low">not validated</span></>}</>],
    );
  }
  return (
    <dl className="readout fo-readout" aria-label={`Test ${TEST}, now showing`}>
      <div className="ro-head"><dt>test</dt><dd>{TEST}</dd></div>
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

/** A real flame, right after the film on Home: NASA's own BASS-II photos of test B12 as a short loop
 * (display only). It lives outside the film so the 3D film stays the one moving thing on the first
 * screen. Muted and inline so it plays on phones; it loads nothing until it is near the screen, plays
 * only while it is on screen, and under reduced motion or the Pause switch only its poster frame shows. */
export function RealFlame() {
  // live, so the Pause button and the reduced-motion setting stop the loop while it is on screen
  const [still, setStill] = useState(() => typeof document === "undefined" || prefersReduced() || motionPaused());
  useEffect(() => watchMotion(() => setStill(prefersReduced() || motionPaused())), []);
  const fig = useRef<HTMLElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const box = fig.current, v = vid.current;
    if (still || !box || !v) return;
    v.muted = true;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !document.hidden) { v.preload = "auto"; void v.play().catch(() => {}); } else v.pause();
    }, { threshold: 0.25 });
    io.observe(box);
    return () => { io.disconnect(); v.pause(); };
  }, [still]);
  return (
    <figure ref={fig} className="real-flame" id="real-flame">
      {still ? (
        <img src="/visuals/B12_flame_clip_poster.jpg" alt="A real flame on an acrylic rod aboard the space station, from NASA BASS-II photos" width={1280} height={720} loading="lazy" />
      ) : (
        <video ref={vid} src="/visuals/B12_flame_clip_web.mp4" poster="/visuals/B12_flame_clip_poster.jpg" muted loop playsInline preload="none" width={1280} height={720} aria-label="A real flame on an acrylic rod aboard the space station, from NASA BASS-II photos" />
      )}
      <figcaption>A real flame aboard the space station. NASA BASS-II photos (PSI-25); time-lapse, in-between frames blended.</figcaption>
    </figure>
  );
}

const CHAPTERS: FilmChapter[] = [
  {
    atBeat: "approach",
    node: (
      <div className="hero-copy fo-open">
        <h1 id="hero-h" className="split" data-element="headline-glow">
          <span><span className="ln" style={{ ["--i" as string]: 0 }}><span>Fans off stops</span></span> <span className="ln" style={{ ["--i" as string]: 1 }}><span>fire in orbit.</span></span></span>{" "}
          <span className="pay"><span className="ln" style={{ ["--i" as string]: 2 }}><span>On the Moon,</span></span> <span className="ln" style={{ ["--i" as string]: 3 }}><span>it may not.</span></span></span>
        </h1>
        <p className="hero3d-lede">Ignos re-measures flames from NASA's space-station photos and shows which of NASA's fire tests apply to your habitat.</p>
        <div className="hero3d-actions">
          <a className="btn primary" href="/habitats">Pick a habitat</a>
        </div>
      </div>
    ),
  },
  {
    atBeat: AT.fans,
    node: (
      <div className="fo-ch">
        <h2>Turn the fans down.</h2>
        <p>The crew stepped test {TEST}'s fans from <Num source={cell(SPREAD_FILE, FIRST._row, "flow_cm_s")}>{FIRST.flow_cm_s}</Num> to <Num source={cell(SPREAD_FILE, LAST._row, "flow_cm_s")}>{LAST.flow_cm_s} cm/s</Num> while an acrylic rod burned.</p>
      </div>
    ),
  },
  {
    atBeat: AT.still,
    node: (
      <div className="fo-ch">
        <h2>Then the air goes still.</h2>
        <p>At the slowest setting it crept at <Num source={cell(SPREAD_FILE, LAST._row, "rate_mm_s")}>{LAST.rate_mm_s} mm/s</Num>, then went out. Without gravity, warm gas doesn't rise, so the fans set the airflow around a flame.</p>
      </div>
    ),
  },
  {
    atBeat: AT.moon,
    node: (
      <div className="fo-ch">
        <h2>On the Moon, warm air rises again.</h2>
        <p>A flame's own heat sets up a slow draft, even with the fans off. How fast, we found no published measurement.</p>
      </div>
    ),
  },
  {
    atBeat: AT.data,
    node: (
      <div className="fo-ch">
        <h2>So we re-measured the station's flames, and checked every number.</h2>
        <p className="fo-actions"><a className="btn primary" href="/research">See the research</a></p>
      </div>
    ),
  },
];

export function FilmOpening() {
  const [shown, setShown] = useState<Shown>(() => shownAt(0));
  const last = useRef(keyOf(shown));
  const onFrame = useCallback((s: FilmFrameState) => {
    const next = shownAt(s.frame);
    const k = keyOf(next);
    if (k !== last.current) { last.current = k; setShown(next); }
  }, []);

  // the headline is set in perspective, receding into the duct, and flattens as the film scrolls in;
  // held still, the stylesheet keeps a gentle fixed tilt instead
  const sec = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = sec.current;
    if (!el) return;
    let off: (() => void) | null = null;
    const apply = (y: number) => {
      const t = Math.min(1, Math.max(0, y / (innerHeight * 0.7)));
      el.style.setProperty("--fo-tilt", (1 - t * (2 - t)).toFixed(3));
    };
    const sync = () => {
      off?.(); off = null;
      if (prefersReduced() || motionPaused()) { el.style.removeProperty("--fo-tilt"); return; }
      apply(getScroll().y || scrollY);
      off = subscribe((f) => apply(f.y));
    };
    sync();
    const unwatch = watchMotion(sync);
    return () => { off?.(); unwatch(); };
  }, []);

  return (
    <section ref={sec} className="journey film-open" aria-labelledby="hero-h">
      <ScrollFilm chapters={CHAPTERS} onFrame={onFrame} length={4.5} labelText={{ rod: "Acrylic rod" }} overlay={<Readout shown={shown} />} />
    </section>
  );
}
