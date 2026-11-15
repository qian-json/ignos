// Written with AI assistance (Claude Code)
// Every photo the tracker read for the open test, in one row at one height, each with its leading
// edge marked where data/derived/edges/<test>.csv puts it. The pictures are cut from the tracker's
// overlay video by scripts/build-frame-strips.mjs; the mark is placed from the CSV's edge_mm through
// the mm -> column fit that script recovered from the overlay's own v1 line. Picking a photo moves
// the shared replay cursor, and the row follows the cursor when the replay moves it.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useReplay } from "../replay";
import { Num } from "../Num";
import { cell, edges } from "../data";
import frames from "../data/frames.json";
import "./frame-strip.css";

interface Strip { frames: number; cols: number; tile: [number, number]; a: number; b: number }
const STRIPS = frames.strips as unknown as Record<string, Strip>;
const edgeFile = (t: string) => `data/derived/edges/${t}.csv`;

/** Calm scrolling unless the visitor asked for less motion or paused the page. */
const still = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "paused";

export function FrameStrip() {
  const { test, cursor, setCursor } = useReplay();
  const rows = edges[test] ?? [];
  const strip = STRIPS[test];
  const [pick, setPick] = useState(0);
  const [near, setNear] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const onScreen = useRef(false);
  const touched = useRef(0);

  // load the sheet only when the row comes near the screen; remember whether it is on screen
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { onScreen.current = e.isIntersecting; if (e.isIntersecting) setNear(true); }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => setPick(0), [test]);

  // follow the replay: pick the photo whose time is the cursor's, unless the reader is using the row
  useEffect(() => {
    if (cursor === null || document.activeElement === row.current || performance.now() - touched.current < 2000) return;
    const i = rows.findIndex((r) => Number(r.t_s) === cursor);
    if (i >= 0) setPick(i);
  }, [cursor, rows]);

  // keep the picked photo in view, scrolling the row only (never the page)
  useEffect(() => {
    const box = row.current;
    const el = box?.querySelector<HTMLElement>(`[data-i="${pick}"]`);
    if (!box || !el || !onScreen.current || document.hidden) return;
    const left = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: still() ? "auto" : "smooth" });
  }, [pick, test]);

  const choose = (i: number) => {
    const j = Math.max(0, Math.min(rows.length - 1, i));
    touched.current = performance.now();
    setPick(j);
    setCursor(Number(rows[j].t_s));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, PageDown: 10, PageUp: -10 }[e.key];
    if (step) { e.preventDefault(); choose(pick + step); }
    else if (e.key === "Home") { e.preventDefault(); choose(0); }
    else if (e.key === "End") { e.preventDefault(); choose(rows.length - 1); }
  };

  const cells = useMemo(() => rows.map((r, i) => {
    const has = r.edge_mm !== "";
    const x = has && strip ? (strip.a + strip.b * Number(r.edge_mm)) * 100 : null;
    return { i, x: x !== null && x >= 0 && x <= 100 ? x : null, fit: r.segment !== "" };
  }), [rows, strip]);

  if (!strip || !rows.length || strip.frames !== rows.length) return null;
  const cur = rows[pick] ?? rows[0];
  const vars = { "--cols": strip.cols, "--aspect": strip.tile[0] / strip.tile[1], "--sheet": near ? `url(/frames/${test}/sheet.jpg)` : "none" } as CSSProperties;

  return (
    <section className="fstrip" data-element="frame-strip" ref={root} aria-labelledby="fstrip-h">
      <div className="fstrip-head">
        <h3 id="fstrip-h">Every photo the tracker read, test {test}</h3>
        <p className="caption">
          {rows.length} photos from the overlay video, oldest first, each at its own shape. The blue tick is the leading edge where <code>{edgeFile(test)}</code> puts it; photos without one had no edge the tracker kept. An underline marks photos inside a fitted fan step.
        </p>
      </div>
      <div
        ref={row}
        className="fstrip-row"
        style={vars}
        tabIndex={0}
        role="slider"
        aria-label={`Photos of test ${test}`}
        aria-valuemin={1}
        aria-valuemax={rows.length}
        aria-valuenow={pick + 1}
        aria-valuetext={`Photo ${pick + 1} of ${rows.length}${cur.edge_mm !== "" ? `, edge ${cur.edge_mm} mm` : ", no edge"}`}
        onKeyDown={onKey}
        onClick={(e) => { const t = (e.target as HTMLElement).closest<HTMLElement>("[data-i]"); if (t) choose(Number(t.dataset.i)); }}
      >
        <ol className="fstrip-frames" aria-hidden="true">
          {cells.map((c) => (
            <li key={c.i} data-i={c.i} data-on={c.i === pick || undefined} data-fit={c.fit || undefined}
              style={{ "--c": c.i % strip.cols, "--r": Math.floor(c.i / strip.cols) } as CSSProperties}>
              <span className="fstrip-pic" />
              {c.x !== null && <span className="fstrip-mark" style={{ left: `${c.x}%` }} />}
            </li>
          ))}
        </ol>
      </div>
      <p className="fstrip-read" aria-live="polite">
        <span>Photo {pick + 1} of {rows.length}</span>
        <span>t = <Num source={cell(edgeFile(test), cur._row, "t_s")}>{cur.t_s} s</Num></span>
        <span>{cur.edge_mm !== "" ? <>Leading edge <Num source={cell(edgeFile(test), cur._row, "edge_mm")}>{cur.edge_mm} mm</Num></> : "No edge kept"}</span>
        <span className="fstrip-hint">Arrow keys step through; click a photo to move the replay there.</span>
      </p>
    </section>
  );
}
