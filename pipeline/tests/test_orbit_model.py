# Written with AI assistance (Claude Code)
"""Orbit model tests (pipeline/diagnostics/orbit_model.py): the cross-validation splitter never leaks a
sample, a synthetic power law is recovered, and the grid never leaves the measured ranges.
Synthetic data plus the committed Table S1 file. No network. Skipped if scikit-learn is missing."""
import sys, os, json, re
import numpy as np
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
pytest.importorskip("sklearn")
from diagnostics import orbit_model as om

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TABLE = os.path.join(REPO, "data", "reference", "link2018_table_s1.csv")
OURS = os.path.join(REPO, "data", "derived", "spread_rates.csv")
PUBLISHED = os.path.join(REPO, "docs", "research", "orbit_model.json")
needs_table = pytest.mark.skipif(not os.path.exists(TABLE), reason="Table S1 file not in this checkout")
needs_published = pytest.mark.skipif(not (os.path.exists(PUBLISHED) and os.path.exists(TABLE)),
                                     reason="docs/research/orbit_model.json not generated yet")

TRUE = {"a": -6.0, "b": 0.30, "c": 0.15, "d": -0.80}   # ln(rate) = a + b ln(flow) + c O2 + d ln(diameter)


def synthetic_table(n_samples=14, rows_per_sample=3, noise=0.02, seed=1, bump=0.0):
    """Samples of 3 rows each. One rod and one O2 per sample, like Table S1. bump > 0 adds a rise-then-fall
    in ln(flow) that no power law can follow."""
    rng = np.random.default_rng(seed)
    sample, step, flow, o2, d_mm, rate = [], [], [], [], [], []
    for k in range(n_samples):
        dk, ok = (6.4, 9.5, 12.7)[k % 3], round(float(rng.uniform(17.0, 21.0)), 1)
        for j in range(rows_per_sample):
            f = round(float(np.exp(rng.uniform(np.log(0.5), np.log(6.0)))), 2)
            ln_r = TRUE["a"] + TRUE["b"] * np.log(f) + TRUE["c"] * ok + TRUE["d"] * np.log(dk)
            ln_r += -bump * (np.log(f) - np.log(1.7)) ** 2 + rng.normal(0.0, noise)
            sample.append(f"S{k}"); step.append(j + 1); flow.append(f); o2.append(ok); d_mm.append(dk)
            rate.append(float(np.exp(ln_r)))
    return om.make_table(sample, step, flow, o2, d_mm, rate)


# ------------------------------------------------------------------ the splitter never leaks a sample
def check_folds(groups):
    groups = np.asarray(groups)
    folds = list(om.leave_one_sample_out(groups))
    assert [g for g, _, _ in folds] == list(dict.fromkeys(groups.tolist()))   # one fold per sample
    tested = np.zeros(len(groups), int)
    for g, train, test in folds:
        assert set(groups[test].tolist()) == {g}                 # the test fold is exactly one sample
        assert g not in set(groups[train].tolist())              # and none of its rows is in train
        assert len(np.intersect1d(train, test)) == 0
        assert len(train) + len(test) == len(groups)             # every row of the sample is held out
        tested[test] += 1
    assert (tested == 1).all()                                   # every row is held out exactly once


def test_splitter_never_leaks_a_sample_synthetic():
    rng = np.random.default_rng(3)
    check_folds(rng.choice(["a", "b", "c", "d", "e"], size=40))   # shuffled, uneven groups
    check_folds(["x", "y", "x", "z", "y", "x"])
    check_folds(["only"] * 4)


@needs_table
def test_splitter_never_leaks_a_sample_table_s1():
    t = om.load_table_s1(TABLE)
    assert len(t) == 52 and len(set(t.sample.tolist())) == 19
    check_folds(t.sample)
    check_folds([om.rod_group(s) for s in t.sample])
    assert om.rod_group("B13a") == om.rod_group("B13b") == "B13" and om.rod_group("B1") == "B1"
    assert len({om.rod_group(s) for s in t.sample}) == 17


def test_cross_validate_never_shows_the_held_out_sample_to_the_model():
    t = synthetic_table()
    seen = []

    class Spy:
        def fit(self, X, rate):
            self.rate = set(np.round(rate, 12).tolist())
            return self

        def predict(self, X):
            seen.append(self.rate)
            return np.zeros(len(X)), None, None

    X = om.features(t.flow, t.o2, t.d_mm)
    om.cross_validate(Spy, X, t.rate, t.sample)
    folds = list(om.leave_one_sample_out(t.sample))
    assert len(seen) == len(folds) == 14
    for (g, train, test), train_rates in zip(folds, seen):
        assert not (set(np.round(t.rate[test], 12).tolist()) & train_rates)   # synthetic rates are all distinct
        assert len(train_rates) == len(train)


# ------------------------------------------------------------- a synthetic power law is recovered
def test_synthetic_power_law_is_recovered():
    t = synthetic_table(noise=0.02)
    X = om.features(t.flow, t.o2, t.d_mm)
    fit = om.LogLinearModel().fit(X, t.rate)
    assert abs(fit.coef[1] - TRUE["b"]) < 0.03
    assert abs(fit.coef[2] - TRUE["c"]) < 0.02
    assert abs(fit.coef[3] - TRUE["d"]) < 0.08
    assert abs(np.sqrt(fit.s2) - 0.02) < 0.01

    cv = om.run_cv(om.model_makers(n_restarts=2), X, t.rate, t.sample)
    med = {m: cv[m]["metrics"]["median_ape_pct"] for m in om.MODEL_ORDER}
    assert med["loglinear"] < 3.0            # about the 2% noise that was put in
    assert med["gp"] < 4.0                   # the GP finds the same surface
    assert med["mean"] > 5 * med["loglinear"]
    assert med["forest"] > med["loglinear"]
    assert cv["loglinear"]["metrics"]["coverage95"] >= 0.85
    assert cv["gp"]["metrics"]["coverage95"] >= 0.80
    assert cv["forest"]["lo"] is None        # the forest has no interval of its own
    chosen, best, close = om.select_model(med)
    assert chosen == "loglinear"             # the true form, and the simplest model near the best score


def test_gp_wins_when_the_data_bend_and_the_power_law_cannot():
    t = synthetic_table(n_samples=20, noise=0.02, bump=0.35, seed=2)
    X = om.features(t.flow, t.o2, t.d_mm)
    cv = om.run_cv(om.model_makers(n_restarts=2), X, t.rate, t.sample)
    med = {m: cv[m]["metrics"]["median_ape_pct"] for m in om.MODEL_ORDER}
    assert med["gp"] < med["loglinear"] - om.TIE_PP
    assert om.select_model(med)[0] in ("gp", "forest")


def test_gp_interval_and_contrast_on_a_power_law():
    t = synthetic_table(noise=0.02)
    X = om.features(t.flow, t.o2, t.d_mm)
    gp = om.GPModel(n_restarts=2).fit(X, t.rate)
    rate, lo, hi = gp.predict(X)
    assert (lo < rate).all() and (rate < hi).all() and (lo > 0).all()
    ratio, r_lo, r_hi = gp.contrast(om.features([1.0], [19.0], [9.5])[0], om.features([2.0], [19.0], [9.5])[0])
    assert r_lo < 2.0 ** TRUE["b"] < r_hi and abs(ratio - 2.0 ** TRUE["b"]) < 0.05   # doubling the flow
    ll = om.LogLinearModel().fit(X, t.rate)
    ratio, r_lo, r_hi = ll.contrast(om.features([1.0], [19.0], [9.5])[0], om.features([1.0], [20.0], [9.5])[0])
    assert r_lo < np.exp(TRUE["c"]) < r_hi                                            # one more percent O2


def test_selection_rule():
    # lowest score wins when nothing is within 1 point
    assert om.select_model({"mean": 30.0, "loglinear": 20.0, "gp": 12.0, "forest": 15.0})[0] == "gp"
    # within 1 point: the simpler model is published, the lowest score is still reported
    chosen, best, close = om.select_model({"mean": 30.0, "loglinear": 12.9, "gp": 12.0, "forest": 12.5})
    assert (chosen, best, close) == ("loglinear", "gp", ["loglinear", "gp", "forest"])
    # just over 1 point away does not count
    assert om.select_model({"mean": 30.0, "loglinear": 13.01, "gp": 12.0, "forest": 14.0})[0] == "gp"
    # nothing beats the baseline by more than a point: the baseline is published
    assert om.select_model({"mean": 12.5, "loglinear": 12.2, "gp": 12.0, "forest": 12.4})[0] == "mean"
    assert om.select_model({"mean": 10.0, "loglinear": 10.0, "gp": 10.0, "forest": 10.0})[0] == "mean"


# ---------------------------------------------------- the grid has no point outside the measured ranges
def check_grid(grids, t):
    assert [g["rod_d_mm"] for g in grids] == sorted(set(t.d_mm.tolist()))   # only diameters in the data
    for g in grids:
        s = t.d_mm == g["rod_d_mm"]
        f_lo, f_hi, o_lo, o_hi = t.flow[s].min(), t.flow[s].max(), t.o2[s].min(), t.o2[s].max()
        flows, o2s = np.array(g["flow_cm_s"]), np.array(g["o2_pct"])
        assert (flows >= f_lo).all() and (flows <= f_hi).all()
        assert (o2s >= o_lo).all() and (o2s <= o_hi).all()
        assert flows.min() > 0                                              # never zero flow
        assert g["measured_flow_range_cm_s"] == [f_lo, f_hi] and g["measured_o2_range_pct"] == [o_lo, o_hi]
        assert flows[0] == f_lo and flows[-1] == f_hi and o2s[0] == o_lo and o2s[-1] == o_hi
        assert (np.diff(flows) > 0).all() and (np.diff(o2s) > 0).all()
        for key in ("rate_mm_s", "lo95_mm_s", "hi95_mm_s", "nearest_row_distance", "nearest_row_index"):
            assert np.array(g[key]).shape == (len(o2s), len(flows)), key
        rate, lo, hi = (np.array(g[k]) for k in ("rate_mm_s", "lo95_mm_s", "hi95_mm_s"))
        assert (lo <= rate).all() and (rate <= hi).all() and (lo >= 0).all()
        assert (np.array(g["nearest_row_distance"]) >= 0).all()
        assert np.array(g["nearest_row_index"]).max() < len(g["measured_rows"]) == int(s.sum())


@needs_table
def test_grid_has_no_point_outside_the_measured_ranges():
    t = om.load_table_s1(TABLE)
    model = om.LogLinearModel().fit(om.features(t.flow, t.o2, t.d_mm), t.rate)
    grids = om.build_grid(lambda f, o, d: model.predict(om.features(f, o, d)), t)
    assert len(grids) == 3
    check_grid(grids, t)


def test_grid_handles_a_diameter_with_one_flow_value():
    t = om.make_table(["A", "A", "B", "B", "C"], [1, 2, 1, 2, 1], [1.0, 2.0, 1.5, 1.5, 0.7],
                      [18.0, 18.0, 19.0, 20.0, 17.3], [6.4, 6.4, 9.5, 9.5, 12.7], [0.05, 0.06, 0.03, 0.04, 0.02])
    model = om.MeanModel().fit(None, t.rate)
    grids = om.build_grid(lambda f, o, d: model.predict(om.features(f, o, d)), t, n_flow=5, n_o2=4)
    check_grid(grids, t)
    assert grids[1]["flow_cm_s"] == [1.5] and grids[0]["o2_pct"] == [18.0]
    assert grids[2]["flow_cm_s"] == [0.7] and grids[2]["o2_pct"] == [17.3]     # one row: one grid point


def test_axis_points_never_leave_the_range():
    for lo, hi in ((0.41, 7.55), (1.38, 1.64), (16.8, 18.9), (0.123456, 0.123457)):
        for geometric in (True, False):
            pts = om.axis_points(lo, hi, 25, geometric, 4)
            assert pts[0] == lo and pts[-1] == hi and (pts >= lo).all() and (pts <= hi).all()


def test_nearest_measured_distance():
    dist, j = om.nearest_measured([1.0, 2.0, 1.0], [18.0, 18.0, 19.0], [1.0, 4.0], [18.0, 18.0], 0.5, 1.0)
    assert dist[0] == 0 and j[0] == 0                          # on a measured row
    assert abs(dist[1] - np.log(2.0) / 0.5) < 1e-12            # same distance to both in ln(flow): first wins
    assert abs(dist[2] - 1.0) < 1e-12 and j[2] == 0            # one O2 standard deviation away


# -------------------------------------------------------------------------------- data and our steps
@needs_table
def test_table_s1_rates_and_colour():
    assert abs(om.table_rate_mm_s(6.78) - 0.0678) < 1e-12      # printed 6.78 -> 0.0678 mm/s (Link 2018 SI p. 1)
    t = om.load_table_s1(TABLE)
    assert sorted(set(t.d_mm.tolist())) == [6.4, 9.5, 12.7]
    assert int(t.clear.sum()) == 6 and set(t.sample[t.clear == 1].tolist()) == {"C25", "C3a", "C3b"}
    assert om.colour_of("B16") == "black" and om.colour_of("C25") == "clear" and om.colour_of("P17") == "not stated"
    if os.path.exists(OURS):    # the same published rates as the tracker's nasa_rate_mm_s column
        for s in om.load_our_steps(OURS):
            hit = (t.sample == s["test_id"]) & np.isclose(t.flow, s["flow_cm_s"])
            if hit.sum() == 1 and s["nasa_rate_mm_s"] is not None:
                assert abs(float(t.rate[hit][0]) - s["nasa_rate_mm_s"]) < 5e-5, s["id"]


def test_outside_comparison_marks_steps_outside_the_ranges():
    t = synthetic_table()
    X = om.features(t.flow, t.o2, t.d_mm)
    final = om.LogLinearModel().fit(X, t.rate)
    refit = lambda sid: om.LogLinearModel().fit(X[t.sample != sid], t.rate[t.sample != sid])
    s = t.d_mm == 6.4
    step = lambda i, **kw: dict({"id": f"spread_rates:T/{i}", "test_id": "S0", "rod_d_mm": 6.35, "o2_pct": float(t.o2[s][0]),
                                 "flow_cm_s": float(t.flow[s][0]), "rate_mm_s": float(t.rate[s][0]), "ci95_mm_s": 0.001,
                                 "nasa_rate_mm_s": float(t.rate[s][0]), "low_confidence": False}, **kw)
    steps = [step(1), step(2, flow_cm_s=50.0), step(3, o2_pct=30.0), step(4, rod_d_mm=20.0),
             step(5, rate_mm_s=10.0, low_confidence=True)]
    oc = om.outside_comparison(final, refit, t, steps, use_clear=False)
    rows = oc["steps"]
    assert rows[0]["inside_measured_ranges"] and rows[0]["model_rod_d_mm"] == 6.4 and rows[0]["nearest_row_distance"] == 0
    assert rows[0]["all_rows"]["our_rate_inside95"] and rows[0]["sample_held_out"]["our_rate_inside95"]
    assert not rows[1]["inside_measured_ranges"] and "flow" in rows[1]["why_outside"]
    assert not rows[2]["inside_measured_ranges"] and "O2" in rows[2]["why_outside"]
    assert not rows[3]["inside_measured_ranges"] and rows[3]["model_rod_d_mm"] is None and "all_rows" not in rows[3]
    assert not rows[4]["all_rows"]["our_rate_inside95"]          # a rate 10 mm/s is far outside the interval
    assert oc["n_steps"] == 5 and oc["n_outside_measured_ranges"] == 3
    assert oc["summary"]["all_rows"]["low_confidence"] == {"n": 1, "n_inside95": 0, "n_nasa_rate_inside95": 1,
                                                           "median_abs_our_vs_model_pct": rows[4]["all_rows"]["our_vs_model_pct"]}


# ------------------------------------------------------------------------------ the published file
@needs_published
def test_published_file_follows_the_rules():
    raw = open(PUBLISHED, encoding="utf-8").read()
    pub = json.loads(raw)
    t = om.load_table_s1(TABLE)
    assert "Written with AI assistance (Claude Code)" in pub["_note"]
    assert pub["training"]["sha256"] == om.sha256_file(TABLE), "Table S1 changed: regenerate orbit_model.json"
    assert pub["training"]["n_rows"] == 52 and pub["training"]["n_samples"] == 19 and pub["cv"]["n_folds"] == 19
    assert "0 g" in pub["scope"] and "PMMA" in pub["scope"] and "opposed" in pub["scope"]
    for word in ("moon", "lunar", "partial gravity", "mars", "martian"):   # nothing about other gravity levels
        assert not re.search(r"" + word + r"", raw.lower()), word
    check_grid(pub["grid"], t)                                    # nothing outside the measured ranges
    table = {m["id"]: m for m in pub["cv"]["models"]}
    assert list(table) == list(om.MODEL_ORDER)                    # all four are reported
    for m in table.values():
        assert m["n_rows"] == 52 and m["median_ape_pct"] >= 0 and m["mean_ape_pct"] >= 0 and m["rmse_mm_s"] > 0
    assert {"coverage95", "n_inside95"} <= set(table["loglinear"]) and {"coverage95", "n_inside95"} <= set(table["gp"])
    med = {k: v["median_ape_pct"] for k, v in table.items()}
    best = min(med.values())
    if all(abs(abs(v - best) - om.TIE_PP) > 0.011 for v in med.values()):   # rounding cannot flip the rule
        assert om.select_model(med)[0] == pub["cv"]["chosen"]
    assert len(pub["heldout_rows"]) == 52
    for step in pub.get("outside_comparison", {}).get("steps", []):
        assert "inside_measured_ranges" in step
