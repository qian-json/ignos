// Written with AI assistance (Claude Code)
// The Method page's opening: the proof chain for one real number, drawn as a stack of six slightly tilted
// layers, from the sentence a reader sees down to the checker's verdict. Pointing at the stack (or focusing
// it) pulls the layers apart; pointing at one layer, or the arrow keys, lifts the layers above it away,
// and the readout beside the stack says what that layer is. Click or Enter pins it apart, Esc closes.
// The sentence is built from the median-error fact in the fact index and run through gateAnswer() here,
// so the file, rows, column, checksum and verdict are what the checker really returned.
// Nothing moves on its own: the only motion is the transition when someone points. Reduced motion and the
// Pause switch show the layers already apart, with no travel.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { gateAnswer, type NumberSource, type Provenance } from "@still-air/proof";
import { FACTS, SPREAD_FILE, spread } from "../data";
import { Num } from "../Num";
import { PageHeading } from "./PageHeading";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./display-type.css";
import "./proof-layers.css";

const FACT_ID = "method:validation:median_abs_pct_error";
type Tone = "plain" | "ink" | "ok" | "warn";
interface Layer { key: string; label: string; tone: Tone; face: ReactNode; note: ReactNode }

function useChain(): Layer[] | null {
  return useMemo(() => {
    const fact = FACTS.find((f) => f.id === FACT_ID);
    if (!fact || !fact.cite) return null;
    const unit = fact.unit === "%" ? "%" : fact.unit ? ` ${fact.unit}` : "";
    const sentence = `Measured from the raw photos, our spread rates differ from NASA's published ones by a median of ${fact.value}${unit}.`;
    const { gate } = gateAnswer(sentence, { facts: FACTS, citations: [{ kind: "row", id: fact.cite }] });
    const n = gate.numbers[0];
    if (!n || n.start === null || n.end === null) return null;
    const src = n.source && "file" in n.source ? (n.source as Provenance) : null;
    const ok = gate.action === "passed" && src !== null;
    const shown = (s: NumberSource | null, text: string) => (s ? <Num source={s}>{text}</Num> : text);
    const places = n.text.match(/\.(\d+)/)?.[1].length ?? 0;
    const rows = src ? (src.rows && src.rows.length ? src.rows : [src.row]) : [];
    const isSpread = src?.file === SPREAD_FILE;
    const rowName = (r: number) => (isSpread && spread[r] ? spread[r].test_id : String(r));

    return [
      {
        key: "sentence", label: "A sentence", tone: "plain",
        face: <p className="pl-sentence">{sentence.slice(0, n.start)}<mark>{shown(n.source, n.text)}</mark>{sentence.slice(n.end)}</p>,
        note: "The claim as a reader sees it. Before anyone does, the checker reads it.",
      },
      {
        key: "number", label: "Its number", tone: "ink",
        face: <p className="pl-big">{shown(n.source, n.text)}</p>,
        note: <>It pulls out the number, its unit (<b>{n.unit ?? "none"}</b>) and how precisely it was written ({places === 0 ? "a whole number" : places === 1 ? "one decimal place" : `${places} decimal places`}).</>,
      },
      {
        key: "file", label: "The file", tone: "plain",
        face: src ? <code className="pl-code">{src.file}</code> : <p>No fact matched.</p>,
        note: src ? <>A fact with the same unit agrees to that precision. It was read from <code>{src.file}</code>.</> : "No fact with that unit agreed, so there is no file.",
      },
      {
        key: "cells", label: "The row and column", tone: "plain",
        face: src ? (
          <div className="pl-cells">
            <span><span className="pl-k">{rows.length > 1 ? "rows" : "row"}</span> {rows.map(rowName).join(" ")}</span>
            <span><span className="pl-k">column</span> <code>{src.column}</code></span>
          </div>
        ) : <p>No rows.</p>,
        note: src ? <>Computed from {rows.length > 1 ? "the rows for tests" : "the row for test"} {rows.map(rowName).join(", ")}, column <code>{src.column}</code>{src.derived ? <>: {src.derived}</> : null}.</> : "No rows to point to.",
      },
      {
        key: "checksum", label: "The checksum (sha256)", tone: "ink",
        face: src?.sha256 ? <code className="pl-hash">{src.sha256}</code> : <p>No checksum recorded.</p>,
        note: src?.sha256 ? <>The file's sha256 pins the exact version of the data: <code className="pl-hash-inline">{src.sha256}</code></> : "No checksum was recorded for this file.",
      },
      {
        key: "verdict", label: ok ? "Verified" : "Not verified", tone: ok ? "ok" : "warn",
        face: (
          <p className="pl-verdict">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="26" height="26"><path d={ok ? "M5 12.5l4.5 4.5L19 7.5" : "M12 7v6M12 16.5v.5"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <b>{ok ? "Verified" : "Not verified"}</b>
          </p>
        ),
        note: ok
          ? <>Every link held, so the sentence is shown with its number marked verified ({gate.verified} of {gate.checked} {gate.checked === 1 ? "number" : "numbers"} matched by <code>gateAnswer</code>).</>
          : "The checker could not match this number, so it is flagged, never passed.",
      },
    ];
  }, []);
}

const REST_NOTE = "Six layers, from the sentence a reader sees down to the verdict. Tap or point at one, or focus the stack and use the arrow keys.";

export function ProofLayers() {
  const chain = useChain();
  const [active, setActive] = useState(-1);
  const [pinned, setPinned] = useState(false);
  const [still, setStill] = useState(() => prefersReduced() || motionPaused());
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => watchMotion(() => setStill(prefersReduced() || motionPaused())), []);

  if (!chain) return null;
  const N = chain.length;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== stage.current) return;   // keys typed on a number inside a layer are that number's own
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step) { e.preventDefault(); setActive((a) => (a < 0 ? (step > 0 ? 0 : N - 1) : (a + step + N) % N)); return; }
    if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(N - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPinned((p) => !p); }
    else if (e.key === "Escape") { setPinned(false); setActive(-1); }
  };

  // the layers overlap on screen, so pick the one whose drawn centre is nearest the pointer (up the stack = up a layer)
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const items = stage.current?.querySelectorAll<HTMLElement>(".pl-layer");
    if (!items) return;
    let best = -1, bd = Infinity;
    items.forEach((l, i) => {
      const r = l.getBoundingClientRect();
      if (e.clientX < r.left - 20 || e.clientX > r.right + 20 || e.clientY < r.top - 20 || e.clientY > r.bottom + 20) return;
      const d = Math.abs(e.clientY - (r.top + r.height / 2));
      if (d < bd) { bd = d; best = i; }
    });
    if (best !== active) setActive(best);
  };

  const current = active >= 0 ? chain[active] : null;
  return (
    <section className="pl" data-element="proof-layers" aria-labelledby="method-title" data-still={still ? "" : undefined}>
      <div className="pl-text">
        <PageHeading as="h1" meta="Method · sources and checks" className="t-display-xl" id="method-title">How every number is checked</PageHeading>
        <p className="pl-lede">Each number on this site is traced to a file, a row and a column, and that file's checksum, before it is shown.</p>
        <div className="pl-readout" id="pl-readout" aria-live="polite">
          {current ? (
            <>
              <span className="t-meta">{String(active + 1).padStart(2, "0")} / {String(N).padStart(2, "0")} · {current.label}</span>
              <p>{current.note}</p>
            </>
          ) : (
            <>
              <p>{REST_NOTE}</p>
            </>
          )}
        </div>
      </div>
      <div
        ref={stage}
        className={`pl-stage${pinned ? " is-pinned" : ""}`}
        style={{ ["--pl-n" as string]: N }}
        tabIndex={0}
        role="group"
        aria-label="The proof chain, six layers. Arrow keys move through them; Enter pins them apart; Escape closes."
        aria-describedby="pl-readout"
        data-active={active >= 0 ? "" : undefined}
        onKeyDown={onKey}
        onPointerMove={onMove}
        onPointerLeave={(e) => { if (e.pointerType === "mouse" && !pinned) setActive(-1); }}
        onBlur={(e) => { if (!pinned && !e.currentTarget.contains(e.relatedTarget as Node)) setActive(-1); }}
      >
        <div className="pl-view">
          <ol className="pl-rig">
            {chain.map((l, i) => (
              <li
                key={l.key}
                className={`pl-layer tone-${l.tone}${i === active ? " is-active" : active >= 0 && i < active ? " is-above" : ""}`}
                style={{ ["--i" as string]: N - 1 - i }}
                onClick={() => { setActive(i); setPinned(true); }}
              >
                <span className="pl-tag">{String(i + 1).padStart(2, "0")} {l.label}</span>
                <div className="pl-face">{l.face}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
