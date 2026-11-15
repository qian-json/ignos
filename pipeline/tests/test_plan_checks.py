# Written with AI assistance (Claude Code)
"""The two tests the build plan lists that had no test yet (BUILD_PLAN.md, Workstream A, item 12):
EXIF parsing, and a regression check that keeps B16 near NASA's value.

The regression check reads the published data/derived/spread_rates.csv, so it needs no photos.
After the Gate 3 freeze (2026-11-15) the headline is fixed: if a headline assertion fails, the
CSV changed, and METHOD.md, the pitch notes and the site must be re-checked before anything ships.
"""
import csv, os, statistics, sys, types
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from stillair_tracker import frames

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSV = os.path.join(REPO, "data", "derived", "spread_rates.csv")


def fake_exifread(tags: dict):
    """A stand-in for the exifread module that returns `tags` for any file."""
    return types.SimpleNamespace(process_file=lambda handle, details=False: tags)


@pytest.mark.parametrize("subsec, shutter, want_frac, want_shutter", [
    ("72", "1/8000", 0.72, 1 / 8000),      # sub-seconds are a decimal fraction, not hundredths of an integer
    ("05", "1/3", 0.05, 1 / 3),            # a leading zero must survive
    ("", "1/13", 0.0, 1 / 13),             # empty sub-second tag
])
def test_exif_time_and_shutter(tmp_path, monkeypatch, subsec, shutter, want_frac, want_shutter):
    tags = {"EXIF DateTimeOriginal": "2014:07:22 13:04:04", "EXIF ExposureTime": shutter}
    if subsec is not None:
        tags["EXIF SubSecTimeOriginal"] = subsec
    monkeypatch.setitem(sys.modules, "exifread", fake_exifread(tags))
    photo = tmp_path / "x.NEF"
    photo.write_bytes(b"")
    t, s = frames.exif_time_and_shutter(str(photo))
    assert t - int(t) == pytest.approx(want_frac, abs=1e-6)
    assert s == pytest.approx(want_shutter)


def test_exif_missing_subsec_tag_means_zero(tmp_path, monkeypatch):
    tags = {"EXIF DateTimeOriginal": "2014:07:22 13:04:04", "EXIF ExposureTime": "1/50"}
    monkeypatch.setitem(sys.modules, "exifread", fake_exifread(tags))
    photo = tmp_path / "x.NEF"
    photo.write_bytes(b"")
    t, _ = frames.exif_time_and_shutter(str(photo))
    assert t == int(t)


def test_exif_times_one_second_apart_differ_by_one_second(tmp_path, monkeypatch):
    photo = tmp_path / "x.NEF"
    photo.write_bytes(b"")
    out = []
    for stamp, sub in (("2014:07:22 13:04:04", "90"), ("2014:07:22 13:04:05", "90")):
        monkeypatch.setitem(sys.modules, "exifread", fake_exifread(
            {"EXIF DateTimeOriginal": stamp, "EXIF SubSecTimeOriginal": sub, "EXIF ExposureTime": "1/50"}))
        out.append(frames.exif_time_and_shutter(str(photo))[0])
    assert out[1] - out[0] == pytest.approx(1.0)


def published_rows() -> list[dict]:
    with open(CSV, newline="", encoding="utf-8") as h:
        return list(csv.DictReader(h))


def reliable(row: dict) -> bool:
    """The headline set: a rate exists, flow below 1 cm/s, not flagged LOW CONFIDENCE."""
    return row["rate_mm_s"] != "" and float(row["flow_cm_s"]) < 1.0 and "LOW CONFIDENCE" not in row["notes"]


@pytest.mark.skipif(not os.path.exists(CSV), reason="published spread_rates.csv not present")
def test_b16_low_flow_steps_stay_near_nasa():
    b16 = {float(r["flow_cm_s"]): r for r in published_rows() if r["test_id"] == "B16"}
    for flow in (0.83, 0.72):
        row = b16[flow]
        assert abs(float(row["pct_error"])) <= 10.0, f"B16 at {flow} cm/s drifted: {row['pct_error']}%"


@pytest.mark.skipif(not os.path.exists(CSV), reason="published spread_rates.csv not present")
def test_pct_error_matches_rate_and_nasa_columns():
    for r in published_rows():
        if r["rate_mm_s"] == "":
            assert r["pct_error"] == "" and r["notes"].startswith("unusable"), "a row without a rate must say why"
            continue
        rate, nasa = float(r["rate_mm_s"]), float(r["nasa_rate_mm_s"])
        assert rate > 0, "a reported spread rate is always positive"
        assert float(r["pct_error"]) == pytest.approx(100 * (rate - nasa) / nasa, abs=0.06)


@pytest.mark.skipif(not os.path.exists(CSV), reason="published spread_rates.csv not present")
def test_frozen_headline():
    errs = [abs(float(r["pct_error"])) for r in published_rows() if reliable(r)]
    tests = {r["test_id"] for r in published_rows() if reliable(r)}
    assert len(errs) == 8 and len(tests) == 4
    assert round(statistics.median(errs), 1) == 6.8
    assert max(errs) <= 15.0
