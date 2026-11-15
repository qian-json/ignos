# Written with AI assistance (Claude Code)
"""Checks for diagnostics/o2_depletion_refit.py (analysis only)."""
import math, os, sys
import numpy as np
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from diagnostics import o2_depletion_refit as od
from diagnostics.uncertainty_floor import default_psi_table

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_psi_mapping():
    psi = {"P16": (18.2, 17.4), "P22a": (20.8, 0.6), "P13a": (20.7, 19.1)}
    assert od.psi_test_for("B16", psi) == "P16"
    assert od.psi_test_for("B22", psi) == "P22a"
    assert od.psi_test_for("B13a", psi) == "P13a"
    assert od.psi_test_for("B99", psi) is None


def test_fit_recovers_known_coefficients():
    rng = np.random.default_rng(0)
    rows = []
    for i in range(60):
        f, o2, d = rng.uniform(0.4, 8), rng.uniform(16, 22), rng.choice([6.4, 9.5, 12.7])
        rows.append({"flow": f, "o2_label": o2, "d_mm": d, "rate": math.exp(-4 + 0.15 * math.log(f) + 0.2 * o2 - 1.0 * math.log(d))})
    c = od.fit(rows, "o2_label")
    assert c[1] == pytest.approx(0.15, abs=1e-9) and c[2] == pytest.approx(0.2, abs=1e-9) and c[3] == pytest.approx(-1.0, abs=1e-9)


@pytest.mark.skipif(not os.path.exists(default_psi_table(REPO)), reason="NASA PSI-25 experimental table not present")
def test_step_o2_estimates_lie_between_readings():
    from diagnostics.uncertainty_floor import read_psi_o2
    rows = od.load_rows(REPO, read_psi_o2(default_psi_table(REPO)))
    assert len(rows) == 52
    for r in rows:
        if "o2_est" in r:
            assert min(r["o2_initial"], r["o2_final"]) - 1e-9 <= r["o2_est"] <= max(r["o2_initial"], r["o2_final"]) + 1e-9
            assert 0 < r["frac"] < 1
