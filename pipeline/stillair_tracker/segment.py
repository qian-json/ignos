# Written with AI assistance (Claude Code)
"""Line fits and exact piecewise-linear segmentation."""
from __future__ import annotations
import numpy as np


def fit_line(t: np.ndarray, x: np.ndarray) -> tuple[float, float, float]:
    """Least-squares slope, intercept and 95% half-width of the slope: Student-t(0.975, n-2) x
    standard error (n is small, 13-30 frames per step, so 1.96 would be 5-12% too narrow)."""
    from scipy.stats import t as student_t
    A = np.vstack([t, np.ones_like(t)]).T
    (m, b), *_ = np.linalg.lstsq(A, x, rcond=None)
    r = x - (m * t + b)
    se = np.sqrt((r @ r) / max(len(t) - 2, 1) / ((t - t.mean()) ** 2).sum())
    if len(t) < 3:
        return float(m), float(b), float("nan")
    return float(m), float(b), float(student_t.ppf(0.975, len(t) - 2) * se)


def dp_segments(t: np.ndarray, x: np.ndarray, k: int, min_pts: int = 6) -> list[tuple[int, int]]:
    """Exact dynamic-programming split of (t, x) into k linear pieces minimizing total SSE.
    Returns index ranges [start, end)."""
    n = len(t)
    cost = np.full((n + 1, n + 1), np.inf)
    for i in range(n):
        for j in range(i + min_pts, n + 1):
            m, b, _ = fit_line(t[i:j], x[i:j])
            cost[i, j] = float(((x[i:j] - (m * t[i:j] + b)) ** 2).sum())
    D = np.full((k + 1, n + 1), np.inf); D[0, 0] = 0.0
    B = np.zeros((k + 1, n + 1), dtype=int)
    for q in range(1, k + 1):
        for j in range(1, n + 1):
            v = D[q - 1, :j] + cost[:j, j]
            B[q, j] = int(np.argmin(v)); D[q, j] = v[B[q, j]]
    cuts, j = [n], n
    for q in range(k, 0, -1):
        j = B[q, j]; cuts.append(j)
    cuts = cuts[::-1]
    return list(zip(cuts[:-1], cuts[1:]))


def schedule_windows(t_end: float, durations: list[float]) -> list[tuple[float, float]]:
    """Place flow-step windows backward from the end of burning using published step durations
    (BUILD_PLAN fallback when change points cannot separate steps with similar rates)."""
    out, end = [], t_end
    for d in reversed(durations):
        out.append((end - d, end)); end -= d
    return out[::-1]
