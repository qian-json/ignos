# Written with AI assistance (Claude Code)
"""Evaluate tracker v1 (frozen) vs v2 (fused, pipeline/PREREGISTRATION.md) per step, without touching
data/derived. Usage: python -m diagnostics.v2_eval TEST:CACHE [TEST:CACHE ...] --out results.json
Tests listed in IN_SAMPLE were used to design v2 and are labelled so."""
from __future__ import annotations
import argparse, json, statistics as st, sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from stillair_tracker.frames import load_test
from stillair_tracker.edge import track_test, track_test_fused
from stillair_tracker.run import steady_fit, calibrate
from stillair_tracker.segment import schedule_windows

IN_SAMPLE = {"B16", "B19", "B12", "P17"}


def evaluate(tid: str, cache: str, cfg_dir: str) -> list[dict]:
    cfg = json.load(open(os.path.join(cfg_dir, f"{tid}.json"), encoding="utf-8"))
    d = load_test(cfg["nef_dir"], cache)
    t, img = d["t"], d["img"].astype(np.float32)
    row0, scale = int(d.get("row0", 0)), int(d["scale"])
    kw = dict(rel=cfg.get("rel_threshold", 0.3), axis_row=cfg["axis_row"] - row0, half_band=cfg["half_band"])
    ppm = calibrate(cfg)[0] / scale
    sign = cfg["direction"]; w0, w1 = cfg["burn_window_s"]
    v1 = track_test(img, direction=sign, **kw)
    v2 = track_test_fused(img, direction=sign, **kw)
    def series(tr):
        ok = ~np.isnan(tr["edge_px"]) & (tr["area"] >= cfg.get("min_area_frame", 3000)) & (t >= w0) & (t <= w1)
        return np.where(ok, sign * tr["edge_px"] / ppm, np.nan), ok
    x1, ok1 = series(v1); x2, _ = series(v2)
    if "windows_s" in cfg:
        wins = [tuple(w) for w in cfg["windows_s"]]
    else:
        wins = schedule_windows(float(t[ok1].max()), [s["dt_s"] for s in cfg["steps"]])
    rows = []
    for s, (a, b) in zip(cfg["steps"], wins):
        nasa = s["nasa_rate_mm_s"]; r = {"test": tid, "in_sample": tid in IN_SAMPLE, "flow_cm_s": s["flow_cm_s"], "nasa": nasa}
        for name, x in (("v1", x1), ("v2", x2)):
            sl, ci, m = steady_fit(t, x, a, b)
            r[name] = None if sl is None else {"rate": round(sl, 4), "ci95": round(ci, 4), "err_pct": round(100 * (round(sl, 4) - nasa) / nasa, 1), "n": int(m.sum())}
        rows.append(r)
    return rows


def summary(rows: list[dict], held_out: bool) -> dict:
    sel = [r for r in rows if r["in_sample"] != held_out]
    out = {}
    for name in ("v1", "v2"):
        allerr = [abs(r[name]["err_pct"]) for r in sel if r[name]]
        low = [abs(r[name]["err_pct"]) for r in sel if r[name] and r["flow_cm_s"] < 1]
        out[name] = {"n_all": len(allerr), "median_all": st.median(allerr) if allerr else None,
                     "n_low": len(low), "median_low": st.median(low) if low else None}
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("pairs", nargs="+"); ap.add_argument("--configs", default="configs"); ap.add_argument("--out")
    a = ap.parse_args()
    rows = []
    for p in a.pairs:
        tid, cache = p.split(":", 1); rows += evaluate(tid, cache, a.configs)
    for r in rows:
        f = lambda v: f"{v['rate']:.4f} {v['err_pct']:+6.1f}% n{v['n']:>2}" if v else "   n/a           "
        print(f"{r['test']:>4} {'in ' if r['in_sample'] else 'OUT'} {r['flow_cm_s']:>5} | v1 {f(r['v1'])} | v2 {f(r['v2'])}")
    res = {"rows": rows, "in_sample": summary(rows, False), "held_out": summary(rows, True)}
    print(json.dumps({k: res[k] for k in ("in_sample", "held_out")}, indent=1))
    if a.out: json.dump(res, open(a.out, "w", encoding="utf-8"), indent=1)
