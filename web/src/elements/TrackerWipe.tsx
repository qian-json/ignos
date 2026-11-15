// Written with AI assistance (Claude Code)
// One NASA photo two ways, split by a line you can drag: the photo as decoded from the camera's raw
// file, and the tracker's overlay of the same photo with its v1 edge and the blue-light front.
// Raw photos exist in the repo for test B16 only (docs/plan-images, decoded from the .NEF files),
// so this compares B16 whatever test is open. Until the reader touches it, scrolling opens the line
// as the picture arrives; reduced motion and the Pause switch hold it still just past the edge.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Num } from "../Num";
import { cell, edges } from "../data";
import frames from "../data/frames.json";
import "./tracker-wipe.css";

const PAIRS = frames.pairs;
const TEST = PAIRS.test;
const FILE = `data/derived/edges/${TEST}.csv`;
const MID = 50;
const STRIP = (frames.strips as unknown as Record<string, { a: number; b: number }>)[TEST];
/** Where the line rests: just past the v1 edge (placed from the CSV through the strip's fit), so the drawn lines show. */
const rest = (edgeMm: string) => {
  if (!STRIP || edgeMm === "") return MID;
  return Math.round(Math.min(90, Math.max(MID, (STRIP.a + STRIP.b * Number(edgeMm)) * 100 + 3)));
};

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const paused = () => document.documentElement.dataset.motion === "paused";

export function TrackerWipe() {
  const rows = edges[TEST] ?? [];
  const photos = PAIRS.photos.filter((p) => rows[p.row] && rows[p.row].edge_mm !== "");
  const [k, setK] = useState(Math.min(1, photos.length - 1));
  const [x, setX] = useState(MID);
  const fig = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const dragging = useRef(false);
  const restAt = useRef(MID);
  restAt.current = photos[k] ? rest(rows[photos[k].row].edge_mm) : MID;

  // scroll opens the line from all-overlay to just past the edge, only while on screen and allowed to move
  useEffect(() => {
    const el = fig.current;
    if (!el) return;
    let on = false, raf = 0;
    const still = () => reduced() || paused() || touched.current;
    const drive = () => {
      raf = 0;
      if (!on || still() || document.hidden) return;
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75)));
      setX(Math.round(100 - (100 - restAt.current) * p));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(drive); };
    const settle = () => { if (!touched.current && (reduced() || paused())) setX(restAt.current); else onScroll(); };
    const io = new IntersectionObserver(([e]) => {
      on = e.isIntersecting;
      if (on) { window.addEventListener("scroll", onScroll, { passive: true }); onScroll(); }
      else window.removeEventListener("scroll", onScroll);
    });
    io.observe(el);
    const mo = new MutationObserver(settle);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", settle);
    settle();
    return () => {
      io.disconnect(); mo.disconnect(); mq.removeEventListener("change", settle);
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (!photos.length) return null;
  const p = photos[k];
  const row = rows[p.row];

  const at = (clientX: number) => {
    const r = fig.current!.getBoundingClientRect();
    setX(Math.round(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100))));
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    touched.current = true; dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    at(e.clientX);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => { if (dragging.current) at(e.clientX); };
  const up = () => { dragging.current = false; };
  const key = (e: KeyboardEvent) => {
    const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -20, PageUp: 20 }[e.key];
    let next: number | null = step ? x + step : e.key === "Home" ? 0 : e.key === "End" ? 100 : null;
    if (next === null) return;
    e.preventDefault();
    touched.current = true;
    next = Math.min(100, Math.max(0, next));
    setX(next);
  };

  return (
    <section className="twipe" data-element="tracker-wipe" aria-labelledby="twipe-h">
      <div className="twipe-text">
        <h3 id="twipe-h">The raw photo against what the tracker drew</h3>
        <p className="caption">
          Test {TEST}, the one test with raw photos in our repository. Left of the line is the tracker's overlay: brightness evened out across shutter speeds, the v1 edge it measures from as a solid cyan line, and the blue-light front as a dashed line (a diagnostic, used in no rate). Right of the line is the same photo decoded from NASA's raw camera file, at the camera's own exposure.
        </p>
        <div className="seg small" role="group" aria-label="Choose a photo">
          {photos.map((q, i) => (
            <button key={q.photo} type="button" aria-pressed={i === k} onClick={() => { setK(i); if (!touched.current) setX(rest(rows[q.row].edge_mm)); }}>Photo {q.photo}</button>
          ))}
        </div>
        <dl className="twipe-facts">
          <div><dt>Taken at</dt><dd className="num">t = <Num source={cell(FILE, row._row, "t_s")}>{row.t_s} s</Num></dd></div>
          <div><dt>v1 edge</dt><dd className="num"><Num source={cell(FILE, row._row, "edge_mm")}>{row.edge_mm} mm</Num></dd></div>
        </dl>
      </div>
      <figure className="twipe-fig">
        <div
          ref={fig}
          className="twipe-stage"
          style={{ "--x": `${x}%` } as CSSProperties}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <img className="twipe-raw" src={p.raw} width={900} height={598} alt={`Photo ${p.photo} of test ${TEST} as decoded from NASA's raw camera file`} decoding="async" />
          <img className="twipe-top" src={p.tracked} width={900} height={598} alt={`The tracker's overlay of photo ${p.photo}, with the v1 edge and the blue-light front drawn`} decoding="async" />
          <span className="twipe-tag l" aria-hidden="true">Tracker</span>
          <span className="twipe-tag r" aria-hidden="true">Raw</span>
          <button
            type="button"
            className="twipe-handle"
            role="slider"
            aria-label="Wipe between the tracker's overlay and the raw photo"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={x}
            aria-valuetext={`${x}% tracker overlay`}
            onKeyDown={key}
          ><span aria-hidden="true" /></button>
        </div>
        <figcaption className="caption">Drag the line, or focus it and use the arrow keys, to compare. Raw file: <code>{p.source}</code></figcaption>
      </figure>
    </section>
  );
}
