# Written with AI assistance (Claude Code)
"""Synthetic video: a bright front moving DOWN at a known speed must come back within 1%."""
import os, sys, subprocess, tempfile, shutil
import numpy as np, pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from stillair_tracker.video import track_video, srgb_to_linear

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def test_srgb_roundtrip_endpoints():
    v = srgb_to_linear(np.array([0, 255], dtype=np.uint8))
    assert v[0] == 0 and abs(v[1] - 1) < 1e-6


def test_downward_front_rate_within_1pct():
    fps, n, h, w = 30, 150, 320, 120
    speed_px_s = 40.0                       # front moves down 40 px/s at full res
    px_per_mm = 8.0                         # -> 5 mm/s
    frames = np.full((n, h, w, 3), 10, np.uint8)
    for i in range(n):
        y = int(round(20 + speed_px_s * i / fps))
        frames[i, 20:y, 40:80] = 230        # burnt-through/flame region grows downward
    d = tempfile.mkdtemp()
    try:
        p = os.path.join(d, "clip.mp4")
        cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
               "-r", str(fps), "-i", "-", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv444p", p]
        subprocess.run(cmd, input=frames.tobytes(), check=True)
        res = track_video(p, px_per_mm, scale=1, rotate_k=1)
        assert abs(res["rate_mm_s"] - speed_px_s / px_per_mm) / (speed_px_s / px_per_mm) < 0.01
    finally:
        shutil.rmtree(d, ignore_errors=True)


def test_rotation_tagged_phone_clip_rate_within_1pct():
    """Phone clips carry a display-rotation tag; it must be ignored (-noautorotate) so rotate_k alone
    sets orientation (bug found by code review: tagged clips gave ~0 mm/s)."""
    fps, n, h, w = 30, 150, 320, 120
    frames = np.full((n, h, w, 3), 10, np.uint8)
    for i in range(n):
        frames[i, 20:int(round(20 + 40.0 * i / fps)), 40:80] = 230
    d = tempfile.mkdtemp()
    try:
        p, q = os.path.join(d, "clip.mp4"), os.path.join(d, "tagged.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
                        "-r", str(fps), "-i", "-", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv444p", p],
                       input=frames.tobytes(), check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-display_rotation", "90", "-i", p, "-c", "copy", q], check=True)
        res = track_video(q, 8.0, scale=1, rotate_k=1)
        assert abs(res["rate_mm_s"] - 5.0) / 5.0 < 0.01
    finally:
        shutil.rmtree(d, ignore_errors=True)
