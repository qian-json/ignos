# Written with AI assistance (Claude Code)
"""Checks for diagnostics/orbit_depletion_check.py (analysis only)."""
import os, sys
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from diagnostics import orbit_depletion_check as oc
from diagnostics.o2_depletion_refit import load_rows
from diagnostics.uncertainty_floor import default_psi_table, read_psi_o2

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.mark.skipif(not os.path.exists(default_psi_table(REPO)), reason="NASA PSI-25 experimental table not present")
def test_implausible_drop_keeps_label_and_others_use_estimate():
    rows = load_rows(REPO, read_psi_o2(default_psi_table(REPO)))
    X_lab, rate, groups, _ = oc.table_arrays(rows, "o2_label")
    X_est, _, _, _ = oc.table_arrays(rows, "o2_est")
    assert len(rate) == 52 and X_lab.shape == X_est.shape
    for i, r in enumerate(rows):
        if r["sample"] == "B22":
            assert X_est[i, 1] == pytest.approx(r["o2_label"])
        else:
            assert X_est[i, 1] == pytest.approx(r["o2_est"])
            assert X_est[i, 1] <= X_lab[i, 1] + 1e-9 or r["o2_initial"] != r["o2_label"]
