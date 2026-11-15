// Written with AI assistance (Claude Code)
import { useEffect, useMemo, useRef, useState } from "react";
import type { MoonGapOk } from "@still-air/proof";
import { C, Plot, ring } from "../Plot";
import { Num } from "../Num";
import { MATERIAL_NAMES, MOONGAP_FILE, cell, fmt, moongap } from "../data";
import { EnvelopeScale } from "../elements/EnvelopeScale";
import { risingFill } from "../elements/risingFill";
import { More } from "../ui/More";

type View = "all" | "station" | "moon" | "earth";
const OK = Object.values(moongap.materials).filter((m): m is MoonGapOk => m?.status === "ok");
const at = (path: string) => cell(MOONGAP_FILE, 0, path);

export function MoonGap() {
  const [key, setKey] = useState(moongap.ranking[0]?.material ?? OK[0].material);
  const [view, setView] = useState<View>("all");
  const [showBase, setShowBase] = useState(false);
  const bandRef = useRef<HTMLElement>(null);
  useEffect(() => (bandRef.current ? risingFill(bandRef.current) : undefined), []);
  const m = OK.find((x) => x.material === key)!;
  const p = `materials.${key}`;
  const dim = (v: View) => (view === "all" || view === v ? 1 : 0.15);
  const bands = moongap.context_bands;
  const base = moongap.reference_lines.moon_base_o2;

  const chart = useMemo(() => {
    const xMax = Math.max(...m.curve.flow_cm_s);
    const shapes: unknown[] = [];
    const annotations: unknown[] = [];
    const band = (b: { label: string; min_cm_s: number | null; max_cm_s: number | null }, color: string, v: View, row: number) => {
      if (b.min_cm_s === null || b.max_cm_s === null) return;
      const w = Math.max(b.max_cm_s - b.min_cm_s, xMax * 0.004);
      shapes.push({ type: "rect", xref: "x", yref: "paper", x0: b.min_cm_s, x1: b.min_cm_s + w, y0: 0, y1: 1, fillcolor: color, opacity: 0.1 * dim(v), line: { width: 0 }, layer: "below" });
      annotations.push({ x: b.min_cm_s, y: 1 - row * 0.07, xref: "x", yref: "paper", text: b.label, showarrow: false, xanchor: "left", font: { size: 11, color }, opacity: dim(v) });
    };
    band(bands.fans_off, C.flame, "station", 0);
    band(bands.bass_ii, C.flame, "station", 1);
    band(bands.station_ventilation, C.flame, "station", 2);
    band(bands.wstf, C.earth, "earth", 0);
    shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: m.lunar.limit_pct, y1: m.lunar.limit_pct, line: { color: C.moon, width: 2.5 }, opacity: dim("moon") });
    annotations.push({ xref: "paper", x: 0.99, y: m.lunar.limit_pct, text: "Lunar gravity limit · airflow unknown", showarrow: false, xanchor: "right", yanchor: "bottom", font: { size: 12, color: C.moon }, opacity: dim("moon") });
    if (showBase) {
      shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: base.o2_pct, y1: base.o2_pct, line: { color: C.ink, width: 1.5, dash: "dot" } });
      annotations.push({ xref: "paper", x: 0.01, y: base.o2_pct, text: base.label, showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 12, color: C.ink } });
    }
    const data = [
      { type: "scatter", mode: "lines", x: m.curve.flow_cm_s, y: m.curve.upper_pct, line: { width: 0 }, hoverinfo: "skip", showlegend: false, opacity: dim("earth") },
      { type: "scatter", mode: "lines", x: m.curve.flow_cm_s, y: m.curve.lower_pct, line: { width: 0 }, fill: "tonexty", fillcolor: "rgba(15,138,115,0.12)", name: "95% band", hoverinfo: "skip", opacity: dim("earth") },
      { type: "scatter", mode: "lines", x: m.curve.flow_cm_s, y: m.curve.o2_pct, line: { color: C.earth, width: 2, dash: "dash" }, name: "Earth fit, extended to still air", hovertemplate: "%{x:.0f} cm/s → %{y:.2f}% O2<extra>fit</extra>", opacity: dim("earth") },
      { type: "scatter", mode: "markers", x: m.wstf_points.flow_cm_s, y: m.wstf_points.o2_pct, marker: ring(C.earth, 11), name: "Earth tests, NASA White Sands", hovertemplate: "%{x:.0f} cm/s → %{y:.2f}% O2<extra>WSTF</extra>", opacity: dim("earth") },
      { type: "scatter", mode: "markers", x: [0], y: [m.zero_flow.intercept_pct], error_y: { type: "data", symmetric: false, array: [m.zero_flow.ci95_pct[1] - m.zero_flow.intercept_pct], arrayminus: [m.zero_flow.intercept_pct - m.zero_flow.ci95_pct[0]], color: C.earth }, marker: { size: 12, color: C.surface, line: { color: C.earth, width: 2 } }, name: "Earth still-air estimate", hovertemplate: "still air → %{y:.2f}% O2<extra></extra>", opacity: dim("earth") },
    ];
    // the y range holds every drawn value with room around the lunar line, so it never sits on the axis
    const ys = [...m.curve.lower_pct, ...m.curve.upper_pct, ...m.wstf_points.o2_pct, ...m.zero_flow.ci95_pct, m.lunar.limit_pct, ...(showBase ? [base.o2_pct] : [])];
    const yLo = Math.min(...ys);
    const yHi = Math.max(...ys);
    const yPad = (yHi - yLo) * 0.1;
    return { data, layout: { shapes, annotations, xaxis: { title: { text: "Forced airflow (cm/s)" }, range: [-xMax * 0.02, xMax * 1.03], nticks: 5 }, yaxis: { title: { text: "Oxygen limit (%)" }, range: [yLo - yPad, yHi + yPad * 2], nticks: 5 } } };
  }, [key, view, showBase]);

  const g = m.gap;
  const r = m.gap_at_ref_flow;
  return (
    <section ref={bandRef} className="panel moonband" id="moon" aria-labelledby="moon-h" data-element="rising-fill">
      <div className="band-inner">
        <div className="moon-head">
          <h2 id="moon-h" className="t-display-l">The Moon Gap: oxygen limits in lunar gravity</h2>
          <p>The Moon Gap is how much lower a material's oxygen limit sat in lunar gravity than the Earth trend predicts for still air.</p>
        </div>

        <figure className="card moon-chart">
          <figcaption className="chart-head"><h3>{MATERIAL_NAMES[key] ?? key}</h3></figcaption>
          <Plot label={`Oxygen limit against airflow for ${MATERIAL_NAMES[key]}, with the lunar limit as a line`} data={chart.data} layout={chart.layout} />
        </figure>

        <More summary="Details">
        <div className="moon-detail">
          <p className="moon-def">A material's oxygen limit is the highest oxygen level at which its flame still goes out on its own. NASA measured it on Earth at several forced flows; extending that line to zero flow gives an Earth still-air estimate. NASA's lunar-gravity tests give a second limit, at a flow nobody has measured. The Moon Gap is the difference: right of zero, the lunar-gravity limit sat lower, so the material burned at oxygen levels where the Earth trend predicts extinction.</p>
          <p className="caption moon-src">Points read from {moongap.paper}, Figs. 7–12. The lunar limit is a line, not a point, because its airflow is unknown. Shaded: airflow ranges for context. Pick a material below to show it in the chart.</p>

          <GapIndex selected={key} onSelect={(k) => setKey(k as typeof key)} />

          <div className="controls">
            <div className="seg" role="group" aria-label="Highlight a setting">
              {(["all", "station", "moon", "earth"] as View[]).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{{ all: "All", station: "Space station", moon: "Moon", earth: "Earth" }[v]}</button>
              ))}
            </div>
            <label className="check"><input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} /> Show planned Moon base O2</label>
          </div>

          <div className="card numbers">
            <h3>Values for this material</h3>
            <dl className="spec-list">
              <div><dt>Earth estimate in still air</dt><dd className="num"><Num source={at(`${p}.zero_flow.intercept_pct`)}>{fmt(m.zero_flow.intercept_pct, 1)}%</Num> O2</dd></div>
              <div><dt>Lunar gravity limit</dt><dd className="num"><Num source={at(`${p}.lunar.limit_pct`)}>{fmt(m.lunar.limit_pct, 1)}%</Num> O2</dd></div>
              <div className="em"><dt>Moon Gap</dt><dd className="num"><Num source={at(`${p}.gap.gap_pct`)}>{g.gap_pct > 0 ? "+" : ""}{fmt(g.gap_pct, 1)}</Num> points</dd></div>
              <div><dt>95% interval</dt><dd className="num"><Num source={at(`${p}.gap.ci95_pct[0]`)}>{fmt(g.ci95_pct[0], 1)}</Num> to <Num source={at(`${p}.gap.ci95_pct[1]`)}>{fmt(g.ci95_pct[1], 1)}</Num></dd></div>
            </dl>
            <p className="caption">{g.gap_pct > 0 ? "Positive: in lunar gravity this material's oxygen limit was lower than Earth's still-air estimate." : "Negative: in lunar gravity this material's oxygen limit was higher than Earth's still-air estimate."}{g.ci95_pct[0] < 0 && g.ci95_pct[1] > 0 ? " The interval includes zero, so the sign isn't settled." : ""}</p>
            <p className="caption"><strong>{r.label}:</strong> <Num source={at(`${p}.gap_at_ref_flow.gap_pct`)}>{fmt(r.gap_pct, 1)}</Num> points. {r.note}</p>
            <p className="caption"><strong>Check against the paper's Table 2:</strong> our fitted slope <Num source={at(`${p}.fit.slope_frac_per_cm_s`)}>{m.fit.slope_frac_per_cm_s.toPrecision(2)}</Num> vs published <Num source={at(`${p}.slope_check.reference_slope_frac_per_cm_s`)}>{m.slope_check.reference_slope_frac_per_cm_s}</Num> s/cm. {m.slope_check.status === "matches_table2" ? "They agree." : "They differ: the line drawn in the paper's figure and its Table 2 don't agree for this material. We show both and haven't settled why."}</p>
            {m.source_note && <p className="caption">{m.source_note}</p>}
          </div>

          <div className="card"><EnvelopeScale /></div>

          <details className="caveats">
            <summary>Caveats: read before quoting</summary>
            <ul className="notes">
              {moongap.caveats.map((c) => <li key={c}>{c}</li>)}
              {moongap.excluded.map((e) => <li key={e.material}><strong>{MATERIAL_NAMES[e.material] ?? e.material} left out:</strong> {e.reason}</li>)}
            </ul>
          </details>
        </div>
        </More>
      </div>
    </section>
  );
}

/**
 * The materials ranked by Moon Gap, as an index: one row each, its interval drawn on one shared
 * axis with zero marked. A row opens that material in the chart below.
 */
function GapIndex({ selected, onSelect }: { selected: string; onSelect: (k: string) => void }) {
  const rows = moongap.ranking;
  const lo = Math.floor(Math.min(...rows.map((x) => x.ci95_pct[0])));
  const hi = Math.ceil(Math.max(...rows.map((x) => x.ci95_pct[1])));
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v++) if (v % 2 === 0 || hi - lo <= 6) ticks.push(v);
  const idx = (k: string) => moongap.ranking.findIndex((x) => x.material === k);
  return (
    <div className="gapindex">
      <div className="gi-axis" aria-hidden="true">
        <span className="gi-name">Material, by Moon Gap</span>
        <span className="gi-track">
          {ticks.map((v) => <span key={v} className={`gi-tick${v === 0 ? " zero" : ""}`} style={{ left: `${pos(v)}%` }}>{v > 0 ? `+${v}` : v}</span>)}
        </span>
        <span className="gi-val">points</span>
      </div>
      <ol className="gi-rows">
        {rows.map((x, i) => {
          const on = x.material === selected;
          const p = `ranking[${idx(x.material)}]`;
          return (
            <li key={x.material}>
              <button type="button" className="gi-row" aria-pressed={on} onClick={() => onSelect(x.material)} aria-label={`Show ${MATERIAL_NAMES[x.material] ?? x.material} in the chart`}>
                <span className="gi-rank num">{String(i + 1).padStart(2, "0")}</span>
                <span className="gi-name">{MATERIAL_NAMES[x.material] ?? x.material}</span>
                <span className="gi-track" aria-hidden="true">
                  <span className="gi-zero" style={{ left: `${pos(0)}%` }} />
                  <span className="gi-ci" style={{ left: `${pos(x.ci95_pct[0])}%`, width: `${pos(x.ci95_pct[1]) - pos(x.ci95_pct[0])}%` }} />
                  <span className="gi-dot" style={{ left: `${pos(x.gap_pct)}%` }} />
                </span>
              </button>
              <span className="gi-val num"><Num source={cell(MOONGAP_FILE, 0, `${p}.gap_pct`)}>{x.gap_pct > 0 ? "+" : ""}{fmt(x.gap_pct, 1)}</Num></span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
