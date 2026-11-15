# Written with AI assistance (Claude Code)
"""Video input for the Earth paper-strip control (Plan B / control_result.json): decode with ffmpeg,
convert sRGB to linear light (IEC 61966-2-1), rotate so the flame spreads toward +x, and track with
the same edge code as the BASS-II photos."""
from __future__ import annotations
import json, subprocess
import numpy as np
from .edge import track_test
from .segment import fit_line


def srgb_to_linear(v: np.ndarray) -> np.ndarray:
    v = v.astype(np.float32) / 255.0
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def probe(path: str) -> tuple[int, int, float]:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,r_frame_rate", "-of", "json", path],
                         capture_output=True, text=True, check=True).stdout
    s = json.loads(out)["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    return int(s["width"]), int(s["height"]), float(num) / float(den)


def read_frames(path: str, step: int = 1, scale: int = 2, rotate_k: int = 0):
    """Return (t_s, frames[N,H,W,3] linear) taking every `step`-th frame, downscaled by `scale`.
    Frames are decoded at their CODED size (-noautorotate), so a phone clip's display-rotation tag
    is ignored and rotate_k alone sets the orientation.
    rotate_k = number of 90-degree counter-clockwise rotations so the spread direction is +x
    (a strip burning downward in the frame needs rotate_k=1)."""
    w, h, fps = probe(path)
    w2, h2 = w // scale, h // scale
    cmd = ["ffmpeg", "-v", "error", "-noautorotate", "-i", path, "-vf", f"scale={w2}:{h2}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    arr = np.frombuffer(raw, np.uint8).reshape(-1, h2, w2, 3)[::step]
    frames = np.stack([np.rot90(srgb_to_linear(f), k=rotate_k) for f in arr])
    t = np.arange(len(arr)) * step / fps
    return t, frames


def track_video(path: str, px_per_mm: float, step: int = 1, scale: int = 2, rotate_k: int = 0,
                rel: float = 0.3, axis_row: int | None = None, half_band: int = 10_000,
                t_window: tuple[float, float] | None = None) -> dict:
    """Rate in mm/s from a video. px_per_mm is at FULL video resolution (from the ruler), divided by
    `scale` internally. Returns rate, ci95, threshold_spread, n_frames, t_start, t_end."""
    t, fr = read_frames(path, step, scale, rotate_k)
    ppm = px_per_mm / scale
    res = {}
    for r in (rel * 0.8, rel, rel * 1.2):
        tr = track_test(fr, rel=r, axis_row=axis_row, half_band=half_band, min_area=20, direction=1)
        x = tr["edge_px"] / ppm
        m = ~np.isnan(x)
        if t_window: m &= (t >= t_window[0]) & (t <= t_window[1])
        slope, _, ci = fit_line(t[m], x[m])
        res[r] = (slope, ci, int(m.sum()), float(t[m].min()), float(t[m].max()))
    s, ci, n, t0, t1 = res[rel]
    alt = [res[rel * 0.8][0], res[rel * 1.2][0]]
    return {"rate_mm_s": s, "ci95_mm_s": ci, "threshold_spread_mm_s": (max(alt) - min(alt)) / 2,
            "n_frames": n, "t_start_s": t0, "t_end_s": t1}
