# Written with AI assistance (Claude Code)
"""Decode Nikon NEF frames to linear, exposure-normalized arrays with EXIF times."""
from __future__ import annotations
import glob, os
from datetime import datetime
from fractions import Fraction
import numpy as np


def exif_time_and_shutter(path: str) -> tuple[float, float]:
    """Return (unix seconds incl. sub-seconds, exposure time in s) from EXIF."""
    import exifread
    with open(path, "rb") as h:
        tags = exifread.process_file(h, details=False)
    dt = datetime.strptime(str(tags["EXIF DateTimeOriginal"]), "%Y:%m:%d %H:%M:%S")
    sub = str(tags.get("EXIF SubSecTimeOriginal", "0")).strip() or "0"
    return dt.timestamp() + float("0." + sub), float(Fraction(str(tags["EXIF ExposureTime"])))


def load_test(nef_dir: str, cache: str | None = None, rows: tuple[int, int] | None = None) -> dict:
    """Load all frames of one test at 1/4 resolution, linear light divided by shutter time.

    f-number and ISO are constant within a BASS-II test (f/2.0, ISO 1000 for P16), so dividing
    by shutter time is the full exposure correction. Times are seconds since the first photo.
    """
    if cache and os.path.exists(cache):
        d = np.load(cache)
        out = {k: d[k] for k in d.files}
        if "t_unix" not in out:  # older cache format: absolute times, implicit 1/4 scale
            out["t_unix"] = out["t"]; out["t"] = out["t"] - out["t"][0]; out["scale"] = np.array(4)
        return out
    import rawpy
    files = sorted(glob.glob(os.path.join(nef_dir, "**", "*.NEF"), recursive=True))
    t, sh, imgs = [], [], []
    for f in files:
        ti, si = exif_time_and_shutter(f)
        with rawpy.imread(f) as r:
            rgb = r.postprocess(half_size=True, gamma=(1, 1), no_auto_bright=True,
                                output_bps=16, use_camera_wb=True).astype(np.float32)
        q = rgb[::2, ::2] / 65535.0 / si
        if rows is not None:  # keep a band around the rod axis to bound memory (row offset saved)
            q = q[rows[0]:rows[1]]
        imgs.append(q.astype(np.float16))
        t.append(ti); sh.append(si)
    t = np.array(t)
    out = {"t": t - t[0], "t_unix": t, "shutter": np.array(sh), "img": np.stack(imgs),
           "names": np.array([os.path.basename(f) for f in files]), "scale": np.array(4),
           "row0": np.array(rows[0] if rows else 0)}
    if cache:
        np.savez_compressed(cache, **out)
    return out
