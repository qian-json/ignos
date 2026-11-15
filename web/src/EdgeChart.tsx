// Written with AI assistance (Claude Code)
// The tracker's leading-edge position in every photo, one colour step per fan setting, with a
// cursor at the photo the burn replay is showing.
import { useMemo } from "react";
import { C, Plot } from "./Plot";
import { edges } from "./data";

export function EdgeChart({ test, cursor, className = "plot short" }: { test: string; cursor: number | null; className?: string }) {
  const edge = (edges[test] ?? []).filter((r) => r.edge_mm !== "");
  const data = useMemo(() => {
    const segs = [...new Set(edge.map((r) => r.segment))];
    return segs.map((s) => {
      const rs = edge.filter((r) => r.segment === s);
      return {
        type: "scatter", mode: "markers", name: s ? `Flow step ${s}` : "Between steps",
        x: rs.map((r) => Number(r.t_s)), y: rs.map((r) => Number(r.edge_mm)),
        marker: { size: 5, color: s ? C.flame : C.rule, opacity: s ? 0.35 + 0.15 * Number(s) : 1 },
        hovertemplate: "t = %{x:.0f} s, edge %{y:.1f} mm<extra></extra>",
      };
    });
  }, [test]);
  const layout = useMemo(() => {
    // fixed to this test's photos, so the axis never keeps another test's range
    const ts = edge.map((r) => Number(r.t_s));
    const lo = Math.min(...ts);
    const hi = Math.max(...ts);
    const pad = (hi - lo) * 0.03;
    return {
    showlegend: false,
    xaxis: { title: { text: "Time since the test's first photo (s)" }, range: [lo - pad, hi + pad], autorange: false },
    yaxis: { title: { text: "Edge position (mm)" } },
    shapes: cursor === null ? [] : [{ type: "line", xref: "x", yref: "paper", x0: cursor, x1: cursor, y0: 0, y1: 1, line: { color: C.accent, width: 1.5 } }],
  };
  }, [cursor, test]);
  return <Plot className={className} label={`Flame edge position over time for test ${test}`} data={data} layout={layout} />;
}
