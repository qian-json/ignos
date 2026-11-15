# Written with AI assistance (Claude Code)
"""Tests for pipeline/diagnostics/phase_model.py: synthetic clusters separate, bright_share is right on a
toy step, saved parameters reproduce the labels without a refit, and the committed JSON scores its own photos."""
import json, os, sys
import numpy as np
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
pytest.importorskip("sklearn")
from diagnostics import phase_model as pm

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SAVED = os.path.join(REPO, "docs", "research", "flame_phase_model.json")


def two_clusters(n=60, seed=3):
    rng = np.random.default_rng(seed)
    bright = np.column_stack([rng.normal(2.8, 0.05, n), rng.normal(0.25, 0.02, n)])
    dim = np.column_stack([rng.normal(2.0, 0.05, n), rng.normal(0.50, 0.02, n)])
    return np.vstack([bright, dim]), np.r_[np.ones(n, bool), np.zeros(n, bool)]


def test_synthetic_clusters_separate():
    X, truth = two_clusters()
    params = pm.fit_mixture(X)
    assert params["component_names"][params["bright_component"]] == "bright"
    assert np.array_equal(pm.is_bright(params, X), truth)


def test_saved_parameters_reproduce_labels_without_refit():
    X, _ = two_clusters()
    fitted = pm.fit_mixture(X)
    params = json.loads(json.dumps(fitted))     # round trip like the saved file
    rng = np.random.default_rng(9)
    new = np.column_stack([rng.uniform(1.9, 2.9, 40), rng.uniform(0.2, 0.55, 40)])
    assert np.array_equal(pm.is_bright(params, X), pm.is_bright(fitted, X))
    assert np.array_equal(pm.is_bright(params, new), pm.is_bright(fitted, new))


def test_fit_is_deterministic():
    X, _ = two_clusters()
    assert pm.fit_mixture(X)["means"] == pm.fit_mixture(X)["means"]


def toy_rows():
    rows = []
    for i, (fs, edge) in enumerate([("1", "1.0"), ("1", "2.0"), ("1", "3.0"), ("1", "4.0"), ("2", "5.0"), ("", "6.0")]):
        rows.append({"test_id": "T", "t_s": str(i), "edge_mm": edge, "fit_step": fs, "in_burn_window": "1",
                     "b_share": "0.3", "brightness_p999": "100"})
    rows[3]["edge_mm"] = ""        # in range but no v1 edge: not used by the fit
    return rows


def test_bright_share_on_toy_step():
    rows = toy_rows()
    bright = {0: True, 1: True, 2: False, 3: True, 4: False, 5: True}
    r = pm.step_share(rows, bright, 1)
    assert (r["n_photos"], r["n_bright"], r["bright_share"]) == (3, 2, pytest.approx(2 / 3))
    assert pm.step_share(rows, bright, 1, "range")["n_photos"] == 4
    assert pm.step_share(rows, bright, 2)["bright_share"] == 0.0
    assert pm.step_share(rows, bright, 9)["bright_share"] is None
    assert pm.predicted_unreliable(0.5) and not pm.predicted_unreliable(0.49) and not pm.predicted_unreliable(None)


def test_confusion_and_current_rule():
    c = pm.confusion([True, True, False, False], [True, False, True, False])
    assert (c["tp"], c["fp"], c["fn"], c["tn"]) == (1, 1, 1, 1)
    assert pm.current_rule(1.0, "") and pm.current_rule(0.5, "LOW CONFIDENCE x") and not pm.current_rule(0.9, "ok")


def test_permutation_p_is_fixed_seed():
    x = list(range(12))
    y = [v + (v % 3) for v in x]
    a = pm.permutation_p(x, y, n_perm=500)
    b = pm.permutation_p(x, y, n_perm=500)
    assert a == b and a[0] > 0.9 and a[1] < 0.01


@pytest.mark.skipif(not os.path.exists(SAVED), reason="model JSON not generated yet")
def test_committed_json_scores_its_own_features():
    with open(SAVED, encoding="utf-8") as h:
        js = json.load(h)
    assert js["model"]["n_init"] >= 5 and js["rule"]["bright_share_threshold"] == 0.5 and not js["rule"]["tuned"]
    for t, info in js["inputs"]["features"].items():
        p = os.path.join(REPO, info["path"])
        if not os.path.exists(p):
            pytest.skip("feature CSV missing")
        sc = pm.score_feature_csv(p, SAVED)
        want = {s["step"]: s["bright_share"] for s in js["steps"] if s["test_id"] == t}
        for s in sc["steps"]:
            if s["step"] in want and want[s["step"]] is not None:
                assert s["bright_share"] == pytest.approx(want[s["step"]], abs=1e-3)
