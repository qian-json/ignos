# Written with AI assistance (Claude Code)
"""A physics-style flame-spread model for black PMMA rods, fitted to NASA's published data.

Training data (both read from checked transcriptions, never typed here):
  - orbit, 0 g: Link et al. 2018 Supplementary Table S1 (data/reference/link2018_table_s1.csv), 52 rows
  - Earth, 1 g: Link et al. 2018 Supplementary Table S2 (data/reference/link2018_table_s2.csv), 46 rows

The model (from flame_model_feasibility.py, the starting point; same equations):
  u      = hypot(fan, earth_wind * g^(1/3))       air speed the flame feels: fan plus gravity's own flow
  amp    = k * max(O2 - o2_zero, 0) * d^(-d_power)
  quench = 1 - quench_wind / u                    the flame dies when the flow is too weak
  blow   = 1 - u / (blowoff_at_18 * exp(blowoff_o2_slope * (O2 - 18)))   ... or too strong
  rate   = amp * max(quench, 0) * max(blow, 0)    mm/s; 0 means no flame

The g^(1/3) scaling is an assumption (NASA's FM2 schematic, T'ien 1986), not something fitted; only
earth_wind (the flow at 1 g) is fitted. The model is trained only at 0 g and 1 g, so anything in
between is the model's prediction, not data. Gravity-driven flow at any gravity other than Earth's is
an internal quantity and is never exported (team rule: no Moon airflow number).
"""
from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

PARAMS = ["k", "o2_zero", "d_power", "quench_wind", "blowoff_at_18", "blowoff_o2_slope", "earth_wind"]
UNITS = {"k": "mm/s per %O2 at d = 1 cm", "o2_zero": "%", "d_power": None, "quench_wind": "cm/s",
         "blowoff_at_18": "cm/s", "blowoff_o2_slope": "1/%O2", "earth_wind": "cm/s"}
LO = np.array([1e-4, 10, 0, 0.01, 2, 0.0, 3])
HI = np.array([1, 17.5, 2, 0.6, 2000, 3, 120])
# Same rule as proof/src/contracts.ts tableS1RateMmS: printed Vf x 10^3 in cm/s -> mm/s.
RATE_SCALE = 0.01
# Residual weights (from the feasibility script): a "no flame" row penalises any predicted flame;
# a rate row is a relative error, floored so near-zero rates don't dominate.
NO_FLAME_SCALE = 0.03
REL_FLOOR = 0.02

TABLE_S1 = "data/reference/link2018_table_s1.csv"
TABLE_S2 = "data/reference/link2018_table_s2.csv"


@dataclass(frozen=True)
class Row:
    group: str        # leave-one-group-out unit: an orbit sample (B16, ...) or an Earth rod diameter block
    domain: str       # "orbit" or "earth"
    d_cm: float
    o2_pct: float
    fan_cm_s: float
    g_earth: float
    rate_mm_s: float | None  # None = no flame observed
    source: str       # file:row for provenance


def _read_csv(path: Path) -> list[dict[str, str]]:
    with open(path, newline="") as f:
        return list(csv.DictReader(line for line in f if not line.startswith("#")))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_rows(root: Path) -> list[Row]:
    rows: list[Row] = []
    for i, r in enumerate(_read_csv(root / TABLE_S1)):
        rows.append(Row(r["sample_id"], "orbit", float(r["rod_d_cm"]), float(r["o2_pct"]), float(r["flow_cm_s"]), 0.0,
                        float(r["rate_x1e3"]) * RATE_SCALE, f"{TABLE_S1}:{i}"))
    for i, r in enumerate(_read_csv(root / TABLE_S2)):
        rate = float(r["rate_x1e3"]) * RATE_SCALE if r["flame"] == "1" else None
        rows.append(Row(f"E{float(r['d_cm']):.2f}", "earth", float(r["d_cm"]), float(r["o2_pct"]), float(r["flow_cm_s"]), 1.0,
                        rate, f"{TABLE_S2}:{i}"))
    return rows


def flow(fan, g, earth_wind):
    """Air speed the flame feels (internal; never exported for g other than 1)."""
    return np.hypot(fan, earth_wind * np.asarray(g, dtype=float) ** (1 / 3))


def predict(p, d, o2, fan, g):
    """Returns (rate mm/s, clipped at 0) and the unclipped product used by the no-flame residual."""
    k, o0, n, uq, b0, b1, ub = p
    u = np.maximum(flow(fan, g, ub), 1e-6)
    amp = k * np.maximum(np.asarray(o2) - o0, 0) * np.asarray(d, dtype=float) ** (-n)
    quench = 1 - uq / u
    blow = 1 - u / (b0 * np.exp(b1 * (np.asarray(o2) - 18)))
    return amp * np.clip(quench, 0, None) * np.clip(blow, 0, None), amp * quench * blow


def _arrays(rows: list[Row]):
    d = np.array([r.d_cm for r in rows]); o = np.array([r.o2_pct for r in rows])
    f = np.array([r.fan_cm_s for r in rows]); g = np.array([r.g_earth for r in rows])
    v = np.array([np.nan if r.rate_mm_s is None else r.rate_mm_s for r in rows])
    return d, o, f, g, v


def residuals(p, arrays):
    d, o, f, g, v = arrays
    pred, raw = predict(p, d, o, f, g)
    noflame = np.isnan(v)
    out = np.empty_like(pred)
    out[noflame] = np.maximum(raw[noflame], 0) / NO_FLAME_SCALE
    out[~noflame] = (pred[~noflame] - v[~noflame]) / np.maximum(v[~noflame], REL_FLOOR)
    return out


def fit(rows: list[Row], seeds: int = 12, start=None, rng_seed: int = 0):
    """Multi-start robust least squares (soft L1), as in the feasibility script. `start` adds a known
    good starting point (used by the bootstrap to converge faster)."""
    arrays = _arrays(rows)
    rng = np.random.default_rng(rng_seed)
    starts = [np.clip(np.asarray(start, dtype=float), LO, HI)] if start is not None else []
    for _ in range(seeds):
        starts.append(np.array([10 ** rng.uniform(-3, -1), rng.uniform(13, 16.5), rng.uniform(.2, 1), rng.uniform(.1, .4),
                                rng.uniform(20, 300), rng.uniform(.2, 1.5), rng.uniform(10, 60)]))
    best = None
    for p0 in starts:
        r = least_squares(residuals, p0, bounds=(LO, HI), args=(arrays,), loss="soft_l1", max_nfev=4000)
        if best is None or r.cost < best.cost:
            best = r
    return best


def score(p, rows: list[Row]) -> dict:
    """Median absolute % error over rows with a flame (where the model also predicts one), and
    burn / no-burn agreement over all rows."""
    d, o, f, g, v = _arrays(rows)
    pred, _ = predict(p, d, o, f, g)
    flame = ~np.isnan(v)
    burn_ok = int(np.sum((pred > 0) == flame))
    both = flame & (pred > 0)
    errs = np.abs(pred[both] - v[both]) / v[both] * 100
    return {"median_abs_error_pct": float(np.median(errs)) if errs.size else None, "burn_correct": burn_ok, "rows": len(rows),
            "rows_with_rate_scored": int(both.sum()), "rate_rows_predicted_no_flame": int(np.sum(flame & (pred <= 0)))}


def lowest_o2_that_burns(p, d, fan, g, lo=10.0, hi=45.0, step=0.01):
    """Lowest O2 (%) at which the model predicts a flame, scanning lo..hi; None if none in range,
    or `lo` itself if it already burns at the bottom of the range (reported as a bound)."""
    grid = np.arange(lo, hi + step / 2, step)
    rates, _ = predict(p, d, grid, fan, g)
    idx = np.flatnonzero(rates > 0)
    return None if idx.size == 0 else float(grid[idx[0]])
