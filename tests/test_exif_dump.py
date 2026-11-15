# Written with AI assistance (Claude Code)
"""Tests for the timestamp / t_s parsing in tools/exif_dump.py."""
import sys
from datetime import datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import exif_dump  # noqa: E402
from exif_dump import compute_t_s, gap_stats, parse_subsec, parse_timestamp  # noqa: E402


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("50", 0.50),
        ("5", 0.5),
        ("05", 0.05),  # leading zero is significant: .05 s, not .5 s
        ("00", 0.0),
        ("123", 0.123),
        ("08", 0.08),
        (" 86 ", 0.86),
        ("86\x00", 0.86),
        (86, 0.86),
        ("", 0.0),
        (None, 0.0),
    ],
)
def test_parse_subsec(raw, expected):
    assert parse_subsec(raw) == pytest.approx(expected)


@pytest.mark.parametrize("bad", ["ab", "1.5", "-3"])
def test_parse_subsec_rejects_non_digits(bad):
    with pytest.raises(ValueError):
        parse_subsec(bad)


def test_parse_timestamp_combines_subsec():
    ts = parse_timestamp("2017:01:17 21:26:07", "08")
    assert ts == datetime(2017, 1, 17, 21, 26, 7, 80000)


def test_parse_timestamp_without_subsec():
    assert parse_timestamp("2017:01:17 21:26:07") == datetime(2017, 1, 17, 21, 26, 7)


@pytest.mark.parametrize("bad", [None, "", "2017-01-17 21:26:07", "0000:00:00 00:00:00"])
def test_parse_timestamp_rejects_bad_input(bad):
    with pytest.raises(ValueError):
        parse_timestamp(bad, "00")


def test_t_s_uses_subsec_and_is_relative_to_first_frame():
    stamps = [
        parse_timestamp("2014:02:11 10:00:00", "90"),
        parse_timestamp("2014:02:11 10:00:02", "15"),  # 1.25 s later
        parse_timestamp("2014:02:11 10:00:02", "95"),  # 0.80 s later
    ]
    assert compute_t_s(stamps) == pytest.approx([0.0, 1.25, 2.05])


def test_t_s_crosses_midnight():
    stamps = [
        parse_timestamp("2014:02:11 23:59:59", "50"),
        parse_timestamp("2014:02:12 00:00:00", "25"),
    ]
    assert compute_t_s(stamps) == pytest.approx([0.0, 0.75])


def test_t_s_zero_is_earliest_frame_and_missing_stay_none():
    stamps = [
        parse_timestamp("2014:02:11 10:00:05", "00"),
        None,
        parse_timestamp("2014:02:11 10:00:03", "50"),
    ]
    assert compute_t_s(stamps) == [pytest.approx(1.5), None, pytest.approx(0.0)]
    assert compute_t_s([None, None]) == [None, None]


def test_gap_stats_irregular_spacing():
    stats = gap_stats([0.0, 1.25, 2.05, None, 5.05])
    assert stats["n_gaps"] == 3
    assert stats["min"] == pytest.approx(0.80)
    assert stats["max"] == pytest.approx(3.00)
    assert stats["median"] == pytest.approx(1.25)
    assert gap_stats([0.0]) is None


def test_rows_sorted_by_timestamp_not_filename(monkeypatch):
    """A camera counter rollover (DSC_9999 -> DSC_0001) must not reorder frames."""
    fake = {
        "DSC_0001.NEF": datetime(2014, 2, 11, 10, 0, 2, 500000),
        "DSC_0002.NEF": None,  # no EXIF
        "DSC_9998.NEF": datetime(2014, 2, 11, 10, 0, 0),
        "DSC_9999.NEF": datetime(2014, 2, 11, 10, 0, 1, 200000),
    }

    def fake_read(path):
        row = {c: None for c in exif_dump.CSV_COLUMNS}
        row.update(file=path.name, _timestamp=fake[path.name], _problems=[])
        return row

    monkeypatch.setattr(exif_dump, "read_frame", fake_read)
    rows = exif_dump.build_rows([Path(n) for n in sorted(fake)], link_id="B16")
    assert {r["link_id"] for r in rows} == {"B16"}  # also set on the frame without EXIF

    assert [r["file"] for r in rows] == [
        "DSC_9998.NEF", "DSC_9999.NEF", "DSC_0001.NEF", "DSC_0002.NEF",
    ]
    assert [r["t_s"] for r in rows] == [pytest.approx(0.0), pytest.approx(1.2), pytest.approx(2.5), None]


def test_link_id_mapping():
    assert exif_dump.LINK_IDS == {"P16": "B16", "P19": "B19"}
    assert exif_dump.CSV_COLUMNS == [
        "file", "datetime_original", "subsec", "t_s", "t_burn_s", "f_number", "exposure_s", "iso",
        "width_px", "height_px", "link_id", "phase", "gap_prev_s", "long_gap", "exposure_scale",
    ]


def test_t_s_rezero_gives_negative_before_t0():
    stamps = [
        parse_timestamp("2014:07:23 09:28:56", "38"),
        parse_timestamp("2014:07:23 11:58:11", "87"),
        parse_timestamp("2014:07:23 11:58:13", "90"),
    ]
    assert compute_t_s(stamps, t0=stamps[1]) == pytest.approx([-8955.49, 0.0, 2.03])


def test_gap_prev_and_long_gap_threshold():
    gaps = exif_dump.compute_gap_prev([-100.0, 0.0, 20.0, None, 40.01])
    assert gaps == [None, pytest.approx(100.0), pytest.approx(20.0), None, pytest.approx(20.01)]
    assert [exif_dump.is_long_gap(g) for g in gaps] == [None, True, False, None, True]  # strictly > 20


def test_exposure_scale():
    assert exif_dump.exposure_scale(2.0, 1 / 8000, 1000) == pytest.approx(32.0)
    assert exif_dump.exposure_scale(2.0, 1 / 3, 1000) == pytest.approx(0.012)
    assert exif_dump.exposure_scale(2.0, None, 1000) is None
    assert exif_dump.exposure_scale(2.0, 0.0, 1000) is None


def _fake_rows(monkeypatch, fake):
    def fake_read(path):
        row = {c: None for c in exif_dump.CSV_COLUMNS}
        row.update(file=path.name, _timestamp=fake[path.name], _problems=[],
                   f_number=2.0, exposure_s=0.25, iso=1000)
        return row

    monkeypatch.setattr(exif_dump, "read_frame", fake_read)
    return [Path(n) for n in sorted(fake)]


def test_build_rows_rezero_phase_and_flags(monkeypatch):
    fake = {
        "a_pre.NEF": datetime(2014, 7, 23, 9, 0, 0),
        "b_t0.NEF": datetime(2014, 7, 23, 11, 0, 0),
        "c.NEF": datetime(2014, 7, 23, 11, 0, 5, 500000),
        "d.NEF": datetime(2014, 7, 23, 11, 0, 35, 500000),  # 30 s gap inside the burn
        "e_noexif.NEF": None,
    }
    rows = exif_dump.build_rows(_fake_rows(monkeypatch, fake), link_id="B16", t0_file="b_t0.NEF")

    # t_s: since the first photo (the contract clock). t_burn_s: since the t0 frame.
    assert [r["t_s"] for r in rows] == [
        pytest.approx(0.0), pytest.approx(7200.0), pytest.approx(7205.5), pytest.approx(7235.5), None,
    ]
    assert [r["t_burn_s"] for r in rows] == [
        pytest.approx(-7200.0), pytest.approx(0.0), pytest.approx(5.5), pytest.approx(35.5), None,
    ]
    assert [r["phase"] for r in rows] == ["pretest", "burn", "burn", "burn", None]
    assert [r["gap_prev_s"] for r in rows] == [
        None, pytest.approx(7200.0), pytest.approx(5.5), pytest.approx(30.0), None,
    ]
    # long gaps are flagged but the frame stays "burn"
    assert [r["long_gap"] for r in rows] == [None, True, False, True, None]
    assert all(r["exposure_scale"] == pytest.approx(0.016) for r in rows)


def test_build_rows_unknown_t0_file_raises(monkeypatch):
    fake = {"a.NEF": datetime(2014, 7, 23, 9, 0, 0)}
    with pytest.raises(ValueError):
        exif_dump.build_rows(_fake_rows(monkeypatch, fake), t0_file="missing.NEF")


def test_build_rows_without_t0_leaves_burn_columns_blank(monkeypatch):
    fake = {"a.NEF": datetime(2014, 7, 23, 9, 0, 0), "b.NEF": datetime(2014, 7, 23, 9, 0, 4)}
    rows = exif_dump.build_rows(_fake_rows(monkeypatch, fake))
    assert [r["t_s"] for r in rows] == [pytest.approx(0.0), pytest.approx(4.0)]
    assert [r["t_burn_s"] for r in rows] == [None, None]
    assert [r["phase"] for r in rows] == [None, None]
