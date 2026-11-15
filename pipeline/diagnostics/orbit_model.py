# Written with AI assistance (Claude Code)
"""Orbit model: a small, cross-validated model of NASA's PUBLISHED space-station spread rates.

Data: data/reference/link2018_table_s1.csv (Link et al. 2018, Sci Rep 8:120, Supplement Table S1,
p. 1; 52 rows from 19 samples). Scope: microgravity (0 g), opposed forced flow, PMMA rods only.
The model is never asked about anything outside the measured ranges.

Usage (from pipeline/):
    python -m diagnostics.orbit_model --repo ..
writes docs/research/orbit_model.json and docs/research/figures/orbit_model.png and prints the
cross-validation table. It needs scikit-learn (1.9 used). It never touches the tracker or its outputs.

DESIGN, FIXED BEFORE ANY SCORE WAS COMPUTED (this docstring was written before the first fit)
- Target: spread rate in mm/s = printed Vf x 10^3 value x 0.01, both table halves
  (docs/DATA_CONTRACTS.md section 6). Models b, c and d fit ln(rate); the reported prediction is
  exp(mean of ln rate), which is the predictive median. Reason: the score is a relative (percent)
  error, the rate is positive, and all three then share one target, so only the model form differs.
- Inputs: ln(flow in cm/s), O2 in %, ln(rod diameter in mm). The same three for b, c and d.
- Models, simplest first (this order breaks ties):
    mean       baseline 0: the mean rate of the training rows, no inputs.
    loglinear  baseline 1: ln(rate) = a + b ln(flow) + c O2 + d ln(diameter), ordinary least squares.
    gp         Gaussian process: inputs standardized, kernel Constant * RBF(one length scale per
               input, bounds 0.2 to 50) + WhiteKernel(bounds 1e-3 to 10), normalize_y, 10 optimizer
               restarts, seed 0. 95% interval = exp(mean +/- 1.96 sd), sd includes the noise term.
    forest     random forest: 500 trees, min_samples_leaf 2, seed 0. No interval of its own.
- Validation: leave-one-SAMPLE-out. Rows of one sample share a rod, an O2 setting and a session,
  so all rows of a sample are held out together (19 folds).
- Metrics on held-out rows: median and mean absolute % error, RMSE in mm/s, and for the models with
  an interval the share of held-out rows inside the 95% predictive interval.
- SELECTION RULE: publish the model with the lowest leave-one-sample-out median absolute % error.
  If other models are within 1 percentage point of the best, publish the simplest of them.
  All four are reported either way.
- Colour: the file has no colour column. The Supplement's Table S1 caption (p. 1) says B and C in
  the sample ID mean black and clear PMMA. Clear = ID starts with C (6 rows, 3 samples). P17's
  letter is not defined there and is coded "not marked clear". Colour is added to the published
  model only if it lowers that model's held-out median absolute % error by more than 1 point.
- Sensitivity checks, reported and never used to choose: (1) samples with an a/b suffix treated as
  one rod (17 folds; our assumption); (2) a cluster bootstrap over samples of the held-out errors.
- Outside comparison: our own measured steps (data/derived/spread_rates.csv) against the published
  model. Reported only. Nothing in the model or the tracker is tuned to it.
- If the forest is published, its band is the prediction times or divided by exp(q), q = the 95th
  percentile of its held-out |ln error| (it has no interval of its own).

ADDED AFTER THE SCORES WERE SEEN (reporting only; none of it changes a model, a score or the choice)
- A fair coverage check for the forest's band: each row's q leaves out that row's own sample.
- Intervals for the forest's contrasts by a cluster bootstrap (200 refits), because a forest has no
  posterior of its own.
- A diagnostics block: the Gaussian process and forest fits on all rows, to explain the scores.
"""
from __future__ import annotations
import argparse, csv, hashlib, json, math, os, platform, sys, warnings
from dataclasses import dataclass
import numpy as np

SEED = 0
Z95 = 1.959963984540054
TIE_PP = 1.0                                        # "within 1 percentage point" in the selection rule
MODEL_ORDER = ("mean", "loglinear", "gp", "forest")  # simplest first
MODEL_NAMES = {"mean": "Baseline 0: mean rate, no inputs",
               "loglinear": "Baseline 1: log-linear fit, ln(rate) = a + b ln(flow) + c O2 + d ln(diameter)",
               "gp": "Gaussian process (standardized inputs, anisotropic RBF + white noise)",
               "forest": "Random forest (500 trees, min leaf 2)"}
SOURCE = "Link et al. 2018, Sci Rep 8:120, Supplement Table S1, p. 1"
SCOPE = ("Microgravity (0 g) on the space station, opposed forced flow, PMMA rods only. Valid only inside the "
         "measured ranges listed for each rod diameter. It is not a model of any other gravity level, material, "
         "flow direction or of zero flow.")
CODE_PATH = "pipeline/diagnostics/orbit_model.py"
SELECTION_RULE = ("Fixed before any score was computed: publish the model with the lowest leave-one-sample-out "
                  "median absolute % error. If other models are within 1 percentage point of the best, publish the "
                  "simplest of them (order: mean, log-linear, Gaussian process, random forest). All four are reported.")
COLOUR_RULE = ("Fixed before any score was computed: colour (clear = sample ID starts with C, Supplement Table S1 "
               "caption, p. 1) is added to the published model only if it lowers that model's leave-one-sample-out "
               "median absolute % error by more than 1 percentage point.")


# ----------------------------------------------------------------------------------------- data
def table_rate_mm_s(printed_x1e3: float) -> float:
    """Printed 'Vf x 10^3' number -> mm/s. Both halves of Table S1 are read as cm/s (the right half's
    mm/s header is a confirmed typo, docs/DATA_CONTRACTS.md section 6), so mm/s = printed x 0.01."""
    return float(printed_x1e3) * 0.01


@dataclass
class Table:
    sample: np.ndarray   # sample ID per row (the cross-validation group)
    step: np.ndarray     # 1-based step within the sample, table order
    flow: np.ndarray     # opposed flow, cm/s
    o2: np.ndarray       # oxygen, %
    d_mm: np.ndarray     # rod diameter, mm (printed cm x 10)
    rate: np.ndarray     # spread rate, mm/s
    clear: np.ndarray    # 1.0 if the sample ID starts with C (clear PMMA), else 0.0

    def __len__(self) -> int:
        return len(self.rate)

    def row_id(self, i: int) -> str:
        return f"table_s1:{self.sample[i]}/{int(self.step[i])}"


def load_table_s1(path: str) -> Table:
    """Read the Table S1 transcription. Lines that start with '#' are the header comment."""
    with open(path, encoding="utf-8", newline="") as f:
        lines = [ln for ln in f if not ln.startswith("#")]
    rows = list(csv.DictReader(lines))
    if not rows:
        raise ValueError(f"no data rows in {path}")
    return make_table([r["sample_id"] for r in rows], [int(r["step"]) for r in rows],
                      [float(r["flow_cm_s"]) for r in rows], [float(r["o2_pct"]) for r in rows],
                      [round(float(r["rod_d_cm"]) * 10.0, 3) for r in rows],
                      [table_rate_mm_s(r["rate_x1e3"]) for r in rows])


def make_table(sample, step, flow, o2, d_mm, rate) -> Table:
    sample = np.asarray(sample, dtype=str)
    return Table(sample, np.asarray(step, dtype=int), np.asarray(flow, dtype=float), np.asarray(o2, dtype=float),
                 np.asarray(d_mm, dtype=float), np.asarray(rate, dtype=float),
                 np.array([1.0 if s.startswith("C") else 0.0 for s in sample]))


def colour_of(sample_id: str) -> str:
    """Supplement Table S1 caption (p. 1): 'B and C means black and clear PMMA samples'."""
    return {"B": "black", "C": "clear"}.get(sample_id[:1], "not stated")


def rod_group(sample_id: str) -> str:
    """Sensitivity grouping: B13a and B13b become B13 (same rod burned twice; our assumption)."""
    return sample_id[:-1] if len(sample_id) > 1 and sample_id[-1] in "ab" and sample_id[-2].isdigit() else sample_id


def features(flow, o2, d_mm, clear=None) -> np.ndarray:
    """Physics-shaped inputs: ln(flow), O2, ln(diameter), and optionally the clear flag."""
    flow, o2, d_mm = (np.atleast_1d(np.asarray(v, dtype=float)) for v in (flow, o2, d_mm))
    cols = [np.log(flow), o2, np.log(d_mm)]
    if clear is not None:
        cols.append(np.atleast_1d(np.asarray(clear, dtype=float)))
    return np.column_stack(cols)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# --------------------------------------------------------------------------------------- models
# Every model has fit(X, rate) and predict(X) -> (rate, lo95, hi95) in mm/s. lo/hi are None if the
# model has no interval. X is the matrix from features().
class MeanModel:
    id = "mean"

    def fit(self, X, rate):
        from scipy import stats
        self.n = len(rate)
        self.mu = float(np.mean(rate))
        s = float(np.std(rate, ddof=1)) if self.n > 1 else 0.0
        self.half = float(stats.t.ppf(0.975, max(self.n - 1, 1))) * s * math.sqrt(1.0 + 1.0 / self.n)
        return self

    def predict(self, X):
        n = len(X)
        return np.full(n, self.mu), np.full(n, max(self.mu - self.half, 0.0)), np.full(n, self.mu + self.half)


class LogLinearModel:
    id = "loglinear"

    def fit(self, X, rate):
        from scipy import stats
        A = np.column_stack([np.ones(len(X)), X])
        y = np.log(rate)
        self.coef = np.linalg.lstsq(A, y, rcond=None)[0]
        self.dof = max(len(y) - A.shape[1], 1)
        resid = y - A @ self.coef
        self.s2 = float(resid @ resid) / self.dof
        self.xtxi = np.linalg.pinv(A.T @ A)
        self.t = float(stats.t.ppf(0.975, self.dof))
        return self

    def predict(self, X):
        A = np.column_stack([np.ones(len(X)), X])
        mu = A @ self.coef
        se = np.sqrt(self.s2 * (1.0 + np.einsum("ij,jk,ik->i", A, self.xtxi, A)))   # new-observation interval
        return np.exp(mu), np.exp(mu - self.t * se), np.exp(mu + self.t * se)

    def contrast(self, xa, xb):
        """rate(xb) / rate(xa) with a 95% interval for the fitted line (plain OLS, ignores clustering)."""
        d = np.concatenate([[0.0], np.asarray(xb, float) - np.asarray(xa, float)])
        est = float(d @ self.coef)
        se = math.sqrt(self.s2 * float(d @ self.xtxi @ d))
        return math.exp(est), math.exp(est - self.t * se), math.exp(est + self.t * se)


class GPModel:
    id = "gp"

    def __init__(self, n_restarts: int = 10, seed: int = SEED):
        self.n_restarts, self.seed = n_restarts, seed

    def fit(self, X, rate):
        from sklearn.gaussian_process import GaussianProcessRegressor
        from sklearn.gaussian_process.kernels import ConstantKernel, RBF, WhiteKernel
        from sklearn.preprocessing import StandardScaler
        self.scaler = StandardScaler().fit(X)
        Z = self.scaler.transform(X)
        kernel = (ConstantKernel(1.0, (1e-2, 1e2)) * RBF(np.ones(Z.shape[1]), (0.2, 50.0))
                  + WhiteKernel(0.3, (1e-3, 10.0)))
        self.gp = GaussianProcessRegressor(kernel, alpha=1e-10, normalize_y=True,
                                           n_restarts_optimizer=self.n_restarts, random_state=self.seed)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            self.gp.fit(Z, np.log(rate))
        self.fit_warnings = sorted({str(w.message).split(". ")[0] for w in caught})
        return self

    def predict(self, X):
        mu, sd = self.gp.predict(self.scaler.transform(X), return_std=True)
        return np.exp(mu), np.exp(mu - Z95 * sd), np.exp(mu + Z95 * sd)

    def noise_var(self) -> float:
        """White-noise variance in ln(rate) units."""
        return float(self.gp.kernel_.k2.noise_level) * float(np.ravel(self.gp._y_train_std)[0]) ** 2

    def contrast(self, xa, xb):
        """rate(xb) / rate(xa) for the noise-free curve, with a 95% interval from the joint posterior."""
        Z = self.scaler.transform(np.vstack([xa, xb]))
        mu, cov = self.gp.predict(Z, return_cov=True)
        cov = cov - self.noise_var() * np.eye(2)
        var = max(float(cov[0, 0] + cov[1, 1] - 2.0 * cov[0, 1]), 0.0)
        est, se = float(mu[1] - mu[0]), math.sqrt(var)
        return math.exp(est), math.exp(est - Z95 * se), math.exp(est + Z95 * se)

    def describe(self) -> dict:
        k = self.gp.kernel_
        return {"kernel": str(k), "amplitude": float(k.k1.k1.constant_value),
                "length_scales_standardized": [float(v) for v in np.atleast_1d(k.k1.k2.length_scale)],
                "noise_sd_ln_rate": math.sqrt(self.noise_var()),
                "log_marginal_likelihood": float(self.gp.log_marginal_likelihood_value_),
                "input_mean": [float(v) for v in self.scaler.mean_], "input_sd": [float(v) for v in self.scaler.scale_],
                "optimizer_notes": self.fit_warnings}


class ForestModel:
    id = "forest"

    def __init__(self, seed: int = SEED):
        self.seed, self.band = seed, None

    def fit(self, X, rate):
        from sklearn.ensemble import RandomForestRegressor
        self.rf = RandomForestRegressor(n_estimators=500, min_samples_leaf=2, random_state=self.seed)
        self.rf.fit(X, np.log(rate))
        return self

    def predict(self, X):
        r = np.exp(self.rf.predict(X))
        if self.band is None:
            return r, None, None
        return r, r * math.exp(-self.band), r * math.exp(self.band)


def model_makers(n_restarts: int = 10) -> dict:
    return {"mean": MeanModel, "loglinear": LogLinearModel,
            "gp": lambda: GPModel(n_restarts=n_restarts), "forest": ForestModel}


# --------------------------------------------------------------------------- cross-validation
def leave_one_sample_out(groups):
    """Yield (group, train_idx, test_idx), one fold per group in order of first appearance.
    All rows of the held-out group are in test, and none of them is in train."""
    groups = np.asarray(groups)
    for g in dict.fromkeys(groups.tolist()):
        test = np.flatnonzero(groups == g)
        train = np.flatnonzero(groups != g)
        yield g, train, test


def cross_validate(make_model, X, rate, groups):
    """Held-out prediction for every row. Returns (pred, lo, hi); lo/hi are None without an interval."""
    n = len(rate)
    pred, lo, hi = np.full(n, np.nan), np.full(n, np.nan), np.full(n, np.nan)
    has_interval = True
    for _, tr, te in leave_one_sample_out(groups):
        p, l, h = make_model().fit(X[tr], rate[tr]).predict(X[te])
        pred[te] = p
        if l is None:
            has_interval = False
        else:
            lo[te], hi[te] = l, h
    return pred, (lo if has_interval else None), (hi if has_interval else None)


def ape(rate, pred) -> np.ndarray:
    return 100.0 * np.abs(np.asarray(pred) - np.asarray(rate)) / np.asarray(rate)


def metrics(rate, pred, lo=None, hi=None) -> dict:
    e = ape(rate, pred)
    out = {"n_rows": int(len(rate)), "median_ape_pct": float(np.median(e)), "mean_ape_pct": float(np.mean(e)),
           "rmse_mm_s": float(np.sqrt(np.mean((np.asarray(pred) - np.asarray(rate)) ** 2)))}
    if lo is not None:
        inside = (rate >= lo) & (rate <= hi)
        out["coverage95"] = float(np.mean(inside))
        out["n_inside95"] = int(inside.sum())
        out["median_interval_halfwidth_pct"] = float(np.median(100.0 * (hi - lo) / 2.0 / pred))
    return out


def forest_band(pred, rate, groups):
    """An interval for the forest, which has none of its own: prediction times or divided by exp(q),
    q = the 95th percentile of the held-out |ln(pred / rate)|. Returns (q from all rows, lo, hi), where
    each row's lo/hi use a q computed WITHOUT that row's own sample, so the coverage check is fair."""
    pred, rate = np.asarray(pred, float), np.asarray(rate, float)
    err = np.abs(np.log(pred / rate))
    lo, hi = np.empty(len(rate)), np.empty(len(rate))
    for _, tr, te in leave_one_sample_out(groups):
        q = float(np.percentile(err[tr], 95)) if len(tr) else float("inf")
        lo[te], hi[te] = pred[te] * math.exp(-q), pred[te] * math.exp(q)
    return float(np.percentile(err, 95)), lo, hi


def bootstrap_contrasts(make_model, X, rate, groups, XA, XB, n_boot: int = 200, seed: int = SEED) -> np.ndarray:
    """For a model with no interval of its own: refit on resampled samples (cluster bootstrap) and
    return ln(rate(XB) / rate(XA)) for every resample, shape (n_boot, n_pairs)."""
    groups = np.asarray(groups)
    rows = [np.flatnonzero(groups == g) for g in dict.fromkeys(groups.tolist())]
    rng = np.random.default_rng(seed)
    out = np.empty((n_boot, len(XA)))
    for b in range(n_boot):
        idx = np.concatenate([rows[i] for i in rng.integers(0, len(rows), len(rows))])
        m = make_model().fit(X[idx], rate[idx])
        out[b] = np.log(m.predict(XB)[0] / m.predict(XA)[0])
    return out


def select_model(median_ape_pct: dict, order=MODEL_ORDER, tie_pp: float = TIE_PP):
    """The selection rule. Returns (chosen id, id with the lowest score, ids within tie_pp of it)."""
    best_id = min(order, key=lambda m: median_ape_pct[m])
    close = [m for m in order if median_ape_pct[m] - median_ape_pct[best_id] <= tie_pp]
    return close[0], best_id, close


def bootstrap_medians(apes: dict, groups, n_boot: int = 5000, seed: int = SEED) -> dict:
    """Cluster bootstrap of the held-out errors: resample whole samples with replacement and recompute
    each model's median absolute % error. The models are not refitted. Returns {id: array(n_boot)}."""
    groups = np.asarray(groups)
    rows = [np.flatnonzero(groups == g) for g in dict.fromkeys(groups.tolist())]
    rng = np.random.default_rng(seed)
    out = {m: np.empty(n_boot) for m in apes}
    for b in range(n_boot):
        idx = np.concatenate([rows[i] for i in rng.integers(0, len(rows), len(rows))])
        for m in apes:
            out[m][b] = np.median(apes[m][idx])
    return out


def bootstrap_loglinear(X, rate, groups, n_boot: int = 2000, seed: int = SEED) -> np.ndarray:
    """Cluster bootstrap of the log-linear coefficients (refit on resampled samples)."""
    groups = np.asarray(groups)
    rows = [np.flatnonzero(groups == g) for g in dict.fromkeys(groups.tolist())]
    rng = np.random.default_rng(seed)
    A = np.column_stack([np.ones(len(X)), X])
    y = np.log(rate)
    out = np.empty((n_boot, A.shape[1]))
    for b in range(n_boot):
        idx = np.concatenate([rows[i] for i in rng.integers(0, len(rows), len(rows))])
        out[b] = np.linalg.lstsq(A[idx], y[idx], rcond=None)[0]
    return out


# ------------------------------------------------------------------------- ranges and the grid
def measured_ranges(t: Table, mask=None) -> dict:
    """Per rod diameter: the measured flow range and O2 range. The grid never leaves these."""
    mask = np.ones(len(t), bool) if mask is None else mask
    out = {}
    for d in sorted(set(t.d_mm[mask].tolist())):
        s = mask & (t.d_mm == d)
        out[d] = {"flow": (float(t.flow[s].min()), float(t.flow[s].max())),
                  "o2": (float(t.o2[s].min()), float(t.o2[s].max())), "rows": np.flatnonzero(s)}
    return out


def nearest_measured(flow, o2, m_flow, m_o2, sd_lnflow: float, sd_o2: float):
    """Distance from each (flow, O2) point to the nearest measured row of the same diameter, in
    standard deviations of the training rows: sqrt((d ln flow / sd)^2 + (d O2 / sd)^2)."""
    a = (np.log(np.asarray(flow, float))[:, None] - np.log(np.asarray(m_flow, float))[None, :]) / sd_lnflow
    b = (np.asarray(o2, float)[:, None] - np.asarray(m_o2, float)[None, :]) / sd_o2
    dist = np.sqrt(a * a + b * b)
    j = dist.argmin(axis=1)
    return dist[np.arange(len(j)), j], j


def axis_points(lo: float, hi: float, n: int, geometric: bool, decimals: int) -> np.ndarray:
    """n points from lo to hi (both included), rounded, and never outside [lo, hi]."""
    if hi <= lo:
        return np.array([lo])
    pts = np.geomspace(lo, hi, n) if geometric else np.linspace(lo, hi, n)
    pts = np.clip(np.round(pts, decimals), lo, hi)
    pts[0], pts[-1] = lo, hi
    return np.unique(pts)


def build_grid(predict, t: Table, n_flow: int = 25, n_o2: int = 13, mask=None) -> list:
    """For each rod diameter in the data: flow x O2 inside that diameter's measured ranges only.
    predict(flow, o2, d_mm) -> (rate, lo95, hi95). Arrays are indexed [o2][flow]."""
    sd_lnflow, sd_o2 = float(np.std(np.log(t.flow))), float(np.std(t.o2))
    grids = []
    for d, rg in measured_ranges(t, mask).items():
        flows = axis_points(*rg["flow"], n_flow, True, 4)
        o2s = axis_points(*rg["o2"], n_o2, False, 3)
        FF, OO = np.meshgrid(flows, o2s)
        rate, lo, hi = predict(FF.ravel(), OO.ravel(), np.full(FF.size, d))
        rows = rg["rows"]
        dist, j = nearest_measured(FF.ravel(), OO.ravel(), t.flow[rows], t.o2[rows], sd_lnflow, sd_o2)
        shape = FF.shape
        r5 = lambda a: None if a is None else [[round(float(v), 5) for v in row] for row in np.asarray(a).reshape(shape)]
        grids.append({
            "rod_d_mm": d, "n_measured_rows": int(len(rows)),
            "measured_flow_range_cm_s": [rg["flow"][0], rg["flow"][1]],
            "measured_o2_range_pct": [rg["o2"][0], rg["o2"][1]],
            "measured_rows": [{"id": t.row_id(i), "flow_cm_s": float(t.flow[i]), "o2_pct": float(t.o2[i]),
                               "rate_mm_s": round(float(t.rate[i]), 4), "pmma": colour_of(str(t.sample[i]))}
                              for i in rows],
            "flow_cm_s": [float(v) for v in flows], "o2_pct": [float(v) for v in o2s],
            "rate_mm_s": r5(rate), "lo95_mm_s": r5(lo), "hi95_mm_s": r5(hi),
            "nearest_row_distance": [[round(float(v), 3) for v in row] for row in dist.reshape(shape)],
            "nearest_row_index": [[int(v) for v in row] for row in j.reshape(shape)]})
    return grids


# ---------------------------------------------------------------------------- our own steps
def load_our_steps(path: str) -> list:
    """Rows of data/derived/spread_rates.csv that have a rate. segment = 1-based row within the test."""
    out, seen = [], {}
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(ln for ln in f if not ln.startswith("#")):
            seen[r["test_id"]] = seen.get(r["test_id"], 0) + 1
            if not r["rate_mm_s"].strip():
                continue
            num = lambda k: float(r[k]) if r.get(k, "").strip() else None
            out.append({"id": f"spread_rates:{r['test_id']}/{seen[r['test_id']]}", "test_id": r["test_id"],
                        "rod_d_mm": float(r["rod_d_mm"]), "o2_pct": float(r["o2_pct"]),
                        "flow_cm_s": float(r["flow_cm_s"]), "rate_mm_s": float(r["rate_mm_s"]),
                        "ci95_mm_s": num("ci95_mm_s"), "nasa_rate_mm_s": num("nasa_rate_mm_s"),
                        "low_confidence": "LOW CONFIDENCE" in r.get("notes", "")})
    return out


def snap_diameter(d_mm: float, known, tol: float = 0.1):
    """Our files give the nominal rod size (6.35 mm); Table S1 prints it rounded (0.64 cm). Match them."""
    best = min(known, key=lambda k: abs(k - d_mm))
    return best if abs(best - d_mm) <= tol else None


def outside_comparison(final, refit_without, t: Table, steps: list, use_clear: bool) -> dict:
    """Our measured rate vs the model's 95% interval at the same flow, O2 and diameter.
    refit_without(sample_id) -> the chosen model refitted without that sample's Table S1 rows."""
    ranges = measured_ranges(t)
    sd_lnflow, sd_o2 = float(np.std(np.log(t.flow))), float(np.std(t.o2))
    rows, cache = [], {}
    for s in steps:
        d = snap_diameter(s["rod_d_mm"], list(ranges))
        row = {k: s[k] for k in ("id", "test_id", "rod_d_mm", "o2_pct", "flow_cm_s", "rate_mm_s", "ci95_mm_s",
                                 "nasa_rate_mm_s", "low_confidence")}
        row["flow_below_1_cm_s"] = s["flow_cm_s"] < 1.0
        row["model_rod_d_mm"] = d
        if d is None:
            row.update({"inside_measured_ranges": False, "why_outside": "rod diameter not in Table S1"})
            rows.append(row)
            continue
        rg = ranges[d]
        in_flow = rg["flow"][0] <= s["flow_cm_s"] <= rg["flow"][1]
        in_o2 = rg["o2"][0] <= s["o2_pct"] <= rg["o2"][1]
        dist, _ = nearest_measured([s["flow_cm_s"]], [s["o2_pct"]], t.flow[rg["rows"]], t.o2[rg["rows"]],
                                   sd_lnflow, sd_o2)
        row["inside_measured_ranges"] = bool(in_flow and in_o2)
        row["why_outside"] = None if in_flow and in_o2 else ("flow" if not in_flow else "O2") + " outside this diameter's measured range"
        row["nearest_row_distance"] = round(float(dist[0]), 3)
        clear = [1.0 if s["test_id"].startswith("C") else 0.0] if use_clear else None
        X = features([s["flow_cm_s"]], [s["o2_pct"]], [d], clear)
        for tag, model in (("all_rows", final), ("sample_held_out", None)):
            if model is None:
                if s["test_id"] not in set(t.sample.tolist()):
                    continue
                if s["test_id"] not in cache:
                    cache[s["test_id"]] = refit_without(s["test_id"])
                model = cache[s["test_id"]]
            p, lo, hi = (float(v[0]) for v in model.predict(X))
            row[tag] = {"model_rate_mm_s": round(p, 5), "lo95_mm_s": round(lo, 5), "hi95_mm_s": round(hi, 5),
                        "our_rate_inside95": bool(lo <= s["rate_mm_s"] <= hi),
                        "our_vs_model_pct": round(100.0 * (s["rate_mm_s"] - p) / p, 1)}
            if s["nasa_rate_mm_s"] is not None:
                row[tag]["nasa_rate_inside95"] = bool(lo <= s["nasa_rate_mm_s"] <= hi)
        rows.append(row)

    def tally(sel, tag):
        sel = [r for r in sel if tag in r]
        return {"n": len(sel), "n_inside95": sum(r[tag]["our_rate_inside95"] for r in sel),
                "n_nasa_rate_inside95": sum(r[tag].get("nasa_rate_inside95", False) for r in sel),
                "median_abs_our_vs_model_pct": (round(float(np.median([abs(r[tag]["our_vs_model_pct"]) for r in sel])), 1)
                                                if sel else None)}
    groups = {"all_steps": rows, "flow_below_1_cm_s": [r for r in rows if r["flow_below_1_cm_s"]],
              "flow_1_cm_s_or_more": [r for r in rows if not r["flow_below_1_cm_s"]],
              "not_low_confidence": [r for r in rows if not r["low_confidence"]],
              "low_confidence": [r for r in rows if r["low_confidence"]]}
    summary = {tag: {g: tally(sel, tag) for g, sel in groups.items()} for tag in ("all_rows", "sample_held_out")}
    return {"n_steps": len(rows), "n_outside_measured_ranges": sum(not r["inside_measured_ranges"] for r in rows),
            "summary": summary, "steps": rows}


# -------------------------------------------------------------------------------- effects
def effects(t: Table, loglin: LogLinearModel, chosen_model, boot: np.ndarray, feat=features, refit=None) -> dict:
    """How the rate changes with flow, O2 and diameter: log-linear coefficients with intervals, and
    contrasts of the chosen model at measured conditions. A model with its own contrast() gives the
    interval directly. Otherwise refit(XA, XB) -> bootstrap ln ratios, shape (n_boot, n_pairs)."""
    names = ["intercept", "ln_flow", "o2_pct", "ln_diameter"]
    se = np.sqrt(loglin.s2 * np.diag(loglin.xtxi))
    coef = {}
    for i, nme in enumerate(names):
        coef[nme] = {"estimate": round(float(loglin.coef[i]), 4),
                     "ci95_ols": [round(float(loglin.coef[i] - loglin.t * se[i]), 4), round(float(loglin.coef[i] + loglin.t * se[i]), 4)],
                     "ci95_cluster_bootstrap": [round(float(np.percentile(boot[:, i], 2.5)), 4), round(float(np.percentile(boot[:, i], 97.5)), 4)]}
    b, c, dd = (loglin.coef[i] for i in (1, 2, 3))
    bb, cb, db = (np.percentile(boot[:, i], [2.5, 97.5]) for i in (1, 2, 3))
    d_min, d_max = float(t.d_mm.min()), float(t.d_mm.max())
    ratio_d = math.log(d_max / d_min)
    plain = {"double_the_flow": {"rate_ratio": round(2.0 ** b, 3), "ci95": [round(2.0 ** bb[0], 3), round(2.0 ** bb[1], 3)]},
             "one_more_percent_o2": {"rate_ratio": round(math.exp(c), 3), "ci95": [round(math.exp(cb[0]), 3), round(math.exp(cb[1]), 3)]},
             "thinnest_to_thickest_rod": {"from_mm": d_min, "to_mm": d_max, "rate_ratio": round(math.exp(dd * ratio_d), 3),
                                          "ci95": sorted([round(math.exp(db[0] * ratio_d), 3), round(math.exp(db[1] * ratio_d), 3)])}}
    out = {"loglinear_coefficients": coef, "loglinear_plain": plain,
           "loglinear_residual_sd_ln_rate": round(math.sqrt(loglin.s2), 4),
           "note": "Intervals marked cluster_bootstrap resample whole samples (2000 resamples, seed 0). "
                   "ci95_ols ignores that rows of one sample are correlated."}
    analytic = hasattr(chosen_model, "contrast")
    if not analytic and refit is None:
        return out
    ranges = measured_ranges(t)
    contrasts, XA, XB = [], [], []

    def add(kind, d_a, d_b, flow_a, flow_b, o2_a, o2_b):
        XA.append(feat([flow_a], [o2_a], [d_a])[0])
        XB.append(feat([flow_b], [o2_b], [d_b])[0])
        contrasts.append({"kind": kind, "from": {"flow_cm_s": flow_a, "o2_pct": o2_a, "rod_d_mm": d_a},
                          "to": {"flow_cm_s": flow_b, "o2_pct": o2_b, "rod_d_mm": d_b}})

    for d, rg in ranges.items():
        s = rg["rows"]
        f_lo, f_mid, f_hi = float(t.flow[s].min()), float(np.median(t.flow[s])), float(t.flow[s].max())
        o_lo, o_mid, o_hi = float(t.o2[s].min()), float(np.median(t.o2[s])), float(t.o2[s].max())
        add("flow, lowest to middle", d, d, f_lo, f_mid, o_mid, o_mid)
        add("flow, middle to highest", d, d, f_mid, f_hi, o_mid, o_mid)
        add("O2, lowest to highest", d, d, f_mid, f_mid, o_lo, o_hi)
    common = common_point(t)
    if common is not None:
        ds = list(ranges)
        for d in ds[1:]:
            add("diameter", ds[0], d, common["flow_cm_s"], common["flow_cm_s"], common["o2_pct"], common["o2_pct"])
    XA, XB = np.array(XA), np.array(XB)
    if analytic:
        triples = [chosen_model.contrast(xa, xb) for xa, xb in zip(XA, XB)]
        how = "interval from the model's own posterior for its noise-free curve"
    else:
        point = chosen_model.predict(XB)[0] / chosen_model.predict(XA)[0]
        bs = np.exp(refit(XA, XB))
        triples = [(float(point[i]), float(np.percentile(bs[:, i], 2.5)), float(np.percentile(bs[:, i], 97.5)))
                   for i in range(len(point))]
        how = (f"the model has no interval of its own: the interval is a cluster bootstrap over samples "
               f"({len(bs)} refits, seed {SEED}), percentile method")
    for c, (r, lo, hi) in zip(contrasts, triples):
        c.update({"rate_ratio": round(r, 3), "ci95": [round(lo, 3), round(hi, 3)],
                  "clear_of_1": bool(lo > 1.0 or hi < 1.0)})
    out["chosen_model_contrasts"] = contrasts
    out["chosen_model_contrasts_note"] = ("rate at 'to' divided by rate at 'from'; " + how +
                                          ". Middle = the median of that diameter's measured values.")
    return out


def common_point(t: Table):
    """A (flow, O2) point inside every diameter's measured ranges, or None if there is none."""
    rg = measured_ranges(t)
    f_lo, f_hi = max(v["flow"][0] for v in rg.values()), min(v["flow"][1] for v in rg.values())
    o_lo, o_hi = max(v["o2"][0] for v in rg.values()), min(v["o2"][1] for v in rg.values())
    if f_lo > f_hi or o_lo > o_hi:
        return None
    return {"flow_cm_s": round((f_lo + f_hi) / 2.0, 2), "o2_pct": round((o_lo + o_hi) / 2.0, 1),
            "common_flow_range_cm_s": [f_lo, f_hi], "common_o2_range_pct": [o_lo, o_hi]}


# ---------------------------------------------------------------------------------- figure
COLOURS = ["#2a78d6", "#eb6834", "#1baf7a"]   # checked with the dataviz palette validator (colour-blind safe)
MARKERS = ["o", "s", "^"]
SHORT = {"mean": "Mean-rate baseline", "loglinear": "Log-linear model", "gp": "Gaussian process", "forest": "Random forest"}
INK, INK2, GRID, AXIS, SURFACE = "#0b0b0b", "#52514e", "#e1e0d9", "#c3c2b7", "#fcfcfb"


def make_figure(path: str, t: Table, cv: dict, chosen: str, predict, o2_ref: float) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    ds = sorted(set(t.d_mm.tolist()))
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.5, 4.9), dpi=160, facecolor=SURFACE)
    for ax in (ax1, ax2):
        ax.set_facecolor(SURFACE)
        ax.grid(True, color=GRID, linewidth=0.6)
        ax.set_axisbelow(True)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        for side in ("left", "bottom"):
            ax.spines[side].set_color(AXIS)
        ax.tick_params(colors=INK2, labelsize=9)

    pred, lo, hi = cv[chosen]["pred"], cv[chosen]["lo"], cv[chosen]["hi"]
    top = 1.08 * max(float(t.rate.max()), float(np.nanmax(pred)))
    cut = False
    if hi is not None:   # show the interval bars in full unless they would squash the plot
        full = 1.08 * float(np.nanmax(hi))
        cut = full > 1.6 * top
        top = min(full, 1.6 * top)
    ax1.plot([0, top], [0, top], color=INK2, linewidth=1.0, zorder=1)
    ax1.text(top * 0.98, top * 0.93, "perfect match", color=INK2, fontsize=8, ha="right", va="top")
    for k, d in enumerate(ds):
        s = t.d_mm == d
        if lo is not None:
            ax1.vlines(t.rate[s], lo[s], hi[s], color=COLOURS[k % 3], linewidth=1.0, alpha=0.35, zorder=2)
        ax1.scatter(t.rate[s], pred[s], s=34, marker=MARKERS[k % 3], color=COLOURS[k % 3], edgecolor=SURFACE,
                    linewidth=0.8, zorder=3, label=f"{d:g} mm rod")
    ax1.set_xlim(0, top)
    ax1.set_ylim(0, top)
    ax1.set_xlabel("NASA's published rate, Table S1 (mm/s)", color=INK, fontsize=10)
    ax1.set_ylabel("Predicted with that sample held out (mm/s)", color=INK, fontsize=10)
    m = cv[chosen]["metrics"]
    bars = (" Bars: 95% interval" + (" (some cut at the top)." if cut else ".")) if lo is not None else ""
    ax1.set_title(f"Held-out prediction vs published rate\n{SHORT[chosen]}, median error {m['median_ape_pct']:.1f}%, "
                  f"{m['n_rows']} rows.{bars}", color=INK, fontsize=10.5, loc="left")
    ax1.legend(frameon=False, fontsize=9, loc="upper left", labelcolor=INK2)

    ranges = measured_ranges(t)
    for k, d in enumerate(ds):
        f_lo, f_hi = ranges[d]["flow"]
        flows = np.geomspace(f_lo, f_hi, 80) if f_hi > f_lo else np.array([f_lo])
        r, l, h = predict(flows, np.full(len(flows), o2_ref), np.full(len(flows), d))
        if l is not None:
            ax2.fill_between(flows, l, h, color=COLOURS[k % 3], alpha=0.16, linewidth=0, zorder=1)
        ax2.plot(flows, r, color=COLOURS[k % 3], linewidth=2.0, zorder=3, label=f"{d:g} mm rod")
        s = t.d_mm == d
        near = s & (np.abs(t.o2 - o2_ref) <= 0.5)
        far = s & ~near
        ax2.scatter(t.flow[far], t.rate[far], s=30, marker=MARKERS[k % 3], facecolor="none",
                    edgecolor=COLOURS[k % 3], linewidth=1.1, zorder=4)
        ax2.scatter(t.flow[near], t.rate[near], s=34, marker=MARKERS[k % 3], color=COLOURS[k % 3],
                    edgecolor=SURFACE, linewidth=0.8, zorder=5)
    ax2.set_xscale("log")
    ticks = [0.5, 1, 2, 4, 8]
    ax2.set_xticks(ticks)
    ax2.set_xticklabels([f"{v:g}" for v in ticks])
    ax2.minorticks_off()
    ax2.set_ylim(0, None)
    ax2.set_xlabel("Opposed flow speed (cm/s, log scale)", color=INK, fontsize=10)
    ax2.set_ylabel("Spread rate (mm/s)", color=INK, fontsize=10)
    ax2.set_title(f"Model at {o2_ref:g}% O2 with 95% bands, measured flow range only\n"
                  f"Points: Table S1. Filled: O2 within 0.5 of {o2_ref:g}%. Hollow: other O2.",
                  color=INK, fontsize=10.5, loc="left")
    ax2.legend(frameon=False, fontsize=9, loc="upper right", labelcolor=INK2)
    fig.text(0.008, 0.008, "Data: Link et al. 2018, Sci Rep 8:120, Supplement Table S1, p. 1. 0 g, opposed forced flow, "
                           "PMMA rods. Written with AI assistance (Claude Code).", color=INK2, fontsize=7.5)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fig.savefig(path, facecolor=SURFACE)
    plt.close(fig)


# ------------------------------------------------------------------------------------ run
def rnd(x, n=4):
    return None if x is None else round(float(x), n)


def _matplotlib_version():
    try:
        import matplotlib
        return matplotlib.__version__
    except ImportError:
        return None


def metrics_json(m: dict) -> dict:
    out = {"n_rows": m["n_rows"], "median_ape_pct": rnd(m["median_ape_pct"], 2), "mean_ape_pct": rnd(m["mean_ape_pct"], 2),
           "rmse_mm_s": rnd(m["rmse_mm_s"], 5)}
    if "coverage95" in m:
        out.update({"coverage95": rnd(m["coverage95"], 4), "n_inside95": m["n_inside95"],
                    "median_interval_halfwidth_pct": rnd(m["median_interval_halfwidth_pct"], 1)})
    return out


def run_cv(makers: dict, X, rate, groups, ids=MODEL_ORDER) -> dict:
    cv = {}
    for mid in ids:
        pred, lo, hi = cross_validate(makers[mid], X, rate, groups)
        cv[mid] = {"pred": pred, "lo": lo, "hi": hi, "metrics": metrics(rate, pred, lo, hi)}
    return cv


def add_forest_band(cv: dict, rate, groups) -> float:
    """Give the forest's held-out predictions the residual band from forest_band(). Returns q (all rows)."""
    q, lo, hi = forest_band(cv["forest"]["pred"], rate, groups)
    cv["forest"].update(lo=lo, hi=hi, metrics=metrics(rate, cv["forest"]["pred"], lo, hi))
    return q


FOREST_INTERVAL_NOTE = ("The forest has no interval of its own. Its band is prediction times or divided by exp(q), "
                        "q = 95th percentile of the held-out |ln error|. In this coverage check each row's q leaves "
                        "out that row's own sample.")


def analyse(table_path: str, ours_path: str | None, n_restarts: int = 10, n_boot: int = 5000) -> tuple:
    """The whole analysis. Returns (json-ready dict, objects needed for the figure)."""
    import scipy, sklearn
    t = load_table_s1(table_path)
    makers = model_makers(n_restarts)
    X = features(t.flow, t.o2, t.d_mm)
    n_samples = len(set(t.sample.tolist()))

    # 1. leave-one-sample-out for the four models, then the selection rule
    cv = run_cv(makers, X, t.rate, t.sample)
    forest_q = add_forest_band(cv, t.rate, t.sample)
    scores = {m: cv[m]["metrics"]["median_ape_pct"] for m in MODEL_ORDER}
    chosen, best_id, close = select_model(scores)
    if chosen == best_id and len(close) == 1:
        why = (f"{chosen} has the lowest held-out median absolute % error ({scores[chosen]:.2f}%) and no other model "
               f"is within {TIE_PP:g} percentage point of it.")
    elif chosen == best_id:
        why = (f"{chosen} has the lowest held-out median absolute % error ({scores[chosen]:.2f}%) and is also the "
               f"simplest of the models within {TIE_PP:g} percentage point ({', '.join(close)}).")
    else:
        why = (f"{best_id} has the lowest held-out median absolute % error ({scores[best_id]:.2f}%), but {chosen} "
               f"({scores[chosen]:.2f}%) is within {TIE_PP:g} percentage point and is simpler, so the rule publishes {chosen}.")

    # 2. uncertainty of the scores: cluster bootstrap over samples
    boots = bootstrap_medians({m: ape(t.rate, cv[m]["pred"]) for m in MODEL_ORDER}, t.sample, n_boot)
    score_ci = {m: [rnd(np.percentile(boots[m], 2.5), 2), rnd(np.percentile(boots[m], 97.5), 2)] for m in MODEL_ORDER}
    versus = {}
    for m in MODEL_ORDER:
        if m != chosen:
            diff = boots[chosen] - boots[m]
            versus[m] = {"median_ape_difference_pct": rnd(scores[chosen] - scores[m], 2),
                         "ci95": [rnd(np.percentile(diff, 2.5), 2), rnd(np.percentile(diff, 97.5), 2)],
                         "share_of_resamples_chosen_is_better": rnd(float(np.mean(diff < 0)), 3)}

    # 3. in-sample scores (optimistic; shown only to make the gap to held-out visible)
    in_sample, fitted_all = {}, {}
    for m in MODEL_ORDER:
        fitted_all[m] = makers[m]().fit(X, t.rate)
        p, lo, hi = fitted_all[m].predict(X)
        in_sample[m] = metrics_json(metrics(t.rate, p, lo, hi))

    # 4. sensitivity: a/b samples as one rod
    rods = np.array([rod_group(s) for s in t.sample])
    cv_rod = run_cv(makers, X, t.rate, rods)
    add_forest_band(cv_rod, t.rate, rods)

    # 5. colour check
    Xc = features(t.flow, t.o2, t.d_mm, t.clear)
    cv_col = run_cv(makers, Xc, t.rate, t.sample, ids=("loglinear", "gp", "forest"))
    add_forest_band(cv_col, t.rate, t.sample)
    use_clear = bool(chosen != "mean" and
                     cv_col[chosen]["metrics"]["median_ape_pct"] < scores[chosen] - TIE_PP)
    ll_col = LogLinearModel().fit(Xc, t.rate)
    boot_col = bootstrap_loglinear(Xc, t.rate, t.sample)
    colour = {"rule": COLOUR_RULE, "source": "Link et al. 2018, Sci Rep 8:120, Supplement Table S1 caption, p. 1",
              "n_clear_rows": int(t.clear.sum()), "clear_samples": sorted(set(t.sample[t.clear == 1].tolist())),
              "not_stated_samples": sorted({s for s in t.sample.tolist() if colour_of(s) == "not stated"}),
              "not_stated_coding": "coded as not marked clear",
              "with_colour_input": {m: metrics_json(cv_col[m]["metrics"]) for m in cv_col},
              "change_in_median_ape_pct": {m: rnd(cv_col[m]["metrics"]["median_ape_pct"] - scores[m], 2) for m in cv_col},
              "loglinear_clear_term": {"estimate": rnd(ll_col.coef[4]), "rate_ratio_clear_vs_black": rnd(math.exp(ll_col.coef[4]), 3),
                                       "ci95_cluster_bootstrap_ratio": [rnd(math.exp(np.percentile(boot_col[:, 4], 2.5)), 3),
                                                                        rnd(math.exp(np.percentile(boot_col[:, 4], 97.5)), 3)]},
              "colour_in_published_model": use_clear}

    # 6. the published model, fitted on all rows
    Xf = Xc if use_clear else X
    final = makers[chosen]().fit(Xf, t.rate)
    if chosen == "forest":   # a forest has no interval: use the 95th percentile of held-out |ln error|
        final.band = (forest_q if not use_clear else
                      float(np.percentile(np.abs(np.log(cv_col["forest"]["pred"] / t.rate)), 95)))
    grid_mask = (t.clear == 0) if use_clear else None

    def predict(flow, o2, d_mm):
        flow = np.atleast_1d(np.asarray(flow, float))
        return final.predict(features(flow, o2, d_mm, np.zeros(len(flow)) if use_clear else None))

    def refit_without(sample_id):
        keep = t.sample != sample_id
        model = makers[chosen]().fit(Xf[keep], t.rate[keep])
        if chosen == "forest":
            model.band = final.band
        return model

    grid = build_grid(predict, t, mask=grid_mask)
    loglin = LogLinearModel().fit(X, t.rate)
    feat = (lambda f, o, d: features(f, o, d, np.zeros(len(f)))) if use_clear else features
    refit_pairs = lambda XA, XB: bootstrap_contrasts(makers[chosen], Xf, t.rate, t.sample, XA, XB)
    eff = effects(t, loglin, final, bootstrap_loglinear(X, t.rate, t.sample), feat, refit_pairs)
    common = common_point(t)
    o2_ref = common["o2_pct"] if common else round(float(np.median(t.o2)), 1)

    model_info = {"id": chosen, "name": MODEL_NAMES[chosen], "fitted_on": f"all {len(t)} rows",
                  "inputs": ["ln(flow_cm_s)", "o2_pct", "ln(rod_d_mm)"] + (["clear (0/1)"] if use_clear else []),
                  "target": "ln(rate_mm_s); the reported rate is exp(predicted mean) = the predictive median",
                  "interval": {"mean": "mean +/- t x sd x sqrt(1 + 1/n), a 95% interval for one new step",
                               "loglinear": "ordinary least squares 95% prediction interval for one new step, in ln(rate)",
                               "gp": "exp(mean +/- 1.96 sd), sd includes the fitted noise: a 95% interval for one new measured step",
                               "forest": "the forest has no interval of its own: lo95 = rate / band_factor, hi95 = rate x band_factor, "
                                         "band_factor = exp(q), q = 95th percentile of the held-out |ln error| over all rows. "
                                         "The band has the same relative width everywhere"}[chosen]}
    if chosen == "forest":
        model_info["fit"] = {"n_estimators": 500, "min_samples_leaf": 2, "seed": SEED,
                             "band_q_ln_rate": rnd(final.band), "band_factor": rnd(math.exp(final.band), 3),
                             "feature_importances": dict(zip(model_info["inputs"], [rnd(v, 3) for v in final.rf.feature_importances_]))}
    if chosen == "gp":
        model_info["fit"] = final.describe()
    elif chosen == "loglinear":
        model_info["fit"] = {"coefficients": [rnd(v, 5) for v in final.coef], "residual_sd_ln_rate": rnd(math.sqrt(final.s2))}
    elif chosen == "mean":
        model_info["fit"] = {"mean_rate_mm_s": rnd(final.mu, 5)}

    out = {
        "_note": ("Written with AI assistance (Claude Code). Generated by " + CODE_PATH + "; regenerate it, never "
                  "hand-edit. A statistical model of NASA's published rates, not a NASA result and not a physics simulation."),
        "schema": "orbit_model/1",
        "scope": SCOPE,
        "code": CODE_PATH,
        "seed": SEED,
        "training": {"file": "data/reference/link2018_table_s1.csv", "sha256": sha256_file(table_path), "source": SOURCE,
                     "n_rows": len(t), "n_samples": n_samples,
                     "rate_conversion": "rate_mm_s = printed Vf x 10^3 value x 0.01, both halves (docs/DATA_CONTRACTS.md section 6)",
                     "rod_d_mm": "printed diameter in cm x 10"},
        "selection_rule": SELECTION_RULE,
        "cv": {"scheme": f"leave-one-sample-out: {n_samples} folds, all rows of one sample held out together",
               "n_folds": n_samples,
               "metric_notes": "ape = absolute % error on held-out rows; coverage95 = share of held-out rows inside the "
                               "model's 95% predictive interval; median_ape_ci95_pct = cluster bootstrap over samples "
                               f"({n_boot} resamples, seed {SEED}), models not refitted",
               "models": [dict({"id": m, "name": MODEL_NAMES[m]}, **metrics_json(cv[m]["metrics"]),
                               median_ape_ci95_pct=score_ci[m], in_sample_optimistic=in_sample[m],
                               **({"interval_note": FOREST_INTERVAL_NOTE} if m == "forest" else {})) for m in MODEL_ORDER],
               "chosen": chosen, "lowest_score": best_id, "within_1_point_of_lowest": close, "why": why,
               "chosen_vs_others_bootstrap": versus},
        "cv_sensitivity_one_rod_for_ab_samples": {
            "note": "Samples with an a/b suffix treated as one rod (our assumption). Reported only; not used to choose.",
            "n_folds": len(set(rods.tolist())),
            "models": [dict({"id": m}, **metrics_json(cv_rod[m]["metrics"])) for m in MODEL_ORDER]},
        "colour_check": colour,
        "model": model_info,
        "diagnostics": {"note": "Fits on all rows, kept to explain the scores. Not used to choose.",
                        "gp_all_rows": fitted_all["gp"].describe(),
                        "forest_feature_importances_all_rows": dict(zip(
                            ["ln(flow_cm_s)", "o2_pct", "ln(rod_d_mm)"],
                            [rnd(v, 3) for v in fitted_all["forest"].rf.feature_importances_]))},
        "effects": eff,
        "reference_point": common,
        "grid_notes": {"axes": "arrays are indexed [o2][flow]; flow is log-spaced, O2 is evenly spaced",
                       "bounds": "lo95/hi95 = 95% predictive interval for one new measured step",
                       "limits": "each grid covers only that rod diameter's measured flow range and measured O2 range. "
                                 "A corner of the box can still be far from any measured row: check nearest_row_distance.",
                       "nearest_row_distance": "distance to the nearest measured row of the same diameter, in standard "
                                               "deviations of the training rows: sqrt((d ln flow / sd)^2 + (d O2 / sd)^2), "
                                               f"sd ln flow = {np.std(np.log(t.flow)):.4f}, sd O2 = {np.std(t.o2):.4f} %",
                       "nearest_row_index": "index into that grid's measured_rows",
                       "pmma": "black rods only" if use_clear else "black and clear rods pooled (colour is not a model input)"},
        "grid": grid,
        "heldout_rows": [{"id": t.row_id(i), "flow_cm_s": float(t.flow[i]), "o2_pct": float(t.o2[i]),
                          "rod_d_mm": float(t.d_mm[i]), "rate_mm_s": rnd(t.rate[i]),
                          "heldout_rate_mm_s": {m: rnd(cv[m]["pred"][i], 5) for m in MODEL_ORDER},
                          "chosen_lo95_mm_s": rnd(cv[chosen]["lo"][i], 5) if cv[chosen]["lo"] is not None else None,
                          "chosen_hi95_mm_s": rnd(cv[chosen]["hi"][i], 5) if cv[chosen]["hi"] is not None else None}
                         for i in range(len(t))],
        "library_versions": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__,
                             "scikit-learn": sklearn.__version__, "matplotlib (figure only)": _matplotlib_version()},
    }
    if ours_path and os.path.exists(ours_path):
        oc = outside_comparison(final, refit_without, t, load_our_steps(ours_path), use_clear)
        oc = dict({"file": "data/derived/spread_rates.csv", "sha256": sha256_file(ours_path),
                   "note": "Our own measured steps against the model. Reported only: nothing is tuned to it. Our steps come "
                           "from tests that are also rows of Table S1, so 'all_rows' is not independent of NASA's rate for "
                           "the same step. 'sample_held_out' refits the model without that test's Table S1 rows."}, **oc)
        out["outside_comparison"] = oc
    return out, {"table": t, "cv": cv, "chosen": chosen, "predict": predict, "o2_ref": o2_ref}


def cv_table_text(out: dict) -> str:
    lines = ["model      median%   mean%    RMSE mm/s  inside 95%   (leave-one-sample-out, held-out rows)"]
    for m in out["cv"]["models"]:
        cov = f"{m['n_inside95']}/{m['n_rows']} = {100 * m['coverage95']:.0f}%" if "coverage95" in m else "-"
        lines.append(f"{m['id']:<10} {m['median_ape_pct']:>6.2f}  {m['mean_ape_pct']:>6.2f}   {m['rmse_mm_s']:.5f}   {cov}")
    lines.append(f"chosen: {out['cv']['chosen']}. {out['cv']['why']}")
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--repo", default="..", help="repo root (default: .. from pipeline/)")
    ap.add_argument("--out-json", help="default <repo>/docs/research/orbit_model.json")
    ap.add_argument("--out-fig", help="default <repo>/docs/research/figures/orbit_model.png")
    ap.add_argument("--restarts", type=int, default=10, help="GP optimizer restarts (10 for the published file)")
    ap.add_argument("--no-fig", action="store_true")
    a = ap.parse_args(argv)
    table = os.path.join(a.repo, "data", "reference", "link2018_table_s1.csv")
    ours = os.path.join(a.repo, "data", "derived", "spread_rates.csv")
    out, extra = analyse(table, ours, n_restarts=a.restarts)
    out_json = a.out_json or os.path.join(a.repo, "docs", "research", "orbit_model.json")
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    if not a.no_fig:
        import matplotlib
        out_fig = a.out_fig or os.path.join(a.repo, "docs", "research", "figures", "orbit_model.png")
        make_figure(out_fig, extra["table"], extra["cv"], extra["chosen"], extra["predict"], extra["o2_ref"])
        print(f"figure: {out_fig} (matplotlib {matplotlib.__version__})")
    print(cv_table_text(out))
    print(f"json: {out_json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
