// Written with AI assistance (Claude Code)
import { useMemo, useState } from "react";
import { C, Plot, ring } from "../Plot";
import { Num } from "../Num";
import { S1_FILE, cell, spread, tableS1, validated } from "../data";
import { FlameStage } from "../orbit/FlameStage";
import { More } from "../ui/More";

const RODS = [...new Set(tableS1.map((r) => r.rod_d_cm))].sort((a, b) => Number(a) - Number(b));
const flows = tableS1.map((r) => Number(r.flow_cm_s));
const MIN = Math.min(...flows);
const MAX = Math.max(...flows);
// slider runs on a log scale across the measured airflows
const toFlow = (t: number) => MIN * (MAX / MIN) ** t;

export function Orbit() {
  const [t, setT] = useState(1);
  const cut = toFlow(t);
  // NASA's rods in one gold ramp, light to dark by diameter (a magnitude, so one hue)
  const GOLD = ["#c39a2c", "#9a7400", "#674e00"];
  const rodColor = (d: string) => GOLD[RODS.indexOf(d)] ?? C.nasa;
  const lowest = tableS1.reduce((a, b) => (Number(b.flow_cm_s) < Number(a.flow_cm_s) ? b : a));
  const visible = tableS1.filter((r) => Number(r.flow_cm_s) <= cut);
  const samples = new Set(tableS1.map((r) => r.sample_id));

  const data = useMemo(() => {
    const out: unknown[] = [];
    for (const d of RODS) {
      const ids = [...new Set(tableS1.filter((r) => r.rod_d_cm === d).map((r) => r.sample_id))];
      ids.forEach((id, k) => {
        const rs = tableS1.filter((r) => r.sample_id === id);
        out.push({
          type: "scatter", mode: "lines+markers", name: `NASA, ${d} cm rods`, legendgroup: d, showlegend: k === 0,
          x: rs.map((r) => Number(r.flow_cm_s)), y: rs.map((r) => r.rate), text: rs.map(() => id),
          line: { color: rodColor(d), width: 1.5 },
          marker: { size: rs.map((r) => (Number(r.flow_cm_s) <= cut ? 9 : 6)), color: rs.map((r) => (Number(r.flow_cm_s) <= cut ? rodColor(d) : C.hair)), line: { color: C.surface, width: 2 } },
          hovertemplate: "%{text}: %{x} cm/s → %{y:.4f} mm/s<extra></extra>",
        });
      });
    }
    const ours = spread.filter(validated);
    out.push({
      type: "scatter", mode: "markers", name: "Ours, validated", x: ours.map((r) => Number(r.flow_cm_s)), y: ours.map((r) => Number(r.rate_mm_s)), text: ours.map((r) => r.test_id),
      marker: ring(C.flame, 12, true), hovertemplate: "ours %{text}: %{x} cm/s → %{y} mm/s<extra></extra>",
    });
    return out;
  }, [cut]);
  const layout = useMemo(() => ({
    xaxis: { title: { text: "Opposed airflow from the fans (cm/s, log scale)" }, type: "log", tickvals: [0.2, 0.5, 1, 2, 5, 10, 20].filter((v) => v >= MIN / 1.5 && v <= MAX * 1.5) },
    yaxis: { title: { text: "Flame spread rate (mm/s)" }, rangemode: "tozero" },
    shapes: [{ type: "rect", xref: "x", yref: "paper", x0: cut, x1: MAX * 2, y0: 0, y1: 1, fillcolor: C.ground, opacity: 0.55, line: { width: 0 }, layer: "above" }],
  }), [cut]);

  return (
    <section className="panel orbit" id="orbit" aria-labelledby="orbit-h">
      <div className="orbit-open">
        <div className="statement">
          <h2 id="orbit-h" className="t-display-l">In microgravity, the fans set the opposed flow</h2>
          <p>With no buoyant flow, ventilation supplies the flame's oxygen.</p>
        </div>
        <div className="orbit-stage">
          <FlameStage flow={t} />
          <label className="slider">
            <span>Opposed flow <strong className="num">{cut.toFixed(2)} cm/s</strong></span>
            <input type="range" min={0} max={1} step={0.01} value={t} onChange={(e) => setT(Number(e.target.value))} aria-label="Fan airflow" aria-valuetext={`${cut.toFixed(2)} centimetres per second`} />
          </label>
        </div>
      </div>

      <More summary="Details">
      <p className="caption orbit-more-note">Without forced flow, oxygen reaches the flame only by diffusion, which is why crews shut off ventilation to slow a fire's spread, along with cutting power and using extinguishers. The slider also filters this chart to the steps at or below the chosen flow.</p>
      <figure className="card wide-chart">
        <figcaption className="chart-head">
          <h3>Flame spread rate against opposed flow: {samples.size} PMMA rod samples, up to {cut.toFixed(2)} cm/s</h3>
        </figcaption>
        <Plot className="plot tall" label="Table S1 spread rate against opposed airflow by rod diameter, with our validated measurements" data={data} layout={layout} />
        <p className="caption">Each line is one rod as the flow was stepped down; hollow blue rings are our validated measurements. Source: Link et al. 2018, Table S1, p. 1.</p>
      </figure>

      <dl className="figures">
        <div><dt>Lowest flow with flame spread in the table</dt><dd className="num"><Num source={cell(S1_FILE, lowest._row, "flow_cm_s")}>{lowest.flow_cm_s} cm/s</Num></dd><dd className="fig-note">sample {lowest.sample_id}</dd></div>
        <div><dt>Spread rate at that flow</dt><dd className="num"><Num source={cell(S1_FILE, lowest._row, "rate_x1e3")}>{lowest.rate.toFixed(4)} mm/s</Num></dd><dd className="fig-note">every step in the table had some forced flow</dd></div>
        <div><dt>Steps at or below this flow</dt><dd className="num">{visible.length} of {tableS1.length}</dd><dd className="fig-note">from {new Set(visible.map((r) => r.sample_id)).size} of {samples.size} samples</dd></div>
      </dl>
      </More>
    </section>
  );
}
