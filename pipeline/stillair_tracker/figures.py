# Written with AI assistance (Claude Code)
"""Parity plot of our spread rates against NASA Table S1: docs/figures/parity_spread_rates.{png,svg}.

Reads ONLY data/derived/spread_rates.csv. x = nasa_rate_mm_s, y = rate_mm_s with ci95_mm_s error bars,
y = x line with a +/-10% band, one marker shape per test. Reliable rows are filled; rows whose notes
contain "LOW CONFIDENCE" or whose flow_cm_s > 1 (early high-flow steps) are hollow and lighter.
The "low-flow median |error|" annotation is computed from reliable rows: flow_cm_s < 1 and not LOW CONFIDENCE.
Every number on the figure comes from the CSV except the 10% band.

Usage: python -m stillair_tracker.figures --repo ..
"""
from __future__ import annotations
import argparse, csv, os
import numpy as np

CSV_REL = os.path.join("data", "derived", "spread_rates.csv")
OUT_REL = os.path.join("docs", "figures")
STEM = "parity_spread_rates"
BAND = 0.10                 # +/-10% agreement band (the only fixed number on the figure)
HIGH_FLOW_CM_S = 1.0        # rows above this are the early high-flow steps
FOOTER = ("Data: NASA PSI-25 BASS-II photos (CC0); "
          "reference: Link et al. 2018 Sci Rep 8:120 Table S1")
# Okabe-Ito colorblind-safe colors; marker shape also encodes the test, so color is not the only cue.
TEST_STYLE = [("#0072B2", "o"), ("#D55E00", "s"), ("#009E73", "^"), ("#CC79A7", "D"), ("#E69F00", "v")]
INK, GRID, BAND_RGB = "#222222", "#DDDDDD", "#BBBBBB"


def read_rows(path: str) -> list[dict]:
    """Rows of spread_rates.csv with the numeric columns the figure needs (NaN when empty)."""
    def num(v):
        return float(v) if v not in ("", None) else np.nan
    with open(path, newline="", encoding="utf-8") as h:
        rows = list(csv.DictReader(h))
    return [{"test_id": r["test_id"], "flow": num(r["flow_cm_s"]), "rate": num(r["rate_mm_s"]),
             "ci95": num(r["ci95_mm_s"]), "nasa": num(r["nasa_rate_mm_s"]), "notes": r.get("notes", "") or ""}
            for r in rows]


def is_flagged(row: dict) -> bool:
    """Hollow/lighter marker: flagged LOW CONFIDENCE in notes, or an early high-flow step."""
    return "LOW CONFIDENCE" in row["notes"] or row["flow"] > HIGH_FLOW_CM_S


def abs_pct_error(row: dict) -> float:
    return abs(row["rate"] - row["nasa"]) / row["nasa"] * 100.0


def low_flow_median_error(rows: list[dict]) -> tuple[float, int]:
    """(median |error| in %, n) over RELIABLE rows: flow < HIGH_FLOW_CM_S, not flagged LOW CONFIDENCE,
    both rates present. Same rule as the headline in pipeline/METHOD.md."""
    errs = [abs_pct_error(r) for r in rows
            if not is_flagged(r) and np.isfinite(r["rate"]) and np.isfinite(r["nasa"]) and r["nasa"] > 0]
    return (float(np.median(errs)) if errs else np.nan), len(errs)


def axis_limits(rows: list[dict]) -> tuple[float, float]:
    """Shared x/y limits covering every point and error bar, padded 8% and starting at 0 if close."""
    vals = []
    for r in rows:
        ci = r["ci95"] if np.isfinite(r["ci95"]) else 0.0
        vals += [r["nasa"], r["rate"] - ci, r["rate"] + ci]
    vals = np.array([v for v in vals if np.isfinite(v)])
    lo, hi = float(vals.min()), float(vals.max())
    pad = 0.08 * (hi - lo if hi > lo else abs(hi) or 1.0)
    lo, hi = lo - pad, hi + pad
    if lo < 0.35 * hi:
        lo = 0.0
    return lo, hi


def plot(rows: list[dict], out_dir: str, dpi: int = 150) -> list[str]:
    """Write <out_dir>/parity_spread_rates.png and .svg (16:9, 1920x1080 px at dpi=150). Returns paths."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D

    rows = [r for r in rows if np.isfinite(r["rate"]) and np.isfinite(r["nasa"])]
    if not rows:
        raise ValueError("no rows with both rate_mm_s and nasa_rate_mm_s")
    tests = list(dict.fromkeys(r["test_id"] for r in rows))
    style = {t: TEST_STYLE[i % len(TEST_STYLE)] for i, t in enumerate(tests)}
    lo, hi = axis_limits(rows)
    med, n_low = low_flow_median_error(rows)

    plt.rcParams.update({"font.size": 15, "axes.labelsize": 18, "axes.titlesize": 20,
                         "legend.fontsize": 14, "xtick.labelsize": 14, "ytick.labelsize": 14,
                         "svg.hashsalt": STEM})
    fig = plt.figure(figsize=(1920 / dpi, 1080 / dpi), dpi=dpi, facecolor="white")
    # Square parity axes on the left, legend + notes column on the right.
    ax_h = 0.74
    ax = fig.add_axes([0.085, 0.165, ax_h * 1080 / 1920, ax_h])
    ax.set_box_aspect(1)

    xs = np.array([lo, hi])
    ax.fill_between(xs, xs * (1 - BAND), xs * (1 + BAND), color=BAND_RGB, alpha=0.35, lw=0, zorder=1)
    ax.plot(xs, xs, color=INK, lw=1.4, zorder=2)

    for r in rows:
        color, marker = style[r["test_id"]]
        flagged = is_flagged(r)
        alpha = 0.55 if flagged else 1.0
        ci = r["ci95"] if np.isfinite(r["ci95"]) else 0.0
        ax.errorbar(r["nasa"], r["rate"], yerr=ci, fmt="none", ecolor=color, elinewidth=1.6,
                    capsize=5, capthick=1.6, alpha=alpha, zorder=3)
        ax.plot(r["nasa"], r["rate"], linestyle="none", marker=marker, markersize=13,
                markerfacecolor="white" if flagged else color, markeredgecolor=color,
                markeredgewidth=2.2, alpha=alpha, zorder=4)

    ax.set_xlim(lo, hi)
    ax.set_ylim(lo, hi)
    ax.set_xlabel("NASA Table S1 spread rate (mm/s)")
    ax.set_ylabel("Our tracked spread rate (mm/s)")
    ax.grid(True, color=GRID, lw=0.8, zorder=0)
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.tick_params(direction="out", length=5)

    # Right-hand column: title, legend, computed annotation.
    x0 = 0.585
    fig.text(x0, 0.91, "Flame-spread rate:\nour tracker vs NASA Table S1", fontsize=22, weight="bold",
             color=INK, va="top", linespacing=1.25)
    fig.text(x0, 0.785, "Each point is one fan-flow step of a BASS-II test.\nError bars: 95% CI of our slope fit.",
             fontsize=14, color="#444444", va="top", linespacing=1.4)
    handles = [Line2D([], [], linestyle="none", marker=style[t][1], markersize=12, markerfacecolor=style[t][0],
                      markeredgecolor=style[t][0], markeredgewidth=2.2, label=f"Test {t}") for t in tests]
    handles += [
        Line2D([], [], linestyle="none", marker="o", markersize=12, markerfacecolor="#666666",
               markeredgecolor="#666666", markeredgewidth=2.2, label="Reliable"),
        Line2D([], [], linestyle="none", marker="o", markersize=12, markerfacecolor="white",
               markeredgecolor="#666666", markeredgewidth=2.2, alpha=0.55,
               label=f"Low confidence or high flow (> {HIGH_FLOW_CM_S:g} cm/s)"),
        Line2D([], [], color=INK, lw=1.4, label="y = x (perfect agreement)"),
        plt.Rectangle((0, 0), 1, 1, facecolor=BAND_RGB, alpha=0.35, lw=0, label=f"±{BAND:.0%} band"),
    ]
    fig.legend(handles=handles, loc="upper left", bbox_to_anchor=(x0 - 0.008, 0.675), frameon=False,
               handletextpad=0.7, labelspacing=0.9, borderaxespad=0)
    med_txt = (f"low-flow median |error| = {med:.1f}%" if np.isfinite(med)
               else "low-flow median |error| = n/a")
    fig.text(x0, 0.235, med_txt, fontsize=19, weight="bold", color=INK, va="top")
    fig.text(x0, 0.18, f"n = {n_low} reliable steps below {HIGH_FLOW_CM_S:g} cm/s (filled markers)\n"
             "|error| = |ours − NASA| / NASA",
             fontsize=13, color="#444444", va="top", linespacing=1.4)
    fig.text(0.5, 0.018, FOOTER, ha="center", va="bottom", fontsize=12, color="#555555")

    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for ext, meta in (("png", {"Software": None}), ("svg", {"Date": None})):
        p = os.path.join(out_dir, f"{STEM}.{ext}")
        fig.savefig(p, dpi=dpi, facecolor="white", metadata=meta)
        paths.append(p)
    plt.close(fig)
    return paths


def main(argv=None) -> list[str]:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default="..", help="repo root holding data/ and docs/")
    ap.add_argument("--dpi", type=int, default=150)
    a = ap.parse_args(argv)
    paths = plot(read_rows(os.path.join(a.repo, CSV_REL)), os.path.join(a.repo, OUT_REL), dpi=a.dpi)
    for p in paths:
        print(p)
    return paths


if __name__ == "__main__":
    main()
