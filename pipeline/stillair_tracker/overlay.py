# Written with AI assistance (Claude Code)
"""Render the tracker overlay video web/public/overlays/<test_id>.mp4 (DATA_CONTRACTS section 3).

One video frame per photo at a constant 10 fps: frame i = row i of data/derived/edges/<test_id>.csv.
Each frame shows the exposure-normalized photo with a per-frame display stretch and two vertical lines:

- Solid cyan line: the v1 edge, read from edges/<test_id>.csv (drawn when edge_mm is not empty).
  Every reported rate uses this edge. Label: "v1 edge (used for the rates)".
- Thin dashed magenta line: the blue-light front. It is the fused edge of edge.track_test_fused
  (the front-most of the brightness edge and the blue-channel edge), with the same tracking
  arguments and the same frame gate as the run. It is a DIAGNOSTIC ONLY. The fused edge did not
  pass its pre-registered held-out test (pipeline/PREREGISTRATION.md,
  docs/research/v2_eval_heldout.json), so no reported number uses it. It is drawn in every frame
  where it exists, also where the v1 edge is missing. Label: "blue-light front (diagnostic)".

Also drawn: the segment number (inside a fitted segment) and a two-row caption bar. Row 1 has
t_s, the photo number and the v1 edge_mm. Row 2 is the legend. This module changes the picture
only. It writes no number to any data file. Frames are piped to ffmpeg as raw RGB (H.264,
yuv420p, +faststart, no audio).

Usage: python -m stillair_tracker.overlay configs/B16.json --cache <npz> --repo ..
"""
from __future__ import annotations
import argparse, csv, json, os, shutil, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from .frames import load_test
from .edge import track_test, track_test_fused
from .run import calibrate, edge_reference, mm_to_px, tracking_kw

FPS = 10
MAX_W = 1280
MAX_BYTES = 15 * 1024 * 1024
BAR_H = 60                      # caption bar: row 1 = caption, row 2 = legend
LINE_RGB = (0, 255, 255)        # v1 edge: solid, 3 px
DIAG_RGB = (255, 80, 255)       # blue-light front: dashed, 2 px. Light magenta: not cyan, not flame blue or yellow.
SEG_RGB = (255, 210, 0)
DASH_ON, DASH_OFF = 10, 10      # px along the dashed line; the gaps keep a v1 line under it visible
V1_LABEL = "v1 edge (used for the rates)"
DIAG_LABEL = "blue-light front (diagnostic)"
LEGEND_V1 = "solid = v1 edge, used for the rates;"
LEGEND_DIAG = "dashed = blue-light front, diagnostic only"
LABEL_ROWS = (6, 40, 64, 88)    # y of the label rows inside the photo; row 2 starts below the segment tag
LABEL_GAP = 8                   # px between a line and its label


def read_edges(path: str) -> list[dict]:
    """Rows of an edges CSV with edge_mm as float (NaN when empty) and segment as int (0 when empty)."""
    with open(path, newline="", encoding="utf-8") as h:
        rows = list(csv.DictReader(h))
    return [{"test_id": r["test_id"], "t_s": float(r["t_s"]),
             "edge_mm": float(r["edge_mm"]) if r["edge_mm"] != "" else np.nan,
             "segment": int(r["segment"]) if r["segment"] != "" else 0} for r in rows]


def fused_front_px(img: np.ndarray, cfg: dict, d: dict, t: np.ndarray, chunk: int = 8) -> np.ndarray:
    """Column of the blue-light front per frame, NaN where it does not exist. Display only.

    This is edge.track_test_fused with the tracking arguments of the run (rel_threshold and
    run.tracking_kw) and the frame gate of the run (run.edge_reference: flame area at least
    min_area_frame, inside the burn window). The area of the fused edge is the larger of the
    brightness and blue areas, so it can exist in a frame where the v1 edge is missing.
    Frames go through in chunks because track_test_fused copies the blue channel. The result is
    the same, because every frame is tracked on its own."""
    kw = dict(rel=cfg.get("rel_threshold", 0.3), **tracking_kw(cfg, d))
    parts = [track_test_fused(img[i:i + chunk], **kw) for i in range(0, len(img), chunk)]
    fused = {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}
    _, _, burn = edge_reference(cfg, t, fused)
    return np.where(burn, fused["edge_px"], np.nan)


def front_stats(x_px, x2_px, ppm: float, direction: int) -> dict:
    """Frame counts for the log: frames with the blue-light front, frames with the v1 edge, frames
    with the front but no v1 edge, and frames where the front is more than 1 mm ahead (upstream)
    of the v1 edge. x_px, x2_px: columns in the tracked frame; ppm: px/mm at that resolution."""
    x_px, x2_px = np.asarray(x_px, dtype=float), np.asarray(x2_px, dtype=float)
    has1, has2 = np.isfinite(x_px), np.isfinite(x2_px)
    both = has1 & has2
    ahead_mm = direction * (x2_px[both] - x_px[both]) / ppm
    return {"front": int(has2.sum()), "v1": int(has1.sum()), "front_only": int((has2 & ~has1).sum()),
            "ahead_1mm": int(np.sum(ahead_mm > 1.0))}


def display_stretch(rgb: np.ndarray, pct: float = 99.5) -> np.ndarray:
    """uint8 RGB: sqrt(value / this frame's `pct` percentile of luminance), clipped to [0, 1].
    Per frame, so the dim late flames (~1000x fainter) stay visible. Display only."""
    rgb = np.asarray(rgb, dtype=np.float32)
    p = float(np.percentile(rgb.mean(-1), pct))
    if not np.isfinite(p) or p <= 0:
        p = float(rgb.max()) or 1.0
    return (np.sqrt(np.clip(rgb / p, 0.0, 1.0)) * 255.0 + 0.5).astype(np.uint8)


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def _text_w(text: str, font) -> int:
    return int(np.ceil(font.getlength(text)))


def make_fonts(out_w: int) -> tuple:
    """(label font, segment font, legend font). The legend font shrinks until the legend fits out_w."""
    size = 18
    while size > 8 and legend_width(_font(size)) > out_w - 20:
        size -= 1
    return _font(18), _font(22), _font(size)


def legend_width(font) -> int:
    """Width of the legend row: solid swatch, v1 text, dashed swatch, diagnostic text."""
    sw = 2 * (DASH_ON + DASH_OFF) + DASH_ON
    return sw + 8 + _text_w(LEGEND_V1, font) + 18 + sw + 8 + _text_w(LEGEND_DIAG, font)


def _hits(a, b) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def place_labels(x1, x2, w1: int, w2: int, img_w: int, lead: int = 1, text_h: int = 22, taken=()) -> tuple:
    """Top-left corners ((x, y) or None) for the v1 label and the blue-light-front label.

    x1, x2: line columns in the output frame (None = no line). w1, w2: label text widths.
    The v1 label goes on the trailing side of its line and the diagnostic label on the leading
    side (lead = +1 when the flame spreads to the right), so no line cuts through a label when
    the diagnostic line is ahead. A label moves down a row, then to the other side, when it
    would leave the picture or touch the other label, the other line or a box in `taken`
    (the segment tag). The two labels never overlap, also when the lines are on the same column."""
    boxes = list(taken)
    out = []
    for x, w, side, other in ((x1, w1, -lead, x2), (x2, w2, lead, x1)):
        if x is None:
            out.append(None)
            continue
        avoid = boxes + ([(other - 4, 0, other + 5, 10 ** 6)] if other is not None else [])
        cands = [((x + LABEL_GAP) if s > 0 else (x - LABEL_GAP - w), y) for s in (side, -side) for y in LABEL_ROWS]
        ok = [c for c in cands if c[0] >= 2 and c[0] + w <= img_w - 2
              and not any(_hits((c[0] - 2, c[1] - 2, c[0] + w + 2, c[1] + text_h), b) for b in avoid)]
        if not ok:   # picture narrower than the label: clamp, and keep clear of the other label only
            ok = [(min(max(2, c[0]), max(2, img_w - 2 - w)), c[1]) for c in cands]
            ok = [c for c in ok if not any(_hits((c[0] - 2, c[1] - 2, c[0] + w + 2, c[1] + text_h), b) for b in boxes)] or ok
        tx, ty = ok[0]
        boxes.append((tx - 2, ty - 2, tx + w + 2, ty + text_h))
        out.append((tx, ty))
    return tuple(out)


def _dashed_vline(d, x: int, y0: int, y1: int, fill) -> None:
    """Vertical dashed line, 2 px wide (columns x-1 and x), each dash with a 1 px dark outline."""
    for y in range(y0, y1 + 1, DASH_ON + DASH_OFF):
        ye = min(y + DASH_ON - 1, y1)
        d.rectangle([x - 2, max(y0, y - 1), x + 1, min(y1, ye + 1)], fill=(0, 0, 0))
        d.rectangle([x - 1, y, x, ye], fill=fill)


def _legend(d, x: int, y: int, font) -> None:
    """Legend row at (x, y): a solid cyan swatch and a dashed magenta swatch, each with its text."""
    sw = 2 * (DASH_ON + DASH_OFF) + DASH_ON
    cy = y + 11
    d.rectangle([x, cy - 1, x + sw - 1, cy + 1], fill=LINE_RGB)
    x += sw + 8
    d.text((x, y), LEGEND_V1, fill=LINE_RGB, font=font)
    x += _text_w(LEGEND_V1, font) + 18
    for k in range(3):
        x0 = x + k * (DASH_ON + DASH_OFF)
        d.rectangle([x0, cy - 1, x0 + DASH_ON - 1, cy], fill=DIAG_RGB)
    x += sw + 8
    d.text((x, y), LEGEND_DIAG, fill=DIAG_RGB, font=font)


def compose_frame(rgb: np.ndarray, x_px: float | None, segment: int, caption: str,
                  out_w: int, out_h: int, fonts=None, x2_px: float | None = None, lead: int = 1) -> np.ndarray:
    """One output frame (out_h x out_w x 3 uint8): stretched photo (scaled to out_w if wider), the
    v1 edge as a solid line at column x_px of the input photo, the blue-light front as a dashed
    line at column x2_px (diagnostic; None or NaN = not drawn), both labels, the segment tag, and
    the caption bar (caption, then the legend). `lead` is the spread direction (+1 = to the right)."""
    small, big, legend = fonts or make_fonts(out_w)
    h, w = rgb.shape[:2]
    s = min(1.0, out_w / w)
    im = Image.fromarray(display_stretch(rgb))
    if s < 1.0:
        im = im.resize((int(round(w * s)), int(round(h * s))), Image.LANCZOS)
    canvas = Image.new("RGB", (out_w, out_h), (0, 0, 0))
    canvas.paste(im, (0, 0))
    d = ImageDraw.Draw(canvas)
    pw, ph = im.size

    def column(v):
        if v is None or not np.isfinite(v):
            return None
        x = int(round(v * s))
        return x if 0 <= x < pw else None

    x1, x2 = column(x_px), column(x2_px)
    if x1 is not None:
        d.line([(x1 - 2, 0), (x1 - 2, ph - 1)], fill=(0, 0, 0), width=1)  # dark outline for contrast
        d.line([(x1 + 2, 0), (x1 + 2, ph - 1)], fill=(0, 0, 0), width=1)
        d.rectangle([x1 - 1, 0, x1 + 1, ph - 1], fill=LINE_RGB)
    if x2 is not None:   # drawn second: its dashes show on top of a v1 line on the same column, the gaps show the v1 line
        _dashed_vline(d, x2, 0, ph - 1, DIAG_RGB)
    taken = []
    if segment:
        tag = f"segment {segment}"
        bb = d.textbbox((10, 8), tag, font=big)
        box = (bb[0] - 6, bb[1] - 4, bb[2] + 6, bb[3] + 4)
        d.rectangle(box, fill=(0, 0, 0))
        d.text((10, 8), tag, fill=SEG_RGB, font=big)
        taken.append(box)
    p1, p2 = place_labels(x1, x2, _text_w(V1_LABEL, small), _text_w(DIAG_LABEL, small), pw, lead, taken=taken)
    if p1:
        d.text(p1, V1_LABEL, fill=LINE_RGB, font=small, stroke_width=2, stroke_fill=(0, 0, 0))
    if p2:
        d.text(p2, DIAG_LABEL, fill=DIAG_RGB, font=small, stroke_width=2, stroke_fill=(0, 0, 0))
    d.text((10, ph + 6), caption, fill=(230, 230, 230), font=small)
    _legend(d, 10, ph + 32, legend)
    return np.asarray(canvas, dtype=np.uint8)


def frame_size(h: int, w: int) -> tuple[int, int]:
    """(out_w, out_h): width <= MAX_W, caption bar added, both even (yuv420p needs even sizes)."""
    s = min(1.0, MAX_W / w)
    pw, ph = int(round(w * s)), int(round(h * s))
    out_w = pw + (pw % 2)
    out_h = ph + BAR_H
    return out_w, out_h + (out_h % 2)


def ffmpeg_exe() -> str:
    exe = shutil.which("ffmpeg") or r"C:\ffmpeg\bin\ffmpeg.exe"
    if not os.path.exists(exe) and not shutil.which(exe):
        raise RuntimeError("ffmpeg not found (PATH or C:\\ffmpeg\\bin)")
    return exe


def encode(frames, out_w: int, out_h: int, out_path: str, crf: int) -> None:
    """Pipe raw RGB frames into ffmpeg: constant 10 fps, H.264, yuv420p, +faststart, no audio."""
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    cmd = [ffmpeg_exe(), "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{out_w}x{out_h}", "-framerate", str(FPS), "-i", "-",
           "-an", "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p",
           "-g", str(FPS), "-r", str(FPS), "-fps_mode", "cfr", "-movflags", "+faststart", out_path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for f in frames:
            p.stdin.write(np.ascontiguousarray(f).tobytes())
    finally:
        p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError(f"ffmpeg failed ({p.returncode})")


def caption_text(test_id: str, row: dict, i: int, n: int, has_front: bool) -> str:
    """Row 1 of the caption bar. The only number of position is the v1 edge_mm from the edges CSV."""
    cap = f"{test_id}   t = {row['t_s']:.1f} s   photo {i + 1}/{n}"
    if np.isfinite(row["edge_mm"]):
        return cap + f"   v1 edge {row['edge_mm']:.2f} mm"
    return cap + ("   no v1 edge" if has_front else "   no flame tracked")


def render_overlay(img: np.ndarray, rows: list[dict], x_px: np.ndarray, out_path: str,
                   test_id: str, crf: int = 20, x2_px: np.ndarray | None = None, lead: int = 1) -> str:
    """Write the overlay video. img: [N, H, W, 3] exposure-normalized frames; rows: edges CSV rows
    (same N, same order); x_px: v1 edge column per frame in img's pixels (NaN = no line);
    x2_px: blue-light front column per frame (diagnostic, NaN = no line; None = never drawn).
    Re-encodes at a higher CRF if the file is over 15 MB."""
    n = len(img)
    if x2_px is None:
        x2_px = np.full(n, np.nan)
    if len(rows) != n or len(x_px) != n or len(x2_px) != n:
        raise ValueError(f"{len(rows)} edges rows / {len(x_px)} + {len(x2_px)} positions for {n} frames: "
                         f"frame i must be row i")
    out_w, out_h = frame_size(img.shape[1], img.shape[2])
    fonts = make_fonts(out_w)

    def frames():
        for i, r in enumerate(rows):
            cap = caption_text(test_id, r, i, n, bool(np.isfinite(x2_px[i])))
            yield compose_frame(img[i], x_px[i], r["segment"], cap, out_w, out_h, fonts, x2_px[i], lead)

    # Each attempt goes to its own temporary file, which then replaces out_path. Re-opening the file
    # ffmpeg just wrote failed on Windows ("Invalid argument") when a retry was needed (B13a, 2026-11-15).
    root, ext = os.path.splitext(out_path)
    while True:
        tmp = f"{root}.crf{crf}.tmp{ext}"
        encode(frames(), out_w, out_h, tmp, crf)
        size = os.path.getsize(tmp)
        if size <= MAX_BYTES or crf >= 40:
            break
        os.remove(tmp)
        crf += 4
    if size > MAX_BYTES:
        os.remove(tmp)
        raise RuntimeError(f"{out_path} is over 15 MB even at crf {crf}")
    os.replace(tmp, out_path)
    return out_path


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("config"); ap.add_argument("--cache"); ap.add_argument("--repo", default="..")
    ap.add_argument("--px-per-mm", type=float, default=None,
                    help="full-resolution px/mm; skips the NEF rod calibration (use the value in spread_rates notes)")
    ap.add_argument("--crf", type=int, default=20)
    a = ap.parse_args(argv)
    cfg = json.load(open(a.config, encoding="utf-8"))
    root = os.path.abspath(a.repo)
    tid = cfg["test_id"]
    rows = read_edges(os.path.join(root, "data", "derived", "edges", f"{tid}.csv"))
    d = load_test(cfg["nef_dir"], a.cache, tuple(cfg["cache_rows"]) if "cache_rows" in cfg else None)
    img = d["img"] if d["img"].dtype == np.float32 else d["img"].astype(np.float32)
    t, scale = d["t"], int(d["scale"])
    if len(rows) != len(t):
        raise SystemExit(f"edges/{tid}.csv has {len(rows)} rows but the cache has {len(t)} photos")
    if np.max(np.abs(np.array([r["t_s"] for r in rows]) - t)) > 0.01:
        raise SystemExit(f"edges/{tid}.csv t_s does not match the cache times: wrong cache?")
    # Same reference column and scale as run.py: edge_mm = 0 at the first burn frame's edge.
    base = track_test(img, rel=cfg.get("rel_threshold", 0.3), **tracking_kw(cfg, d))
    ref, valid, _ = edge_reference(cfg, t, base)
    ppm_full = a.px_per_mm if a.px_per_mm else calibrate(cfg)[0]
    ppm = ppm_full / scale
    edge_mm = np.array([r["edge_mm"] for r in rows])
    x_px = mm_to_px(edge_mm, ref, ppm, cfg["direction"])
    both = np.isfinite(edge_mm) & valid
    err = float(np.max(np.abs(x_px[both] - base["edge_px"][both]))) if both.any() else 0.0
    print(f"{tid}: {len(rows)} frames, ref {ref:.2f} px, {ppm_full:.2f} px/mm full res, "
          f"edge_mm -> px vs re-tracked edge: max diff {err:.3f} px")
    if err > 0.5:
        raise SystemExit("edges CSV does not match the re-tracked edge (cache or config changed since run.py?)")
    # Second line, display only: the blue-light front (fused edge). It never touches the CSVs.
    x2_px = fused_front_px(img, cfg, d, t)
    st = front_stats(x_px, x2_px, ppm, cfg["direction"])
    print(f"{tid}: blue-light front (diagnostic) in {st['front']} frames, v1 edge in {st['v1']}, "
          f"front without a v1 edge in {st['front_only']}, "
          f"front more than 1 mm ahead of the v1 edge in {st['ahead_1mm']}")
    out = os.path.join(root, "web", "public", "overlays", f"{tid}.mp4")
    render_overlay(img, rows, x_px, out, tid, a.crf, x2_px, cfg["direction"])
    print(out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
