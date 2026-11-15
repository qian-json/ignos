# Written with AI assistance (Claude Code)
"""Tests for pipeline/diagnostics/flame_features.py: colour shares on a toy image, and the committed
per-photo tables have every column the phase model needs. No frame cache needed."""
import os, sys
import numpy as np
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from diagnostics import flame_features as ff

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FEAT = os.path.join(REPO, "docs", "research", "flame_features")


def test_columns_listed():
    for c in ("brightness_p999", "b_share", "r_share", "g_share", "in_burn_window", "fit_step", "edge_mm"):
        assert c in ff.COLUMNS


def test_colour_shares_add_to_one():
    rgb = np.zeros((20, 20, 3))
    rgb[5:15, 5:15] = (1.0, 2.0, 5.0)
    mask = rgb.sum(-1) > 0
    r, g, b = ff.colour_shares(rgb, mask)
    assert r + g + b == pytest.approx(1.0) and b == pytest.approx(5 / 8)


@pytest.mark.parametrize("t", ["B16", "B19", "B12", "P17", "B13b", "B13a"])
def test_committed_tables_have_columns(t):
    p = os.path.join(FEAT, f"{t}.csv")
    if not os.path.exists(p):
        pytest.skip("table not in this checkout")
    _, rows = ff.read_table(p)
    assert rows and set(ff.COLUMNS) <= set(rows[0])
    flame = [r for r in rows if r["in_burn_window"] == "1" and r["b_share"] != ""]
    assert flame and all(float(r["brightness_p999"]) > 0 for r in flame)
