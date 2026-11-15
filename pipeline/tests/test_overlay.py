# Written with AI assistance (Claude Code)
"""Overlay video test: synthetic cache + edges CSV -> CLI -> ffprobe checks against DATA_CONTRACTS section 3.
Also the two lines: the solid v1 edge and the dashed blue-light front (diagnostic, display only)."""
import sys, os, csv, json, shutil, subprocess
import numpy as np
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from stillair_tracker.edge import track_test
from stillair_tracker.run import px_to_mm, mm_to_px, edge_reference, tracking_kw
from stillair_tracker.overlay import (main as overlay_main, compose_frame, frame_size, place_labels, fused_front_px,
                                      front_stats, caption_text, make_fonts, _hits, _text_w,
                                      LINE_RGB, DIAG_RGB, DASH_ON, DASH_OFF, V1_LABEL, DIAG_LABEL, LABEL_GAP)

FFPROBE = shutil.which("ffprobe") or r"C:\ffmpeg\bin\ffprobe.exe"
needs_ffmpeg = pytest.mark.skipif(not (shutil.which("ffmpeg") or os.path.exists(r"C:\ffmpeg\bin\ffmpeg.exe")),
                                  reason="ffmpeg not installed")
CFG = {"axis_row": 60, "half_band": 40, "direction": 1, "rel_threshold": 0.3, "min_area_frame": 300}


def synthetic(n=14, shape=(121, 301), axis=60, speed=4.0, dt=5.0, seed=0, blue=(), zone=30):
    """Bright bar along a horizontal rod whose right end moves at `speed` px/s; first frame has no flame.
    Frames listed in `blue` also get a dim blue-only zone `zone` px ahead of the bar: too dim for the
    brightness edge (v1), bright enough for the blue-channel edge."""
    rng = np.random.default_rng(seed)
    t = np.arange(n) * dt
    img = rng.normal(0.01, 0.003, (n,) + shape + (3,)).clip(0).astype(np.float32)
    for i in range(1, n):
        v = np.geomspace(50, 0.05, n)[i]
        right = int(round(80 + speed * t[i]))
        img[i, axis - 15:axis + 15, 30:right] = v
        if i in blue:
            img[i, axis - 15:axis + 15, right:right + zone] = (0.0, 0.0, 0.5 * v)
    return t, img


def is_rgb(a, rgb):
    return (np.asarray(a) == np.array(rgb, dtype=np.uint8)).all(-1)


def test_mm_px_round_trip():
    x = np.array([10.0, 123.4, 250.0])
    for sign in (1, -1):
        assert np.allclose(mm_to_px(px_to_mm(x, 100.0, 8.7, sign), 100.0, 8.7, sign), x)


def test_compose_draws_line_at_column_and_even_size():
    _, img = synthetic(n=3)
    w, h = frame_size(*img.shape[1:3])
    assert w % 2 == 0 and h % 2 == 0 and w >= img.shape[2]
    f = compose_frame(img[2], 150.0, 2, "t = 10.0 s", w, h)
    assert f.shape == (h, w, 3)
    assert tuple(f[img.shape[1] - 5, 150]) == LINE_RGB
    assert not is_rgb(f[:img.shape[1]], DIAG_RGB).any()          # no second line unless it is asked for


def test_frame_size_caps_width():
    w, h = frame_size(717 * 2, 1080 * 2)
    assert w <= 1280 and w % 2 == 0 and h % 2 == 0


def test_second_line_is_dashed_and_v1_stays_solid():
    """v1 edge at column 400: solid cyan. Blue-light front at column 460: dashed, thinner, magenta."""
    _, img = synthetic(n=3, shape=(201, 901), axis=150)
    ph = img.shape[1]
    w, h = frame_size(ph, img.shape[2])
    f = compose_frame(img[2], 400.0, 0, "t = 10.0 s", w, h, None, 460.0)
    below = np.arange(100, ph)                                   # rows below every label row
    assert is_rgb(f[below, 400], LINE_RGB).all()                 # solid: every row
    assert is_rgb(f[below, 399], LINE_RGB).all() and is_rgb(f[below, 401], LINE_RGB).all()   # 3 px wide
    dash = (below % (DASH_ON + DASH_OFF)) < DASH_ON
    for col in (459, 460):                                       # dashed, 2 px wide
        assert (is_rgb(f[below, col], DIAG_RGB) == dash).all()
    assert not is_rgb(f[below, 458], DIAG_RGB).any() and not is_rgb(f[below, 461], DIAG_RGB).any()
    # both labels are drawn: v1 on the trailing (left) side, the diagnostic one on the leading (right) side
    assert is_rgb(f[6:28, 150:392], LINE_RGB).any() and is_rgb(f[6:28, 468:720], DIAG_RGB).any()
    assert not is_rgb(f[6:28, 468:720], LINE_RGB).any() and not is_rgb(f[6:28, 150:392], DIAG_RGB).any()
    # legend in the caption bar: one cyan part and one magenta part
    assert is_rgb(f[ph + 30:, :], LINE_RGB).any() and is_rgb(f[ph + 30:, :], DIAG_RGB).any()


def test_front_is_drawn_without_a_v1_edge():
    _, img = synthetic(n=3, shape=(201, 901), axis=150)
    ph = img.shape[1]
    w, h = frame_size(ph, img.shape[2])
    f = compose_frame(img[2], np.nan, 0, "t = 10.0 s", w, h, None, 460.0)
    assert is_rgb(f[100:ph, 460], DIAG_RGB).any()
    assert not is_rgb(f[:ph], LINE_RGB).any()                    # no v1 line and no v1 label in the photo
    assert is_rgb(f[6:28, 468:720], DIAG_RGB).any()


def test_lines_on_the_same_column_both_stay_visible():
    _, img = synthetic(n=3, shape=(201, 901), axis=150)
    ph = img.shape[1]
    w, h = frame_size(ph, img.shape[2])
    for dx in (0, 1, 3):                                         # px between the two lines
        f = compose_frame(img[2], 400.0, 0, "t = 10.0 s", w, h, None, 400.0 + dx)
        strip = f[100:ph, 396:406]
        rows_v1 = is_rgb(strip, LINE_RGB).any(1)
        rows_front = is_rgb(strip, DIAG_RGB).any(1)
        assert rows_front.sum() >= 40 and rows_v1.sum() >= 30    # dashes of the front, v1 line in the gaps
        assert (rows_v1 | rows_front).mean() >= 0.85             # the rest: 1 px dark rows that end each dash


def label_boxes(x1, x2, w1, w2, img_w, lead=1, taken=()):
    return [(p[0], p[1], p[0] + w, p[1] + 22) for p, w in zip(place_labels(x1, x2, w1, w2, img_w, lead, taken=taken), (w1, w2))
            if p is not None]


def test_labels_never_overlap():
    small = make_fonts(1080)[0]
    w1, w2 = _text_w(V1_LABEL, small), _text_w(DIAG_LABEL, small)
    tag = (4, 4, 126, 36)                                        # the segment tag, top left
    for x1 in (20, 130, 300, 540, 800, 1000, 1070):
        for dx in (0, 1, 3, 6, 40, 250):
            for lead in (1, -1):
                x2 = x1 + lead * dx
                if not 0 <= x2 < 1080:
                    continue
                boxes = label_boxes(x1, x2, w1, w2, 1080, lead, taken=[tag])
                assert len(boxes) == 2
                assert not _hits(boxes[0], boxes[1]), (x1, x2, lead)
                for b in boxes:
                    assert b[0] >= 0 and b[2] <= 1080 and not _hits(b, tag), (x1, x2, lead)
    # with room on both sides: v1 label left of its line, diagnostic label right of its line, same row
    (a, b) = label_boxes(540, 543, w1, w2, 1080)
    assert a[2] == 540 - LABEL_GAP and b[0] == 543 + LABEL_GAP and a[1] == b[1]
    # no line cuts through the other line's label
    assert not (a[0] <= 543 <= a[2]) and not (b[0] <= 540 <= b[2])
    # one line missing: the other label is still placed
    assert place_labels(None, 300, w1, w2, 1080)[0] is None and place_labels(300, None, w1, w2, 1080)[1] is None


def test_fused_front_gate_and_counts():
    """The blue-light front leads the v1 edge where a blue-only zone runs ahead, equals it elsewhere,
    exists in a frame where the v1 edge is missing, and is not drawn outside the burn window."""
    t, img = synthetic(n=9, blue=(4, 5))
    v = float(img[6].max())
    img[6] = np.float32(0.01)                                    # frame 6: tiny bright core, large blue zone
    img[6, 45:75, 30:35] = v
    img[6, 45:75, 35:100] = (0.0, 0.0, 0.5 * v)
    cfg = {**CFG, "burn_window_s": [1, 37]}                      # frame 8 (t = 40 s) is after the burn window
    d = {"row0": np.array(0), "scale": np.array(4)}
    base = track_test(img, rel=0.3, **tracking_kw(cfg, d))
    _, _, burn = edge_reference(cfg, t, base)
    x1 = np.where(burn, base["edge_px"], np.nan)
    x2 = fused_front_px(img, cfg, d, t, chunk=4)
    assert np.isnan(x2[0]) and np.isnan(x2[8]) and np.isfinite(base["edge_px"][8])
    for i in (1, 2, 3, 7):
        assert x2[i] == x1[i]                                    # no blue zone: same column as v1
    for i in (4, 5):
        assert x2[i] - x1[i] == 30                               # blue zone 30 px ahead
    assert np.isnan(x1[6]) and x2[6] == 99                       # v1 missing, front at the zone's last column
    assert np.array_equal(x2, fused_front_px(img, cfg, d, t, chunk=100), equal_nan=True)   # chunking changes nothing
    st = front_stats(x1, x2, 10.0, 1)                            # 10 px/mm: 30 px = 3 mm
    assert st == {"front": 7, "v1": 6, "front_only": 1, "ahead_1mm": 2}
    assert front_stats(x1, x2, 40.0, 1)["ahead_1mm"] == 0        # 30 px = 0.75 mm: not more than 1 mm
    rows = [{"t_s": 30.0, "edge_mm": np.nan}, {"t_s": 5.0, "edge_mm": 1.234}]
    assert caption_text("SYN1", rows[0], 6, 9, True).endswith("no v1 edge")
    assert caption_text("SYN1", rows[0], 6, 9, False).endswith("no flame tracked")
    assert caption_text("SYN1", rows[1], 1, 9, True).endswith("v1 edge 1.23 mm")


@needs_ffmpeg
def test_overlay_cli_meets_contract(tmp_path, capsys):
    t, img = synthetic(blue=(6, 7, 8, 9))
    cfg = {"test_id": "SYN1", "nef_dir": str(tmp_path / "none"), "axis_row": 60, "half_band": 40,
           "direction": 1, "rel_threshold": 0.3, "min_area_frame": 300, "burn_window_s": [1, 1e9]}
    cfg_path = tmp_path / "SYN1.json"; cfg_path.write_text(json.dumps(cfg), encoding="utf-8")
    cache = tmp_path / "syn_cache.npz"
    np.savez(cache, t=t, t_unix=t + 1e9, shutter=np.ones_like(t), img=img, names=np.array([f"f{i}" for i in range(len(t))]),
             scale=np.array(4), row0=np.array(0))
    # edges CSV exactly as run.py would write it (same helpers), px/mm = 40 full res -> 10 at 1/4 scale
    d = {"t": t, "img": img, "scale": np.array(4), "row0": np.array(0)}
    base = track_test(img, rel=0.3, min_area=50, **tracking_kw(cfg, d))
    ref, valid, _ = edge_reference(cfg, t, base)
    mm = np.where(valid, px_to_mm(base["edge_px"], ref, 10.0, 1), np.nan)
    edges = tmp_path / "data" / "derived" / "edges"; edges.mkdir(parents=True)
    with open(edges / "SYN1.csv", "w", newline="", encoding="utf-8") as h:
        w = csv.writer(h); w.writerow(["test_id", "t_s", "edge_mm", "segment"])
        for i in range(len(t)):
            w.writerow(["SYN1", f"{t[i]:.2f}", "" if np.isnan(mm[i]) else f"{mm[i]:.3f}", "1" if 4 <= i <= 9 else ""])
    before = (edges / "SYN1.csv").read_bytes()
    overlay_main([str(cfg_path), "--cache", str(cache), "--repo", str(tmp_path), "--px-per-mm", "40"])
    assert (edges / "SYN1.csv").read_bytes() == before              # display only: the edges CSV is not touched
    log = capsys.readouterr().out
    assert "blue-light front (diagnostic) in 13 frames, v1 edge in 13" in log
    assert "front more than 1 mm ahead of the v1 edge in 4" in log  # the 4 frames with a 3 mm blue zone
    out = tmp_path / "web" / "public" / "overlays" / "SYN1.mp4"
    assert out.exists() and out.stat().st_size <= 15 * 1024 * 1024
    probe = json.loads(subprocess.run(
        [FFPROBE, "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(out)],
        capture_output=True, text=True, check=True).stdout)
    streams = probe["streams"]
    assert [s["codec_type"] for s in streams] == ["video"]          # no audio
    v = streams[0]
    assert v["codec_name"] == "h264" and v["pix_fmt"] == "yuv420p"
    assert v["r_frame_rate"] == "10/1" and v["avg_frame_rate"] == "10/1"
    assert int(v["nb_read_frames"]) == len(t)                       # one frame per edges row
    assert int(v["width"]) <= 1280
    data = out.read_bytes()                                          # +faststart: moov before mdat
    assert 0 <= data.find(b"moov") < data.find(b"mdat")
