# Written with AI assistance (Claude Code and Codex)
"""Two resolution-specific digitization passes of Link 2018 SI Fig. S1."""
from __future__ import annotations

import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CURVES = {"B16": {"red":(.72, 39, 51), "black":(.83,23,41), "blue":(1.67,11,25), "magenta":(7.55,3,12)},
          "B19": {"red":(.72,30,43), "black":(.83,17,33), "blue":(1.67,8,19), "magenta":(7.55,2,10)}}
CAL = {
    "pdf_render": {"file":"docs/sources/Link2018_SciRep_SI.pdf", "page_index":1, "render_scale":2.5, "x0":{"B16":272.5,"B19":855.5}, "x200":{"B16":676.0,"B19":1259.0}, "y0":1551.5,"y50":1219.5,"half_x":3},
    "supplied_png": {"file":"docs/plan-images/link2018-figS1.png", "x0":{"B16":55.0,"B19":410.5}, "x200":{"B16":299.0,"B19":655.0}, "y0":243.0,"y50":40.5,"half_x":1},
}
TMAX = {"B16":{"red":190,"black":190,"blue":155,"magenta":90},
        "B19":{"red":200,"black":150,"blue":140,"magenta":85}}


def pixels_of_color(rgb, color):
    r,g,b = rgb[...,0].astype(float),rgb[...,1].astype(float),rgb[...,2].astype(float)
    if color == "red": return (r > 110) & (r > 1.35*g) & (r > 1.35*b)
    if color == "blue": return (b > 100) & (b > 1.35*r) & (b > 1.20*g)
    if color == "magenta": return (r > 100) & (b > 100) & (r > 1.3*g) & (b > 1.3*g)
    return (r < 105) & (g < 105) & (b < 105)


def digitize(pass_name):
    c = CAL[pass_name]
    if pass_name == "pdf_render":
        import fitz
        page = fitz.open(ROOT / c["file"])[c["page_index"]]
        pix = page.get_pixmap(matrix=fitz.Matrix(c["render_scale"], c["render_scale"]), alpha=False)
        img = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n).copy()
    else:
        img = np.asarray(Image.open(ROOT / c["file"]).convert("RGB"))
    rows = []
    for test, curves in CURVES.items():
        x0, x200 = c["x0"][test], c["x200"][test]
        for color, (flow, ymin, ymax) in curves.items():
            color_mask = pixels_of_color(img, color)
            pymin = int(c["y0"] - ymax * (c["y0"]-c["y50"])/50)
            pymax = int(c["y0"] - ymin * (c["y0"]-c["y50"])/50)
            for sec in np.arange(5, TMAX[test][color] + 1, 5):
                px = int(round(x0 + sec * (x200-x0)/200))
                ys, xs = np.nonzero(color_mask[pymin:pymax+1,px-c["half_x"]:px+c["half_x"]+1])
                if len(ys) < 1:
                    continue
                pos = (c["y0"] - (pymin + np.median(ys))) * 50/(c["y0"]-c["y50"])
                rows.append({"pass":pass_name,"test_id":test,"flow_cm_s":flow,"color":color,"t_s":float(sec),"position_mm":float(pos)})
    return rows


def compare(digitized, test, flow):
    fig = [r for r in digitized if r["test_id"] == test and r["flow_cm_s"] == flow]
    ft = np.asarray([r["t_s"] for r in fig]); fx = np.asarray([r["position_mm"] for r in fig])
    if len(ft) < 5:
        return {"test_id":test,"flow_cm_s":flow,"n_digitized":len(ft),"status":"too_few_digitized"}
    with (ROOT / "data/derived/spread_rates.csv").open(newline="", encoding="utf-8") as h:
        row = next(r for r in csv.DictReader(h) if r["test_id"] == test and float(r["flow_cm_s"]) == flow)
    with (ROOT / f"data/derived/edges/{test}.csv").open(newline="", encoding="utf-8") as h:
        edge = [(float(r["t_s"]), float(r["edge_mm"])) for r in csv.DictReader(h) if r["edge_mm"]]
    ws, we = float(row["t_start_s"]), float(row["t_end_s"])
    et = np.asarray([t-ws for t,x in edge if ws <= t <= we]); ex = np.asarray([x for t,x in edge if ws <= t <= we])
    keep = (et >= ft.min()) & (et <= ft.max())
    et, ex = et[keep], ex[keep]
    if len(et) < 5:
        return {"test_id":test,"flow_cm_s":flow,"n_digitized":len(ft),"status":"too_few_common"}
    interp = np.interp(et, ft, fx)
    # Figure positions use a different origin for each flow step. Remove one
    # constant offset, fixed at the first common photo; retain all curve shape.
    residual = (ex-ex[0]) - (interp-interp[0])
    fig_slope = float(np.polyfit(ft,fx,1)[0])
    return {"test_id":test,"flow_cm_s":flow,"n_digitized":len(ft),"n_common_photos":len(et),
            "figure_slope_mm_s":fig_slope,"tracker_csv_rate_mm_s":float(row["rate_mm_s"]),
            "shape_rmse_mm":float(np.sqrt(np.mean(residual**2))),
            "shape_median_abs_mm":float(np.median(abs(residual))),
            "shape_last_minus_first_mm":float(residual[-1]),"status":"ok"}


def main():
    passes = {k:digitize(k) for k in CAL}
    result = {"_comment":"Written with AI assistance (Claude Code and Codex)",
              "source":"Link et al. 2018 Supplement Fig. S1, p. 2; data/derived/edges/B16.csv and B19.csv",
              "calibration":CAL, "passes":{}, "pass_disagreement":[]}
    for name, points in passes.items():
        result["passes"][name] = {"points":points,
            "comparison":[compare(points,test,flow) for test,curves in CURVES.items() for color,(flow,_,_) in curves.items()]}
    for test, curves in CURVES.items():
        for color, (flow,_,_) in curves.items():
            a = {r["t_s"]:r["position_mm"] for r in passes["pdf_render"] if r["test_id"]==test and r["flow_cm_s"]==flow}
            b = {r["t_s"]:r["position_mm"] for r in passes["supplied_png"] if r["test_id"]==test and r["flow_cm_s"]==flow}
            common = sorted(set(a)&set(b))
            if common:
                diff = np.asarray([a[t]-b[t] for t in common])
                centered = diff - np.median(diff)
                result["pass_disagreement"].append({"test_id":test,"flow_cm_s":flow,"n_common":len(common),
                                                    "median_vertical_offset_mm":float(np.median(diff)),
                                                    "median_abs_shape_mm":float(np.median(abs(centered))),
                                                    "max_abs_shape_mm":float(max(abs(centered)))})
    out = ROOT / "docs/research/accuracy"
    (out / "figure_s1.json").write_text(json.dumps(result,indent=2,allow_nan=False)+"\n",encoding="utf-8")
    fig, axes = plt.subplots(1,2,figsize=(10,4))
    for ax, test in zip(axes, CURVES):
        for color,(flow,_,_) in CURVES[test].items():
            points = [r for r in passes["pdf_render"] if r["test_id"]==test and r["flow_cm_s"]==flow]
            ax.plot([p["t_s"] for p in points],[p["position_mm"] for p in points], color=color,label=f"{flow:g} cm/s")
        ax.set(title=test,xlabel="Figure time (s)",ylabel="Digitized flame position (mm)")
        ax.legend()
    fig.tight_layout(); fig.savefig(ROOT / "docs/research/figures/accuracy_figure_s1.png",dpi=180); plt.close(fig)
    print(json.dumps({name:result["passes"][name]["comparison"] for name in passes},indent=2))


if __name__ == "__main__":
    main()
