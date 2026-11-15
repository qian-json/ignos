# Written with AI assistance (Claude Code)
"""Flame phase model (exploratory diagnostic): do the photos alone say where the tracker is unreliable?

Fit: a 2-component Gaussian mixture on two per-photo features, log10(brightness_p999) and b_share,
standardized, pooled over the flame photos of the tests (docs/research/flame_features/<test>.csv).
The fit never sees a spread rate or an error. The brighter component is named "bright", the other
"dim-blue".

Per flow step (row of data/derived/spread_rates.csv): bright_share = share of "bright" photos among
the photos the step's rate fit uses (25-90% of the step window, run.py steady_fit).
Rule, fixed before any result and never tuned: predicted unreliable if bright_share >= 0.5.

Scoring of the rule only, after the fit: outcome bad = no usable rate, or |pct_error| > 15 (the band
pipeline/METHOD.md uses), over rows that have a NASA rate; compared with the current rule
(flow >= 1 cm/s, or LOW CONFIDENCE in notes). The published rates behind pct_error are from
Link et al. 2018, Sci Rep 8:120, Supplement Table S1, p. 1.

This analysis was designed after the errors were known. It changes no reported rate.

Usage (from pipeline/):
  python -m diagnostics.phase_model                       # fit, score, write JSON + MD + PNG
  python -m diagnostics.phase_model --score ../docs/research/flame_features/NEW.csv
      # label a NEW test with the saved mixture (no refit) and print its steps
"""
from __future__ import annotations
import argparse, csv, hashlib, json, os, sys
import numpy as np

PIPELINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_REPO = os.path.normpath(os.path.join(PIPELINE_DIR, ".."))
FEATURES_REL = "docs/research/flame_features"
SPREAD_REL = "data/derived/spread_rates.csv"
JSON_REL = "docs/research/flame_phase_model.json"
MD_REL = "docs/research/flame_phase_model.md"
FIG_REL = "docs/research/figures/flame_phase.png"
TESTS = ["B16", "B19", "B12", "P17", "B13b", "B13a"]
AI_NOTE = "Written with AI assistance (Claude Code)"
TABLE_S1 = "Link et al. 2018, Sci Rep 8:120, Supplement Table S1, p. 1"
PHOTOS = "NASA PSI-25 BASS-II archive, CC0, DOI 10.60555/4qc4-de67"

BRIGHTNESS_COL = "brightness_p999"
BAND_COL = "brightness_p999_band"      # cross-check only
RULE_THRESHOLD = 0.5                   # fixed before any result; never tuned
CHECK_THRESHOLDS = (0.25, 0.75)        # sensitivity check only, not the rule
ERROR_BAND_PCT = 15.0                  # the band METHOD.md uses
HIGH_FLOW_CM_S = 1.0                   # the current rule's flow limit
N_PERM = 10000
SEED = 20261115
GMM_RANDOM_STATE = 0
GMM_N_INIT = 10
FIT_START, FIT_STOP = 0.25, 0.90       # run.py steady_fit; used here only to cross-check the feature CSV


# ---------- reading ----------


def _p_text(p: float, hits: int, n: int) -> str:
    """Report a permutation p-value without printing '0.000' when no shuffle reached the observed value."""
    if hits == 0:
        return f"below {1 / n:.4f} (none of {n:,} shuffles reached it)"
    return f"{p:.3f}"

def read_features(path: str) -> list[dict]:
    """Rows of a per-photo feature CSV (flame_features.py). Lines that start with '#' are comments."""
    with open(path, newline="", encoding="utf-8") as h:
        lines = [ln for ln in h.read().splitlines() if not ln.startswith("#")]
    return list(csv.DictReader(lines))


def read_spread(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as h:
        return list(csv.DictReader(h))


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def flame_index(rows: list[dict], col: str = BRIGHTNESS_COL) -> list[int]:
    """Row numbers of the flame photos: inside the burn window, with a tracker mask (b_share filled)
    and a positive brightness."""
    return [i for i, r in enumerate(rows)
            if r["in_burn_window"] == "1" and r["b_share"] != "" and r[col] != "" and float(r[col]) > 0]


def feature_matrix(rows: list[dict], idx: list[int], col: str = BRIGHTNESS_COL) -> np.ndarray:
    """[n, 2]: log10(brightness), b_share for the photos in idx."""
    return np.array([[np.log10(float(rows[i][col])), float(rows[i]["b_share"])] for i in idx],
                    dtype=float).reshape(-1, 2)


# ---------- the mixture ----------

def log_weighted_density(params: dict, X: np.ndarray) -> np.ndarray:
    """[n, 2]: log(weight_k) + log N(z | mean_k, cov_k) with z the standardized features. Uses only
    the saved parameters, so a saved model scores new photos without scikit-learn and without a refit."""
    Z = (np.asarray(X, dtype=float).reshape(-1, 2) - np.array(params["scaler_mean"])) / np.array(params["scaler_scale"])
    out = np.empty((len(Z), len(params["weights"])))
    for k, (w, mu, cov) in enumerate(zip(params["weights"], params["means"], params["covariances"])):
        L = np.linalg.cholesky(np.array(cov, dtype=float))
        y = np.linalg.solve(L, (Z - np.array(mu)).T)
        out[:, k] = np.log(w) - 0.5 * (Z.shape[1] * np.log(2 * np.pi) + 2 * np.log(np.diag(L)).sum() + (y ** 2).sum(0))
    return out


def component_of(params: dict, X: np.ndarray) -> np.ndarray:
    return np.argmax(log_weighted_density(params, X), axis=1)


def is_bright(params: dict, X: np.ndarray) -> np.ndarray:
    """True where a photo's most likely component is the bright one."""
    return component_of(params, X) == params["bright_component"]


def bright_probability(params: dict, X: np.ndarray) -> np.ndarray:
    lw = log_weighted_density(params, X)
    lw = lw - lw.max(1, keepdims=True)
    p = np.exp(lw)
    return p[:, params["bright_component"]] / p.sum(1)


def fit_mixture(X: np.ndarray, random_state: int = GMM_RANDOM_STATE, n_init: int = GMM_N_INIT) -> dict:
    """Standardize, fit a 2-component full-covariance Gaussian mixture, name the brighter component
    "bright". X holds photo features only: no rate and no error can enter here."""
    os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 1))   # skips a noisy core-count probe on Windows
    from sklearn.mixture import GaussianMixture
    from sklearn.preprocessing import StandardScaler
    X = np.asarray(X, dtype=float).reshape(-1, 2)
    sc = StandardScaler().fit(X)
    Z = sc.transform(X)
    gm = GaussianMixture(n_components=2, covariance_type="full", random_state=random_state, n_init=n_init).fit(Z)
    bright = int(np.argmax(gm.means_[:, 0]))        # feature 0 is log10 brightness
    params = {"scaler_mean": sc.mean_.tolist(), "scaler_scale": sc.scale_.tolist(),
              "weights": gm.weights_.tolist(), "means": gm.means_.tolist(), "covariances": gm.covariances_.tolist(),
              "bright_component": bright,
              "component_names": ["bright" if k == bright else "dim-blue" for k in range(2)]}
    if not np.array_equal(component_of(params, X), gm.predict(Z)):
        raise AssertionError("labels from the saved parameters differ from scikit-learn's predict()")
    params["fit"] = {"n_photos": int(len(X)), "converged": bool(gm.converged_), "n_iter": int(gm.n_iter_),
                     "mean_log_likelihood": float(gm.lower_bound_)}
    return params


def label_tests(feats: dict, params: dict, col: str = BRIGHTNESS_COL) -> dict:
    """{test: {row number: True if bright}} for every flame photo."""
    out = {}
    for tid, rows in feats.items():
        idx = flame_index(rows, col)
        out[tid] = dict(zip(idx, is_bright(params, feature_matrix(rows, idx, col)).tolist())) if idx else {}
    return out


def pooled(feats: dict, tests: list[str], col: str = BRIGHTNESS_COL) -> np.ndarray:
    parts = [feature_matrix(feats[t], flame_index(feats[t], col), col) for t in tests]
    return np.vstack(parts) if parts else np.empty((0, 2))


# ---------- per step ----------

def step_share(rows: list[dict], bright: dict, k: int, photo_rule: str = "fit") -> dict:
    """bright_share of step k of one test.

    photo_rule "fit": the photos the rate fit uses (fit_step == k and a v1 edge). If none has a v1
    edge (the area gate removed them all), fall back to all flame photos in the fit range.
    photo_rule "range": always all flame photos in the fit range (cross-check)."""
    in_range = [i for i, r in enumerate(rows) if r["fit_step"] == str(k) and i in bright]
    fit = [i for i in in_range if rows[i]["edge_mm"] != ""]
    if photo_rule == "fit" and fit:
        use, kind = fit, "fit photos"
    elif in_range:
        use, kind = in_range, ("all flame photos in the fit range" if photo_rule == "range"
                               else "fallback: all flame photos in the fit range (none has a v1 edge)")
    else:
        return {"n_photos": 0, "n_bright": 0, "bright_share": None, "photo_set": "no flame photo in the fit range"}
    nb = int(sum(bool(bright[i]) for i in use))
    return {"n_photos": len(use), "n_bright": nb, "bright_share": nb / len(use), "photo_set": kind}


def predicted_unreliable(share, threshold: float = RULE_THRESHOLD) -> bool:
    """The rule. A step with no flame photo at all has no share and is not flagged."""
    return share is not None and share >= threshold


def current_rule(flow_cm_s: float, notes: str) -> bool:
    """Today's flag: flow at or above 1 cm/s, or LOW CONFIDENCE in the row's notes."""
    return flow_cm_s >= HIGH_FLOW_CM_S or "LOW CONFIDENCE" in (notes or "")


def spread_steps(spread_rows: list[dict], tests: list[str] | None = None) -> list[dict]:
    """One record per spread_rates row (step number = order within its test), with the outcome."""
    out, count = [], {}
    for r in spread_rows:
        k = count[r["test_id"]] = count.get(r["test_id"], 0) + 1
        if tests is not None and r["test_id"] not in tests:
            continue
        usable = r["rate_mm_s"] != ""
        has_nasa = r["nasa_rate_mm_s"] != ""
        err = float(r["pct_error"]) if r["pct_error"] != "" else None
        bad = None if not has_nasa else bool((not usable) or (err is not None and abs(err) > ERROR_BAND_PCT))
        out.append({"test_id": r["test_id"], "step": k, "flow_cm_s": float(r["flow_cm_s"]),
                    "t_start_s": float(r["t_start_s"]), "t_end_s": float(r["t_end_s"]),
                    "has_nasa_rate": has_nasa, "usable": usable,
                    "pct_error": err, "abs_pct_error": abs(err) if err is not None else None, "bad": bad,
                    "low_confidence_note": "LOW CONFIDENCE" in r["notes"],
                    "current_rule_flag": current_rule(float(r["flow_cm_s"]), r["notes"])})
    return out


def check_fit_steps(rows: list[dict], step: dict, tol_s: float = 0.2) -> None:
    """The feature CSV's fit_step must be the 25-90% range of this spread_rates window (to the
    0.1 s the CSV prints). Guards against a feature CSV and a spread_rates.csv from different runs."""
    a = step["t_start_s"] + FIT_START * (step["t_end_s"] - step["t_start_s"])
    b = step["t_start_s"] + FIT_STOP * (step["t_end_s"] - step["t_start_s"])
    for r in rows:
        t, inside = float(r["t_s"]), r["fit_step"] == str(step["step"])
        if inside and not (a - tol_s <= t <= b + tol_s) or (not inside and a + tol_s < t < b - tol_s):
            raise AssertionError(f"{step['test_id']} step {step['step']}: photo at {t} s disagrees with the "
                                 f"fit range {a:.1f}-{b:.1f} s (feature CSV and spread_rates.csv out of step?)")


def add_shares(steps: list[dict], feats: dict, labels: dict, prefix: str = "", photo_rule: str = "fit") -> None:
    """Fill bright_share and the rule's prediction into the step records (keys get `prefix`)."""
    for s in steps:
        r = step_share(feats[s["test_id"]], labels[s["test_id"]], s["step"], photo_rule)
        if prefix:
            s[prefix + "bright_share"] = r["bright_share"]
            s[prefix + "predicted_unreliable"] = predicted_unreliable(r["bright_share"])
        else:
            s.update(r)
            s["predicted_unreliable"] = predicted_unreliable(r["bright_share"])


# ---------- scoring the rule ----------

def confusion(pred: list[bool], bad: list[bool]) -> dict:
    tp = sum(p and b for p, b in zip(pred, bad)); fp = sum(p and not b for p, b in zip(pred, bad))
    fn = sum((not p) and b for p, b in zip(pred, bad)); tn = sum((not p) and (not b) for p, b in zip(pred, bad))
    return {"n": len(pred), "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "sensitivity": tp / (tp + fn) if tp + fn else None,
            "specificity": tn / (tn + fp) if tn + fp else None,
            "correct": tp + tn}


def spearman(x, y) -> float:
    from scipy.stats import rankdata
    rx, ry = rankdata(x), rankdata(y)
    if len(rx) < 3 or rx.std() == 0 or ry.std() == 0:
        return float("nan")
    return float(np.corrcoef(rx, ry)[0, 1])


def permutation_p(x, y, groups=None, n_perm: int = N_PERM, seed: int = SEED) -> tuple[float, float, int]:
    """(Spearman rho, two-sided permutation p, hits). y is shuffled n_perm times with a fixed seed;
    p = (1 + number of shuffles with |rho| >= the observed |rho|) / (1 + n_perm).
    With `groups`, y is shuffled only within each group (here: within each test)."""
    from scipy.stats import rankdata
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    obs = spearman(x, y)
    if not np.isfinite(obs):
        return obs, float("nan"), 0
    rx, ry = rankdata(x), rankdata(y)
    rxc, ryc = rx - rx.mean(), ry - ry.mean()
    denom = np.sqrt((rxc ** 2).sum() * (ryc ** 2).sum())
    rng = np.random.default_rng(seed)
    sets = None if groups is None else [np.flatnonzero(np.asarray(groups) == g) for g in dict.fromkeys(groups)]
    hits = 0
    for _ in range(n_perm):
        if sets is None:
            p = rng.permutation(len(y))
        else:
            p = np.arange(len(y))
            for idx in sets:
                p[idx] = rng.permutation(idx)
        hits += abs(float((rxc * ryc[p]).sum() / denom)) >= abs(obs) - 1e-12
    return obs, (hits + 1) / (n_perm + 1), int(hits)


def mcnemar_exact(only_a_right: int, only_b_right: int) -> float:
    """Exact two-sided McNemar p for two rules scored on the same steps: a binomial test on the steps
    where exactly one rule is right. 1.0 when the rules never disagree."""
    from scipy.stats import binomtest
    n = only_a_right + only_b_right
    return 1.0 if n == 0 else float(binomtest(only_a_right, n, 0.5).pvalue)


def leave_one_test_out(feats: dict, steps: list[dict], col: str = BRIGHTNESS_COL) -> dict:
    """Refit the mixture without each test in turn, label that test's photos with the refit, and
    recompute its steps. Fills loto_bright_share / loto_predicted_unreliable into `steps`."""
    tests = list(feats)
    full = label_tests(feats, fit_mixture(pooled(feats, tests, col)), col)
    same = total = 0
    for held in tests:
        others = [t for t in tests if t != held]
        lab = label_tests({held: feats[held]}, fit_mixture(pooled(feats, others, col)), col)
        same += sum(lab[held][i] == full[held][i] for i in lab[held]); total += len(lab[held])
        add_shares([s for s in steps if s["test_id"] == held], feats, lab, prefix="loto_")
    changed = [s for s in steps if s["loto_predicted_unreliable"] != s["predicted_unreliable"]]
    return {"n_steps": len(steps), "n_predictions_changed": len(changed),
            "changed_steps": [f"{s['test_id']} step {s['step']} ({s['flow_cm_s']:g} cm/s)" for s in changed],
            "photo_labels_same": same, "photo_labels_total": total}


def analyse(feats: dict, spread_rows: list[dict], col: str = BRIGHTNESS_COL, full: bool = True) -> dict:
    """Fit on the pooled photos, then score the fixed rule. Rates and errors are read only after
    the labels exist. With full=False only the fit and the step predictions are returned."""
    tests = list(feats)
    params = fit_mixture(pooled(feats, tests, col))
    labels = label_tests(feats, params, col)
    steps = spread_steps(spread_rows, tests)
    for s in steps:
        check_fit_steps(feats[s["test_id"]], s)
    add_shares(steps, feats, labels)
    if not full:
        return {"params": params, "labels": labels, "steps": steps}
    add_shares(steps, feats, labels, prefix="range_", photo_rule="range")
    loto = leave_one_test_out(feats, steps, col)
    ev = [s for s in steps if s["has_nasa_rate"]]
    bad = [s["bad"] for s in ev]
    rated = [s for s in ev if s["usable"] and s["bright_share"] is not None]
    x, y = [s["bright_share"] for s in rated], [s["abs_pct_error"] for s in rated]
    rho, p, hits = permutation_p(x, y)
    _, p_within, hits_within = permutation_p(x, y, groups=[s["test_id"] for s in rated])
    ev_rated = [s for s in ev if s["usable"]]
    photo_only = [s for s in ev if (s["predicted_unreliable"] == s["bad"]) and (s["current_rule_flag"] != s["bad"])]
    current_only = [s for s in ev if (s["predicted_unreliable"] != s["bad"]) and (s["current_rule_flag"] == s["bad"])]
    groups = {}
    for name in ("bright", "dim-blue"):
        Xg = np.vstack([feature_matrix(feats[t], [i for i, b in labels[t].items() if b == (name == "bright")]) for t in tests])
        groups[name] = {"photos": int(len(Xg)),
                        "log10_brightness_min": float(Xg[:, 0].min()) if len(Xg) else None,
                        "log10_brightness_max": float(Xg[:, 0].max()) if len(Xg) else None,
                        "b_share_min": float(Xg[:, 1].min()) if len(Xg) else None,
                        "b_share_max": float(Xg[:, 1].max()) if len(Xg) else None}
    metrics = {
        "rows_scored": len(ev), "rows_bad": int(sum(bad)),
        "groups": groups,
        "phase_rule": confusion([s["predicted_unreliable"] for s in ev], bad),
        "current_rule": confusion([s["current_rule_flag"] for s in ev], bad),
        "paired_comparison": {"only_photo_rule_right": [_name(s) for s in photo_only],
                              "only_current_rule_right": [_name(s) for s in current_only],
                              "mcnemar_exact_p": mcnemar_exact(len(photo_only), len(current_only))},
        "rated_steps_only": {"note": "secondary view: only the steps that have a rate",
                             "phase_rule": confusion([s["predicted_unreliable"] for s in ev_rated], [s["bad"] for s in ev_rated]),
                             "current_rule": confusion([s["current_rule_flag"] for s in ev_rated], [s["bad"] for s in ev_rated])},
        "bright_share_values": {"zero_or_one": sum(s["bright_share"] in (0.0, 1.0) for s in steps), "steps": len(steps)},
        "threshold_sensitivity_check": {f"{thr:g}": confusion([predicted_unreliable(s["bright_share"], thr) for s in ev], bad)
                                        for thr in CHECK_THRESHOLDS},
        "spearman": {"rho": rho, "n": len(rated), "p_permutation": p, "shuffles_at_or_above": hits,
                     "n_permutations": N_PERM, "seed": SEED, "two_sided": True,
                     "p_permutation_within_test": p_within, "shuffles_at_or_above_within_test": hits_within},
        "leave_one_test_out": {**loto, "confusion": confusion([s["loto_predicted_unreliable"] for s in ev], bad)},
        "photo_set_check": {"n_predictions_changed": sum(s["range_predicted_unreliable"] != s["predicted_unreliable"] for s in steps),
                            "confusion": confusion([s["range_predicted_unreliable"] for s in ev], bad)},
    }
    return {"params": params, "labels": labels, "steps": steps, "metrics": metrics}


def band_check(feats: dict, spread_rows: list[dict], steps: list[dict]) -> dict | None:
    """Cross-check: the same model with brightness taken only over the rod band's rows, which are the
    same in every test. Returns how many step predictions change (None if the column is missing)."""
    if any(BAND_COL not in rows[0] for rows in feats.values() if rows):
        return None
    alt = analyse(feats, spread_rows, col=BAND_COL, full=False)["steps"]
    ch = [a for a, s in zip(alt, steps) if a["predicted_unreliable"] != s["predicted_unreliable"]]
    ev = [a for a in alt if a["has_nasa_rate"]]
    return {"n_predictions_changed": len(ch),
            "changed_steps": [f"{a['test_id']} step {a['step']} ({a['flow_cm_s']:g} cm/s)" for a in ch],
            "confusion": confusion([a["predicted_unreliable"] for a in ev], [a["bad"] for a in ev])}


# ---------- scoring a new test with the saved model ----------

def score_rows(rows: list[dict], params: dict, col: str = BRIGHTNESS_COL) -> dict:
    """Label one test's photos with saved parameters (no refit) and compute every step's bright_share
    and the rule's prediction. `rows` are the rows of its feature CSV."""
    idx = flame_index(rows, col)
    bright = dict(zip(idx, is_bright(params, feature_matrix(rows, idx, col)).tolist())) if idx else {}
    ks = sorted({int(r["fit_step"]) for r in rows if r["fit_step"] != ""})
    steps = []
    for k in ks:
        r = step_share(rows, bright, k)
        steps.append({"step": k, **r, "predicted_unreliable": predicted_unreliable(r["bright_share"])})
    return {"test_id": rows[0]["test_id"] if rows else "", "n_photos": len(rows), "n_flame_photos": len(idx),
            "n_bright_photos": int(sum(bright.values())), "labels": bright, "steps": steps}


def score_feature_csv(path: str, model: dict | str, col: str = BRIGHTNESS_COL) -> dict:
    """Score a NEW test from its feature CSV. `model` is the saved JSON (path or loaded dict)."""
    if isinstance(model, str):
        with open(model, encoding="utf-8") as h:
            model = json.load(h)
    return score_rows(read_features(path), model.get("model", model), col)


# ---------- outputs ----------

def _round(v, nd=4):
    return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else round(float(v), nd)


def build_json(res: dict, feats: dict, inputs: dict, band: dict | None) -> dict:
    import sklearn
    p = res["params"]
    m = json.loads(json.dumps(res["metrics"]))
    for c in ("phase_rule", "current_rule"):
        m[c]["sensitivity"], m[c]["specificity"] = _round(m[c]["sensitivity"]), _round(m[c]["specificity"])
    for c in m["threshold_sensitivity_check"].values():
        c["sensitivity"], c["specificity"] = _round(c["sensitivity"]), _round(c["specificity"])
    for c in (m["leave_one_test_out"]["confusion"], m["photo_set_check"]["confusion"],
              m["rated_steps_only"]["phase_rule"], m["rated_steps_only"]["current_rule"]):
        c["sensitivity"], c["specificity"] = _round(c["sensitivity"]), _round(c["specificity"])
    for g in m["groups"].values():
        for k in list(g):
            if k != "photos":
                g[k] = _round(g[k], 3)
    m["paired_comparison"]["mcnemar_exact_p"] = _round(m["paired_comparison"]["mcnemar_exact_p"])
    m["spearman"]["rho"] = _round(m["spearman"]["rho"])
    m["spearman"]["p_permutation"] = _round(m["spearman"]["p_permutation"], 5)
    m["spearman"]["p_permutation_within_test"] = _round(m["spearman"]["p_permutation_within_test"], 5)
    if band is not None:
        band = json.loads(json.dumps(band))
        band["confusion"]["sensitivity"] = _round(band["confusion"]["sensitivity"])
        band["confusion"]["specificity"] = _round(band["confusion"]["specificity"])
    m["band_brightness_check"] = band
    per_test = {}
    for t, lab in res["labels"].items():
        per_test[t] = {"photos": len(feats[t]), "flame_photos": len(lab), "bright_photos": int(sum(lab.values()))}
    steps = []
    for s in res["steps"]:
        steps.append({"test_id": s["test_id"], "step": s["step"], "flow_cm_s": s["flow_cm_s"],
                      "usable_rate": s["usable"], "pct_error": s["pct_error"], "abs_pct_error": s["abs_pct_error"],
                      "bad": s["bad"], "n_photos": s["n_photos"], "n_bright": s["n_bright"],
                      "photo_set": s["photo_set"], "bright_share": _round(s["bright_share"]),
                      "predicted_unreliable": s["predicted_unreliable"],
                      "current_rule_flag": s["current_rule_flag"], "low_confidence_note": s["low_confidence_note"],
                      "loto_bright_share": _round(s["loto_bright_share"]),
                      "loto_predicted_unreliable": s["loto_predicted_unreliable"],
                      "range_bright_share": _round(s["range_bright_share"])})
    return {
        "_note": (f"{AI_NOTE}. Exploratory flame phase model, written by pipeline/diagnostics/phase_model.py; "
                  "regenerate it, never hand-edit. Designed after the tracker's errors were known. It changes no "
                  "reported rate and not the headline. Small sample; steps within a test are not independent. "
                  "B13b and B13a were held-out for tracker v2 but are in-sample here. The mixture is fitted on photo "
                  f"features only. pct_error is our rate against {TABLE_S1}. Photos: {PHOTOS}."),
        "schema": "flame_phase_model/1",
        "inputs": inputs,
        "model": {"type": "2-component Gaussian mixture, full covariance, on standardized features",
                  "features": ["log10(brightness_p999)", "b_share"],
                  "library": f"scikit-learn {sklearn.__version__}", "random_state": GMM_RANDOM_STATE, "n_init": GMM_N_INIT,
                  "scaler_mean": p["scaler_mean"], "scaler_scale": p["scaler_scale"],
                  "weights": p["weights"], "means": p["means"], "covariances": p["covariances"],
                  "bright_component": p["bright_component"], "component_names": p["component_names"],
                  "parameter_space": "means and covariances are in standardized units: z = (x - scaler_mean) / scaler_scale",
                  "fit": p["fit"], "photos_per_test": per_test},
        "rule": {"bright_share_threshold": RULE_THRESHOLD, "tuned": False,
                 "text": "a step is predicted unreliable if bright_share >= 0.5",
                 "photos": "photos in 25-90% of the step window that have a v1 edge (run.py steady_fit); "
                           "if none has a v1 edge, all flame photos in that range"},
        "outcome": {"bad": "no usable rate, or |pct_error| > 15", "error_band_pct": ERROR_BAND_PCT,
                    "reference": TABLE_S1, "rows": "rows of data/derived/spread_rates.csv that have a NASA rate"},
        "current_rule": "flow_cm_s >= 1, or LOW CONFIDENCE in notes",
        "steps": steps,
        "metrics": m,
    }


def _pct(v) -> str:
    return "n/a" if v is None else f"{100 * v:.0f}%"


def _two_by_two(c: dict, flag: str, clear: str) -> list[str]:
    return [f"| | Bad step | Step not bad | Total |", "|---|---|---|---|",
            f"| {flag} | {c['tp']} | {c['fp']} | {c['tp'] + c['fp']} |",
            f"| {clear} | {c['fn']} | {c['tn']} | {c['fn'] + c['tn']} |",
            f"| Total | {c['tp'] + c['fn']} | {c['fp'] + c['tn']} | {c['n']} |", "",
            f"Sensitivity {_frac(c['tp'], c['tp'] + c['fn'])}. Specificity {_frac(c['tn'], c['tn'] + c['fp'])}. "
            f"Correct calls {c['correct']} of {c['n']}."]


def _frac(a: int, b: int) -> str:
    return f"{a}/{b} ({100 * a / b:.0f}%)" if b else "n/a"


def _name(s: dict) -> str:
    return f"{s['test_id']} {s['flow_cm_s']:g} cm/s"


def verdict(m: dict) -> tuple[str, str]:
    """(word, one plain sentence) for the photo rule against the current rule, from the steps where
    exactly one of them is right (exact McNemar test)."""
    pc = m["paired_comparison"]
    x, y = len(pc["only_photo_rule_right"]), len(pc["only_current_rule_right"])
    if x == 0 and y == 0:
        return "the same", "The two rules make the same call on every step where it matters."
    tail = (f"The rules disagree on {x + y} steps. The photo rule is right on {x} of them and the current rule on {y} "
            f"(exact McNemar p = {pc['mcnemar_exact_p']:.2f}).")
    if pc["mcnemar_exact_p"] < 0.05:
        return ("better" if x > y else "worse"), tail
    return "about the same, with different mistakes", tail + " That is too few steps to tell the rules apart."


def build_markdown(js: dict, res: dict) -> str:
    m, steps, mod = js["metrics"], res["steps"], js["model"]
    ev = [s for s in steps if s["has_nasa_rate"]]
    a, b = m["phase_rule"], m["current_rule"]
    sp, lo = m["spearman"], m["leave_one_test_out"]
    tests = list(mod["photos_per_test"])
    mean = np.array(mod["scaler_mean"]); scale = np.array(mod["scaler_scale"])
    word, sentence = verdict(m)
    missed = [s for s in ev if s["bad"] and not s["predicted_unreliable"]]
    false_alarm = [s for s in ev if not s["bad"] and s["predicted_unreliable"]]
    cur_missed = [s for s in ev if s["bad"] and not s["current_rule_flag"]]
    cur_false = [s for s in ev if not s["bad"] and s["current_rule_flag"]]
    fallback = [s for s in steps if s["photo_set"].startswith("fallback")]
    L = [f"<!-- {AI_NOTE} -->",
         "# Flame phase model: can the photos say where the tracker is unreliable?", "",
         "**This is an exploratory analysis.** It was designed after the tracker's errors were known. "
         "It is a look back, not a test planned in advance. It changes no reported spread rate and it does not "
         f"change the headline. The sample is small: {len(ev)} flow steps from {len(tests)} tests, and steps within one "
         "test are not independent. B13b and B13a were held-out tests for tracker v2. Here they are in-sample, "
         "because their photos helped fit the model.", "",
         "## What",
         "The tracker finds the flame edge by brightness. `pipeline/METHOD.md` says the tracker fails when a flow "
         "step falls in the flame's bright, sooty early phase, and works in the dim blue phase. Today a step counts as "
         "reliable by its airflow (below 1 cm/s) plus a confidence-interval rule. Here we ask a different question: "
         "can the photos alone give that signal?", "",
         "## How",
         "1. **Features.** For every flame photo we take two numbers from `docs/research/flame_features/`: "
         "log10 of `brightness_p999` and `b_share` (the blue share of the flame's colour). "
         "A flame photo is a photo inside the burn window where the tracker found a mask.",
         "2. **Model.** Both features are standardized. Then a Gaussian mixture with 2 components is fitted on the "
         f"flame photos of all {len(tests)} tests together ({mod['library']}, full covariance, random_state {mod['random_state']}, "
         f"n_init {mod['n_init']}). The component with the higher brightness is named **bright**. The other is named "
         "**dim-blue**. The fit sees photo features only. It never sees a spread rate or an error.",
         "3. **Per step.** `bright_share` is the share of bright photos among the photos the step's rate fit uses. "
         "These are the photos in 25 to 90 percent of the step window that have a v1 edge (`run.py`, `steady_fit`). "
         "If no photo in that range has a v1 edge, all flame photos in the range are used.",
         f"4. **Rule.** A step is predicted unreliable if `bright_share` is {RULE_THRESHOLD:g} or more. This number was "
         "fixed before any result and was not tuned.",
         f"5. **Outcome.** Used only to score the rule. A step is **bad** if it has no usable rate, or if its error is "
         f"above {ERROR_BAND_PCT:g}%. That is the band `pipeline/METHOD.md` already uses. The error is our rate against {TABLE_S1}.",
         "6. **Current rule.** For comparison, a step is flagged today if its flow is 1 cm/s or more, or if its notes "
         "say LOW CONFIDENCE.", "",
         "## Results", "",
         "### The two groups of photos",
         "| Group | Share of photos | Centre: log10 brightness | Centre: b_share |", "|---|---|---|---|"]
    for k, name in enumerate(mod["component_names"]):
        c = mean + scale * np.array(mod["means"][k])
        L.append(f"| {name} | {100 * mod['weights'][k]:.0f}% | {c[0]:.2f} | {c[1]:.2f} |")
    L += ["", "| Test | Photos | Flame photos | Bright | Dim-blue |", "|---|---|---|---|---|"]
    for t in tests:
        q = mod["photos_per_test"][t]
        L.append(f"| {t} | {q['photos']} | {q['flame_photos']} | {q['bright_photos']} | {q['flame_photos'] - q['bright_photos']} |")
    tot = [sum(mod["photos_per_test"][t][k] for t in tests) for k in ("photos", "flame_photos", "bright_photos")]
    L += [f"| All | {tot[0]} | {tot[1]} | {tot[2]} | {tot[1] - tot[2]} |", "",
          "Figure: `docs/research/figures/flame_phase.png`. Left: the two features, coloured by group, one marker "
          "shape per test. Right: `bright_share` against the error of each step.", "",
          "### Every step",
          f"Flow and error are from `data/derived/spread_rates.csv`. The error is against {TABLE_S1}.", "",
          "| Test | Flow (cm/s) | Error | Outcome | Photos | bright_share | Photo rule | Current rule | bright_share, test left out |",
          "|---|---|---|---|---|---|---|---|---|"]
    for s in steps:
        err = f"{s['pct_error']:+.1f}%" if s["pct_error"] is not None else "no usable rate"
        out = "n/a" if s["bad"] is None else ("bad" if s["bad"] else "ok")
        n = f"{s['n_photos']}" + (" (fallback)" if s["photo_set"].startswith("fallback") else "")
        share = "n/a" if s["bright_share"] is None else f"{s['bright_share']:.2f}"
        lshare = "n/a" if s["loto_bright_share"] is None else f"{s['loto_bright_share']:.2f}"
        L.append(f"| {s['test_id']} | {s['flow_cm_s']:g} | {err} | {out} | {n} | {share} | "
                 f"{'unreliable' if s['predicted_unreliable'] else 'reliable'} | "
                 f"{'flagged' if s['current_rule_flag'] else 'not flagged'} | {lshare} |")
    if fallback:
        L += ["", f"\"(fallback)\" marks the {len(fallback)} steps where no photo in the fit range has a v1 edge, "
                  "so all flame photos in the range were used."]
    L += ["", f"### Photo rule: bright_share at {RULE_THRESHOLD:g} or more means unreliable"]
    L += _two_by_two(a, "Predicted unreliable", "Predicted reliable")
    L += ["", "### Current rule: flow at 1 cm/s or more, or LOW CONFIDENCE"]
    L += _two_by_two(b, "Flagged", "Not flagged")
    L += ["", "### Rank correlation",
          f"Spearman rho between `bright_share` and the absolute error is **{sp['rho']:+.2f}** over the {sp['n']} steps "
          f"that have a rate. The permutation p-value is **{_p_text(sp['p_permutation'], sp['shuffles_at_or_above'], sp['n_permutations'])}** (two-sided, {sp['n_permutations']:,} "
          f"shuffles, seed {sp['seed']}). A stricter check shuffles the errors only inside each test, because steps of "
          f"one test are not independent. That gives p = {sp['p_permutation_within_test']:.3f}.", "",
          "### Sensitivity check: other thresholds",
          "This is a check only. These thresholds are not the rule and were not used to pick it.", "",
          "| Threshold | Bad and predicted unreliable | Not bad but predicted unreliable | Bad but predicted reliable | Not bad and predicted reliable | Sensitivity | Specificity |",
          "|---|---|---|---|---|---|---|"]
    rows_thr = [(f"{thr:g}", m["threshold_sensitivity_check"][f"{thr:g}"]) for thr in CHECK_THRESHOLDS]
    rows_thr.insert(1, (f"{RULE_THRESHOLD:g} (the rule)", a))
    for name, c in rows_thr:
        L.append(f"| {name} | {c['tp']} | {c['fp']} | {c['fn']} | {c['tn']} | {_frac(c['tp'], c['tp'] + c['fn'])} | {_frac(c['tn'], c['tn'] + c['fp'])} |")
    L += ["", "### Stability: leave one test out",
          "For each test we fitted the mixture again without that test's photos, labelled its photos with that fit, "
          "and computed its steps again.",
          f"- Step predictions that change: **{lo['n_predictions_changed']} of {lo['n_steps']}**"
          + (f" ({', '.join(lo['changed_steps'])})." if lo["changed_steps"] else "."),
          f"- Photo labels that stay the same: {lo['photo_labels_same']} of {lo['photo_labels_total']}.",
          f"- With the left-out labels the photo rule's table is {lo['confusion']['tp']} / {lo['confusion']['fp']} / "
          f"{lo['confusion']['fn']} / {lo['confusion']['tn']} (bad and flagged / not bad and flagged / bad and not flagged / "
          "not bad and not flagged).", "",
          "### Other checks",
          f"- **Which photos.** Using all flame photos in the fit range for every step, not only the ones with a v1 edge, "
          f"changes {m['photo_set_check']['n_predictions_changed']} of {len(steps)} predictions."]
    bc = m.get("band_brightness_check")
    if bc:
        L.append(f"- **Frame size.** `brightness_p999` is taken over the cached frame, and B16's cache keeps more rows than "
                 f"the others. Fitting the same model on `brightness_p999_band` (the same rows in every test) changes "
                 f"{bc['n_predictions_changed']} of {len(steps)} predictions"
                 + (f" ({', '.join(bc['changed_steps'])})." if bc["changed_steps"] else "."))
    L += ["", "## Reading the result",
          f"- **Compared with the flow rule: {word}.** {sentence} The photo rule gets {a['correct']} of {a['n']} steps right. "
          f"The current rule gets {b['correct']} of {b['n']} right.",
          f"- The photo rule misses {len(missed)} bad " + ("step" if len(missed) == 1 else "steps")
          + (": " + ", ".join(_name(s) for s in missed) + "." if missed else "."),
          f"- The photo rule raises {len(false_alarm)} false " + ("alarm" if len(false_alarm) == 1 else "alarms")
          + (": " + ", ".join(_name(s) for s in false_alarm) + "." if false_alarm else "."),
          f"- The current rule misses {len(cur_missed)} bad " + ("step" if len(cur_missed) == 1 else "steps")
          + (": " + ", ".join(_name(s) for s in cur_missed) + "." if cur_missed else ".")
          + f" It raises {len(cur_false)} false " + ("alarm" if len(cur_false) == 1 else "alarms")
          + (": " + ", ".join(_name(s) for s in cur_false) + "." if cur_false else "."),
          f"- With {a['n']} steps, a difference of one or two steps between the rules is not evidence that one is better."]
    L += READING_EXTRA
    L += ["", "## Limits",
          "- **Exploratory.** The analysis was designed after the errors were known. The features, the model and the "
          "15% band could have been chosen in other ways. A planned test on new data would be needed to confirm anything here.",
          f"- **Small sample.** {len(ev)} steps from {len(tests)} tests. Steps within a test share a rod, a camera setup and a "
          "flame history, so they are not independent. The permutation p-value treats the steps as exchangeable, so it is "
          "too optimistic.",
          "- **No held-out test yet.** B13b and B13a were held-out for tracker v2, but they are in-sample here. The "
          "leave-one-test-out check refits the mixture, but the rule and the features were still chosen with all six tests in view.",
          "- **One failure type only.** The rule looks for the bright phase. A step can also fail because the flame is too "
          "dim or too small for the tracker's area gate. Those photos are dim-blue, so this rule cannot flag them.",
          "- **No reported number changes.** The spread rates, the edges and the headline in `pipeline/METHOD.md` stay as they are. "
          "The reliable set is still defined by flow plus the confidence-interval rule.",
          "- **Brightness across tests.** Brightness is compared between tests. That assumes the same aperture and ISO in "
          "every test. We did not re-check the camera settings of each test here.",
          "- **The blue line is a diagnostic line.** This model does not use the blue-light edge. It uses the colour inside "
          "the v1 mask. A fused edge (blue plus brightness) was tested on held-out tests under a rule fixed in advance "
          "(`pipeline/PREREGISTRATION.md`) and it did not beat v1. So v1 stays, and the blue line should be labelled a "
          "diagnostic line, not the leading edge.", "",
          "## Score a new test",
          "The fitted parameters are saved in `docs/research/flame_phase_model.json` (scaler means and scales, component "
          "weights, means and covariances). A new test can be scored without a refit:", "",
          "```sh", "cd pipeline",
          "python -m diagnostics.flame_features --tests NEW --cache NEW=<frame cache>   # writes docs/research/flame_features/NEW.csv",
          "python -m diagnostics.phase_model --score ../docs/research/flame_features/NEW.csv",
          "```", "",
          "A test scored this way is out-of-sample for the mixture. Do not refit with it before its result is written down.", "",
          "## Reproduce",
          "From `pipeline/`: `python -m diagnostics.flame_features`, then `python -m diagnostics.phase_model`. "
          "Tests: `python -m pytest -q tests/test_flame_features.py tests/test_phase_model.py`. "
          "The JSON lists the sha256 of every input file.", "",
          "## Sources for the numbers",
          "- Group centres, shares and photo counts: `docs/research/flame_phase_model.json`, fields `model.means`, `model.weights`, `model.photos_per_test`.",
          "- Flow, error, outcome and the LOW CONFIDENCE flag of every step: `data/derived/spread_rates.csv`, columns `flow_cm_s`, `pct_error`, `rate_mm_s`, `notes` (read only).",
          "- Photo brightness and blue share: `docs/research/flame_features/<test>.csv`, columns `brightness_p999`, `b_share`, `fit_step`, `edge_mm`.",
          "- Both 2x2 tables, sensitivity, specificity, rho, p-values, leave-one-test-out and the threshold check: `docs/research/flame_phase_model.json`, section `metrics`.",
          f"- {TABLE_S1} (published spread rates behind `pct_error`, used only to score the rule).",
          f"- {PHOTOS} (raw photos).", "",
          "## For the humans to decide",
          "- Whether to mention this diagnostic in the pitch at all. It is exploratory and changes no reported number, so the safe choice is to keep it in the repo and out of the headline.",
          "- Whether to keep the flow rule as the only reliability flag. Nothing here argues for replacing it.",
          "- Whether to score the next new test with the saved model (`--score`) and write the result down before looking at its error.",
          "- A fairness note: the LOW CONFIDENCE part of the current rule comes from each fit's confidence interval, which is partly tied to the error. The photo rule does not use it.", ""]
    return "\n".join(L)


READING_EXTRA: list[str] = []   # extra plain-English bullets for "Reading the result" (none by default)


TEST_MARKERS = {"B16": "o", "B19": "s", "B12": "^", "P17": "D", "B13b": "v", "B13a": "P"}
EXTRA_MARKERS = ["X", "*", "h", "<", ">", "p"]
C_BRIGHT, C_DIM, INK, MUTED, GRID = "#D55E00", "#0072B2", "#222222", "#666666", "#DDDDDD"


def make_figure(res: dict, feats: dict, path: str) -> str:
    """Left: the two features, coloured by component, one marker shape per test. Right: bright_share
    against |pct_error| per step, steps with no usable rate in a strip at the top."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    params, steps = res["params"], [s for s in res["steps"] if s["has_nasa_rate"]]
    tests = list(feats)
    marker = {t: TEST_MARKERS.get(t, EXTRA_MARKERS[i % len(EXTRA_MARKERS)]) for i, t in enumerate(tests)}
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(12.5, 5.6), dpi=160)
    fig.patch.set_facecolor("white")

    # left: photos
    allx = []
    for t in tests:
        idx = flame_index(feats[t])
        if not idx:
            continue
        X = feature_matrix(feats[t], idx)
        allx.append(X)
        br = np.array([res["labels"][t][i] for i in idx])
        for sel, col in ((br, C_BRIGHT), (~br, C_DIM)):
            ax.scatter(X[sel, 0], X[sel, 1], s=26, marker=marker[t], facecolor=col, edgecolor="white",
                       linewidth=0.4, alpha=0.8, zorder=3)
    X = np.vstack(allx)
    pad = 0.06 * (X.max(0) - X.min(0))
    x0, x1, y0, y1 = X[:, 0].min() - pad[0], X[:, 0].max() + pad[0], X[:, 1].min() - pad[1], X[:, 1].max() + pad[1]
    gx, gy = np.meshgrid(np.linspace(x0, x1, 300), np.linspace(y0, y1, 300))
    P = bright_probability(params, np.column_stack([gx.ravel(), gy.ravel()])).reshape(gx.shape)
    ax.contour(gx, gy, P, levels=[0.5], colors=MUTED, linewidths=1.0, linestyles="--", zorder=2)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1)
    ax.set_xlabel("log10 of photo brightness (99.9th percentile, linear units per second)", color=INK)
    ax.set_ylabel("Blue share of the flame's colour (b_share)", color=INK)
    ax.set_title("Flame photos fall into two groups", loc="left", color=INK, fontsize=12)
    n_b = int(sum(sum(v.values()) for v in res["labels"].values())); n_all = int(sum(len(v) for v in res["labels"].values()))
    h1 = [Line2D([], [], marker="o", linestyle="", markerfacecolor=C_BRIGHT, markeredgecolor="white", markersize=8, label=f"bright ({n_b} photos)"),
          Line2D([], [], marker="o", linestyle="", markerfacecolor=C_DIM, markeredgecolor="white", markersize=8, label=f"dim-blue ({n_all - n_b} photos)"),
          Line2D([], [], color=MUTED, linestyle="--", linewidth=1.0, label="equal chance of either group")]
    leg1 = ax.legend(handles=h1, loc="upper right", frameon=False, fontsize=9, title="Group (from the photos only)", title_fontsize=9)
    leg1._legend_box.align = "left"
    ax.add_artist(leg1)
    h2 = [Line2D([], [], marker=marker[t], linestyle="", markerfacecolor=MUTED, markeredgecolor="white", markersize=7, label=t) for t in tests]
    ax.legend(handles=h2, loc="lower left", frameon=False, fontsize=9, title="Test", title_fontsize=9, ncol=2)

    # right: steps
    rated = [s for s in steps if s["usable"] and s["bright_share"] is not None]
    norate = [s for s in steps if not s["usable"] and s["bright_share"] is not None]
    top = max([s["abs_pct_error"] for s in rated] + [ERROR_BAND_PCT]) * 1.08
    strip = top * 1.13
    bx.axvspan(RULE_THRESHOLD, 1.06, color="#F2F2F2", zorder=0)
    bx.axhline(ERROR_BAND_PCT, color=MUTED, linestyle="--", linewidth=1.0, zorder=1)
    bx.axvline(RULE_THRESHOLD, color=MUTED, linestyle="-", linewidth=1.0, zorder=1)
    bx.axhline(top * 1.035, color=GRID, linewidth=1.0, zorder=1)
    for s in rated:
        bx.scatter(s["bright_share"], s["abs_pct_error"], s=62, marker=marker[s["test_id"]], facecolor=INK,
                   edgecolor="white", linewidth=0.8, zorder=3)
    seen = {}
    for s in norate:   # same share -> spread sideways so every mark shows
        j = seen[round(s["bright_share"], 2)] = seen.get(round(s["bright_share"], 2), -1) + 1
        dx = 0.035 * j * (-1 if s["bright_share"] > 0.5 else 1)
        bx.scatter(s["bright_share"] + dx, strip, s=62, marker=marker[s["test_id"]], facecolor="white",
                   edgecolor=INK, linewidth=1.3, zorder=3)
    for s in steps:    # name only the steps the photo rule gets wrong
        if s["bright_share"] is None or s["bad"] == s["predicted_unreliable"] or not s["usable"]:
            continue
        right = s["bright_share"] < 0.5
        bx.annotate(f"{s['test_id']} {s['flow_cm_s']:g} cm/s", (s["bright_share"], s["abs_pct_error"]),
                    xytext=(9 if right else -9, 0), textcoords="offset points", ha="left" if right else "right",
                    va="center", fontsize=8.5, color=INK)
    bx.set_xlim(-0.06, 1.06); bx.set_ylim(0, strip * 1.07)
    ticks = [v for v in (0, 15, 25, 50, 75, 100, 150, 200) if v <= top]
    bx.set_yticks(ticks + [strip]); bx.set_yticklabels([f"{v}%" for v in ticks] + ["no usable\nrate"])
    bx.set_xticks([0, 0.25, 0.5, 0.75, 1.0])
    bx.set_xlabel("bright_share: share of the step's fit photos in the bright group", color=INK)
    bx.set_ylabel("Absolute error against Table S1", color=INK)
    bx.set_title("Does a bright step mean a bad step?", loc="left", color=INK, fontsize=12)
    bx.text(RULE_THRESHOLD - 0.02, strip * 1.035, "rule: reliable", ha="right", va="center", fontsize=9, color=MUTED)
    bx.text(RULE_THRESHOLD + 0.02, strip * 1.035, "rule: unreliable", ha="left", va="center", fontsize=9, color=MUTED)
    bx.text(1.05, ERROR_BAND_PCT + top * 0.012, f"{ERROR_BAND_PCT:g}% band", ha="right", va="bottom", fontsize=8.5, color=MUTED)
    h3 = [Line2D([], [], marker="o", linestyle="", markerfacecolor=INK, markeredgecolor="white", markersize=8, label="step with a rate"),
          Line2D([], [], marker="o", linestyle="", markerfacecolor="white", markeredgecolor=INK, markersize=8, label="step with no usable rate")]
    bx.legend(handles=h3, loc="center left", bbox_to_anchor=(0.02, 0.62), frameon=False, fontsize=9)
    for a_ in (ax, bx):
        a_.grid(True, color=GRID, linewidth=0.6, zorder=0)
        a_.set_axisbelow(True)
        a_.tick_params(colors=INK, labelsize=9)
        for side in ("top", "right"):
            a_.spines[side].set_visible(False)
        for side in ("left", "bottom"):
            a_.spines[side].set_color(MUTED)
    fig.text(0.01, 0.012, f"Exploratory: designed after the errors were known. Photos: {PHOTOS}. "
                          f"\nErrors against {TABLE_S1}. {AI_NOTE}.", fontsize=7.5, color=MUTED, ha="left", va="bottom")
    fig.tight_layout(rect=(0, 0.06, 1, 1))
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    fig.savefig(path, dpi=160, facecolor="white",
                metadata={"Title": "Flame phase model (exploratory)", "Description": f"{AI_NOTE}. Photos: {PHOTOS}.",
                          "Software": "pipeline/diagnostics/phase_model.py"})
    plt.close(fig)
    return path


# ---------- CLI ----------

def load_features(features_dir: str, tests: list[str]) -> dict:
    feats = {}
    for t in tests:
        p = os.path.join(features_dir, f"{t}.csv")
        if not os.path.exists(p):
            raise SystemExit(f"no feature table {p}; run `python -m diagnostics.flame_features --tests {t}` first")
        feats[t] = read_features(p)
    return feats


def print_summary(js: dict) -> None:
    m = js["metrics"]
    for name, key in (("photo rule (bright_share >= 0.5)", "phase_rule"), ("current rule (flow >= 1 or LOW CONFIDENCE)", "current_rule")):
        c = m[key]
        print(f"{name}: bad&flagged {c['tp']}, ok&flagged {c['fp']}, bad&not flagged {c['fn']}, ok&not flagged {c['tn']}; "
              f"sensitivity {c['sensitivity']}, specificity {c['specificity']}")
    sp, lo = m["spearman"], m["leave_one_test_out"]
    print(f"Spearman rho {sp['rho']} (n={sp['n']}), permutation p {sp['p_permutation']} "
          f"(within-test p {sp['p_permutation_within_test']})")
    print(f"leave-one-test-out: {lo['n_predictions_changed']} of {lo['n_steps']} step predictions change {lo['changed_steps']}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Exploratory flame phase model (photo features only).")
    ap.add_argument("--repo", default=DEFAULT_REPO, help="repo root")
    ap.add_argument("--features-dir", default=None, help="folder of per-photo feature CSVs")
    ap.add_argument("--spread", default=None, help="spread_rates.csv")
    ap.add_argument("--tests", nargs="+", default=TESTS, help="tests the mixture is fitted on")
    ap.add_argument("--json", default=None); ap.add_argument("--md", default=None); ap.add_argument("--fig", default=None)
    ap.add_argument("--no-figure", action="store_true")
    ap.add_argument("--score", metavar="FEATURE_CSV", help="score a NEW test with the saved model; nothing is refitted "
                                                           "and none of the model's files is rewritten")
    ap.add_argument("--model", default=None, help="--score: saved model JSON (default <repo>/docs/research/flame_phase_model.json)")
    ap.add_argument("--out", default=None, help="--score: also write the scored steps to this JSON file")
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)
    spread = a.spread or os.path.join(repo, SPREAD_REL)
    jpath = a.json or os.path.join(repo, JSON_REL)
    if a.score:
        sc = score_feature_csv(a.score, a.model or jpath)
        known = {(s["test_id"], s["step"]): s for s in spread_steps(read_spread(spread))} if os.path.exists(spread) else {}
        print(f"{sc['test_id']}: {sc['n_photos']} photos, {sc['n_flame_photos']} flame photos, {sc['n_bright_photos']} bright "
              f"(saved model, no refit)")
        for s in sc["steps"]:
            k = known.get((sc["test_id"], s["step"]))
            extra = ""
            if k:
                err = f"{k['pct_error']:+.1f}%" if k["pct_error"] is not None else "no usable rate"
                extra = f" | flow {k['flow_cm_s']:g} cm/s, error {err}, current rule {'flagged' if k['current_rule_flag'] else 'not flagged'}"
                s.update({"flow_cm_s": k["flow_cm_s"], "pct_error": k["pct_error"], "usable_rate": k["usable"],
                          "bad": k["bad"], "current_rule_flag": k["current_rule_flag"]})
            share = "n/a" if s["bright_share"] is None else f"{s['bright_share']:.2f}"
            print(f"  step {s['step']}: bright_share {share} over {s['n_photos']} photos ({s['photo_set']}) -> "
                  f"predicted {'unreliable' if s['predicted_unreliable'] else 'reliable'}{extra}")
        if a.out:
            out = {"_note": f"{AI_NOTE}. A test scored with the saved flame phase model (no refit). Exploratory.",
                   "model_file": os.path.basename(a.model or jpath), "test_id": sc["test_id"],
                   "n_photos": sc["n_photos"], "n_flame_photos": sc["n_flame_photos"],
                   "n_bright_photos": sc["n_bright_photos"], "steps": sc["steps"]}
            with open(a.out, "w", encoding="utf-8", newline="\n") as h:
                json.dump(out, h, indent=1); h.write("\n")
        return 0
    fdir = a.features_dir or os.path.join(repo, FEATURES_REL)
    feats = load_features(fdir, a.tests)
    spread_rows = read_spread(spread)
    res = analyse(feats, spread_rows)
    band = band_check(feats, spread_rows, res["steps"])
    rel = lambda p: os.path.relpath(os.path.abspath(p), repo).replace(os.sep, "/")
    inputs = {"spread_rates": {"path": rel(spread), "sha256": sha256_file(spread)},
              "features": {t: {"path": rel(os.path.join(fdir, f"{t}.csv")), "sha256": sha256_file(os.path.join(fdir, f"{t}.csv"))}
                           for t in a.tests}}
    js = build_json(res, feats, inputs, band)
    os.makedirs(os.path.dirname(os.path.abspath(jpath)), exist_ok=True)
    with open(jpath, "w", encoding="utf-8", newline="\n") as h:
        json.dump(js, h, indent=1); h.write("\n")
    mpath = a.md or os.path.join(repo, MD_REL)
    with open(mpath, "w", encoding="utf-8", newline="\n") as h:
        h.write(build_markdown(js, res))
    print_summary(js)
    print(jpath); print(mpath)
    if not a.no_figure:
        print(make_figure(res, feats, a.fig or os.path.join(repo, FIG_REL)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
