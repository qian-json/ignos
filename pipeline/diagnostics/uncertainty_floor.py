# Written with AI assistance (Claude Code)
"""Condition-label uncertainty for the BASS-II steps (analysis only; the frozen tracker and its CSV are untouched).

CORRECTION (2026-11-15 ~12:05 CST): an earlier version of this file added NASA's stated O2 uncertainty to the
comparison "our rate vs Table S1 rate". That was wrong: both rates measure the SAME flame in the SAME burn, so
an error in the oxygen or flow LABEL cannot make the two measurements disagree; it cancels. The headline
comparison keeps Table S1 as given (3 of 8 within 1 provisional SD, 6 of 8 within 2; analysis.json).

What label uncertainty DOES affect: any comparison of a measured rate with a model or condition at the labelled
O2 and flow (the orbit model, the habitat matcher, Moon or Earth comparisons). This script quantifies it from
NASA's own records:
- O2: Table S1's O2 equals NASA's "Calibrated initial O2" (PSI-25 experimental table). The same table gives a
  "Calibrated final O2"; the drop over the burn is 0.3 to 1.6 points for our tests. Only before/after readings
  exist (ICES-2015-196 p. 5), so the O2 during a step is estimated by linear interpolation in time over the burn
  window (an ASSUMPTION; true depletion follows the burning rate) and bounded by [final, initial].
- Rate effect: d ln(rate)/d O2 from the log-linear fit on Table S1 (docs/research/orbit_model.json).
- Link et al. 2018's stated +/-0.3% O2 uncertainty (Fig. 7 caption) is shown in rate terms for both readings
  (one SD, or a 95% bound).

Usage (from pipeline/): python -m diagnostics.uncertainty_floor --repo .. [--psi-table PATH]
"""
from __future__ import annotations
import argparse, csv, json, math, os

O2_UNCERTAINTY_PTS = 0.3   # Link et al. 2018, Fig. 7 caption
PSI_OF = {"B16": "P16", "B19": "P19", "B12": "P12", "P17": "P17", "B13b": "P13b", "B13a": "P13a"}


def default_psi_table(repo: str) -> str:
    return os.path.normpath(os.path.join(repo, "..", "space-apps-2026", "data", "raw", "psi25",
                                         "PSI-25_Experimental table_BASS-II.csv"))


def read_psi_o2(path: str) -> dict:
    """{PSI test: (initial O2 %, final O2 %)} from NASA's PSI-25 experimental table."""
    with open(path, encoding="utf-8-sig") as h:
        rows = list(csv.reader(h))
    hdr = [c.strip() for c in rows[0]]
    i_t = hdr.index("Test #")
    i_a = next(k for k, c in enumerate(hdr) if c.lower().startswith("calibrated") and "initial o2" in c.lower())
    i_b = next(k for k, c in enumerate(hdr) if c.lower().startswith("calibrated") and "final o2" in c.lower())
    out = {}
    for r in rows[1:]:
        try:
            out[r[i_t].strip()] = (float(r[i_a]), float(r[i_b]))
        except (ValueError, IndexError):
            pass
    return out


def rel_from_o2(beta: float, pts: float) -> float:
    """Relative rate change for an O2 change of `pts` points (log-linear sensitivity)."""
    return math.exp(beta * pts) - 1.0


def step_o2(o2_init: float, o2_final: float, burn: tuple, window: tuple) -> dict:
    """O2 at a step's window midpoint, linear in time over the burn window, clipped to the burn."""
    w0, w1 = burn
    mid = min(max(0.5 * (window[0] + window[1]), w0), w1)
    frac = (mid - w0) / (w1 - w0) if w1 > w0 else 0.0
    return {"frac_of_burn": frac, "o2_linear": o2_init - frac * (o2_init - o2_final),
            "o2_range": [o2_final, o2_init]}


def main(argv=None) -> dict:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    ap.add_argument("--psi-table", default=None)
    ap.add_argument("--no-fig", action="store_true")
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)
    psi = read_psi_o2(a.psi_table or default_psi_table(repo))
    with open(os.path.join(repo, "docs", "research", "orbit_model.json"), encoding="utf-8") as h:
        eff = json.load(h)["effects"]["loglinear_coefficients"]
    beta, beta_ci = eff["o2_pct"]["estimate"], eff["o2_pct"]["ci95_cluster_bootstrap"]
    with open(os.path.join(repo, "data", "derived", "spread_rates.csv"), encoding="utf-8") as h:
        rows = list(csv.DictReader(h))

    tests, steps = {}, []
    for tid, ptest in PSI_OF.items():
        with open(os.path.join(repo, "pipeline", "configs", f"{tid}.json"), encoding="utf-8") as h:
            cfg = json.load(h)
        o2a, o2b = psi[ptest]
        tests[tid] = {"psi_test": ptest, "table_s1_o2": cfg["o2_pct"], "psi_initial_o2": o2a, "psi_final_o2": o2b,
                      "drop_points": round(o2a - o2b, 2), "label_matches_initial": abs(cfg["o2_pct"] - o2a) < 1e-9,
                      "rate_effect_of_full_drop_pct": round(-100 * rel_from_o2(beta, o2a - o2b) / (1 + rel_from_o2(beta, o2a - o2b)), 1)}
        for s, w in zip(cfg["steps"], cfg["windows_s"]):
            r = next(x for x in rows if x["test_id"] == tid and float(x["flow_cm_s"]) == s["flow_cm_s"])
            est = step_o2(o2a, o2b, tuple(cfg["burn_window_s"]), tuple(w))
            deficit = o2a - est["o2_linear"]
            steps.append({"test_id": tid, "flow_cm_s": s["flow_cm_s"],
                          "headline": r["rate_mm_s"] != "" and s["flow_cm_s"] < 1.0 and "LOW CONFIDENCE" not in r["notes"],
                          "frac_of_burn_at_mid": round(est["frac_of_burn"], 3), "o2_label": cfg["o2_pct"],
                          "o2_linear_estimate": round(est["o2_linear"], 2), "o2_bounds": est["o2_range"],
                          "label_minus_estimate_points": round(deficit, 2),
                          "expected_rate_shift_pct_linear": round(100 * (math.exp(-beta * deficit) - 1), 1),
                          "expected_rate_shift_pct_worst": round(100 * (math.exp(-beta * (o2a - o2b)) - 1), 1)})
    head = [s for s in steps if s["headline"]]
    out = {
        "_note": "Written with AI assistance (Claude Code). Analysis only; no reported rate changes. Label "
                 "uncertainty applies to comparisons against a model or condition, NOT to our rate vs Table S1 "
                 "(same flame). Correction of an earlier version that mixed the two.",
        "sources": {"psi_table": "NASA PSI-25 experimental table (CC0), columns 'Calibrated initial/final O2 % by vol'",
                    "o2_readings_before_after": "ICES-2015-196 (Olson, Ferkul et al., NTRS 20150019858) p. 5",
                    "o2_decreased_each_burn": "ICES-2015-196 p. 4",
                    "o2_uncertainty": "Link et al. 2018 Sci Rep 8:120, Fig. 7 caption: +/-0.3%",
                    "beta": "docs/research/orbit_model.json effects.loglinear_coefficients.o2_pct"},
        "beta_o2_per_point": beta, "beta_o2_ci95_cluster": beta_ci,
        "stated_o2_uncertainty_in_rate_terms_pct": {
            "as_1sd": round(100 * rel_from_o2(beta, O2_UNCERTAINTY_PTS), 1),
            "as_95pct_bound_sd": round(100 * rel_from_o2(beta, O2_UNCERTAINTY_PTS / 1.96), 1),
            "as_1sd_beta_ci": [round(100 * rel_from_o2(b, O2_UNCERTAINTY_PTS), 1) for b in beta_ci]},
        "tests": tests,
        "steps": steps,
        "headline_steps_label_minus_estimate_points": [s["label_minus_estimate_points"] for s in head],
        "assumption": "O2 falls linearly in time over the burn window between NASA's before and after readings.",
    }
    path = os.path.join(repo, "docs", "research", "accuracy", "uncertainty_floor.json")
    with open(path, "w", encoding="utf-8", newline="\n") as h:
        json.dump(out, h, indent=1)
    if not a.no_fig:
        plot(out, os.path.join(repo, "docs", "research", "figures", "accuracy_uncertainty_floor.png"))
    for t, v in tests.items():
        print(t, v)
    for s in head:
        print(s["test_id"], s["flow_cm_s"], "label", s["o2_label"], "est", s["o2_linear_estimate"],
              "shift", s["expected_rate_shift_pct_linear"], "% (worst", s["expected_rate_shift_pct_worst"], "%)")
    return out


def plot(out: dict, path: str) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    st = [s for s in out["steps"] if s["headline"]]
    fig, ax = plt.subplots(figsize=(9, 4.4))
    for i, s in enumerate(st):
        lo, hi = s["o2_bounds"]
        ax.plot([i, i], [lo, hi], color="#9aa6b2", lw=6, solid_capstyle="butt")
        ax.plot(i, s["o2_label"], marker="_", ms=22, mew=2.5, color="#1f6fd1")
        ax.plot(i, s["o2_linear_estimate"], marker="o", color="#d1621f")
    ax.set_xticks(range(len(st)), [f"{s['test_id']}\n{s['flow_cm_s']:g}" for s in st])
    ax.set_ylabel("O2 (% by volume)")
    ax.set_xlabel("test and flow (cm/s); the 8 headline low-flow steps")
    ax.set_title("Oxygen during each step vs the oxygen it is labelled with")
    ax.plot([], [], color="#9aa6b2", lw=6, label="NASA before/after readings for the burn (final to initial)")
    ax.plot([], [], marker="_", ms=14, mew=2.5, ls="", color="#1f6fd1", label="label used in Table S1 (= initial)")
    ax.plot([], [], marker="o", ls="", color="#d1621f", label="linear-in-time estimate at the step midpoint (assumption)")
    ax.legend(loc="upper right", fontsize=8, frameon=False)
    fig.text(0.01, 0.01, "Source: NASA PSI-25 experimental table (calibrated initial and final O2); readings only before and after each test\n"
             "(ICES-2015-196 p. 5). Affects model and condition comparisons, not our rate vs Table S1. Written with AI assistance (Claude Code).",
             fontsize=7, color="#555")
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    fig.savefig(path, dpi=150)
    plt.close(fig)


if __name__ == "__main__":
    main()
