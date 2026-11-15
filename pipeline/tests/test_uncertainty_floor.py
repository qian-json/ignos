# Written with AI assistance (Claude Code)
"""Checks for diagnostics/uncertainty_floor.py (condition-label uncertainty; analysis only)."""
import math, os, sys
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from diagnostics import uncertainty_floor as uf

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PSI = uf.default_psi_table(REPO)


def test_rel_from_o2():
    assert uf.rel_from_o2(0.18, 0.3) == pytest.approx(math.exp(0.054) - 1)
    assert uf.rel_from_o2(0.18, 0.0) == pytest.approx(0.0)


def test_step_o2_linear_and_clipped():
    e = uf.step_o2(18.0, 17.0, (0.0, 100.0), (40.0, 60.0))
    assert e["frac_of_burn"] == pytest.approx(0.5) and e["o2_linear"] == pytest.approx(17.5)
    late = uf.step_o2(18.0, 17.0, (0.0, 100.0), (150.0, 170.0))
    assert late["o2_linear"] == pytest.approx(17.0)          # clipped to the burn end
    assert e["o2_range"] == [17.0, 18.0]


@pytest.mark.skipif(not os.path.exists(PSI), reason="NASA PSI-25 experimental table not present on this machine")
def test_table_s1_o2_is_nasa_initial_o2_for_all_tests():
    psi = uf.read_psi_o2(PSI)
    import json
    for tid, ptest in uf.PSI_OF.items():
        with open(os.path.join(REPO, "pipeline", "configs", f"{tid}.json"), encoding="utf-8") as h:
            cfg = json.load(h)
        o2a, o2b = psi[ptest]
        assert cfg["o2_pct"] == pytest.approx(o2a)
        assert o2b <= o2a
