# Written with AI assistance (Claude Code)
"""Does the orbit-model comparison change if O2 is the in-burn estimate instead of the starting-value label?

Analysis only. The orbit model (diagnostics/orbit_model.py, random forest chosen by its fixed rule) is trained on
Table S1 rows labelled with each burn's STARTING O2. NASA's PSI-25 table shows O2 fell during every burn
(docs/research/accuracy/uncertainty_floor.md). A fair check therefore retrains the same forest on in-burn O2
estimates for the Table S1 rows (diagnostics/o2_depletion_refit.py) and scores our measured steps at their own
in-burn estimates (docs/research/accuracy/uncertainty_floor.json), then compares with the label convention.
Same model class, same leave-one-sample-out band rule, same seed. B22's NASA final O2 (0.6%) is implausible
(see o2_depletion_refit.json), so its rows keep the label O2 in both conventions.

Usage (from pipeline/): python -m diagnostics.orbit_depletion_check --repo ..
"""
from __future__ import annotations
import argparse, csv, json, os
import numpy as np
from diagnostics import orbit_model as om
from diagnostics.o2_depletion_refit import load_rows
from diagnostics.uncertainty_floor import default_psi_table, read_psi_o2

MAX_DROP = 3.0


def table_arrays(rows: list[dict], key: str):
    o2 = np.array([r[key] if (key == "o2_label" or r["o2_initial"] - r["o2_final"] <= MAX_DROP) else r["o2_label"]
                   for r in rows], float)
    flow = np.array([r["flow"] for r in rows]); d = np.array([r["d_mm"] for r in rows])
    rate = np.array([r["rate"] for r in rows]); groups = np.array([r["sample"] for r in rows])
    return om.features(flow, o2, d), rate, groups, d


def run(rows, our_steps, key, our_key):
    X, rate, groups, d = table_arrays(rows, key)
    pred, _, _ = om.cross_validate(om.ForestModel, X, rate, groups)
    q, _, _ = om.forest_band(pred, rate, groups)
    heldout_median = float(np.median(np.abs(pred - rate) / rate) * 100)
    known = sorted(set(d.tolist()))
    out = []
    for s in our_steps:
        dd = om.snap_diameter(s["rod_d_mm"], known)
        tr = groups != s["test_id"]
        m = om.ForestModel().fit(X[tr], rate[tr]); m.band = q
        p, lo, hi = (float(v[0]) for v in m.predict(om.features([s["flow_cm_s"]], [s[our_key]], [dd])))
        out.append({"test_id": s["test_id"], "flow_cm_s": s["flow_cm_s"], "o2_used": round(s[our_key], 2),
                    "ours_mm_s": s["rate_mm_s"], "model_mm_s": round(p, 5), "inside95": bool(lo <= s["rate_mm_s"] <= hi),
                    "ours_vs_model_pct": round(100 * (s["rate_mm_s"] - p) / p, 1)})
    return {"table_heldout_median_ape_pct": round(heldout_median, 2), "band_q": round(q, 4), "steps": out,
            "n_inside95": sum(o["inside95"] for o in out), "n": len(out),
            "median_abs_ours_vs_model_pct": round(float(np.median([abs(o["ours_vs_model_pct"]) for o in out])), 1)}


def main(argv=None) -> dict:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)
    rows = load_rows(repo, read_psi_o2(default_psi_table(repo)))
    with open(os.path.join(repo, "docs", "research", "accuracy", "uncertainty_floor.json"), encoding="utf-8") as h:
        uf = json.load(h)
    with open(os.path.join(repo, "data", "derived", "spread_rates.csv"), encoding="utf-8") as h:
        sr = list(csv.DictReader(h))
    steps = []
    for s in uf["steps"]:
        r = next(x for x in sr if x["test_id"] == s["test_id"] and float(x["flow_cm_s"]) == s["flow_cm_s"])
        if r["rate_mm_s"] == "" or s["flow_cm_s"] >= 1.0:
            continue          # low-flow steps with a rate (the 8 headline + the flagged B12 0.82 step)
        steps.append({**s, "rate_mm_s": float(r["rate_mm_s"]), "rod_d_mm": float(r["rod_d_mm"]),
                      "flagged": "LOW CONFIDENCE" in r["notes"]})
    res = {"label (starting O2)": run(rows, steps, "o2_label", "o2_label"),
           "in-burn estimate": run(rows, steps, "o2_est", "o2_linear_estimate")}
    out = {"_note": "Written with AI assistance (Claude Code). Analysis only; nothing reported changes. Our steps are "
                    "scored by the forest refitted without their own Table S1 sample; band rule as in orbit_model.py.",
           "n_steps": len(steps), "flagged": [f"{s['test_id']} {s['flow_cm_s']}" for s in steps if s["flagged"]],
           "conventions": res}
    with open(os.path.join(repo, "docs", "research", "accuracy", "orbit_depletion_check.json"), "w",
              encoding="utf-8", newline="\n") as h:
        json.dump(out, h, indent=1)
    for k, v in res.items():
        print(f"{k:22s} Table S1 held-out median {v['table_heldout_median_ape_pct']}%  ours inside 95%: "
              f"{v['n_inside95']}/{v['n']}  median |ours-model| {v['median_abs_ours_vs_model_pct']}%")
    return out


if __name__ == "__main__":
    main()
