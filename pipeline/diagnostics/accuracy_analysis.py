# Written with AI assistance (Claude Code and Codex)
"""Independent diagnostics of frozen spread rates; never writes tracker data."""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.stats import t as student_t

from stillair_tracker.run import steady_fit

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/research/accuracy"
FIG = ROOT / "docs/research/figures"
SEED = 20261115


def deming(x, y, lam=1.0):
    """Deming y on x; lambda is y-error variance / x-error variance."""
    x, y = np.asarray(x), np.asarray(y)
    vx, vy = np.var(x, ddof=1), np.var(y, ddof=1)
    cov = np.cov(x, y)[0, 1]
    if abs(cov) < 1e-15:
        return [float("nan"), float("nan")]
    slope = (vy - lam * vx + np.sqrt((vy - lam * vx)**2 + 4 * lam * cov**2)) / (2 * cov)
    return [float(slope), float(np.mean(y) - slope * np.mean(x))]


def ccc(x, y):
    x, y = np.asarray(x), np.asarray(y)
    return float(2 * np.cov(x, y)[0, 1] / (np.var(x, ddof=1) + np.var(y, ddof=1) + (np.mean(x) - np.mean(y))**2))


def boot_cluster(rows, n=20000):
    groups = {k: [r for r in rows if r["test_id"] == k] for k in sorted({r["test_id"] for r in rows})}
    rng = np.random.default_rng(SEED)
    slopes, intercepts, medians, biases = [], [], [], []
    keys = list(groups)
    for _ in range(n):
        sample = [r for k in rng.choice(keys, len(keys)) for r in groups[k]]
        x = [float(r["nasa_rate_mm_s"]) for r in sample]
        y = [float(r["rate_mm_s"]) for r in sample]
        slope, intercept = deming(x, y)
        if np.isfinite(slope):
            slopes.append(slope); intercepts.append(intercept)
        medians.append(float(np.median([abs(float(r["pct_error"])) for r in sample])))
        biases.append(float(np.mean(np.asarray(y) - x)))
    pct = lambda a: [float(v) for v in np.percentile(a, [2.5, 97.5])]
    return {"deming_slope_ci95": pct(slopes), "deming_intercept_ci95_mm_s": pct(intercepts),
            "median_abs_pct_error_ci95": pct(medians), "bias_ci95_mm_s": pct(biases),
            "n_resamples": n, "seed": SEED}


def group_summary(rows):
    x = np.asarray([float(r["nasa_rate_mm_s"]) for r in rows])
    y = np.asarray([float(r["rate_mm_s"]) for r in rows])
    diff = y - x
    sl, it = deming(x, y)
    return {"n": len(rows), "median_abs_pct_error": float(np.median(abs(100 * diff / x))),
            "bias_mm_s": float(np.mean(diff)), "limits_95_mm_s": [float(np.mean(diff) - 1.96 * np.std(diff, ddof=1)), float(np.mean(diff) + 1.96 * np.std(diff, ddof=1))],
            "deming_slope": sl, "deming_intercept_mm_s": it, "lin_ccc": ccc(x, y)}


def error_budget(row):
    test = row["test_id"]
    t, x = [], []
    with (ROOT / f"data/derived/edges/{test}.csv").open(newline="", encoding="utf-8") as h:
        for p in csv.DictReader(h):
            t.append(float(p["t_s"])); x.append(float(p["edge_mm"]) if p["edge_mm"] else np.nan)
    t, x = np.asarray(t), np.asarray(x)
    ws, we = float(row["t_start_s"]), float(row["t_end_s"])
    fit, _, mask = steady_fit(t, x, ws, we)
    shifts = []
    for left in (-10, -5, 0, 5, 10):
        for right in (-10, -5, 0, 5, 10):
            if left == right == 0:
                continue
            slope, _, _ = steady_fit(t, x, ws + left, we + right)
            if slope is not None:
                shifts.append(float(slope))
    rate = float(row["rate_mm_s"])
    ci95 = float(row["ci95_mm_s"])
    fit_sd = ci95 / student_t.ppf(0.975, int(row["n_frames"]) - 2)
    threshold = float(row["threshold_spread_mm_s"] or 0)
    # Half ranges are treated as rectangular sensitivity bounds, not empirically estimated SDs.
    threshold_sd = threshold / np.sqrt(3)
    window_half = max([abs(v - rate) for v in shifts], default=0)
    window_sd = window_half / np.sqrt(3)
    m = re.search(r"scale ([\d.]+)\+/-([\d.]+) px/mm", row["notes"])
    scale, scale_sem = (float(m[1]), float(m[2])) if m else (float("nan"), float("nan"))
    scale_sd = rate * scale_sem / scale
    # The only documented independent full-resolution width systematic is P16's 1.2 px.
    # P19 reuses P16's scale. Other headline tests have no quantified systematic.
    scale_sys = rate * 1.2 / (6.35 * scale) if test in ("B16", "B19") else None
    components = [fit_sd, threshold_sd, window_sd, scale_sd]
    if scale_sys is not None:
        components.append(scale_sys / np.sqrt(3))
    combined = float(np.sqrt(np.sum(np.square(components))))
    nasa = float(row["nasa_rate_mm_s"])
    cadence = float(np.median(np.diff(t[mask]))) if mask.sum() >= 2 else float("nan")
    fit_span = float(np.ptp(t[mask])) if mask.sum() >= 2 else float("nan")
    # Bhattacharjee/Carmignani's 1-pixel and 1-frame heuristic, divided by fit span.
    # The photo cadence is irregular; this is diagnostic, not an extra Gaussian SD.
    frame_fraction = ((1 / (scale / 4 * rate)) + cadence) / fit_span if fit_span > 0 else float("nan")
    return {"test_id": test, "flow_cm_s": float(row["flow_cm_s"]), "ours_mm_s": rate,
            "nasa_mm_s": nasa, "edge_csv_refit_mm_s": fit, "fit_sd_mm_s": fit_sd,
            "threshold_half_range_mm_s": threshold, "window_max_abs_shift_mm_s": window_half,
            "window_valid_refits": len(shifts), "scale_sem_px_per_mm": scale_sem,
            "scale_systematic_half_range_mm_s": scale_sys, "combined_provisional_sd_mm_s": combined,
            "z_if_nasa_sd_zero": (rate - nasa) / combined,
            "frame_theory_fraction_heuristic": frame_fraction, "photo_cadence_median_s": cadence,
            "fit_span_s": fit_span, "threshold_one_sided": "one-sided" in row["notes"]}


def figures(rows, stats):
    FIG.mkdir(parents=True, exist_ok=True)
    x = np.asarray([float(r["nasa_rate_mm_s"]) for r in rows]); y = np.asarray([float(r["rate_mm_s"]) for r in rows])
    colors = {"B16":"#2563eb", "B19":"#059669", "B12":"#d97706", "P17":"#be185d"}
    fig, ax = plt.subplots(figsize=(6.1, 5.2))
    for test in colors:
        idx = [i for i, r in enumerate(rows) if r["test_id"] == test]
        ax.scatter(x[idx], y[idx], label=test, color=colors[test], s=54)
    lo, hi = min(x.min(), y.min()) * .85, max(x.max(), y.max()) * 1.12
    xx = np.linspace(lo, hi, 100)
    ax.plot(xx, xx, "k--", label="ideal 1:1")
    ax.plot(xx, stats["deming_slope"] * xx + stats["deming_intercept_mm_s"], color="#8b5cf6", label="Deming, equal variance")
    ax.set(xlabel="Link Table S1 rate (mm/s)", ylabel="Frozen tracker rate (mm/s)", xlim=(lo,hi), ylim=(lo,hi), title="Low-flow parity, 8 headline steps")
    ax.legend(); fig.tight_layout(); fig.savefig(FIG / "accuracy_parity.png", dpi=180); plt.close(fig)

    mean = (x+y)/2; diff = y-x
    fig, ax = plt.subplots(figsize=(6.1, 4.6))
    for test in colors:
        idx = [i for i, r in enumerate(rows) if r["test_id"] == test]
        ax.scatter(mean[idx], diff[idx], label=test, color=colors[test], s=54)
    ax.axhline(stats["bias_mm_s"], color="k", label="bias")
    for i, v in enumerate(stats["limits_95_mm_s"]):
        ax.axhline(v, color="#6b7280", ls="--", label="95% limits of agreement (descriptive, n=8)" if i == 0 else None)
    ax.axhline(0, color="#a1a1aa", lw=.7)
    ax.set(xlabel="Mean of two rates (mm/s)", ylabel="Tracker minus Table S1 (mm/s)", title="Bland-Altman: 8 low-flow steps from 4 tests")
    ax.legend()
    fig.text(.02, .065, "Excludes B12 0.82 cm/s: LOW CONFIDENCE, +93.3% error.", fontsize=7)
    fig.text(.02, .035, "Table S1: Link et al. 2018, Sci Rep 8:120, SI p. 1. Written with AI assistance.", fontsize=7)
    fig.tight_layout(rect=(0, .11, 1, 1)); fig.savefig(FIG / "accuracy_bland_altman.png", dpi=180); plt.close(fig)

    fig, ax = plt.subplots(figsize=(7, 4.6))
    for i, test in enumerate(colors):
        values = [100 * (float(r["rate_mm_s"])-float(r["nasa_rate_mm_s"]))/float(r["nasa_rate_mm_s"]) for r in rows if r["test_id"] == test]
        ax.scatter([i-.10, i+.10], values, color=colors[test], s=55)
        ax.plot([i-.10,i+.10], values, color=colors[test], alpha=.5)
    ax.axhline(0, color="k", lw=.8)
    ax.set(xticks=range(4), xticklabels=list(colors), ylabel="Signed difference from Table S1 (%)", title="Two low-flow steps per test")
    fig.tight_layout(); fig.savefig(FIG / "accuracy_by_test.png", dpi=180); plt.close(fig)


def main():
    with (ROOT / "data/derived/spread_rates.csv").open(newline="", encoding="utf-8") as h:
        all_rows = list(csv.DictReader(h))
    low = [r for r in all_rows if r["rate_mm_s"] and float(r["flow_cm_s"]) < 1]
    headline = [r for r in low if not r["notes"].startswith("LOW CONFIDENCE")]
    assert len(headline) == 8 and len(low) == 9, (len(headline), len(low))
    stats = group_summary(headline)
    result = {"_comment": "Written with AI assistance (Claude Code and Codex)",
              "source": "data/derived/spread_rates.csv; Link et al. 2018 Supplement Table S1 p. 1",
              "headline": {**stats, **boot_cluster(headline)}, "all_nine_low_flow_including_flagged": group_summary(low),
              "per_test": {k: group_summary([r for r in headline if r["test_id"] == k]) for k in sorted({r["test_id"] for r in headline})},
              "budget": [error_budget(r) for r in low]}
    for key in ("headline", "all_nine_low_flow_including_flagged"):
        subset = result["budget"][:8] if key == "headline" else result["budget"]
        if key == "headline":
            ids = {(r["test_id"], float(r["flow_cm_s"])) for r in headline}
            subset = [r for r in result["budget"] if (r["test_id"], r["flow_cm_s"]) in ids]
        result[key]["within_1_provisional_sd"] = sum(abs(r["z_if_nasa_sd_zero"]) <= 1 for r in subset)
        result[key]["within_2_provisional_sd"] = sum(abs(r["z_if_nasa_sd_zero"]) <= 2 for r in subset)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "analysis.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    figures(headline, stats)
    print(json.dumps({"headline": result["headline"], "nine": result["all_nine_low_flow_including_flagged"]}, indent=2))


if __name__ == "__main__":
    main()
