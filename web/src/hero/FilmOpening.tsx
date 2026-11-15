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
import { SPREAD_FILE, cell, spread, type Row } from "../data";
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
        : ["spread", <Num source={cell(SPREAD_FILE, r._row, "rate_mm_s")}>{r.rate_mm_s} mm/s</Num>],
    );
  }
  return (
    <dl className="readout fo-readout" aria-label={`Test ${TEST}, now showing`}>
      <div className="ro-head"><dt>test</dt><dd>{TEST}</dd></div>
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
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
        <p className="hero3d-lede">We measured space-station flames from NASA's photos and asked what changes on the Moon.</p>
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
        <p>At the slowest setting it crept at <Num source={cell(SPREAD_FILE, LAST._row, "rate_mm_s")}>{LAST.rate_mm_s} mm/s</Num>, then went out. Without gravity, warm gas doesn't rise, so crews cut ventilation to slow a fire's spread.</p>
      </div>
    ),
  },
  {
    atBeat: AT.moon,
    node: (
      <div className="fo-ch">
        <h2>On the Moon, warm air rises again.</h2>
        <p>A flame's own heat sets up a slow draft, even with the fans off. How fast, nobody has measured.</p>
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
