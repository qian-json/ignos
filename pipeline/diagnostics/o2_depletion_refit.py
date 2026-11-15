# Written with AI assistance (Claude Code)
"""Does labelling each BASS-II burn with its STARTING oxygen bias the published O2 dependence?

Analysis only (no reported rate changes). NASA's PSI-25 experimental table gives a calibrated initial and final
O2 for every test (O2 "decreased during each burn", ICES-2015-196 p. 4; readings only "before and after each
BASS-II test", p. 5). Link et al. 2018 Table S1 labels every step of a sample with one O2, which equals the
initial reading for the tests we checked (docs/research/accuracy/uncertainty_floor.md).

Here every Table S1 step gets an estimated O2 at its midpoint: initial - frac * (initial - final), where frac is
the step's midpoint position in the sample's listed step durations (steps assumed contiguous, in table order,
filling the burn; an ASSUMPTION, since ignition time and time after the last step are not in Table S1). The
log-linear model ln(rate) = a + b ln(flow) + c O2 + d ln(diameter) is fitted with the label O2, the estimated
O2 and the final O2 (a bound), with whole-sample bootstrap CIs (parallel over the CPU cores).

Usage (from pipeline/): python -m diagnostics.o2_depletion_refit --repo .. [--psi-table PATH] [--boot 4000]
"""
from __future__ import annotations
import argparse, csv, json, math, os
import numpy as np
from diagnostics.uncertainty_floor import default_psi_table, read_psi_o2

SEED = 20261115


def psi_test_for(sample: str, psi: dict) -> str | None:
    """Table S1 sample (B16, C25, B13a, B22, C3a ...) -> PSI test id (P16, P25, P13a, P22a, P3a ...)."""
    base = "P" + sample[1:]
    for cand in (base, base + "a"):
        if cand in psi:
            return cand
    return None


def load_rows(repo: str, psi: dict) -> list[dict]:
    with open(os.path.join(repo, "data", "reference", "link2018_table_s1.csv"), encoding="utf-8") as h:
        rows = [r for r in csv.DictReader(line for line in h if not line.startswith("#"))]
    by = {}
    for r in rows:
        by.setdefault(r["sample_id"], []).append(r)
    out = []
    for sid, rs in by.items():
        rs.sort(key=lambda r: int(r["step"]))
        dts = [float(r["dt_s"]) for r in rs]
        tot = sum(dts)
        p = psi_test_for(sid, psi)
        o2a, o2b = psi.get(p, (None, None)) if p else (None, None)
        cum = 0.0
        for r, dt in zip(rs, dts):
            frac = (cum + dt / 2) / tot
            cum += dt
            lab = float(r["o2_pct"])
            rec = {"sample": sid, "psi_test": p, "d_mm": 10 * float(r["rod_d_cm"]), "flow": float(r["flow_cm_s"]),
                   "rate": float(r["rate_x1e3"]) * 0.01, "o2_label": lab, "frac": frac,
                   "o2_initial": o2a, "o2_final": o2b,
                   "label_is_initial": (o2a is not None and abs(lab - o2a) < 0.05)}
            if o2a is not None and o2b is not None:
                rec["o2_est"] = o2a - frac * (o2a - o2b)
            out.append(rec)
    return out


def fit(rows: list[dict], key: str) -> np.ndarray:
    X = np.array([[1.0, math.log(r["flow"]), r[key], math.log(r["d_mm"])] for r in rows])
    y = np.array([math.log(r["rate"]) for r in rows])
    return np.linalg.lstsq(X, y, rcond=None)[0]


def boot_o2_coef(rows: list[dict], key: str, n: int, seed: int) -> list[float]:
    rng = np.random.default_rng(seed)
    samples = sorted({r["sample"] for r in rows})
    by = {s: [r for r in rows if r["sample"] == s] for s in samples}
    cs = []
    for _ in range(n):
        pick = rng.choice(samples, size=len(samples), replace=True)
        rr = [r for s in pick for r in by[s]]
        try:
            cs.append(fit(rr, key)[2])
        except np.linalg.LinAlgError:
            pass
    return [float(np.percentile(cs, 2.5)), float(np.percentile(cs, 97.5))]


def main(argv=None) -> dict:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    ap.add_argument("--psi-table", default=None)
    ap.add_argument("--boot", type=int, default=4000)
    ap.add_argument("--max-drop", type=float, default=3.0,
                    help="exclude samples whose before-after O2 drop exceeds this (implausible for one rod burn; reported)")
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)
    psi = read_psi_o2(a.psi_table or default_psi_table(repo))
    rows = load_rows(repo, psi)
    with_o2 = [r for r in rows if "o2_est" in r]
    excluded = sorted({r["sample"] for r in with_o2 if r["o2_initial"] - r["o2_final"] > a.max_drop})
    usable = [r for r in with_o2 if r["sample"] not in excluded]
    res = {}
    from concurrent.futures import ProcessPoolExecutor
    keys = {"label (Table S1, = initial)": "o2_label", "estimated at step midpoint": "o2_est", "final reading (bound)": "o2_final"}
    with ProcessPoolExecutor() as ex:
        futs = {name: ex.submit(boot_o2_coef, usable, k, a.boot, SEED) for name, k in keys.items()}
        for name, k in keys.items():
            coef = fit(usable, k)
            coef_all = fit(with_o2, k)
            res[name] = {"o2_coef_all_samples_incl_excluded": round(float(coef_all[2]), 4),"o2_coef_per_point": round(float(coef[2]), 4),
                         "o2_coef_ci95_cluster": [round(v, 4) for v in futs[name].result()],
                         "rate_ratio_per_point": round(math.exp(coef[2]), 3),
                         "flow_exponent": round(float(coef[1]), 4), "diameter_exponent": round(float(coef[3]), 4)}
    mism = sorted({(r["sample"], r["psi_test"], r["o2_label"], r["o2_initial"]) for r in rows if not r["label_is_initial"]},
                  key=lambda t: t[0])
    out = {
        "_note": "Written with AI assistance (Claude Code). Analysis only. Step timing within a burn is assumed from "
                 "Table S1's listed step durations (contiguous, in order); O2 assumed to fall linearly in time between "
                 "NASA's before/after readings. Final-O2 fit is a bound, not an estimate.",
        "sources": {"table_s1": "data/reference/link2018_table_s1.csv (Link et al. 2018 Sci Rep 8:120, SI Table S1 p. 1)",
                    "o2_before_after": "NASA PSI-25 experimental table, calibrated initial/final O2 (CC0)",
                    "o2_fell": "ICES-2015-196 (NTRS 20150019858) pp. 4-5"},
        "n_rows": len(rows), "n_rows_with_before_after_o2": len(usable),
        "n_samples_with_before_after_o2": len({r["sample"] for r in with_o2}),
        "excluded_implausible_drop": [{"sample": s, "drop_points": round(next(r["o2_initial"] - r["o2_final"] for r in with_o2 if r["sample"] == s), 2)} for s in excluded],
        "max_drop_rule_points": a.max_drop, "n_rows_fitted": len(usable),
        "label_not_equal_initial": [{"sample": s, "psi_test": p, "label": l, "initial": i} for s, p, l, i in mism],
        "fits": res,
        "o2_drop_points_by_sample": {r["sample"]: round(r["o2_initial"] - r["o2_final"], 2) for r in with_o2},
        "bootstrap": {"resamples": a.boot, "seed": SEED, "unit": "whole Table S1 sample"},
    }
    with open(os.path.join(repo, "docs", "research", "accuracy", "o2_depletion_refit.json"), "w", encoding="utf-8", newline="\n") as h:
        json.dump(out, h, indent=1)
    print(json.dumps({k: out[k] for k in ("n_rows", "n_rows_fitted", "excluded_implausible_drop", "n_samples_with_before_after_o2",
                                           "label_not_equal_initial", "fits", "o2_drop_points_by_sample")}, indent=1))
    return out


if __name__ == "__main__":
    main()
