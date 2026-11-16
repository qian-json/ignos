// Written with AI assistance (Claude Code)
// Measure, as a comparison: every fan step of every test, ours against NASA's published rate, on one
// parity chart. The open test's facts, the photos, the tracker wipe and its rows sit behind the toggle.
import { useMemo } from "react";
import { useReplay } from "../replay";
import { C, Plot, ring } from "../Plot";
import { Num } from "../Num";
import { BurnScrub } from "../elements/BurnScrub";
import { FrameStrip } from "../elements/FrameStrip";
import { TrackerWipe } from "../elements/TrackerWipe";
import { More } from "../ui/More";
import { SPREAD_CSV_HREF, SPREAD_FILE, S1_FILE, cell, lowConfidence, spread, tableS1, validated, type Row } from "../data";

export const TESTS = [...new Set(spread.map((r) => r.test_id))];

/** NASA's rate for a step: the matching Table S1 row when there is one, else the CSV's own copy. */
function nasa(r: Row) {
  const s = tableS1.find((x) => x.sample_id === r.test_id && x.flow_cm_s === r.flow_cm_s);
  return s ? { value: s.rate, text: s.rate.toFixed(4), source: cell(S1_FILE, s._row, "rate_x1e3") } : { value: Number(r.nasa_rate_mm_s), text: r.nasa_rate_mm_s, source: cell(SPREAD_FILE, r._row, "nasa_rate_mm_s") };
}

const OK = spread.filter(validated);
const WORST = OK.reduce((a, b) => (Math.abs(Number(b.pct_error)) > Math.abs(Number(a.pct_error)) ? b : a));
const BAND = Math.abs(Number(WORST.pct_error)) / 100; // the agreement band drawn on the chart is the worst validated error

function DiffBar({ pct, ok }: { pct: number; ok: boolean }) {
  // a small diverging bar: zero in the middle, the worst validated error at each quarter mark
  const span = BAND * 100 * 4;
  const w = Math.min(Math.abs(pct) / span, 0.5) * 100;
  return (
    <span className="diffbar" aria-hidden="true">
      <span className="band" style={{ left: `${50 - 25}%`, width: "50%" }} />
      <span className={`bar${ok ? "" : " off"}`} style={pct >= 0 ? { left: "50%", width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` }} />
      <span className="zero" />
    </span>
  );
}

export function Measure() {
  const { test, setTest } = useReplay();
  const rows = spread.filter((r) => r.test_id === test);
  const head = rows[0];

  const parity = useMemo(() => {
    const pts = spread.map((r) => ({ r, n: nasa(r) }));
    const max = Math.max(...pts.flatMap((p) => [p.n.value, Number(p.r.rate_mm_s) + Number(p.r.ci95_mm_s)])) * 1.06;
    const series = (pick: (r: Row) => boolean, name: string, color: string, open: boolean, size: number) => {
      const ps = pts.filter((p) => pick(p.r));
      return {
        type: "scatter", mode: "markers", name,
        x: ps.map((p) => p.n.value), y: ps.map((p) => Number(p.r.rate_mm_s)),
        customdata: ps.map((p) => [p.r.test_id, p.r.flow_cm_s, p.r.pct_error]),
        error_y: { type: "data", array: ps.map((p) => Number(p.r.ci95_mm_s)), color, thickness: 1, width: 0 },
        marker: ring(color, size, open),
        hovertemplate: "%{customdata[0]} at %{customdata[1]} cm/s<br>NASA %{x:.4f} · ours %{y:.4f} mm/s<br>%{customdata[2]}%<extra></extra>",
      };
    };
    const here = (r: Row) => r.test_id === test;
    return {
      data: [
        { type: "scatter", mode: "lines", x: [0, max, max, 0], y: [0, max * (1 - BAND), max * (1 + BAND), 0], fill: "toself", fillcolor: "rgba(44,80,207,0.07)", line: { width: 0 }, hoverinfo: "skip", showlegend: false },
        { type: "scatter", mode: "lines", x: [0, max], y: [0, max], line: { color: C.ink, width: 1 }, hoverinfo: "skip", showlegend: false },
        series((r) => !here(r), "Other tests", C.rule, false, 8),
        series((r) => here(r) && validated(r), `Test ${test}, validated`, C.flame, false, 11),
        series((r) => here(r) && !validated(r), `Test ${test}, not validated`, C.flame, true, 11),
      ],
      layout: {
        xaxis: { title: { text: "NASA's published rate (mm/s)" }, range: [0, max], tickformat: ".2f", nticks: 5 },
        yaxis: { title: { text: "Our rate from the photos (mm/s)" }, range: [0, max], tickformat: ".2f", nticks: 5 },
        annotations: [
          { x: max * 0.94, y: max * 0.94, text: "perfect agreement", showarrow: false, xanchor: "right", yanchor: "bottom", font: { size: 11, color: C.mute }, textangle: -45 },
        ],
      },
    };
  }, [test]);

  const nOk = rows.filter(validated).length;
  const frames = rows.reduce((a, r) => a + Number(r.n_frames || 0), 0);

  return (
    <section className="panel measure" id="measure" aria-labelledby="measure-h">
      <div className="panel-head">
        <h2 id="measure-h" className="t-display-l">Flame spread rate, measured from NASA's raw photos</h2>
      </div>

      <figure className="card compare-chart">
        <figcaption className="chart-head row-head">
          <p className="caption">Each dot is one fan step, our speed against NASA's; the wedge is ±<Num source={cell(SPREAD_FILE, WORST._row, "pct_error")}>{Math.abs(Number(WORST.pct_error))}%</Num>, our worst validated step.</p>
          <div className="seg small" role="group" aria-label="Choose a test">
            {TESTS.map((t) => <button key={t} type="button" aria-pressed={t === test} onClick={() => setTest(t)}>{t}</button>)}
          </div>
        </figcaption>
        <Plot className="plot tall" label="Parity chart: our spread rate against NASA's published rate for every fan step of every test" data={parity.data} layout={parity.layout} />
      </figure>

      <More summary="Details" open>
      <div className="measure-more">
        <div className="measure-about">
          <p className="caption">Our tracker follows the flame's leading edge through every raw photo of a space-station rod test and fits one speed per fan setting. NASA's rate is from Link et al. 2018, Table S1. On the diagonal line we match exactly; bars are 95% intervals.</p>
          <details className="overlay" open>
            <summary>Watch what the tracker saw</summary>
            <video src={`/overlays/${test}.mp4`} controls muted playsInline preload="metadata" aria-label={`Tracker overlay video for test ${test}`} />
            <p className="caption">Solid line: the edge used for our rates. Dashed line: the blue-light front, shown as a check only. One frame per photo.</p>
          </details>
        </div>
        <aside className="spec" aria-labelledby="spec-h">
          <h3 id="spec-h" className="spec-title">Test {test}</h3>
          <dl className="spec-list">
            <div><dt>NASA photo set</dt><dd>PSI P{test.slice(1)}</dd></div>
            <div><dt>Rod diameter</dt><dd className="num"><Num source={cell(SPREAD_FILE, head._row, "rod_d_mm")}>{head.rod_d_mm} mm</Num></dd></div>
            <div><dt>Oxygen</dt><dd className="num"><Num source={cell(SPREAD_FILE, head._row, "o2_pct")}>{head.o2_pct}%</Num></dd></div>
            <div><dt>Fan steps fitted</dt><dd className="num">{rows.length}</dd></div>
            <div><dt>Validated</dt><dd className="num">{nOk} of {rows.length}</dd></div>
            <div><dt>Photos in the fits</dt><dd className="num">{frames}</dd></div>
          </dl>
        </aside>
      </div>

      <FrameStrip />
      <BurnScrub />
      <TrackerWipe />

      <div className="scroll-x" role="region" aria-labelledby="measure-table-cap" tabIndex={0}>
        <table className="data compare-table">
          <caption id="measure-table-cap">Test {test}, step by step</caption>
          <thead>
            <tr><th scope="col">Airflow (cm/s)</th><th scope="col" className="r">Ours (mm/s)</th><th scope="col" className="r">±95%</th><th scope="col" className="r">NASA (mm/s)</th><th scope="col" className="r">Difference</th><th scope="col" className="diffcol"><span className="sr">Difference drawn</span></th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const n = nasa(r);
              const ok = validated(r);
              return (
                <tr key={r._row} data-ok={ok}>
                  <td className="num"><Num source={cell(SPREAD_FILE, r._row, "flow_cm_s")}>{r.flow_cm_s}</Num></td>
                  <td className="r num"><Num source={cell(SPREAD_FILE, r._row, "rate_mm_s")}>{r.rate_mm_s}</Num></td>
                  <td className="r num"><Num source={cell(SPREAD_FILE, r._row, "ci95_mm_s")}>{r.ci95_mm_s}</Num></td>
                  <td className="r num"><Num source={n.source}>{n.text}</Num></td>
                  <td className="r num"><Num source={cell(SPREAD_FILE, r._row, "pct_error")}>{Number(r.pct_error) > 0 ? "+" : ""}{r.pct_error}%</Num></td>
                  <td className="diffcol"><DiffBar pct={Number(r.pct_error)} ok={ok} /></td>
                  <td>{ok ? <span className="tag ok"><span aria-hidden="true">●</span> Validated</span> : <span className="tag low"><span aria-hidden="true">○</span> {lowConfidence(r) ? "Low confidence" : "High flow, not validated"}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="measure-dl">
        <a className="btn ghost" href={SPREAD_CSV_HREF} download="ignos_spread_rates.csv">Download every step as CSV</a>
        <span className="caption">All {spread.length} fan steps from {TESTS.length} tests, our rate beside NASA's, with intervals and the tracker's notes. File: <code>{SPREAD_FILE}</code></span>
      </p>
      <p className="caption">Validated means a step under 1 cm/s that the tracker didn't flag. Above 1 cm/s most steps fall in the flame's bright early phase, where the tracker can lock onto the bright core, so we don't count them. NASA's rate is Table S1's printed V<sub>f</sub>×10³ read as cm/s; the right half of that table prints “mm/s”, a typo our own measurement settled. Hover any number for its file, row and column.</p>
      </More>
    </section>
  );
}
