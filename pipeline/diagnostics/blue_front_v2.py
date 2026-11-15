# Written with AI assistance (Claude Code)
"""Diagnostic only: a better blue-light front for the overlay videos. It changes no rate and no data file.

Why: the overlay's dashed "blue-light front" (overlay.fused_front_px) runs the v1 detector on the blue
channel with the SAME relative threshold (0.3 x the frame's 99.9th percentile). The yellow-white core is
also very bright in blue, so that threshold is set by the core and the faint blue glow ahead of it
(CH* chemiluminescence, ~431 nm) is cut off. The dashed line then sits on the core edge, on top of v1.

This version keeps v1's flame core (same mask, opening, band and largest component) and adds the blue
channel's own signal above ITS BACKGROUND NOISE:
  1. smooth the blue channel (Gaussian, sigma 3 px), because the glow is faint per pixel but extended;
  2. threshold = median + k * 1.4826 * MAD of that smoothed blue in the rod band, measured away from
     the flame (outside the core dilated by 150 px), so it is a noise level, not a fraction of the core;
  3. keep only blue blobs of at least 200 px that come within 80 px of the core (drops specks and stars)
     and span at least 30% of the core's height (drops the thin lit-rod glint ahead of late B12 flames);
  4. front = the same 90th-percentile-of-rows rule as v1, on core + kept blue.
In linear raw data the glow just ahead of the core is not blue-dominant (red is higher there; the bluish
look in the video comes from the display rendering), so "blue above noise" is used, not "blue above red".

KNOWN LIMITATION (checked by eye, 2026-11-15): better than the old dashed line in most frames (B16 photo 41:
76 px ahead of v1 at the end of the visible blue glow, where the old line sat on v1), but in some late B12
frames it still locks onto the lit rod glint ahead of the flame (photo 121: 287 px ahead; B12 lead p90 29 mm).
A "blue >= red" pixel rule removes that glint but also removes B16's faint arcs (they are red-dominant in
linear raw data), so neither rule is clean. NOT a replacement for the site overlays yet; research only.

Outputs: docs/research/figures/overlays_blue_v2/<test>.mp4 (local, not committed) (same renderer, v1 line unchanged) and
docs/research/figures/overlays_blue_v2/summary.json (how far the new front leads v1, in mm).
Usage (from pipeline/): python -m diagnostics.blue_front_v2 [--repo ..] [--tests B16 B19 ...] [--no-video]
"""
from __future__ import annotations
import argparse, csv, json, os, sys
import numpy as np
from scipy import ndimage as ndi

PIPELINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PIPELINE_DIR)
from stillair_tracker.frames import load_test
from stillair_tracker.edge import track_test
from stillair_tracker.run import edge_reference, mm_to_px, tracking_kw
from stillair_tracker.run_all import DEFAULT_CACHE_DIR, cache_path
from stillair_tracker import overlay as ov

TESTS = ["B16", "B19", "B12", "P17", "B13b", "B13a"]


def blue_front_frame(rgb, rel=0.3, axis_row=None, half_band=70, direction=1,
                     sigma=3.0, k=6.0, near=80, min_blob=200, bg_gap=150, min_contrast=3.0, streak_rows=11):
    """Column of the blue-light front in one exposure-normalized frame, NaN when there is no flame core."""
    lum = rgb.mean(-1)
    p = np.percentile(lum, 99.9)
    if p < min_contrast * max(float(np.median(lum)), 1e-12):
        return np.nan
    band = np.zeros(lum.shape, bool)
    if axis_row is None:
        band[:] = True
    else:
        band[max(0, axis_row - half_band):axis_row + half_band] = True
    core = ndi.binary_opening(lum > rel * p, iterations=2) & band
    lab, n = ndi.label(core)
    if n == 0:
        return np.nan
    comp = lab == 1 + int(np.argmax(ndi.sum(core, lab, range(1, n + 1))))
    bs = ndi.gaussian_filter(rgb[..., 2].astype(np.float32), sigma=sigma)
    bg = bs[band & ~ndi.binary_dilation(comp, iterations=bg_gap)]
    if bg.size < 100:
        return np.nan
    med = float(np.median(bg))
    thr = med + k * 1.4826 * float(np.median(np.abs(bg - med)))
    keep = comp.copy()
    # erode by the blur width: smoothing pushes every bright edge outward by about 2 sigma
    # The core is removed first so a glint touching it is judged on its own shape, not merged into the core.
    bmask = ndi.binary_erosion((bs > thr) & band, iterations=max(1, int(round(sigma))))
    bmask &= ~ndi.binary_dilation(comp, iterations=max(1, int(round(3 * sigma))))   # the core's own blur halo
    # Erase thin horizontal streaks (a lit rod is a few rows tall) even where they touch the glow.
    bmask = ndi.binary_opening(bmask, structure=np.ones((streak_rows, 1), bool))
    bl, nb = ndi.label(bmask)
    if nb:
        sizes = ndi.sum(np.ones_like(bl), bl, range(1, nb + 1))
        near_m = ndi.binary_dilation(comp, iterations=near)
        touch = ndi.maximum(near_m, bl, range(1, nb + 1))
        cy = np.nonzero(comp)[0]
        min_rows = max(15, int(0.3 * (cy.max() - cy.min() + 1)))   # glow is a tall arc; a lit rod glint is a thin streak
        for j, sl in enumerate(ndi.find_objects(bl), start=1):
            if sl is None:
                continue
            if sizes[j - 1] >= min_blob and touch[j - 1] and (sl[0].stop - sl[0].start) >= min_rows:
                keep |= bl == j
    ys, xs = np.nonzero(keep)
    rows = np.unique(ys)
    if direction > 0:
        return float(np.percentile([xs[ys == r].max() for r in rows], 90))
    return float(np.percentile([xs[ys == r].min() for r in rows], 10))


def scale_from_notes(rows_csv, tid):
    for r in rows_csv:
        if r["test_id"] == tid and "scale " in r["notes"]:
            return float(r["notes"].split("scale ")[1].split("+/-")[0])
    raise SystemExit(f"{tid}: no 'scale' in spread_rates notes")


def run_test(tid, repo, cache_dir, out_dir, video=True):
    cfg = json.load(open(os.path.join(repo, "pipeline", "configs", f"{tid}.json"), encoding="utf-8"))
    rows = ov.read_edges(os.path.join(repo, "data", "derived", "edges", f"{tid}.csv"))
    d = load_test(cfg["nef_dir"], cache_path(cfg, cache_dir), tuple(cfg["cache_rows"]) if "cache_rows" in cfg else None)
    img = d["img"] if d["img"].dtype == np.float32 else d["img"].astype(np.float32)
    t, scale = d["t"], int(d["scale"])
    kw = tracking_kw(cfg, d)
    base = track_test(img, rel=cfg.get("rel_threshold", 0.3), **kw)
    ref, valid, _ = edge_reference(cfg, t, base)
    with open(os.path.join(repo, "data", "derived", "spread_rates.csv"), encoding="utf-8") as h:
        sr = list(csv.DictReader(l for l in h if not l.startswith("#")))
    ppm = scale_from_notes(sr, tid) / scale
    edge_mm = np.array([r["edge_mm"] for r in rows])
    x_px = mm_to_px(edge_mm, ref, ppm, cfg["direction"])
    x2 = np.array([blue_front_frame(f, rel=cfg.get("rel_threshold", 0.3), axis_row=kw.get("axis_row"),
                                    half_band=kw.get("half_band", 70), direction=cfg["direction"]) for f in img])
    old = ov.fused_front_px(img, cfg, d, t)
    both = np.isfinite(x_px) & np.isfinite(x2)
    lead_new = cfg["direction"] * (x2[both] - x_px[both]) / ppm
    both_o = np.isfinite(x_px) & np.isfinite(old)
    lead_old = cfg["direction"] * (old[both_o] - x_px[both_o]) / ppm
    s = {"frames": int(len(img)), "frames_with_front": int(np.isfinite(x2).sum()),
         "lead_mm_new": {"median": round(float(np.median(lead_new)), 3) if both.any() else None,
                         "p10": round(float(np.percentile(lead_new, 10)), 3) if both.any() else None,
                         "p90": round(float(np.percentile(lead_new, 90)), 3) if both.any() else None},
         "lead_mm_old_dashed_line": {"median": round(float(np.median(lead_old)), 3) if both_o.any() else None}}
    if video:
        os.makedirs(out_dir, exist_ok=True)
        ov.render_overlay(img, rows, x_px, os.path.join(out_dir, f"{tid}.mp4"), tid, x2_px=x2)
    return s


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=os.path.dirname(PIPELINE_DIR))
    ap.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR)
    ap.add_argument("--tests", nargs="*", default=TESTS)
    ap.add_argument("--no-video", action="store_true")
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)
    out_dir = os.path.join(repo, "docs", "research", "figures", "overlays_blue_v2")
    summary = {"_note": "Written with AI assistance (Claude Code). Diagnostic only; no rate or data file changes. "
                        "lead_mm = how far the blue-light front is ahead of the v1 edge, in the spread direction.",
               "method": "pipeline/diagnostics/blue_front_v2.py", "tests": {}}
    for tid in a.tests:
        summary["tests"][tid] = run_test(tid, repo, a.cache_dir, out_dir, video=not a.no_video)
        print(tid, json.dumps(summary["tests"][tid]))
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "summary.json"), "w", encoding="utf-8", newline="\n") as h:
        json.dump(summary, h, indent=1)
    return summary


if __name__ == "__main__":
    main()
