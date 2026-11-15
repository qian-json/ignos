# Written with AI assistance (Claude Code)
"""Unit tests for the Still Air tracker (synthetic inputs with known answers)."""
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from stillair_tracker.edge import track_test
from stillair_tracker.segment import fit_line, dp_segments, schedule_windows
from stillair_tracker.calibrate import rod_width_px


def moving_bar_frames(speed_px_s, dt_s, n, shape=(200, 400), axis=100, brightness=None, seed=0):
    rng = np.random.default_rng(seed)
    t = np.arange(n) * dt_s
    frames = []
    for i, ti in enumerate(t):
        f = rng.normal(0.01, 0.003, shape + (3,)).clip(0)
        right = 60 + speed_px_s * ti
        f[axis - 15:axis + 15, 40:int(round(right))] = (brightness[i] if brightness is not None else 1.0)
        frames.append(f.astype(np.float32))
    return t, np.stack(frames)


def test_moving_bar_rate_within_1pct():
    speed = 1.7
    t, img = moving_bar_frames(speed, 5.0, 40)
    tr = track_test(img, rel=0.3, axis_row=100, half_band=40, min_area=50, direction=1)
    m, _, _ = fit_line(t, tr["edge_px"])
    assert abs(m - speed) / speed < 0.01


def test_moving_bar_survives_1000x_brightness_change():
    speed = 0.9
    b = np.geomspace(100.0, 0.1, 40)          # flame dims ~1000x, like P16
    t, img = moving_bar_frames(speed, 5.0, 40, brightness=b)
    tr = track_test(img, rel=0.3, axis_row=100, half_band=40, min_area=50, direction=1)
    m, _, _ = fit_line(t, tr["edge_px"])
    assert abs(m - speed) / speed < 0.01


def test_fit_line_ci_covers_truth():
    rng = np.random.default_rng(1)
    t = np.linspace(0, 200, 40); x = 0.06 * t + rng.normal(0, 0.3, t.size)
    m, _, ci = fit_line(t, x)
    assert abs(m - 0.06) < ci


def test_dp_finds_breakpoint():
    t = np.arange(60, dtype=float)
    x = np.where(t < 25, 0.5 * t, 12.5 + 2.0 * (t - 25))
    segs = dp_segments(t, x, 2)
    assert segs[0][1] == 25


def test_schedule_windows_backward():
    w = schedule_windows(600.0, [72, 139, 198, 170])
    assert w[-1] == (430.0, 600.0) and w[0][0] == 600.0 - 579


def test_rod_calibration_synthetic():
    # 6.35 mm rod at 34.83 px/mm -> 221 px wide, specular highlight on top, dark body
    h, w, top, width = 300, 120, 40, 221
    g = np.full((h, w), 60.0)
    g[top:top + 10] = 170.0                     # highlight band at the top edge
    g[top + 10:top + width] = 15.0              # dark rod
    g[top + width:] = 110.0                     # background below
    widths = rod_width_px(g)
    assert np.all(np.abs(widths - width) <= 2)


def test_ci95_uses_student_t():
    from scipy.stats import t as student_t
    rng = np.random.default_rng(3)
    t = np.linspace(0, 100, 13); x = 0.05 * t + rng.normal(0, 0.2, t.size)
    m, b, ci = fit_line(t, x)
    r = x - (m * t + b)
    se = np.sqrt((r @ r) / (len(t) - 2) / ((t - t.mean()) ** 2).sum())
    assert abs(ci - student_t.ppf(0.975, 11) * se) < 1e-12


def test_fused_edge_takes_front_most_of_lum_and_blue():
    from stillair_tracker.edge import track_test_fused
    # bright yellow core up to x=150 plus a dim blue zone to x=190: lum edge stops at the core, blue reaches 190
    img = np.full((3, 200, 300, 3), 0.002, np.float32)
    for i in range(3):
        img[i, 85:115, 60:150] = [1.0, 0.8, 0.2]      # sooty core (red/green heavy)
        img[i, 90:110, 150:190 + i] = [0.0, 0.0, 0.6]  # blue leading zone
    f = track_test_fused(img, rel=0.3, axis_row=100, half_band=40, min_area=50, direction=1)
    assert np.all(f["edge_px"] >= 188) and np.all(f["edge_lum_px"] < 152)

def test_nonphysical_slope_is_flagged_not_reported():
    """A zero or negative fitted slope becomes an unusable row with the value kept in the note."""
    from stillair_tracker.run import nonphysical_note
    assert nonphysical_note(0.0573) == ""
    assert nonphysical_note(None) == ""
    for bad in (-0.0127, 0.0):
        note = nonphysical_note(bad)
        assert f"{bad:.4f}" in note and "no rate is reported" in note
