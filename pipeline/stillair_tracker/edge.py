# Written with AI assistance (Claude Code)
"""Leading-edge detection on exposure-normalized frames."""
from __future__ import annotations
import numpy as np
from scipy import ndimage as ndi


def track_frame(rgb: np.ndarray, rel: float = 0.3, axis_row: int | None = None,
                half_band: int = 70, min_area: int = 300, direction: int = 1,
                min_contrast: float = 3.0) -> dict:
    """Flame mask = pixels above `rel` x the frame's 99.9th-percentile brightness (relative
    threshold, because flame brightness changes ~1000x within a test), opened to remove hot
    pixels, restricted to a band around the rod axis, largest component kept.

    Returns edge_px (90th percentile over rows of each row's front-most pixel in the spread
    `direction`, +1 = increasing column), tail_px (same on the trailing side), area, blue_frac.
    """
    lum = rgb.mean(-1)
    p = np.percentile(lum, 99.9)
    nan = {"edge_px": np.nan, "tail_px": np.nan, "area": 0, "blue_frac": np.nan}
    if p < min_contrast * max(float(np.median(lum)), 1e-12):
        return nan  # no flame: a relative threshold on a near-uniform frame would only find noise
    m = ndi.binary_opening(lum > rel * p, iterations=2)
    if axis_row is not None:
        m[: max(0, axis_row - half_band)] = False
        m[axis_row + half_band:] = False
    lab, n = ndi.label(m)
    if n == 0:
        return nan
    sizes = ndi.sum(m, lab, range(1, n + 1))
    k = 1 + int(np.argmax(sizes))
    if sizes[k - 1] < min_area:
        return {**nan, "area": int(sizes[k - 1])}
    comp = lab == k
    ys, xs = np.nonzero(comp)
    rows = np.unique(ys)
    # front = per-row extreme flame pixel in the spread direction, robust 90th percentile over rows
    # (a percentile over ALL pixels moves slower than the front as the flame grows)
    if direction > 0:
        front = np.array([xs[ys == r].max() for r in rows]); edge = np.percentile(front, 90)
        back = np.array([xs[ys == r].min() for r in rows]); tail = np.percentile(back, 10)
    else:
        front = np.array([xs[ys == r].min() for r in rows]); edge = np.percentile(front, 10)
        back = np.array([xs[ys == r].max() for r in rows]); tail = np.percentile(back, 90)
    px = rgb[ys, xs]
    return {"edge_px": float(edge), "tail_px": float(tail),
            "area": int(sizes[k - 1]), "blue_frac": float(np.mean(px[:, 2] > px[:, 0]))}


def track_test(img: np.ndarray, **kw) -> dict:
    rows = [track_frame(f, **kw) for f in img]
    return {k: np.array([r[k] for r in rows], dtype=float) for k in rows[0]}


def track_test_fused(img: np.ndarray, direction: int = 1, **kw) -> dict:
    """Tracker v2 (pipeline/PREREGISTRATION.md): edge on mean luminance AND on the blue channel alone,
    with the same v1 machinery; the fused edge is the front-most of the two in the spread direction
    (either one if the other is missing). Area = the larger of the two. Not used by run.py unless a
    config sets "edge_mode": "fused"."""
    lum = track_test(img, direction=direction, **kw)
    blue = track_test(np.repeat(img[..., 2:3], 3, axis=-1), direction=direction, **kw)
    a, b = lum["edge_px"], blue["edge_px"]
    pick = np.where(np.isnan(a), b, np.where(np.isnan(b), a, np.maximum(a, b) if direction > 0 else np.minimum(a, b)))
    return {"edge_px": pick, "tail_px": lum["tail_px"], "area": np.fmax(lum["area"], blue["area"]),
            "blue_frac": lum["blue_frac"], "edge_lum_px": a, "edge_blue_px": b}
