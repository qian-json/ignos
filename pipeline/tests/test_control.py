# Written with AI assistance (Claude Code)
"""Synthetic downward-burning strip: hand crossings and tracker must agree, and the output must
match contract control/1's fields."""
import os, sys, subprocess, tempfile, shutil, json
import numpy as np, pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from stillair_tracker.control import build, hand_rate

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def test_hand_rate_needs_three_marks():
    with pytest.raises(SystemExit):
        hand_rate([(10, 0), (20, 5)])


def test_control_result_shape_and_agreement():
    fps, n, h, w, speed, ppm = 30, 240, 400, 120, 16.0, 8.0     # 16 px/s at 8 px/mm -> 2 mm/s
    frames = np.full((n, h, w, 3), 12, np.uint8)
    for i in range(n):
        frames[i, 20:int(round(20 + speed * i / fps)), 45:75] = 235
    d = tempfile.mkdtemp()
    try:
        p = os.path.join(d, "strip.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
                        "-r", str(fps), "-i", "-", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv444p", p],
                       input=frames.tobytes(), check=True)
        crossings = [(mm, (20 + mm * ppm - 20) / speed) for mm in (2.0, 4.0, 6.0, 8.0, 10.0)]  # true hand times
        res = build(p, ppm, crossings, "2026-11-14T23:30:00Z", "synthetic", rotate_k=1, scale=1)
        assert res["contract"] == "control/1" and res["test_id"] == "CTRL-1"
        assert set(res) >= {"clip", "hand", "tracker", "diff_pct", "notes"}
        assert set(res["tracker"]) == {"rate_mm_s", "ci95_mm_s", "threshold_spread_mm_s", "n_frames", "t_start_s", "t_end_s"}
        assert abs(res["hand"]["rate_mm_s"] - 2.0) < 1e-6
        assert abs(res["diff_pct"]) < 2.0
    finally:
        shutil.rmtree(d, ignore_errors=True)
