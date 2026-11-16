# Written with AI assistance (Claude Code)
"""Display-only visuals made from the real NASA BASS-II photos (PSI-25, CC0). They change no rate and no data file.

1. space-time image ("kymograph"): the flame's light along the rod (x, mm) against time (y, s), true colour,
   with the v1 tracked edge and the fan-step windows drawn on. The front is the bright diagonal; its slope is
   the spread rate the tracker measures.
2. cinematic clip: the real photos cropped to the rod band, per-frame display stretch (same as the overlays),
   frame-interpolated to a smooth 1080p H.264 clip with no text (captions are added in the video edit).
3. 3D flame landscape: brightness along the rod x time as a 3D surface, rendered with an orbiting camera.

Every pixel comes from the exposure-normalized frame cache built from NASA's raw photos. Nothing is drawn by hand
except labels. Usage (from pipeline/):  python -m diagnostics.visuals --test B12 [--what kymo,clip,3d]
Outputs: docs/research/figures/visuals/<test>_*.png|mp4
"""
from __future__ import annotations
import argparse, csv, json, os, subprocess, sys
import numpy as np

PIPELINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PIPELINE_DIR)
from stillair_tracker.frames import load_test
from stillair_tracker.edge import track_test
from stillair_tracker.run import edge_reference, mm_to_px, tracking_kw
from stillair_tracker.run_all import DEFAULT_CACHE_DIR, cache_path
from stillair_tracker import overlay as ov

WM = "Built with AI assistance (Claude Code). Images: NASA BASS-II (PSI-25)."


def load(tid, repo, cache_dir):
    cfg = json.load(open(os.path.join(repo, "pipeline", "configs", f"{tid}.json"), encoding="utf-8"))
    d = load_test(cfg["nef_dir"], cache_path(cfg, cache_dir), tuple(cfg["cache_rows"]) if "cache_rows" in cfg else None)
    kw = tracking_kw(cfg, d)
    with open(os.path.join(repo, "data", "derived", "spread_rates.csv"), encoding="utf-8") as h:
        sr = [r for r in csv.DictReader(l for l in h if not l.startswith("#")) if r["test_id"] == tid]
    scale_full = next(float(r["notes"].split("scale ")[1].split("+/-")[0]) for r in sr if "scale " in r["notes"])
    ppm = scale_full / int(d["scale"])
    rows = ov.read_edges(os.path.join(repo, "data", "derived", "edges", f"{tid}.csv"))
    return cfg, d, kw, ppm, rows, sr


def stretch(f):
    """Per-frame display stretch, identical in spirit to overlay.display_stretch: sqrt(value / p99.5 of luminance)."""
    f = f.astype(np.float32)
    p = float(np.percentile(f.mean(-1), 99.5)) or 1.0
    return np.sqrt(np.clip(f / p, 0, 1))


def kymo(tid, repo, cache_dir, out):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    cfg, d, kw, ppm, rows, sr = load(tid, repo, cache_dir)
    img, t = d["img"], d["t"]
    ax_r, hb = kw["axis_row"], kw["half_band"]
    w0b, w1b = cfg["burn_window_s"]
    sel = np.where((t >= w0b) & (t <= w1b))[0]
    img, t = img[sel], t[sel]
    rows = [rows[i] for i in sel]
    t0 = t[0]

    def line(f):
        b = f[max(0, ax_r - hb):ax_r + hb].astype(np.float32)
        b = np.clip(b - np.median(b, axis=(0, 1)), 0, None)             # remove the frame's black level per channel
        prof = np.percentile(b, 90, axis=0)                               # robust to single hot pixels (a max is not)
        p = float(np.percentile(prof.mean(-1), 99.5)) or 1.0
        return np.sqrt(np.clip(prof / p, 0, 1))
    lines = np.stack([line(f) for f in img])                              # (N, W, 3)
    # uniform time grid (photos are not evenly spaced): nearest earlier photo
    tg = np.linspace(t[0], t[-1], 900)
    idx = np.clip(np.searchsorted(t, tg, side="right") - 1, 0, len(t) - 1)
    grid = lines[idx]
    W = grid.shape[1]
    x_mm = (np.arange(W) - (W / 2)) / ppm
    base = track_test(img.astype(np.float32) if img.dtype != np.float32 else img, rel=cfg.get("rel_threshold", 0.3), **kw)
    ref, _, _ = edge_reference(cfg, t, base)
    edge_mm = np.array([r["edge_mm"] for r in rows])
    x_px = mm_to_px(edge_mm, ref, ppm, cfg["direction"])
    fig, a = plt.subplots(figsize=(12, 7.5), dpi=160, facecolor="black")
    a.set_facecolor("black")
    a.imshow(grid, aspect="auto", origin="upper", extent=[x_mm[0], x_mm[-1], tg[-1] - t0, 0], interpolation="bilinear")
    ok = np.isfinite(x_px)
    a.plot((x_px[ok] - W / 2) / ppm, t[ok] - t0, color="#36e3ff", lw=1.2, alpha=0.9, label="tracked flame edge (v1)")
    for s, (w0, w1) in zip(cfg["steps"], cfg["windows_s"]):
        a.axhspan(w0 - t0, w1 - t0, xmin=0, xmax=0.012, color="#ffd166", alpha=0.9)
        a.text(x_mm[0] + 0.02 * (x_mm[-1] - x_mm[0]), (w0 + w1) / 2 - t0, f" fan step {s['flow_cm_s']} cm/s",
               color="#ffd166", fontsize=9, va="center")
    for sp in a.spines.values():
        sp.set_color("#666")
    a.tick_params(colors="#ccc")
    a.set_xlabel("position along the rod (mm)", color="#ddd")
    a.set_ylabel("time since first photo (s)", color="#ddd")
    a.set_title(f"{tid}: a flame creeping along a plastic rod on the space station, every photo stacked in time.\n"
                "The bright diagonal is the flame; its slope is the spread rate.", color="white", fontsize=12, loc="left")
    a.legend(loc="lower right", facecolor="black", edgecolor="#444", labelcolor="#ddd", fontsize=9)
    fig.text(0.01, 0.005, WM, color="#888", fontsize=8)
    fig.tight_layout(rect=(0, 0.02, 1, 1))
    p = os.path.join(out, f"{tid}_space_time.png")
    fig.savefig(p, facecolor="black"); plt.close(fig)
    return p


def clip(tid, repo, cache_dir, out, seconds=8.0, fps=30):
    cfg, d, kw, ppm, rows, sr = load(tid, repo, cache_dir)
    img = d["img"]
    ax_r, hb = kw["axis_row"], kw["half_band"]
    H, W = img.shape[1], img.shape[2]
    r0 = max(0, ax_r - int(hb * 1.6)); r1 = min(H, ax_r + int(hb * 1.6))
    lum = np.array([float(np.percentile(f[r0:r1].astype(np.float32).mean(-1), 99.5)) for f in img])
    keep = np.where(lum > 3 * np.median(lum[:5] + 1e-6))[0] if lum.max() > 0 else np.arange(len(img))
    keep = keep if len(keep) > 10 else np.arange(len(img))
    # crop to the columns the flame actually occupies over the burn (plus a margin), so it fills the frame
    occ = np.zeros(W, bool)
    for i in keep[:: max(1, len(keep) // 40)]:
        b = img[i][r0:r1].astype(np.float32).mean(-1)
        b = b - np.median(b)
        occ |= (np.percentile(b, 95, axis=0) > 0.25 * np.percentile(b, 99.9))
    cols = np.nonzero(occ)[0]
    c0, c1 = (max(0, cols.min() - 80), min(W, cols.max() + 160)) if len(cols) else (0, W)
    c1 = c0 + ((c1 - c0) // 2) * 2
    tmp = os.path.join(out, f"_{tid}_frames.rgb")
    ch = (r1 - r0) // 2 * 2
    W = c1 - c0
    with open(tmp, "wb") as h:
        for i in keep:
            g = stretch(img[i][r0:r0 + ch, c0:c1])
            h.write((np.clip(g, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes())
    src_fps = max(1.0, len(keep) / seconds)
    p = os.path.join(out, f"{tid}_flame_clip.mp4")
    ff = ov.ffmpeg_exe()
    cmd = [ff, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{ch}", "-r", f"{src_fps:.4f}", "-i", tmp,
           "-vf", f"minterpolate=fps={fps}:mi_mode=blend,scale=1920:-2:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", p]
    subprocess.run(cmd, check=True)
    os.remove(tmp)
    web = os.path.join(out, f"{tid}_flame_clip_web.mp4")   # small copy for the website (720p, higher compression)
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", p, "-vf", "scale=1280:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-crf", "27", "-preset", "slow", "-an", "-movflags", "+faststart", web], check=True)
    return p


def landscape(tid, repo, cache_dir, out, frames=150, fps=30):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import cm
    cfg, d, kw, ppm, rows, sr = load(tid, repo, cache_dir)
    img, t = d["img"], d["t"]
    ax_r, hb = kw["axis_row"], kw["half_band"]
    from scipy import ndimage as ndi
    w0b, w1b = cfg["burn_window_s"]
    sel = np.where((t >= w0b) & (t <= w1b))[0]
    img, t = img[sel], t[sel]

    def prof(f):   # same robust profile as the space-time image: black level removed, 90th percentile across the band
        b = f[max(0, ax_r - hb):ax_r + hb].astype(np.float32).mean(-1)
        b = np.clip(b - np.median(b), 0, None)
        p = np.percentile(b, 90, axis=0)
        return np.sqrt(np.clip(p / (np.percentile(p, 99.5) or 1.0), 0, 1))
    L = ndi.gaussian_filter(np.stack([prof(f) for f in img]), sigma=(1.0, 3.0))
    step = max(1, L.shape[1] // 220)
    Z = L[:, ::step]
    X = (np.arange(Z.shape[1]) * step - L.shape[1] / 2) / ppm
    T = t - t[0]
    XX, TT = np.meshgrid(X, T)
    tmp_dir = os.path.join(out, f"_{tid}_3d"); os.makedirs(tmp_dir, exist_ok=True)
    fig = plt.figure(figsize=(12.8, 7.2), dpi=150, facecolor="black")
    a = fig.add_subplot(111, projection="3d", facecolor="black")
    a.plot_surface(XX, TT, Z, cmap=cm.inferno, rstride=1, cstride=1, linewidth=0, antialiased=True)
    a.set_xlabel("along the rod (mm)", color="#ccc"); a.set_ylabel("time (s)", color="#ccc"); a.set_zlabel("flame light (relative)", color="#ccc")
    for axis in (a.xaxis, a.yaxis, a.zaxis):
        axis.set_pane_color((0, 0, 0, 1)); axis.label.set_color("#ccc")
    a.tick_params(colors="#999")
    fig.text(0.02, 0.95, f"{tid}: flame light along the rod over time, from NASA's space-station photos", color="white", fontsize=13)
    fig.text(0.02, 0.02, WM, color="#888", fontsize=8)
    for k in range(frames):
        a.view_init(elev=28 + 6 * np.sin(2 * np.pi * k / frames), azim=-70 + 120 * k / frames)
        fig.savefig(os.path.join(tmp_dir, f"f{k:04d}.png"), facecolor="black")
    plt.close(fig)
    p = os.path.join(out, f"{tid}_flame_landscape_3d.mp4")
    subprocess.run([ov.ffmpeg_exe(), "-y", "-loglevel", "error", "-framerate", str(fps), "-i", os.path.join(tmp_dir, "f%04d.png"),
                    "-vf", "scale=1920:1080:flags=lanczos", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", p], check=True)
    for f in os.listdir(tmp_dir):
        os.remove(os.path.join(tmp_dir, f))
    os.rmdir(tmp_dir)
    return p


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=os.path.dirname(PIPELINE_DIR))
    ap.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR)
    ap.add_argument("--test", default="B12")
    ap.add_argument("--what", default="kymo,clip,3d")
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)
    out = os.path.join(repo, "docs", "research", "figures", "visuals"); os.makedirs(out, exist_ok=True)
    for w in a.what.split(","):
        fn = {"kymo": kymo, "clip": clip, "3d": landscape}[w]
        print(w, fn(a.test, repo, a.cache_dir, out), flush=True)


if __name__ == "__main__":
    main()
