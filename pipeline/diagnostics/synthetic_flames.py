# Written with AI assistance (Claude Code and Codex)
"""Known-truth flame benchmark for the frozen edge and fit functions."""
from __future__ import annotations

import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from stillair_tracker.edge import track_test
from stillair_tracker.run import steady_fit

ROOT = Path(__file__).resolve().parents[2]
PXM = 34.83 / 4  # B16's measured 1/4-resolution scale; no published rate involved.


def real_cadence():
    """Use the actual P16 photo timestamps inside its burn window."""
    path = ROOT / "data/derived/edges/B16.csv"
    with path.open(newline="", encoding="utf-8") as h:
        t = [float(r["t_s"]) for r in csv.DictReader(h) if 9084.6 <= float(r["t_s"]) <= 9762.6]
    return np.asarray(t) - t[0]


def make_flames(speed_mm_s, seed=0, bright_core=True):
    """Linear-light frames after shutter normalization, with noise and isolated hot pixels.

    Core and blue-zone radiances decay 1000-fold over the burn. The camera shutter
    changes over its real stated range and is divided back out after simulated
    sensor noise. Blue-zone visibility changes with phase, not with NASA rates.
    """
    rng = np.random.default_rng(seed)
    t = real_cadence()
    h, w = 76, 820
    yy, xx = np.mgrid[:h, :w]
    images = np.empty((len(t), h, w, 3), np.float32)
    truth = 150 + speed_mm_s * PXM * t
    for i, ti in enumerate(t):
        phase = ti / max(t[-1], 1)
        decay = 1000 ** (-phase)
        shutter = (1/8000) * (8000/3) ** phase
        shutter *= (1.15 if i % 7 < 3 else 0.87)
        front = truth[i] - 2.0 * ((yy-38)/38)**2
        blue_zone = (xx >= front-36) & (xx <= front)
        core = (xx >= front-125) & (xx < front-36)
        light = np.zeros((h,w,3), np.float32)
        core_strength = 1000 * decay
        light[core] = np.array([1.0, .8, .14]) * core_strength
        blue_ratio = (0.045 + .85 * phase) if bright_core else .82
        light[blue_zone] = np.array([.03, .16, 1.0]) * core_strength * blue_ratio
        # Sensor-domain shot/read noise. Exposure normalization is then applied.
        raw = light * shutter
        raw += rng.normal(0, .00009, raw.shape).astype(np.float32)
        raw = raw.clip(0, 1)
        for _ in range(5):
            ry, rx = rng.integers(0,h), rng.integers(0,w)
            raw[ry,rx] = 1
        images[i] = raw / shutter
    return t, images, truth / PXM


def evaluate(speed_mm_s, seed=0, bright_core=True):
    t, img, truth_mm = make_flames(speed_mm_s, seed, bright_core)
    tr = track_test(img, rel=.3, axis_row=38, half_band=36, direction=1)
    measured_mm = tr["edge_px"] / PXM
    slope, ci, mask = steady_fit(t, measured_mm, 0, float(t[-1]))
    truth_slope, _, _ = steady_fit(t, truth_mm, 0, float(t[-1]))
    bias_px = tr["edge_px"] - truth_mm * PXM
    return {"speed_truth_mm_s": speed_mm_s, "seed": seed, "bright_core": bright_core,
            "measured_mm_s": slope, "truth_fit_mm_s": truth_slope, "fit_ci95_mm_s": ci,
            "abs_pct_error": abs(100*(slope-speed_mm_s)/speed_mm_s) if slope is not None else None,
            "n_photos": len(t), "n_fit_photos": int(mask.sum()),
            "median_front_offset_px_early": float(np.nanmedian(bias_px[t < .3*t[-1]])),
            "median_front_offset_px_late": float(np.nanmedian(bias_px[t > .7*t[-1]])),
            "t_s": t.tolist(), "front_truth_px": (truth_mm*PXM).tolist(),
            "front_measured_px": tr["edge_px"].tolist()}


def main():
    cases = [evaluate(speed, seed, bright) for speed in (.02,.06,.10) for bright in (True,False) for seed in (0,1)]
    out = ROOT / "docs/research/accuracy"
    figdir = ROOT / "docs/research/figures"
    out.mkdir(parents=True, exist_ok=True); figdir.mkdir(parents=True, exist_ok=True)
    (out / "synthetic.json").write_text(json.dumps({"_comment":"Written with AI assistance (Claude Code and Codex)", "source_cadence":"data/derived/edges/B16.csv", "cases":cases}, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    fig, ax = plt.subplots(figsize=(7,4.5))
    for c in cases:
        if c["seed"] == 0 and c["speed_truth_mm_s"] == .06:
            label = "Tracker edge, bright-core case" if c["bright_core"] else "Tracker edge, visible-blue case"
            ax.plot(c["t_s"], np.asarray(c["front_measured_px"])/PXM, label=label)
    c = next(c for c in cases if c["speed_truth_mm_s"] == .06)
    ax.plot(c["t_s"], np.asarray(c["front_truth_px"])/PXM, "k--", label="True front")
    ax.set(xlabel="Time since first photo (s)", ylabel="Front position (mm)", title="Synthetic flame at 0.06 mm/s; P16 photo cadence")
    blue = [c["abs_pct_error"] for c in cases if not c["bright_core"]]
    bright = [c["abs_pct_error"] for c in cases if c["bright_core"]]
    ax.legend()
    fig.text(.02, .07, f"Visible blue: {sum(e < 2 for e in blue)}/6 within 2% (max {max(blue):.2f}%); bright core: {sum(e > 2 for e in bright)}/6 fail ({min(bright):.1f}-{max(bright):.1f}%).", fontsize=7)
    fig.text(.02, .04, "Synthetic data, P16 photo cadence. Written with AI assistance.", fontsize=7)
    fig.tight_layout(rect=(0, .12, 1, 1)); fig.savefig(figdir / "accuracy_synthetic.png", dpi=180); plt.close(fig)
    print(json.dumps([{k:v for k,v in c.items() if k not in ("t_s","front_truth_px","front_measured_px")} for c in cases], indent=2))


if __name__ == "__main__":
    main()
