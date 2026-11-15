// Written with AI assistance (Claude Code)
// How the checker verifies one real number, told as you scroll: a pinned stage where one shape
// changes size, corners and tone from a sentence, to the number in it, to the file, rows and column
// the number came from, to the file's checksum, to the verdict. The sentence is built from the
// median-error fact in the fact index and run through gateAnswer() on this page, so the verdict and
// every source shown are what the checker really returned. With reduced motion the steps are shown
// stacked and still.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { gateAnswer, type NumberSource, type Provenance } from "@still-air/proof";
import { FACTS, SPREAD_FILE, cell, spread } from "../data";
import { Num } from "../Num";
import { motionPaused, useReducedMotion, watchMotion } from "./motionState";
import "./checker-story.css";

const FACT_ID = "method:validation:median_abs_pct_error";
type Tone = "card" | "ink" | "ok" | "warn";
interface Step { key: string; tone: Tone; radius: number; copy: string; body: ReactNode }

function useStory(): Step[] | null {
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

    return [
      {
        key: "sentence", tone: "card", radius: 14,
        copy: "An answer arrives as a sentence. Before anyone sees it, the checker reads it.",
        body: <p className="cs-sentence">{sentence.slice(0, n.start)}<mark>{shown(n.source, n.text)}</mark>{sentence.slice(n.end)}</p>,
      },
      {
        key: "number", tone: "ink", radius: 40,
        copy: "It finds each number, its unit, and how precisely it was written.",
        body: (
          <div className="cs-number">
            <span className="cs-big">{shown(n.source, n.text)}</span>
            <span className="cs-meta">unit <b>{n.unit ?? "none"}</b> · {places === 0 ? "a whole number" : places === 1 ? "one decimal place" : `${places} decimal places`}</span>
          </div>
        ),
      },
      {
        key: "file", tone: "card", radius: 12,
        copy: "It looks for a fact with the same unit that agrees to that precision, and finds which file holds it.",
        body: src ? <div className="cs-kv"><span className="k">File</span><code>{src.file}</code></div> : <p>No fact matched.</p>,
      },
      {
        key: "rows", tone: "ink", radius: 18,
        copy: "Then the rows it was computed from.",
        body: (
          <div className="cs-rows">
            <span className="k">{rows.length > 1 ? "Rows" : "Row"}</span>
            <ul>{rows.map((r) => <li key={r}><span className="num">{r}</span>{isSpread && spread[r] ? <span className="cs-id">{spread[r].test_id}</span> : null}</li>)}</ul>
            {src?.derived && <span className="cs-meta">{src.derived}</span>}
          </div>
        ),
      },
      {
        key: "column", tone: "card", radius: 12,
        copy: "And the column, with the value in each of those rows.",
        body: src ? (
          <div className="cs-rows">
            <span className="k">Column <code>{src.column}</code></span>
            <ul>
              {rows.map((r) => {
                const v = isSpread ? spread[r]?.[src.column] : undefined;
                return <li key={r}>{isSpread && spread[r] ? <span className="cs-id">{spread[r].test_id}</span> : <span className="num">{r}</span>}{v !== undefined && v !== "" ? <Num source={cell(src.file, r, src.column)}>{v}{unit}</Num> : null}</li>;
              })}
            </ul>
          </div>
        ) : <p>No column.</p>,
      },
      {
        key: "checksum", tone: "ink", radius: 10,
        copy: "The file's checksum pins the exact version of the data the fact was read from.",
        body: src?.sha256 ? <div className="cs-kv"><span className="k">sha256</span><code className="cs-hash">{src.sha256}</code></div> : <p>No checksum recorded.</p>,
      },
      {
        key: "verdict", tone: ok ? "ok" : "warn", radius: 36,
        copy: ok ? "Only then is the sentence shown, with its number marked verified." : "The checker could not match this number, so it is flagged, never passed.",
        body: (
          <div className="cs-verdict">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="28" height="28"><path d={ok ? "M5 12.5l4.5 4.5L19 7.5" : "M12 7v6M12 16.5v.5"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span><b>{ok ? "Verified" : "Not verified"}</b><span className="cs-meta">{gate.verified} of {gate.checked} {gate.checked === 1 ? "number" : "numbers"} matched by <code>gateAnswer</code></span></span>
          </div>
        ),
      },
    ];
  }, []);
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TONE_VAR: Record<Tone, string> = { card: "--surface", ink: "--night", ok: "--verified", warn: "--unverified" };

export function CheckerStory() {
  const steps = useStory();
  const reduced = useReducedMotion();
  if (!steps) return null;
  return reduced ? <StoryStill steps={steps} /> : <StoryPinned steps={steps} />;
}

function StoryStill({ steps }: { steps: Step[] }) {
  return (
    <section className="cs cs-still" data-element="checker-story" aria-labelledby="cs-h">
      <h3 id="cs-h">One number, checked</h3>
      <ol className="cs-strip">
        {steps.map((s) => (
          <li key={s.key}>
            <p className="cs-line">{s.copy}</p>
            <div className={`cs-face tone-${s.tone}`} style={{ borderRadius: s.radius }}>{s.body}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StoryPinned({ steps }: { steps: Step[] }) {
  const N = steps.length;
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const shapeRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = rootRef.current!, stage = stageRef.current!, shape = shapeRef.current!;
    const layers = layerRefs.current.slice(0, N) as HTMLDivElement[];
    let geo: { w: number; h: number }[] = [];
    let tones: number[][] = [];
    let t = 0, target = 0, raf = 0, last = 0, onScreen = false, shownStep = -1;

    function rgb(token: string): number[] {
      const probe = document.createElement("i");
      probe.style.color = `var(${token})`; stage.appendChild(probe);
      const m = getComputedStyle(probe).color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
      probe.remove();
      return m.slice(0, 3);
    }
    function measure() {
      geo = layers.map((l) => ({ w: l.offsetWidth, h: l.offsetHeight }));
      tones = steps.map((s) => rgb(TONE_VAR[s.tone]));
    }
    function progress() {
      const r = root.getBoundingClientRect();
      const bar = parseFloat(getComputedStyle(root).getPropertyValue("--bar")) || 0;
      const range = r.height - (innerHeight - bar);
      return range > 0 ? Math.min(1, Math.max(0, (bar - r.top) / range)) * (N - 1) : 0;
    }
    function render() {
      const cut = motionPaused();
      const i = Math.min(N - 1, Math.floor(t)), u = t - i;
      const j = Math.min(N - 1, i + 1);
      const k = i === N - 1 ? 0 : cut ? (u < 0.5 ? 0 : 1) : smooth(0.42, 0.58, u);
      const a = geo[i], b = geo[j];
      if (!a || !b) return;
      const lerp = (x: number, y: number) => x + (y - x) * k;
      shape.style.width = `${lerp(a.w, b.w)}px`;
      shape.style.height = `${lerp(a.h, b.h)}px`;
      shape.style.borderRadius = `${lerp(steps[i].radius, steps[j].radius)}px`;
      const c = tones[i].map((v, n) => Math.round(lerp(v, tones[j][n])));
      shape.style.backgroundColor = `rgb(${c.join(",")})`;
      // the old content leaves first, the new one arrives after it, out of a short blur
      layers.forEach((l, n) => {
        let o = 0, e = 1;
        if (n === i) { o = 1 - smooth(0, 0.5, k); e = 1; }
        if (n === j && j !== i) { e = smooth(0.5, 1, k); o = e; }
        const atRest = o === 1 && e === 1;
        l.style.opacity = String(o);
        l.style.visibility = o > 0.001 ? "visible" : "hidden";
        l.style.transform = atRest || cut ? "none" : `scale(${0.94 + 0.06 * e})`;
        l.style.filter = atRest || cut ? "none" : `blur(${((1 - e) * 8).toFixed(2)}px)`;
      });
      const now = k < 0.5 ? i : j;
      if (now !== shownStep) {
        shownStep = now;
        layers.forEach((l, n) => { l.inert = n !== now; l.setAttribute("aria-hidden", String(n !== now)); });
        setActive(now);
      }
    }
    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      t = motionPaused() ? target : t + (target - t) * (1 - Math.exp(-dt / 0.1));
      if (Math.abs(target - t) < 0.001) t = target;
      render();
      raf = t !== target && onScreen && !document.hidden ? requestAnimationFrame(frame) : 0;
    }
    function kick() {
      target = progress();
      if (motionPaused() || document.hidden) { cancelAnimationFrame(raf); raf = 0; t = target; render(); return; }
      if (!raf && onScreen) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }
    const ac = new AbortController();
    addEventListener("scroll", kick, { passive: true, signal: ac.signal });
    addEventListener("resize", () => { measure(); render(); kick(); }, { passive: true, signal: ac.signal });
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) kick(); else { cancelAnimationFrame(raf); raf = 0; } });
    io.observe(root);
    const ro = new ResizeObserver(() => { measure(); render(); });
    ro.observe(stage);
    const stop = watchMotion(() => { if (motionPaused() || document.hidden) { t = target = progress(); cancelAnimationFrame(raf); raf = 0; render(); } else kick(); });
    measure(); t = target = progress(); render();
    return () => { ac.abort(); io.disconnect(); ro.disconnect(); stop(); cancelAnimationFrame(raf); };
  }, [N, steps]);

  return (
    <section ref={rootRef} className="cs cs-pinned" data-element="checker-story" aria-labelledby="cs-h" style={{ height: `calc(100svh + ${(N - 1) * 55}svh)` }}>
      <div className="cs-pin">
        <div className="cs-copy">
          <h3 id="cs-h">One number, checked</h3>
          <span className="cs-count" aria-hidden="true">{active + 1} / {N}</span>
          <ol className="cs-lines">
            {steps.map((s, n) => <li key={s.key} className={n === active ? "is-on" : ""} aria-current={n === active ? "step" : undefined}>{s.copy}</li>)}
          </ol>
        </div>
        <div ref={stageRef} className="cs-stage">
          <div ref={shapeRef} className="cs-shape" aria-hidden="true" />
          {steps.map((s, n) => (
            <div key={s.key} ref={(el) => { layerRefs.current[n] = el; }} className={`cs-layer cs-face tone-${s.tone}`}>{s.body}</div>
          ))}
        </div>
      </div>
    </section>
  );
}
