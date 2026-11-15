# Written with AI assistance (Claude Code)
"""Run the tracker on one BASS-II test and write contract files:
data/derived/spread_rates.csv rows (appended/replaced per test) and data/derived/edges/<test_id>.csv.

Usage: python -m stillair_tracker.run configs/B16.json --cache <npz> --repo <repo root>
"""
from __future__ import annotations
import argparse, csv, json, os
import numpy as np
from .frames import load_test
from .edge import track_test
from .segment import fit_line, schedule_windows, dp_segments
from .calibrate import px_per_mm

COLS = ["test_id", "rod_d_mm", "o2_pct", "flow_cm_s", "t_start_s", "t_end_s", "rate_mm_s", "ci95_mm_s",
        "threshold_spread_mm_s", "nasa_rate_mm_s", "pct_error", "flame_len_mm", "blue_frac",
        "extinction_s", "n_frames", "notes"]


def steady_fit(t, x, w0, w1, start=0.25, stop=0.90):
    """Fit the steady part of a flow step only: from `start` to `stop` of the window. The flow
    sensor lags ~1 min after a change, each flow change makes the flame jump, and the published
    step durations place windows only to about +/-10 s. One rule for every step, never tuned
    per step. FROZEN at 25-90% on 2026-11-14 (chosen after a first run with "later 75%", so the
    earlier rule is always reported in notes as a sensitivity check). Returns slope, ci95, mask."""
    a, b = w0 + start * (w1 - w0), w0 + stop * (w1 - w0)
    m = (t >= a) & (t <= b) & ~np.isnan(x)
    if m.sum() < 6:
        return None, None, m
    slope, _, ci = fit_line(t[m], x[m])
    return slope, ci, m


def nonphysical_note(slope) -> str:
    """A flame front does not move backwards, so a fitted slope of zero or less is a tracking
    failure, not a spread rate. Returns the note text for such a slope (the row is then written
    as unusable, with the fitted value kept in the note), or "" for a usable slope.
    Rule added 2026-11-15 after B13a's first step came out negative; it never changes a
    positive rate."""
    if slope is None or slope > 0:
        return ""
    return (f"fitted slope {slope:.4f} mm/s is zero or negative, which is not physical for a spreading flame, "
            "so no rate is reported; ")


def px_to_mm(edge_px, ref_px: float, ppm: float, sign: int):
    """Edge position in mm along the rod axis (increasing upstream, 0 at the first burn frame's
    edge) from a column in the tracked frame. `ppm` is px/mm at the frame's own resolution."""
    return sign * (np.asarray(edge_px, dtype=float) - ref_px) / ppm


def mm_to_px(edge_mm, ref_px: float, ppm: float, sign: int):
    """Inverse of px_to_mm: column in the tracked frame for an edge_mm value (overlay video)."""
    return ref_px + sign * np.asarray(edge_mm, dtype=float) * ppm


def tracking_kw(cfg, d) -> dict:
    """track_frame/track_test keyword arguments for this test (axis row shifted for band caches)."""
    return dict(axis_row=cfg["axis_row"] - int(d.get("row0", 0)), half_band=cfg["half_band"],
                direction=cfg["direction"])


def edge_reference(cfg, t, base) -> tuple[float, np.ndarray, np.ndarray]:
    """Valid-flame mask, burn mask and the reference column (edge_px of the first burn frame,
    which is edge_mm = 0). Shared by run.py and overlay.py so both use the same zero."""
    valid = ~np.isnan(base["edge_px"]) & (base["area"] >= cfg.get("min_area_frame", 3000))
    w0, w1 = cfg["burn_window_s"]
    burn = valid & (t >= w0) & (t <= w1)
    return float(base["edge_px"][burn][0]), valid, burn


def calibrate(cfg) -> tuple[float, float]:
    import glob, rawpy
    c = cfg["calibration"]
    if "px_per_mm_full" in c:   # measured outside calibrate.py (its highlight rule failed); see the config's _comment
        return float(c["px_per_mm_full"]), float(c.get("px_per_mm_sem", 0.0))
    files = sorted(glob.glob(os.path.join(c.get("nef_dir", cfg["nef_dir"]), "**", "*.NEF"), recursive=True))
    with rawpy.imread(files[c["frame_index"]]) as r:
        g = r.postprocess(use_camera_wb=True).astype(float).mean(-1)
    x0, x1, y0, y1 = c["crop_full_res"]
    return px_per_mm(g[y0:y1, x0:x1], cfg["rod_d_mm"])


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("config"); ap.add_argument("--cache"); ap.add_argument("--repo", default="..")
    a = ap.parse_args(argv)
    cfg = json.load(open(a.config, encoding="utf-8"))
    d = load_test(cfg["nef_dir"], a.cache, tuple(cfg["cache_rows"]) if "cache_rows" in cfg else None)
    t, img, scale = d["t"], d["img"].astype(np.float32) if d["img"].dtype != np.float32 else d["img"], int(d["scale"])
    kw = tracking_kw(cfg, d)
    rel = cfg.get("rel_threshold", 0.3)
    tr = {r: track_test(img, rel=r, **kw) for r in (rel * 0.8, rel, rel * 1.2)}
    base = tr[rel]
    ppm_full, ppm_sem = calibrate(cfg)
    ppm = ppm_full / scale
    ref, valid, burn = edge_reference(cfg, t, base)
    t_last = float(t[burn].max())
    after = np.where(t > t_last)[0]
    ext = float(t[after[0]]) if len(after) >= 3 and not valid[after[:3]].any() else None
    if "extinction_s" in cfg:   # read from NASA's video log + photos when the area gate loses a dim flame
        ext = float(cfg["extinction_s"])
    sign = cfg["direction"]
    # no edge outside the burn window (pre-test shot, after extinction)
    edge_mm = np.where(burn, px_to_mm(base["edge_px"], ref, ppm, sign), np.nan)
    if "windows_s" in cfg:   # explicit step windows read from the test video's flow overlay (GMT clock)
        windows = [tuple(w) for w in cfg["windows_s"]]
        how = "window from the test video's FAN/AIR overlay (GMT clock), not from rates"
    else:
        windows = schedule_windows(t_last, [s["dt_s"] for s in cfg["steps"]])
        how = "window from Table S1 dt placed backward from last flame frame"
    tb, xb = t[burn], edge_mm[burn]
    dp = dp_segments(tb, xb, len(cfg["steps"]) + 1)
    dp_starts = [float(tb[i]) for i, _ in dp]
    rows, seg_col = [], np.full(len(t), "", dtype=object)
    for k, (s, (ws, we)) in enumerate(zip(cfg["steps"], windows), start=1):
        slope, ci, m = steady_fit(t, edge_mm, ws, we)
        note_neg = nonphysical_note(slope)
        if note_neg:
            slope = None
        alt = []
        for r in (rel * 0.8, rel * 1.2):
            _, _, burn_r = edge_reference(cfg, t, tr[r])   # same frame gate as the base fit
            e2 = np.where(burn_r, px_to_mm(tr[r]["edge_px"], ref, ppm, sign), np.nan)
            sl, _, _ = steady_fit(t, e2, ws, we)
            if sl is not None: alt.append(sl)
        nearest = min(dp_starts, key=lambda v: abs(v - ws))
        alt_rule, _, _ = steady_fit(t, edge_mm, ws, we, start=0.25, stop=1.0)
        note = (f"PSI {cfg['psi_test']}; {how}; "
                f"slope fit on 25-90% of the window; nearest change point {nearest - ws:+.0f} s; "
                f"scale {ppm_full:.2f}+/-{ppm_sem:.2f} px/mm from rod width"
                + (f" ({cfg['calibration']['note']})" if cfg["calibration"].get("note") else "")
                + (f"; window-rule sensitivity: later-75% rule gives {alt_rule:.4f} mm/s" if alt_rule is not None else ""))
        if slope is None:
            rows.append({**{c: "" for c in COLS}, "test_id": cfg["test_id"], "rod_d_mm": cfg["rod_d_mm"],
                         "o2_pct": cfg["o2_pct"], "flow_cm_s": s["flow_cm_s"], "t_start_s": f"{ws:.1f}",
                         "t_end_s": f"{we:.1f}", "nasa_rate_mm_s": s["nasa_rate_mm_s"],
                         "n_frames": int(((t >= ws + 0.25 * (we - ws)) & (t <= ws + 0.90 * (we - ws))).sum()),
                         "notes": "unusable: " + note_neg + f"{int(m.sum())} of the photos in the fit range pass the flame area gate; " + note})
            continue
        seg_col[m] = str(k)
        if len(alt) == 1:
            note = "threshold sensitivity one-sided (|alt - rate|): too few frames pass the size gate at the other threshold; " + note
        if ci > 0.3 * abs(slope):
            note = "LOW CONFIDENCE (ci95 > 30% of rate; early high-flow phase, jittery edge); " + note
        tl = (base["edge_px"] - base["tail_px"]) * sign / ppm
        nasa = s["nasa_rate_mm_s"]
        rows.append({"test_id": cfg["test_id"], "rod_d_mm": cfg["rod_d_mm"], "o2_pct": cfg["o2_pct"],
                     "flow_cm_s": s["flow_cm_s"], "t_start_s": f"{ws:.1f}", "t_end_s": f"{we:.1f}",
                     "rate_mm_s": f"{slope:.4f}", "ci95_mm_s": f"{ci:.4f}",
                     "threshold_spread_mm_s": f"{(max(alt) - min(alt)) / 2:.4f}" if len(alt) == 2 else (f"{abs(alt[0] - slope):.4f}" if alt else ""),
                     "nasa_rate_mm_s": nasa, "pct_error": f"{100 * (round(slope, 4) - nasa) / nasa:.1f}",
                     "flame_len_mm": f"{np.nanmedian(tl[m]):.1f}", "blue_frac": f"{np.nanmedian(base['blue_frac'][m]):.2f}",
                     "extinction_s": f"{ext:.1f}" if ext is not None else "", "n_frames": int(m.sum()), "notes": note})
    root = os.path.abspath(a.repo)
    out = os.path.join(root, "data", "derived", "spread_rates.csv")
    old = []
    if os.path.exists(out):
        with open(out, newline="", encoding="utf-8") as h:
            old = [r for r in csv.DictReader(h) if r["test_id"] != cfg["test_id"]]
    with open(out, "w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, COLS); w.writeheader(); w.writerows(old + rows)
    os.makedirs(os.path.join(root, "data", "derived", "edges"), exist_ok=True)
    with open(os.path.join(root, "data", "derived", "edges", f"{cfg['test_id']}.csv"), "w", newline="", encoding="utf-8") as h:
        w = csv.writer(h); w.writerow(["test_id", "t_s", "edge_mm", "segment"])
        for i in range(len(t)):
            w.writerow([cfg["test_id"], f"{t[i]:.2f}", "" if np.isnan(edge_mm[i]) else f"{edge_mm[i]:.3f}", seg_col[i]])
    for r in rows:
        print(r["flow_cm_s"], r["rate_mm_s"], "+/-", r["ci95_mm_s"], "thr+/-", r["threshold_spread_mm_s"],
              "NASA", r["nasa_rate_mm_s"], r["pct_error"] + "%", "n", r["n_frames"])
    print("scale", round(ppm_full, 2), "px/mm; extinction", ext, "; change points", [round(v) for v in dp_starts])


if __name__ == "__main__":
    main()
