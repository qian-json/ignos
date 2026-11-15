// Written with AI assistance (Claude Code)
// One chart look for the whole site: hairline solid grid one step off the surface, no axis lines
// or tick marks, figures in the mono, a legend above the plot, 2 px surface rings on markers and
// an ink tooltip. The series palette (ours cobalt, NASA dark gold, Earth teal, Moon violet) passes
// the colour-vision and contrast checks against the card surface.
import { useEffect, useRef } from "react";

/** Plotly loads only when a page first draws a chart, so pages without charts never download it. */
type PlotlyLib = typeof import("plotly.js-basic-dist-min")["default"];
let plotly: Promise<PlotlyLib> | null = null;
const loadPlotly = () => (plotly ??= import("plotly.js-basic-dist-min").then((m) => ((m as unknown as { default?: PlotlyLib }).default ?? (m as unknown as PlotlyLib))));

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Theme colours read from the CSS tokens, so charts and page share one palette. */
export const C = {
  get ink() { return css("--ink"); },
  get mute() { return css("--mute"); },
  get rule() { return css("--rule"); },
  get hair() { return css("--hair"); },
  get flame() { return css("--flame"); },
  get moon() { return css("--moon"); },
  get earth() { return css("--earth"); },
  get nasa() { return css("--nasa"); },
  get unverified() { return css("--unverified"); },
  get accent() { return css("--accent"); },
  get surface() { return css("--surface"); },
  get ground() { return css("--ground"); },
};

/** A marker with the surface ring that keeps it legible where it crosses a line or a neighbour. */
export const ring = (color: string, size = 10, open = false) => ({
  size, color: open ? C.surface : color, line: { color: open ? color : C.surface, width: 2 },
});

export function Plot({ data, layout, className = "plot", label }: { data: unknown[]; layout: Record<string, unknown>; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const mono = css("--mono");
    const base: Record<string, unknown> = {
      font: { family: css("--font"), size: 13, color: C.ink },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 52, r: 14, t: 34, b: 46 },
      hoverlabel: { bgcolor: C.ink, bordercolor: C.ink, font: { family: mono, size: 12, color: css("--ground") }, align: "left" },
      legend: { orientation: "h", x: 0, xanchor: "left", y: 1.02, yanchor: "bottom", font: { size: 12, color: C.mute }, itemsizing: "constant", bgcolor: "rgba(0,0,0,0)" },
      hovermode: "closest",
      ...layout,
    };
    const axis = (a: Record<string, unknown> = {}) => ({
      gridcolor: C.hair, gridwidth: 1, zeroline: false, showline: false, ticks: "", ticklen: 0,
      tickfont: { family: mono, size: 11, color: C.mute },
      automargin: true,
      ...a,
      title: a.title ? { standoff: 10, font: { size: 12, color: C.mute }, ...(a.title as object) } : undefined,
    });
    base.xaxis = axis(layout.xaxis as Record<string, unknown>);
    base.yaxis = axis(layout.yaxis as Record<string, unknown>);
    let live = true;
    loadPlotly().then((Plotly) => { if (live && el.isConnected) Plotly.react(el, data, base, { displayModeBar: false, responsive: true }); });
    return () => { live = false; };
  }, [data, layout]);
  useEffect(() => () => { const el = ref.current; if (el && plotly) plotly.then((Plotly) => Plotly.purge(el)); }, []);
  return <div ref={ref} className={className} role="img" aria-label={label} />;
}
