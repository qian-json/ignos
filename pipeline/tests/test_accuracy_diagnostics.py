# Written with AI assistance (Claude Code and Codex)
"""Behavioral checks for the independent accuracy diagnostics."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from diagnostics.accuracy_analysis import ccc, deming
from diagnostics.synthetic_flames import evaluate


def test_deming_and_concordance_identity():
    x = np.array([.02, .04, .08, .1])
    slope, intercept = deming(x, x)
    assert abs(slope - 1) < 1e-12
    assert abs(intercept) < 1e-12
    assert abs(ccc(x, x) - 1) < 1e-12


def test_synthetic_visible_blue_front_recovers_rate():
    result = evaluate(.06, seed=2, bright_core=False)
    assert result["n_fit_photos"] >= 6
    assert result["abs_pct_error"] < 2


def test_synthetic_bright_core_exposes_bias():
    result = evaluate(.06, seed=2, bright_core=True)
    assert result["median_front_offset_px_early"] < result["median_front_offset_px_late"] - 10
