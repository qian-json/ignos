# Written with AI assistance (Claude Code).
"""Cheap checks for diagnostics.air_display: digit-template matching on synthetic glyphs."""
import numpy as np

from diagnostics import air_display as A


def _glyph(seed: int) -> np.ndarray:
    """Distinct random 18x28 'digit' pattern with a bright stroke look."""
    rng = np.random.default_rng(seed)
    g = (rng.random((A.CORE_H, A.CORE_W)) > 0.55).astype(np.float32) * 170 + 20
    return g


def _strip_with(glyph_by_cell: dict, n=3) -> np.ndarray:
    strip = np.zeros((n, A.CROP_H, A.CROP_W), np.float32)
    for k, g in glyph_by_cell.items():
        x0 = A.cell_left(k) - 2
        strip[:, A.VAL_ROW0:A.VAL_ROW0 + A.CORE_H, x0:x0 + A.CORE_W] = g
    return strip.astype(np.uint8)


def test_reads_synthetic_digits_with_shift_and_blank():
    tpl = {str(d): _glyph(d) for d in range(10)}
    names, tstack = A.template_stack(tpl)
    # '3' in cell 7, '8' in cell 8, cell 6 blank; the '8' is shifted 2 px right
    strip = _strip_with({7: tpl["3"], 8: np.roll(tpl["8"], 2, axis=1)})
    ch, sc, mg = A.read_cells(strip, A.AIR_CELLS, A.VAL_ROW0, names, tstack, 0.72 * 190)
    assert "".join(ch[0]) == " 38"
    assert (A.parse_number(ch[0])[0]) == 38
    assert sc[0, 1] > 0.9 and mg[0, 1] > 0.3


def test_unknown_glyph_is_unreadable_not_guessed():
    tpl = {str(d): _glyph(d) for d in range(10)}
    names, tstack = A.template_stack(tpl)
    strip = _strip_with({8: _glyph(99)})
    ch, _, _ = A.read_cells(strip, A.AIR_CELLS, A.VAL_ROW0, names, tstack, 0.72 * 190)
    assert ch[0, 2] == "?"
    assert A.parse_number(ch[0]) == (None, "unreadable")


def test_window_stats_and_hms():
    rows = [dict(photo_t_s=float(t), air=(t % 3), fan=41) for t in range(100)]
    st = A.window_stats(rows, 10, 19)
    assert st["n"] == 10 and st["min"] == 0 and st["max"] == 2
    assert A.hms_to_s("12:01:18.5") == 12 * 3600 + 60 + 18.5
