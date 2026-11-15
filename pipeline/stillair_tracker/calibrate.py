# Written with AI assistance (Claude Code)
"""px/mm from the rod's known diameter, measured in a well-lit full-resolution frame."""
from __future__ import annotations
import numpy as np
from scipy import ndimage as ndi


def rod_width_px(gray: np.ndarray, step: int = 15) -> np.ndarray:
    """Rod width per column of a crop that contains background above and below a horizontal rod.
    Top edge: background -> highlight at half maximum. Bottom edge: dark rod -> background at
    half maximum. Never uses any spread-rate reference, so the validation is not circular."""
    g = ndi.median_filter(gray.astype(float), 3)
    widths = []
    for x in range(10, g.shape[1] - 10, step):
        p = ndi.gaussian_filter1d(g[:, x - 6:x + 7].mean(1), 1.5)
        bg_top = np.median(p[:15]); pk = int(np.argmax(p[: len(p) // 3]))
        top = next(i for i in range(pk + 1) if p[i] > bg_top + 0.5 * (p[pk] - bg_top))
        lo = pk + int(np.argmin(p[pk:])); dark = p[lo]; bg_bot = np.median(p[-12:])
        bot = next(i for i in range(len(p) - 1, lo, -1) if p[i] < dark + 0.5 * (bg_bot - dark))
        widths.append(bot - top)
    return np.array(widths, dtype=float)


def px_per_mm(gray: np.ndarray, rod_d_mm: float) -> tuple[float, float]:
    w = rod_width_px(gray)
    return float(w.mean() / rod_d_mm), float(w.std(ddof=1) / np.sqrt(len(w)) / rod_d_mm)
