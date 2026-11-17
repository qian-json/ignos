// Written with AI assistance (Claude Code)
// The Model page: the team's flame-spread model, shown only as a validation result. Every figure is read
// from data/derived/flame_model.json and opens to its JSON path. The file holds no per-test predictions
// against NASA's rates (its contract refuses them), so the one chart plots the file's own validation
// rows: the remeasurement cross-check, the model refitted without each test against our re-measured rate.
// No Moon or partial-gravity number appears here, because the file holds none.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import flameModel from "../../../data/derived/flame_model.json";
import { cell } from "../data";
import { Num } from "../Num";
import { C, Plot, ring } from "../Plot";
import { More } from "../ui/More";
import "../elements/model-page.css";
import { ModelRings } from "../elements/ModelRings";

const FILE = "data/derived/flame_model.json";

interface Score { median_abs_error_pct: number; burn_correct: number; rows: number; rows_with_rate_scored: number; rate_rows_predicted_no_flame: number }
interface CrossRow { test_id: string; flow_cm_s: number; ours_mm_s: number; model_mm_s: number; pct_difference: number; test_held_out_of_fit: boolean; row: number }
interface Param { unit: string | null; meaning?: string; [k: string]: unknown }
interface FlameModelFile {
  _note: string;
  label: string;
  scope: string;
  model: { equations: string[]; gravity_note: string; fit: string; parameters: Record<string, Param> };
  validation: {
    fit_all: Record<"all" | "orbit" | "earth", Score>;
    leave_one_group_out: Score & { groups: number; orbit_tests: number; earth_blocks: number; always_burns_baseline_correct: number; how: string };
    cross_domain: Record<"orbit_only_to_earth" | "earth_only_to_orbit", Score & { passed: boolean; note: string }>;
    bootstrap: { resamples: number; how: string };
    remeasurement_cross_check: { steps: number; median_abs_difference_pct: number; within_typical_error: number; typical_error_pct: number; rows: CrossRow[]; note: string };
  };
  caveats: string[];
  derived_from: { file: string; sha256: string }[];
}

const M = flameModel as unknown as FlameModelFile;
const V = M.validation;
/** The interval level, read from the parameters' own key (ci95, ci95_pct, ...). */
const CI_LEVEL = /^ci(\d+)/.exec(Object.keys(Object.values(M.model.parameters)[0] ?? {}).find((k) => k.startsWith("ci")) ?? "")?.[1] ?? "";

/** A figure from the model file, with its JSON path as the source. */
function F({ path, value, digits = 3, suffix = "" }: { path: string; value: number; digits?: number; suffix?: string }) {
  // as written in the file when that is already short; otherwise rounded to `digits` significant figures
  const plain = String(value);
  const text = plain.replace(/^-?0\.0*|[-.]/g, "").length <= digits ? plain : value.toPrecision(digits);
  return <Num source={cell(FILE, 0, path)}>{text}{suffix}</Num>;
}

/** Adds data-mdl-in once a block is on screen, so CSS can raise it into place. Reduced motion and the
 *  Pause switch are handled in the stylesheet: the end state is the designed state. */
function useArrive<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>("[data-mdl-arrive]");
    if (typeof IntersectionObserver === "undefined") { els.forEach((e) => (e.dataset.mdlIn = "")); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { (e.target as HTMLElement).dataset.mdlIn = ""; io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return ref;
}

/** A token colour (#rrggbb) as rgba, for Plotly fills. */
const tint = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})` : hex;
};

const LABEL = "Model prediction, not a NASA measurement";

function Pill({ children, tone = "model" }: { children: ReactNode; tone?: "model" | "fail" }) {
  return <span className={`mdl-pill mdl-pill-${tone}`}>{children}</span>;
}

function CrossCheckChart() {
  const x = V.remeasurement_cross_check;
  const rows = x.rows;
  const allHeld = rows.every((r) => r.test_held_out_of_fit);
  const { data, layout } = useMemo(() => {
    const top = Math.max(...rows.flatMap((r) => [r.ours_mm_s, r.model_mm_s])) * 1.15;
    const t = x.typical_error_pct / 100;
    const line = [0, top];
    const band = [
      { x: line, y: line.map((v) => v * (1 - t)), mode: "lines", line: { width: 0 }, hoverinfo: "skip", showlegend: false },
      { x: line, y: line.map((v) => v * (1 + t)), mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: tint(C.flame, 0.1), hoverinfo: "skip", name: "Typical held-out error" },
      { x: line, y: line, mode: "lines", line: { color: C.mute, width: 1.5, dash: "dot" }, hoverinfo: "skip", name: "Perfect agreement" },
      {
        x: rows.map((r) => r.ours_mm_s), y: rows.map((r) => r.model_mm_s), mode: "markers", type: "scatter", name: "One re-measured step",
        marker: ring(C.flame, 12),
        customdata: rows.map((r) => [r.test_id, r.flow_cm_s, r.pct_difference]),
        hovertemplate: "%{customdata[0]} · flow %{customdata[1]} cm/s<br>ours %{x} mm/s<br>model %{y} mm/s<br>%{customdata[2]}%<extra></extra>",
      },
    ];
    return {
      data: band,
      layout: {
        xaxis: { title: { text: "Our re-measured rate (mm/s)" }, range: [0, top] },
        yaxis: { title: { text: allHeld ? "Model, test held out (mm/s)" : "Model (mm/s)" }, range: [0, top] },
        margin: { l: 56, r: 12, t: 40, b: 50 },
      },
    };
  }, [rows, x.typical_error_pct, allHeld]);
  return <Plot data={data} layout={layout} className="plot mdl-plot" label={`Remeasurement cross-check: ${rows.length} steps, the model's rate against our re-measured rate, with the line of perfect agreement.`} />;
}

export function ModelPage() {
  const ref = useArrive<HTMLDivElement>();
  const logo = V.leave_one_group_out;
  const cross = V.cross_domain;
  const rc = V.remeasurement_cross_check;
  const LOGO = "validation.leave_one_group_out";
  const RC = "validation.remeasurement_cross_check";
  const burnShare = logo.burn_correct / logo.rows;
  const baseShare = logo.always_burns_baseline_correct / logo.rows;

  return (
    <div ref={ref} id="model" className="page page-model mdl" aria-labelledby="mdl-h">
      <header className="mdl-head" data-bar-tone="dark">
        <div className="mdl-head-in">
          <h1 id="mdl-h" className="mdl-title"><span className="mdl-rise">Flame spread,</span> <span className="mdl-rise">as a formula</span></h1>
          <p className="mdl-lede">Fitted to Link et al. 2018's acrylic-rod burns in orbit and on Earth, then tested on burns it never saw.</p>
          <div className="mdl-badges">
            <Pill>{LABEL}</Pill>
            <span className="mdl-scope">Orbit and Earth only. No Moon prediction.</span>
          </div>
        </div>
        <ModelRings />
      </header>

      <div className="mdl-sheet">
        <section className="mdl-result" aria-labelledby="mdl-r">
          <div className="mdl-figs" data-mdl-arrive>
            <h2 id="mdl-r" className="mdl-h2">How close it gets</h2>
            <div className="mdl-big">
              <span className="mdl-big-v"><F path={`${LOGO}.median_abs_error_pct`} value={logo.median_abs_error_pct} suffix="%" /></span>
              <span className="mdl-big-k">median error on groups hidden from the fit</span>
            </div>
            <ul className="mdl-cross" aria-label="Across gravity">
              {([["orbit_only_to_earth", "Orbit only", "Earth"], ["earth_only_to_orbit", "Earth only", "orbit"]] as const).map(([k, from, to]) => (
                <li key={k}>
                  <span className="mdl-cross-k">{from} <span aria-hidden="true">→</span><span className="mdl-sr">to</span> {to}</span>
                  <span className="mdl-cross-v"><F path={`validation.cross_domain.${k}.median_abs_error_pct`} value={cross[k].median_abs_error_pct} suffix="%" /></span>
                  <Pill tone={cross[k].passed ? "model" : "fail"}>{cross[k].passed ? "passes" : "fails"}</Pill>
                </li>
              ))}
            </ul>

            <div className="mdl-burn" aria-labelledby="mdl-b">
              <h3 id="mdl-b">Burn or no burn, held out</h3>
              <div className="mdl-bar">
                <span className="mdl-bar-k">Model</span>
                <span className="mdl-bar-track"><span className="mdl-bar-fill" style={{ width: `${burnShare * 100}%` }} /></span>
                <span className="mdl-bar-v"><F path={`${LOGO}.burn_correct`} value={logo.burn_correct} /> of <F path={`${LOGO}.rows`} value={logo.rows} /></span>
              </div>
              <div className="mdl-bar is-base">
                <span className="mdl-bar-k">Always “burns”</span>
                <span className="mdl-bar-track"><span className="mdl-bar-fill" style={{ width: `${baseShare * 100}%` }} /></span>
                <span className="mdl-bar-v"><F path={`${LOGO}.always_burns_baseline_correct`} value={logo.always_burns_baseline_correct} /> of <F path={`${LOGO}.rows`} value={logo.rows} /></span>
              </div>
              <p className="mdl-note">{logo.burn_correct <= logo.always_burns_baseline_correct ? "Same as the baseline: no skill." : "Compare with the baseline."}</p>
            </div>
          </div>

          <figure className="mdl-chart" data-mdl-arrive>
            <figcaption className="mdl-chart-head">
              <span className="mdl-chart-t">Remeasurement cross-check</span>
              <Pill>{LABEL}</Pill>
            </figcaption>
            <CrossCheckChart />
            <p className="mdl-caption">Our tracker re-measured these burns from NASA's photos. Not independent: the published rates for them (Link et al. 2018, Table S1) are in the training data.</p>
          </figure>
        </section>

        <section className="mdl-details" aria-label="Validation details" data-mdl-arrive>
          <More summary="Leave-one-group-out">
            <p className="mdl-text">{logo.how.charAt(0).toUpperCase() + logo.how.slice(1)}</p>
            <dl className="mdl-dl">
              <div><dt>Groups hidden in turn</dt><dd><F path={`${LOGO}.groups`} value={logo.groups} /></dd></div>
              <div><dt>Rows scored</dt><dd><F path={`${LOGO}.rows_with_rate_scored`} value={logo.rows_with_rate_scored} /></dd></div>
              <div><dt>NASA rate, predicted no flame</dt><dd><F path={`${LOGO}.rate_rows_predicted_no_flame`} value={logo.rate_rows_predicted_no_flame} /></dd></div>
              <div><dt>Fit to every row, median error</dt><dd><F path="validation.fit_all.all.median_abs_error_pct" value={V.fit_all.all.median_abs_error_pct} suffix="%" /></dd></div>
            </dl>
          </More>
          <More summary="Cross-domain">
            <ul className="mdl-list">
              {(["orbit_only_to_earth", "earth_only_to_orbit"] as const).map((k) => (
                <li key={k}>
                  <span className="mono"><F path={`validation.cross_domain.${k}.median_abs_error_pct`} value={cross[k].median_abs_error_pct} suffix="%" /> median error · burn / no burn <F path={`validation.cross_domain.${k}.burn_correct`} value={cross[k].burn_correct} /> of <F path={`validation.cross_domain.${k}.rows`} value={cross[k].rows} /></span>
                  <span>{cross[k].note}</span>
                </li>
              ))}
            </ul>
            <p className="mdl-text">{M.model.gravity_note}</p>
          </More>
          <More summary="Bootstrap">
            <p className="mdl-text"><F path="validation.bootstrap.resamples" value={V.bootstrap.resamples} /> resamples: {V.bootstrap.how}.</p>
            <div className="scroll-x">
              <table className="data mdl-table">
                <thead><tr><th>parameter</th><th className="r">fitted</th><th className="r">{CI_LEVEL}% interval</th><th>unit</th></tr></thead>
                <tbody>
                  {Object.entries(M.model.parameters).map(([name, p]) => {
                    const vk = Object.keys(p).find((k) => k.startsWith("value"))!;
                    const ck = Object.keys(p).find((k) => k.startsWith("ci95"))!;
                    const ci = p[ck] as [number, number];
                    const base = `model.parameters.${name}`;
                    return (
                      <tr key={name}>
                        <td><code>{name}</code></td>
                        <td className="r"><F path={`${base}.${vk}`} value={p[vk] as number} digits={4} /></td>
                        <td className="r"><F path={`${base}.${ck}[0]`} value={ci[0]} digits={4} /> to <F path={`${base}.${ck}[1]`} value={ci[1]} digits={4} /></td>
                        <td>{p.unit ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {M.model.parameters.earth_wind?.meaning && <p className="mdl-text"><code>earth_wind</code>: {M.model.parameters.earth_wind.meaning}</p>}
          </More>
          <More summary="Remeasurement cross-check">
            <p className="mdl-text">{rc.note}</p>
            <p className="mdl-text">Median difference <F path={`${RC}.median_abs_difference_pct`} value={rc.median_abs_difference_pct} suffix="%" />; <F path={`${RC}.within_typical_error`} value={rc.within_typical_error} /> of <F path={`${RC}.steps`} value={rc.steps} /> steps within the typical held-out error (<F path={`${RC}.typical_error_pct`} value={rc.typical_error_pct} suffix="%" />).</p>
            <div className="scroll-x">
              <table className="data mdl-table">
                <thead><tr><th>test</th><th className="r">flow cm/s</th><th className="r">ours mm/s</th><th className="r">model mm/s</th><th className="r">difference</th></tr></thead>
                <tbody>
                  {rc.rows.map((r, i) => {
                    const p = `${RC}.rows[${i}]`;
                    return (
                      <tr key={i}>
                        <td className="mono">{r.test_id}</td>
                        <td className="r"><F path={`${p}.flow_cm_s`} value={r.flow_cm_s} /></td>
                        <td className="r"><F path={`${p}.ours_mm_s`} value={r.ours_mm_s} /></td>
                        <td className="r"><F path={`${p}.model_mm_s`} value={r.model_mm_s} /></td>
                        <td className="r"><F path={`${p}.pct_difference`} value={r.pct_difference} suffix="%" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </More>
          <More summary="Caveats">
            <ul className="mdl-list">{M.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </More>
          <More summary="Where it came from">
            <p className="mdl-text">{M._note}</p>
            <p className="mdl-text">Fit: {M.model.fit}. Scope: {M.scope}</p>
            <ul className="mdl-eq" aria-label="Equations">{M.model.equations.map((e, i) => <li key={i}><code>{e}</code></li>)}</ul>
            <ul className="mdl-files">
              {M.derived_from.map((d) => (
                <li key={d.file}><code>{d.file}</code> <span className="mdl-sha">sha256 {d.sha256.slice(0, 12)}…</span></li>
              ))}
            </ul>
          </More>
        </section>
      </div>
    </div>
  );
}
