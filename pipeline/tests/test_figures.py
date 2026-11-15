# Written with AI assistance (Claude Code)
"""Parity figure test: tiny synthetic spread_rates.csv in a temp repo -> CLI -> PNG/SVG checks."""
import sys, os, csv
import numpy as np
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
pytest.importorskip("matplotlib")
from stillair_tracker.figures import main as figures_main, read_rows, is_flagged, low_flow_median_error, STEM

COLS = ["test_id", "rod_d_mm", "o2_pct", "flow_cm_s", "t_start_s", "t_end_s", "rate_mm_s", "ci95_mm_s",
        "threshold_spread_mm_s", "nasa_rate_mm_s", "pct_error", "flame_len_mm", "blue_frac", "extinction_s",
        "n_frames", "notes"]
ROWS = [  # test_id, flow, rate, ci95, nasa, notes
    ("T1", 5.0, 0.040, 0.004, 0.050, "early high-flow step"),
    ("T1", 0.8, 0.055, 0.002, 0.050, ""),
    ("T1", 0.7, 0.048, 0.002, 0.050, ""),
    ("T2", 0.8, 0.030, 0.015, 0.040, "LOW CONFIDENCE (ci95 > 30% of rate)"),
    ("T2", 0.6, 0.041, 0.002, 0.040, ""),
]


def write_repo(root):
    d = os.path.join(root, "data", "derived")
    os.makedirs(d)
    with open(os.path.join(d, "spread_rates.csv"), "w", newline="", encoding="utf-8") as h:
        w = csv.writer(h)
        w.writerow(COLS)
        for tid, flow, rate, ci, nasa, notes in ROWS:
            w.writerow([tid, 6.35, 18.0, flow, 0, 100, rate, ci, 0.001, nasa,
                        round((rate - nasa) / nasa * 100, 1), 10, 0, "", 10, notes])


def test_flags_and_low_flow_median(tmp_path):
    write_repo(str(tmp_path))
    rows = read_rows(str(tmp_path / "data" / "derived" / "spread_rates.csv"))
    assert [is_flagged(r) for r in rows] == [True, False, False, True, False]
    med, n = low_flow_median_error(rows)
    # reliable rows (flow < 1, not LOW CONFIDENCE): |errors| 10, 4, 2.5 -> median 4.0 (the 25% row is flagged)
    assert n == 3 and med == pytest.approx(4.0)


def test_cli_writes_png_and_svg(tmp_path):
    write_repo(str(tmp_path))
    paths = figures_main(["--repo", str(tmp_path)])
    out = tmp_path / "docs" / "figures"
    png, svg = out / f"{STEM}.png", out / f"{STEM}.svg"
    assert {os.path.abspath(p) for p in paths} == {str(png), str(svg)}
    from PIL import Image
    with Image.open(png) as im:
        assert im.size == (1920, 1080)
        a = np.asarray(im.convert("RGB"))
    assert a.std() > 5  # not blank
    text = svg.read_text(encoding="utf-8")
    assert text.lstrip().startswith("<?xml") and "<svg" in text
