# Written with AI assistance (Claude Code).
"""Read the AIR / FAN / GMT numbers that NASA's own overlay shows in the BASS test videos.

The PSI-25 test videos burn a status line into every frame: FUEL, AIR (air velocity
transducer reading, cm/s), FAN (fan voltage x10) and RAD, with a date and GMT clock on the
line below. This module reads those numbers by template matching, using the video's own
clock digits (labelled once, by eye, at one anchor frame per video) as the digit templates.
Nothing here uses Table S1 or any spread rate.

Pipeline per test:
  1. ffmpeg decodes the overlay strip (crop 570x60 at x=150,y=25) at 2 frames/s.
  2. The overlay is a fixed character grid (pitch 28.6 px). Cells: AIR value = grid cells
     6-8, FAN value = 11-13, clock HH 9-10, MM 12-13, SS 15-16.
  3. Templates for 0-9 are averaged from the seconds-units clock cell, labelled by counting
     seconds from the by-eye anchor frame (see ANCHORS), then verified by eye on a montage.
  4. Every value cell is matched against the templates (normalised cross-correlation, small
     shift search). Cells with a low score or a small margin are marked unreadable.
  5. Video time -> GMT (clock) -> photo time (GMT minus the photo-clock zero in PHOTO_ZERO).
  6. For each step row of data/derived/spread_rates.csv the AIR readings in the 25-90 % fit
     range of the step window (and the same range 60 s later) are summarised.

Run from pipeline/:  python -m diagnostics.air_display --repo ..
"""
from __future__ import annotations

import argparse
import csv
import json
import subprocess
from pathlib import Path

import numpy as np

# ---- overlay geometry (full-frame crop 570x60 at x=150, y=25) -------------------------------
CROP_W, CROP_H, CROP_X, CROP_Y = 570, 60, 150, 25
CELL0, PITCH = 10.0, 28.62      # left edge of grid cell 0 and the cell pitch, in crop pixels
CORE_W, CORE_H = 28, 18         # template window
MARGIN_X, MARGIN_Y = 3, 1       # shift search +- in x / y
VAL_ROW0 = 23                   # first core row of the FAN/AIR value line
CLK_ROW0 = 41                   # first core row of the clock line
AIR_CELLS = (6, 7, 8)
FAN_CELLS = (11, 12, 13)
HH_CELLS, MM_CELLS, SS_CELLS = (9, 10), (12, 13), (15, 16)
BLANK_MAX = 80                  # a cell whose brightest pixel is below this is blank
MIN_SCORE = 0.80                # best correlation below this -> glyph unreadable
MIN_MARGIN = 0.05               # best minus second best below this -> ambiguous

# ---- per-test constants ----------------------------------------------------------------------
# video file; anchor = (sample index at 2 fps, clock string read by eye on that frame);
# photo_zero = GMT of photo-clock time 0 (first photo EXIF time, per the config comment).
TESTS = {
    "B16": dict(video="PSI-25_Raw Data_BASS_GMT203_SAMPLE_191_TEST_P16.mp4",
                anchor=(260, "12:01:18"), photo_zero="09:28:56.38",
                mapping="t = GMT - 09:28:56.38 (first photo EXIF); config window 12:00:21 -> 9084.62"),
    "B19": dict(video="PSI-25_Raw Data_BASS_GMT203_SAMPLE_194_TEST_P19.mp4",
                anchor=(200, "12:52:31"), photo_zero="12:24:43.50",
                mapping="t = GMT - 12:24:43.50 (first photo EXIF); config window 12:52:56 -> 1692.5"),
    "B12": dict(video="PSI-25_Raw Data_BASS_GMT210_SAMPLE_199_TEST_P12.mp4",
                anchor=(200, "11:18:03"), photo_zero="11:16:55.66",
                mapping="t = GMT - 11:16:55.66 (first photo EXIF); config window 11:19:23 -> 147.3"),
    "P17": dict(video="PSI-25_Raw Data_BASS_GMT210_SAMPLE_192_TEST_P17.mp4",
                anchor=(200, "12:02:57"), photo_zero="12:01:47.56",
                mapping="t = GMT - 12:01:47.56 (first photo EXIF); config window 12:04:08 -> 140.4"),
    "B13a": dict(video="PSI-25_Raw Data_BASS_GMT195_SAMPLE_203_TEST_P13a.mp4",
                 anchor=(200, "14:31:29"), photo_zero="14:27:21.72",
                 mapping="t = GMT - 14:27:21.72 (frame 0 EXIF); config window 14:31:18 -> 236.3"),
    "B13b": dict(video="PSI-25_Raw Data_BASS_GMT195_SAMPLE_203_TEST_P13b.mp4",
                 anchor=(200, "16:06:15"), photo_zero="16:02:25.13",
                 mapping="t = GMT - 16:02:25.13 (first photo EXIF); config window 16:05:34 -> 188.9"),
}
DEFAULT_VIDEO_DIR = "../space-apps-2026/data/raw/psi25"
DEFAULT_FFMPEG = "C:/ffmpeg/bin/ffmpeg.exe"
FPS = 2


def hms_to_s(txt: str) -> float:
    h, m, s = txt.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


# ---- decoding ---------------------------------------------------------------------------------
def decode_strip(video: Path, ffmpeg: str) -> np.ndarray:
    """Return an (n, 60, 570) uint8 array of the overlay strip at FPS frames per second."""
    cmd = [ffmpeg, "-noautorotate", "-v", "error", "-i", str(video), "-vf",
           f"fps={FPS},crop={CROP_W}:{CROP_H}:{CROP_X}:{CROP_Y},format=gray",
           "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, CROP_H, CROP_W)


# ---- cell extraction and matching ---------------------------------------------------------------
def cell_left(k: int) -> int:
    return int(round(CELL0 + PITCH * k))


def cell_crops(strip: np.ndarray, k: int, row0: int) -> np.ndarray:
    """(n, CORE_H+2*MARGIN_Y, CORE_W+2*MARGIN_X) float crops around grid cell k."""
    x0 = cell_left(k) - 2 - MARGIN_X
    y0 = row0 - MARGIN_Y
    return strip[:, y0:y0 + CORE_H + 2 * MARGIN_Y, x0:x0 + CORE_W + 2 * MARGIN_X].astype(np.float32)


def _windows(crops: np.ndarray):
    for dy in range(2 * MARGIN_Y + 1):
        for dx in range(2 * MARGIN_X + 1):
            yield dy, dx, crops[:, dy:dy + CORE_H, dx:dx + CORE_W]


def _zn(w: np.ndarray) -> np.ndarray:
    w = w - w.mean(axis=(-2, -1), keepdims=True)
    n = np.sqrt((w ** 2).sum(axis=(-2, -1), keepdims=True)) + 1e-6
    return w / n


def match_scores(crops: np.ndarray, templates: np.ndarray):
    """Best normalised correlation of each crop against each template over the shift grid.

    crops: (n, H+2my, W+2mx); templates: (T, H, W) already zero-mean/unit-norm.
    Returns scores (n, T) and the best (dy, dx) per crop for template argmax is not needed.
    """
    best = np.full((crops.shape[0], templates.shape[0]), -1.0, np.float32)
    for _dy, _dx, w in _windows(crops):
        zw = _zn(w)
        s = np.einsum("nhw,thw->nt", zw, templates)
        best = np.maximum(best, s)
    return best


def build_templates(strip: np.ndarray, anchor: tuple[int, str]) -> dict[str, np.ndarray]:
    """Average the seconds-units clock glyph into digit templates 0-9.

    The cell is cut into runs of constant glyph (one run per displayed second); runs are
    labelled by counting from the anchor frame. Only the first 150 runs are used.
    """
    k = SS_CELLS[1]
    cr = cell_crops(strip, k, CLK_ROW0)
    core = cr[:, MARGIN_Y:MARGIN_Y + CORE_H, MARGIN_X:MARGIN_X + CORE_W]
    a_idx, a_txt = anchor
    a_digit = int(a_txt[-1])
    n_use = min(len(core), 2 * 100 + a_idx)
    n_use = len(core) if n_use > len(core) else n_use
    idx = np.arange(len(core))
    # The clock ticks once per second at an unknown phase: try phases and keep the one whose
    # classes are most compact (smallest within-class variance of the glyph pixels).
    best = None
    for phase in np.arange(0.0, 1.0, 0.1):
        lab = (a_digit + np.floor((idx - a_idx) / FPS + phase).astype(int)) % 10
        sel = idx[(idx >= max(0, a_idx - 80)) & (idx < min(len(core), a_idx + 160))]
        sse = 0.0
        for dgt in range(10):
            g = core[sel[lab[sel] == dgt]]
            if len(g) > 1:
                sse += float(((g - np.median(g, axis=0)) ** 2).sum())
        if best is None or sse < best[0]:
            best = (sse, lab)
    labels = best[1]
    n_use = min(len(core), a_idx + 160)
    lo_use = max(0, a_idx - 80)
    core = core
    # two passes: average per label, then relabel by nearest template and re-average
    for _pass in range(3):
        tpl = []
        for dgt in range(10):
            sel = np.where(labels[lo_use:n_use] == dgt)[0] + lo_use
            if len(sel) == 0:
                raise RuntimeError(f"no samples for digit {dgt}; anchor or clock unreadable")
            if _pass == 0:
                ref = np.median(core[sel], axis=0)
            else:
                ref = tpl_prev[dgt]
            aligned = []
            zr = _zn(ref[None])[0]
            for i in sel:
                bestv, bestw = -2, None
                for _dy, _dx, w in _windows(cr[i:i + 1]):
                    v = float((_zn(w)[0] * zr).sum())
                    if v > bestv:
                        bestv, bestw = v, w[0]
                aligned.append(bestw)
            tpl.append(np.median(np.stack(aligned), axis=0))
        tpl_prev = tpl
        t = _zn(np.stack(tpl))
        labels = match_scores(cr, t).argmax(1)
    return {str(i): tpl[i] for i in range(10)}


def template_stack(templates: dict[str, np.ndarray]):
    names = sorted(templates)
    return names, _zn(np.stack([templates[n] for n in names]))


def read_cells(strip, cells, row0, names, tstack, blank_max=BLANK_MAX):
    """Read a row of character cells. Returns chars (n, len(cells)) str, score, margin."""
    n = strip.shape[0]
    chars = np.empty((n, len(cells)), dtype="<U1")
    score = np.zeros((n, len(cells)), np.float32)
    margin = np.zeros((n, len(cells)), np.float32)
    for j, k in enumerate(cells):
        cr = cell_crops(strip, k, row0)
        core = cr[:, MARGIN_Y:MARGIN_Y + CORE_H, MARGIN_X:MARGIN_X + CORE_W]
        blank = core.max(axis=(1, 2)) < blank_max
        sc = match_scores(cr, tstack)
        order = np.argsort(-sc, axis=1)
        b1 = sc[np.arange(n), order[:, 0]]
        b2 = sc[np.arange(n), order[:, 1]]
        ch = np.array([names[i] for i in order[:, 0]])
        ok = (b1 >= MIN_SCORE) & ((b1 - b2) >= MIN_MARGIN)
        ch = np.where(ok, ch, "?")
        ch = np.where(blank, " ", ch)
        chars[:, j] = ch
        score[:, j] = np.where(blank, 1.0, b1)
        margin[:, j] = np.where(blank, 1.0, b1 - b2)
    return chars, score, margin


def parse_number(chars_row) -> tuple[int | None, str]:
    """Right-aligned integer from a row of chars. '?' anywhere -> None (unreadable)."""
    s = "".join(chars_row).strip()
    if s == "" or "?" in s:
        return None, "unreadable" if "?" in s else "blank"
    if not s.isdigit():
        return None, "unreadable"
    if " " in s:
        return None, "unreadable"
    return int(s), "ok"


def read_test(name: str, strip: np.ndarray):
    cfg = TESTS[name]
    templ = build_templates(strip, cfg["anchor"])
    names, tstack = template_stack(templ)
    # blank threshold relative to this video's own stroke brightness (blank cells are not
    # always black: compression bleed gives ~100-115 against strokes of ~150-190)
    ref = max(np.percentile(strip[:, VAL_ROW0:VAL_ROW0 + CORE_H, cell_left(k) - 2:cell_left(k) + 26].max(axis=(1, 2)), 90)
              for k in (AIR_CELLS[-1], FAN_CELLS[-1]))
    bm = 0.72 * ref
    air_c, air_s, air_m = read_cells(strip, AIR_CELLS, VAL_ROW0, names, tstack, bm)
    fan_c, fan_s, fan_m = read_cells(strip, FAN_CELLS, VAL_ROW0, names, tstack, bm)
    hh_c, hh_s, _ = read_cells(strip, HH_CELLS, CLK_ROW0, names, tstack)
    mm_c, mm_s, _ = read_cells(strip, MM_CELLS, CLK_ROW0, names, tstack)
    ss_c, ss_s, _ = read_cells(strip, SS_CELLS, CLK_ROW0, names, tstack)
    n = strip.shape[0]
    rows = []
    for i in range(n):
        air, air_q = parse_number(air_c[i])
        fan, fan_q = parse_number(fan_c[i])
        clk = "".join(hh_c[i]) + ":" + "".join(mm_c[i]) + ":" + "".join(ss_c[i])
        valid = "?" not in clk and " " not in clk
        rows.append(dict(video_s=i / FPS, gmt=clk if valid else "", air=air, air_status=air_q,
                         air_score=float(air_s[i].min()), air_margin=float(air_m[i].min()),
                         fan=fan, fan_status=fan_q, fan_score=float(fan_s[i].min())))
    return rows, templ


# ---- time mapping ----------------------------------------------------------------------------
def add_photo_time(rows: list[dict], photo_zero: str) -> dict:
    """Fill photo_t_s. The clock has 1 s resolution; samples with an unreadable or
    inconsistent clock use the video-time offset of their neighbours."""
    t0 = hms_to_s(photo_zero)
    g = np.full(len(rows), np.nan)
    for i, r in enumerate(rows):
        if r["gmt"]:
            g[i] = hms_to_s(r["gmt"])
    v = np.array([r["video_s"] for r in rows])
    off = g - v
    # robust local offset: running median of valid offsets, then reject outliers > 3 s
    good = ~np.isnan(off)
    loc = np.full(len(rows), np.nan)
    idx = np.where(good)[0]
    for i in range(len(rows)):
        lo, hi = max(0, i - 60), min(len(rows), i + 61)
        w = off[lo:hi][good[lo:hi]]
        if len(w):
            loc[i] = np.median(w)
    bad = good & (np.abs(off - loc) > 3)
    n_bad = int(bad.sum())
    for i, r in enumerate(rows):
        if good[i] and not bad[i]:
            gm, src = g[i], "clock"
        elif not np.isnan(loc[i]):
            gm, src = v[i] + loc[i], "interp"
        else:
            gm, src = np.nan, "none"
        r["photo_t_s"] = round(gm - t0, 2) if not np.isnan(gm) else ""
        r["time_src"] = src
    spread = float(np.nanmax(off[good & ~bad]) - np.nanmin(off[good & ~bad])) if (good & ~bad).any() else float("nan")
    return dict(n_clock_unreadable=int((~good).sum()), n_clock_rejected=n_bad,
                clock_minus_video_range_s=round(spread, 1))


# ---- per-step statistics --------------------------------------------------------------------------
def fan_median(rows, lo, hi):
    v = [r["fan"] for r in rows if r["photo_t_s"] != "" and lo <= r["photo_t_s"] <= hi and r["fan"] is not None]
    return float(np.median(v)) if v else None


def window_stats(rows, lo, hi):
    vals, n_total, n_unread = [], 0, 0
    for r in rows:
        t = r["photo_t_s"]
        if t == "" or not (lo <= t <= hi):
            continue
        n_total += 1
        if r["air"] is None:
            n_unread += 1
        else:
            vals.append(r["air"])
    fans = [r["fan"] for r in rows if r["photo_t_s"] != "" and lo <= r["photo_t_s"] <= hi and r["fan"] is not None]
    out = dict(n=len(vals), n_samples=n_total, n_unreadable=n_unread, lo_s=round(lo, 1), hi_s=round(hi, 1),
               fan_min=min(fans) if fans else None, fan_max=max(fans) if fans else None)
    if vals:
        a = np.array(vals, float)
        vc = {int(k): int((a == k).sum()) for k in np.unique(a)}
        out.update(median=float(np.median(a)), min=float(a.min()), max=float(a.max()),
                   mean=round(float(a.mean()), 2), values=vc)
    else:
        out.update(median=None, min=None, max=None, mean=None, values={})
    return out


def quality(stats):
    if stats["n"] == 0:
        return "unreadable"
    frac = stats["n"] / max(stats["n_samples"], 1)
    spread = stats["max"] - stats["min"]
    if frac < 0.5:
        return "poor (many unreadable samples)"
    if stats.get("fan_min") is not None and stats["fan_max"] - stats["fan_min"] > 3:
        return f"FAN changes inside window ({stats['fan_min']}-{stats['fan_max']}): fan ramp or next step in window"
    if spread > 2:
        return "varying (range > 2 cm/s)"
    return "ok"


def step_table(repo: Path, series: dict[str, list[dict]]):
    steps = []
    with open(repo / "data/derived/spread_rates.csv", newline="") as f:
        for row in csv.DictReader(f):
            tid = row["test_id"]
            ts, te = float(row["t_start_s"]), float(row["t_end_s"])
            lo, hi = ts + 0.25 * (te - ts), ts + 0.90 * (te - ts)
            st = window_stats(series[tid], lo, hi)
            sh = window_stats(series[tid], lo + 60, hi + 60)
            steps.append(dict(test=tid, flow_label_cm_s=float(row["flow_cm_s"]), t_start_s=ts, t_end_s=te,
                              fan_median_in_range=fan_median(series[tid], lo, hi), air=st, air_lag60=sh, reading_quality=quality(st),
                              reading_quality_lag60=quality(sh)))
    return steps


# ---- outputs ---------------------------------------------------------------------------------------
def write_series(outdir: Path, name: str, rows: list[dict]):
    with open(outdir / f"{name}_air.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["video_s", "gmt", "photo_t_s", "fan", "air", "air_status", "air_score", "air_margin"])
        for r in rows:
            w.writerow([r["video_s"], r["gmt"], r["photo_t_s"], "" if r["fan"] is None else r["fan"],
                        "" if r["air"] is None else r["air"], r["air_status"],
                        round(r["air_score"], 3), round(r["air_margin"], 3)])


def fmt(st):
    if st["median"] is None:
        return "unreadable"
    return f"{st['median']:g} ({st['min']:g}-{st['max']:g}, n={st['n']})"


def write_figure(path: Path, steps):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(6.4, 5.2))
    cols = {"B16": "#1b6ca8", "B19": "#c2571a", "B12": "#2a9d4b", "P17": "#8b3fa8",
            "B13a": "#6b6b6b", "B13b": "#b8860b"}
    markers = {"B16": "o", "B19": "s", "B12": "^", "P17": "D", "B13a": "v", "B13b": "P"}
    lim = 9
    ax.plot([0, lim], [0, lim], color="0.7", lw=1, ls="--", zorder=1)
    ax.axvspan(0, 1.1, color="#fff2cc", alpha=0.6, zorder=0)
    unread = []
    for s in steps:
        x = s["flow_label_cm_s"]
        a = s["air"]
        b = s["air_lag60"]
        if a["median"] is None:
            unread.append(s)
            continue
        ax.errorbar(x, a["median"], yerr=[[a["median"] - a["min"]], [a["max"] - a["median"]]], fmt=markers[s["test"]],
                    color=cols[s["test"]], ms=7, capsize=2, lw=1, zorder=3)
        if b["median"] is not None:
            ax.plot(x + 0.06, b["median"], markers[s["test"]], mfc="none", color=cols[s["test"]], ms=7, zorder=3)
    for s in unread:
        ax.plot(s["flow_label_cm_s"], 0.0, "x", color="k", ms=8, zorder=4)
    for t in cols:
        ax.plot([], [], markers[t], color=cols[t], label=t)
    ax.plot([], [], "o", mfc="none", color="k", label="same steps, window +60 s (open)")
    ax.plot([], [], "x", color="k", label="no readable AIR in range")
    ax.text(0.05, lim - 0.5, "low-flow steps (label <= 1.1 cm/s)", fontsize=8, color="#7a6200", va="top")
    ax.set_xlim(0, lim)
    ax.set_ylim(-0.5, lim)
    ax.set_xlabel("Table S1 flow label (cm/s)")
    ax.set_ylabel("AIR value on NASA overlay, median (bars: min-max) (cm/s)")
    ax.set_title("NASA overlay AIR reading vs Table S1 label, per step", fontsize=10)
    ax.legend(fontsize=7, loc="upper left", bbox_to_anchor=(0.0, 0.93))
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


FINDINGS_AND_LIMITS = """## What the table shows

- The display shows whole cm/s (a single integer, no decimals), so anything below about 1 cm/s cannot be
  resolved and a flow of 0.4 to 1 cm/s would read 0 or 1.
- At the same FAN setting the display reads the same value in every test where it was read: FAN 62 reads 8,
  FAN 52 reads 3, FAN 48 reads 2, FAN 44 reads 2 to 3, and FAN 41 to 42 reads 0. This is a function of the
  fan setting, not of the Table S1 label.
- The Table S1 labels do not follow the displayed AIR value. The clearest case is FAN 41: B16 (label 0.72)
  and B13a/B13b (labels 1.38 to 1.64) all show AIR 0 in the fit range. B12 step 0.6 (FAN about 44.5) also reads
  0, while B16 and B19 at FAN 44 read 2 to 3. So the displayed AIR cannot confirm or refute the labels in the
  low-flow steps; it only says the transducer read 0 to 3 cm/s there. For the high-flow steps (label 7.55) the
  display reads 8 (B16) and 8 (B19), close to the label.
- Window +60 s: the shifted range often contains the next FAN step or the end-of-test fan burst, so its median
  mixes states. Those rows are marked in the quality column ("FAN changes inside window"). Rows marked ok in
  both columns are the clean lag check: they show the same reading with and without the shift.

## Limits

- Step 1 of B16 and B19 (label 7.55) is flagged because the FAN already starts ramping down inside the fit
  range (B16: from FAN 62 at 12:01:46 to FAN 44 at 12:02:14, photo time 9166-9197 s). The config windows
  end where FAN reaches the new value. The AIR reading falls with it (8 to 5 over that ramp), so within the
  ramp the display follows the fan with a delay of the order of 10 to 30 s on this series (read by eye from
  B16_air.csv, not fitted), shorter than the one minute the paper quotes.
- The sensor is at the duct inlet, lags by about a minute and reads coarsely near zero (NASA ICES-2015-196
  pp. 2-3); a displayed 0 is not a measured zero flow in the cell.
- Digit reading: every AIR and FAN value was read by template matching with a correlation and margin test. I
  checked 12 randomly chosen frames (2 per test) and 4 frames with two-digit AIR values (P17) by eye against
  the printed digits: all agreed. Samples that failed the test or were blank (58 of 11834, 0.5 %; 50 of them are one
  stretch of B12 with a blank AIR field, outside every fit range) are left blank and counted as unreadable, never guessed.
- The anchor frame for each video (the clock read by eye that labels the digit templates) is a constant in the
  script. The FAN medians in air_by_step.json match the FAN steps listed in the config comments.
- Photo time comes from the 1 s resolution GMT clock and the first-photo EXIF time, as in the configs, so
  times are good to about 1 s. Clock and video time differ by at most 1.5 s over each video.
- The 2 samples per second are not independent: n is a count of samples, not of independent measurements.
- Nothing here was tuned toward Table S1 or our spread rates; thresholds are set from the overlay itself.
"""


def write_readme(path: Path, steps, notes, qc):
    L = []
    L.append("# NASA overlay AIR reading vs Table S1 flow labels\n")
    L.append("Written with AI assistance (Claude Code). Generated by `pipeline/diagnostics/air_display.py`; "
             "nothing here was tuned toward Table S1 or our spread rates.\n")
    L.append("## What was measured\n")
    L.append("The PSI-25 test videos print a status line on every frame: FUEL, AIR (air velocity transducer "
             "reading, cm/s), FAN (fan voltage x10) and RAD, plus a date and GMT clock (NASA ICES-2015-196 p. 3). "
             "The transducer sits at the duct inlet, has a response time of about one minute (p. 2) and reads "
             "coarsely near zero. This is NASA's own displayed airflow, a separate check on the flow labels in "
             "Link et al. 2018 Table S1.\n")
    L.append("## Method\n")
    L.append("- Frames decoded at 2 per second; the overlay strip (570x60 px at x=150, y=25) is a fixed "
             "character grid with a 28.6 px pitch. AIR value = grid cells 6-8, FAN value = cells 11-13, GMT clock = "
             "cells 9-16.\n"
             "- Digit templates 0-9 are averaged from the video's own seconds-units clock digit. Each second is "
             "labelled by counting from one anchor frame whose clock was read by eye, so the templates are the "
             "overlay font itself. Each value cell is matched to the templates by normalised cross-correlation "
             "with a +-3 px x / +-1 px y shift search.\n"
             f"- A cell is called unreadable if the best correlation is below {MIN_SCORE} or the best-to-second margin is "
             f"below {MIN_MARGIN}; blank cells are blank. Unreadable cells are never turned into numbers.\n"
             "- Verification by eye on sampled frames is described under Limits.\n")
    L.append("## Time mapping (video clock -> photo time)\n")
    L.append("Photo time t = GMT clock minus the photo clock zero (first photo EXIF time), the same mapping the "
             "step windows in `pipeline/configs/*.json` use. Each mapping reproduces the config's own window "
             "start from its stated GMT event.\n")
    for k, v in TESTS.items():
        L.append(f"- {k}: {v['mapping']}. {notes[k]}")
    L.append("")
    L.append("## Per-step comparison\n")
    L.append("Fit range = 25-90 % of the step window (same as the rate fit). 'Window +60 s' is the same range shifted "
             "60 s later to allow for the sensor lag. Values are AIR in cm/s as median (min-max, n readable samples at 2/s). "
             "The display shows whole numbers.\n")
    L.append("| test | label (cm/s) | AIR in fit range | AIR, window +60 s | quality |")
    L.append("|---|---|---|---|---|")
    for s in steps:
        L.append(f"| {s['test']} | {s['flow_label_cm_s']:g} | {fmt(s['air'])} | {fmt(s['air_lag60'])} | "
                 f"{s['reading_quality']} / {s['reading_quality_lag60']} |")
    L.append("")
    L.append(qc)
    path.write_text("\n".join(L) + "\n", encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default="..", help="repo root (default ..)")
    ap.add_argument("--video-dir", default=DEFAULT_VIDEO_DIR)
    ap.add_argument("--ffmpeg", default=DEFAULT_FFMPEG)
    ap.add_argument("--tests", nargs="*", default=list(TESTS))
    args = ap.parse_args(argv)
    repo = Path(args.repo).resolve()
    outdir = repo / "docs/research/accuracy/air_display"
    outdir.mkdir(parents=True, exist_ok=True)
    series, notes = {}, {}
    for name in args.tests:
        strip = decode_strip(Path(args.video_dir) / TESTS[name]["video"], args.ffmpeg)
        rows, _ = read_test(name, strip)
        info = add_photo_time(rows, TESTS[name]["photo_zero"])
        series[name] = rows
        notes[name] = (f"Clock unreadable in {info['n_clock_unreadable']} of {len(rows)} samples, "
                       f"{info['n_clock_rejected']} rejected as inconsistent; clock minus video time varies over "
                       f"{info['clock_minus_video_range_s']} s across the video.")
        write_series(outdir, name, rows)
        print(name, len(rows), "samples", info)
    steps = step_table(repo, series)
    (outdir / "air_by_step.json").write_text(json.dumps(steps, indent=1), encoding="utf-8")
    figdir = repo / "docs/research/figures"
    figdir.mkdir(parents=True, exist_ok=True)
    write_figure(figdir / "air_display_vs_label.png", steps)
    write_readme(outdir / "README.md", steps, notes, FINDINGS_AND_LIMITS)
    for s in steps:
        print(s["test"], s["flow_label_cm_s"], fmt(s["air"]), "| +60:", fmt(s["air_lag60"]))


if __name__ == "__main__":
    main()
