# Written with AI assistance (Claude Code)
"""Checks for diagnostics/test_matrices.py (BASS-II test matrices and fan calibration; analysis only)."""
import datetime, os, sys
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from diagnostics import test_matrices as tm

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PSI = os.path.normpath(os.path.join(REPO, "..", "..", "space-apps-2026", "data", "raw", "psi25"))
MATRIX = os.path.join(PSI, tm.MATRIX_FILE)
CAL = os.path.join(PSI, tm.CAL_FILE)
have = pytest.mark.skipif(not (os.path.exists(MATRIX) and os.path.exists(CAL)), reason="NASA PSI-25 files not present")


def test_col_helpers():
    assert tm.col_index("A1") == 0 and tm.col_index("AB7") == 27
    assert tm.col_letter(0) == "A" and tm.col_letter(27) == "AB"
    assert tm.serial_to_date("41842") == datetime.date(2014, 7, 22)


def test_interp_ignores_pot_zero_and_flags_below_range():
    table = [(2.0, 55.0, 6.0), (1.0, 47.0, 3.5), (0.5, 42.0, 0.0), (0.0, 38.0, 0.0)]
    assert tm.interp_air(table, 1.5)[0] == pytest.approx(4.75)
    assert tm.interp_air(table, 0.3)[0] is None
    assert tm.interp_air(table, 3.0)[0] is None


@have
def test_matrix_sheet_names_and_known_cell():
    sheets = tm.read_xlsx(MATRIX)
    assert list(sheets) == ["Bhattacharjee", "Ferkul", "Miller", "Olson", "Fernandez-Pello", "T'ien"]
    rows = tm.read_matrix_rows(sheets)
    p16 = rows[("Fernandez-Pello", "P16")]
    assert tm.serial_to_date(p16["date_serial"]) == datetime.date(2014, 7, 22)
    assert float(p16["o2_initial"]) == pytest.approx(18.2) and float(p16["o2_final"]) == pytest.approx(17.4)


@have
def test_calibration_block_2014_07_22():
    blocks = tm.read_calibration(tm.read_xlsx(CAL))
    b, exact = tm.block_for(blocks, datetime.date(2014, 7, 22))
    assert exact and b["n_tables"] == 3
    t2 = {p: air for p, _, air in b["tables"]["2"]}
    assert t2[1.0] == 3.5 and t2[0.5] == 0.0 and t2[2.0] == 6.0
