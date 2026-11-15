# Written with AI assistance (Claude Code)
"""Tests for pipeline/flame_model (the model fitted to Link 2018 Tables S1 and S2)."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "flame_model"))
from model import fit, load_rows, lowest_o2_that_burns, predict, score  # noqa: E402

OUT = ROOT / "data" / "derived" / "flame_model.json"


@pytest.fixture(scope="module")
def rows():
    return load_rows(ROOT)


@pytest.fixture(scope="module")
def fitted(rows):
    return fit(rows, seeds=8).x


def test_loads_both_tables(rows):
    orbit = [r for r in rows if r.domain == "orbit"]
    earth = [r for r in rows if r.domain == "earth"]
    assert len(orbit) == 52 and len(earth) == 46
    assert sum(r.rate_mm_s is None for r in earth) == 9  # the dashes in Table S2
    assert all(r.g_earth == 0 for r in orbit) and all(r.g_earth == 1 for r in earth)
    # Table S1 B16 step 3 printed 6.99 (cm/s x 10^3) is 0.0699 mm/s, as in the proof layer
    b16 = [r for r in orbit if r.group == "B16"]
    assert any(abs(r.rate_mm_s - 0.0699) < 1e-9 for r in b16)


def test_fit_matches_the_data(rows, fitted):
    s = score(fitted, rows)
    assert s["median_abs_error_pct"] < 20
    assert s["burn_correct"] >= 85
    # the flow a flame makes for itself at 1 g lands inside published estimates (20 to 35 cm/s), roughly
    assert 15 < fitted[6] < 35


def test_physics_sanity(fitted):
    # no flow at all in orbit: no flame (the model has no diffusion-only flame; documented)
    assert predict(fitted, 0.64, 21.0, 0.0, 0.0)[0] == 0
    # more oxygen never slows the flame at fixed flow, and thinner rods spread faster
    r = [float(predict(fitted, 0.64, o, 2.0, 1.0)[0]) for o in (19, 20, 21)]
    assert r[0] <= r[1] <= r[2]
    assert predict(fitted, 0.32, 21.0, 2.0, 1.0)[0] > predict(fitted, 1.27, 21.0, 2.0, 1.0)[0]
    # at Earth gravity a flame keeps going with the fans off (its own buoyant flow)
    assert lowest_o2_that_burns(fitted, 0.64, 0.0, 1.0) is not None


def test_output_file_is_validation_only_and_labelled():
    doc = json.loads(OUT.read_text())
    assert doc["contract"] == "flame_model/1"
    assert "model, not a NASA measurement" in doc["label"]
    for forbidden in ("grid", "points", "moon_vs_earth"):
        assert forbidden not in doc  # no prediction at the Moon or between 0 g and 1 g
    logo = doc["validation"]["leave_one_group_out"]
    assert logo["burn_correct"] <= logo["always_burns_baseline_correct"] + 2  # reported next to the baseline
    assert doc["validation"]["cross_domain"]["orbit_only_to_earth"]["passed"] is False
    assert "Not an independent test" in doc["validation"]["remeasurement_cross_check"]["note"]
