# Written with AI assistance (Claude Code)
import numpy as np
from diagnostics.blue_front_v2 import blue_front_frame


def _frame(seed=0, glow=True, speck=False, glint=False):
    rng = np.random.default_rng(seed)
    f = rng.normal(1.0, 0.15, (200, 600, 3)).clip(0).astype(np.float32)
    f[80:120, 100:200] += np.array([90.0, 60.0, 20.0])          # bright yellow core, front at col 199
    if glow:
        f[85:115, 200:260, 2] += 2.5                              # faint blue glow ahead, front at col 259
    if speck:
        f[95:98, 500:503, 2] += 40.0                              # isolated blue speck far ahead
    if glint:
        f[98:103, 200:400, :] += np.array([6.0, 4.0, 3.0])        # thin lit rod ahead of the flame
    return f


def test_front_reaches_faint_blue_glow():
    x = blue_front_frame(_frame(), axis_row=100, half_band=60)
    assert 255 <= x <= 264          # true glow front 259; smoothing bias about +2 px


def test_no_glow_stays_on_core():
    x = blue_front_frame(_frame(glow=False), axis_row=100, half_band=60)
    assert 197 <= x <= 208          # true core front 199; a bright edge blurs about +5 px


def test_far_speck_ignored():
    x = blue_front_frame(_frame(glow=False, speck=True), axis_row=100, half_band=60)
    assert x < 210


def test_reverse_direction():
    f = _frame()[:, ::-1].copy()
    x = blue_front_frame(f, axis_row=100, half_band=60, direction=-1)
    assert 599 - 264 <= x <= 599 - 255


def test_no_flame_is_nan():
    f = np.random.default_rng(1).normal(1.0, 0.15, (200, 600, 3)).clip(0).astype(np.float32)
    assert np.isnan(blue_front_frame(f, axis_row=100, half_band=60))


def test_thin_rod_glint_ignored():
    x = blue_front_frame(_frame(glow=False, glint=True), axis_row=100, half_band=60)
    assert x < 210


def test_glint_touching_glow_ignored():
    x = blue_front_frame(_frame(glint=True), axis_row=100, half_band=60)
    assert 255 <= x <= 276          # glow front 259; residue where the streak meets the glow is up to ~+13 px (was +141)
