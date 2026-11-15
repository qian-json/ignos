# Written with AI assistance (Claude Code)
"""Per-photo flame measurement table: docs/research/flame_features/<test>.csv (diagnostic only).

For each test this script loads the config and the frame cache, runs the frozen v1 tracking the
same way run.py does (same helpers: tracking_kw, calibrate, edge_reference, px_to_mm, steady_fit,
edge.track_test), and writes one row per photo. It also tracks the blue channel alone and the fused
edge (edge.track_test_fused) to say how far the blue-light front is ahead of the v1 edge.

It changes no reported number. It never reads a published spread rate. It asserts that its
edge_mm equals data/derived/edges/<test>.csv to the printed precision, so the table is tied to the
committed tracker output.

Usage (from pipeline/):
  python -m diagnostics.flame_features                                  # the six tests
  python -m diagnostics.flame_features --tests B13a --cache B13a=<path to b13a_cache.npz>
Column definitions: docs/research/flame_features/README.md (written by this script).
"""
from __future__ import annotations
import argparse, csv, glob, json, os, re, sys
import numpy as np
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from stillair_tracker import run as run_mod
from stillair_tracker.edge import track_test, track_test_fused
from stillair_tracker.frames import load_test
from stillair_tracker.run import edge_reference, px_to_mm, steady_fit, tracking_kw
from stillair_tracker.segment import schedule_windows

PIPELINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(PIPELINE_DIR, "configs")
DEFAULT_CACHE_DIR = os.path.normpath(os.path.join(PIPELINE_DIR, "..", "..", "space-apps-2026", "data", "derived"))
DEFAULT_TESTS = ["B16", "B19", "B12", "P17", "B13b", "B13a"]
OUT_REL = os.path.join("docs", "research", "flame_features")
EDGES_REL = os.path.join("data", "derived", "edges")
V2_EVAL_REL = os.path.join("docs", "research", "v2_eval_heldout.json")
AI_NOTE = "Written with AI assistance (Claude Code)"
SOURCE = "NASA PSI-25 BASS-II archive, CC0, DOI 10.60555/4qc4-de67"
CHUNK = 16   # photos converted to float32 at a time (bounds memory; tracking is per photo, so results do not depend on it)

COLUMNS = ["test_id", "t_s", "segment", "edge_mm", "blue_edge_mm", "fused_minus_v1_mm", "flame_len_mm",
           "area_mm2", "blue_frac", "brightness_p999", "r_share", "g_share", "b_share",
           "in_burn_window", "fit_step", "brightness_p999_band"]
FORMATS = {"edge_mm": "{:.3f}", "blue_edge_mm": "{:.3f}", "fused_minus_v1_mm": "{:.3f}", "flame_len_mm": "{:.3f}",
           "area_mm2": "{:.3f}", "blue_frac": "{:.4f}", "brightness_p999": "{:.6g}", "r_share": "{:.4f}",
           "g_share": "{:.4f}", "b_share": "{:.4f}", "brightness_p999_band": "{:.6g}"}


# ---------- per-photo measurements ----------

def flame_mask(rgb: np.ndarray, rel: float = 0.3, axis_row: int | None = None, half_band: int = 70,
               min_area: int = 300, direction: int = 1, min_contrast: float = 3.0):
    """The tracker's flame mask for one photo and the percentile its threshold is based on.

    edge.track_frame does not return its mask, so this repeats its steps one for one: mean
    brightness, 99.9th percentile, contrast check, threshold at rel x percentile, opening, rod band,
    largest connected region, minimum area. compute_features() checks every photo's mask area
    against the area track_frame reports. `direction` is accepted so tracking_kw() can be passed
    unchanged; a mask has no direction. Returns (mask or None, percentile)."""
    lum = rgb.mean(-1)
    p = np.percentile(lum, 99.9)
    if p < min_contrast * max(float(np.median(lum)), 1e-12):
        return None, float(p)
    m = ndi.binary_opening(lum > rel * p, iterations=2)
    if axis_row is not None:
        m[: max(0, axis_row - half_band)] = False
        m[axis_row + half_band:] = False
    lab, n = ndi.label(m)
    if n == 0:
        return None, float(p)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    k = 1 + int(np.argmax(sizes))
    if sizes[k - 1] < min_area:
        return None, float(p)
    return lab == k, float(p)


def colour_shares(rgb: np.ndarray, mask: np.ndarray) -> tuple[float, float, float]:
    """Mean over the mask's pixels of each pixel's R, G and B share of its own R+G+B (sums to 1).
    Every mask pixel counts the same, so the dim outer zone weighs as much as the bright core."""
    px = rgb[mask].astype(np.float64)
    s = px.sum(-1, keepdims=True)
    r, g, b = (px / s).mean(0)
    return float(r), float(g), float(b)


def step_windows(cfg: dict, t_last: float) -> list[tuple[float, float]]:
    """Flow-step windows exactly as run.py picks them."""
    if "windows_s" in cfg:
        return [tuple(w) for w in cfg["windows_s"]]
    return schedule_windows(t_last, [s["dt_s"] for s in cfg["steps"]])


def _same(a: np.ndarray, b: np.ndarray) -> bool:
    return bool(np.array_equal(np.asarray(a, dtype=float), np.asarray(b, dtype=float), equal_nan=True))


def compute_features(cfg: dict, d: dict, ppm_full: float) -> dict:
    """All per-photo arrays for one test. `d` is a loaded frame cache (frames.load_test), `ppm_full`
    the full-resolution px/mm from run.calibrate. NaN means "not defined"."""
    t, scale = d["t"], int(d["scale"])
    img = d["img"]
    kw = tracking_kw(cfg, d)
    rel = cfg.get("rel_threshold", 0.3)
    sign = cfg["direction"]
    n = len(t)
    band = slice(max(0, kw["axis_row"] - kw["half_band"]), kw["axis_row"] + kw["half_band"])
    v1_parts, blue_parts, fused_parts = [], [], []
    p999, p999_band = np.full(n, np.nan), np.full(n, np.nan)
    shares = np.full((n, 3), np.nan)
    mask_area = np.zeros(n)
    for i0 in range(0, n, CHUNK):
        f = img[i0:i0 + CHUNK]
        f = f.astype(np.float32) if f.dtype != np.float32 else f          # same conversion as run.py
        v1_parts.append(track_test(f, rel=rel, **kw))                       # v1, the call run.py makes
        fused_parts.append(track_test_fused(f, rel=rel, **kw))              # v2 (PREREGISTRATION.md)
        blue_parts.append(track_test(np.repeat(f[..., 2:3], 3, axis=-1), rel=rel, **kw))   # blue channel alone
        for j, rgb in enumerate(f):
            mask, p = flame_mask(rgb, rel=rel, **kw)
            p999[i0 + j] = p
            p999_band[i0 + j] = float(np.percentile(rgb[band].mean(-1), 99.9))
            if mask is not None:
                mask_area[i0 + j] = mask.sum()
                shares[i0 + j] = colour_shares(rgb, mask)
                bf = float(np.mean(rgb[mask][:, 2] > rgb[mask][:, 0]))
                if not np.isclose(bf, v1_parts[-1]["blue_frac"][j], rtol=0, atol=1e-12):
                    raise AssertionError(f"{cfg['test_id']} photo {i0 + j}: mask blue_frac differs from the tracker's")
    cat = lambda parts: {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}
    v1, blue, fused = cat(v1_parts), cat(blue_parts), cat(fused_parts)
    has_mask = ~np.isnan(v1["edge_px"])
    # The repeated mask must be the tracker's own: same photos, same pixel count.
    if not _same(has_mask, mask_area > 0) or not _same(mask_area[has_mask], v1["area"][has_mask]):
        raise AssertionError(f"{cfg['test_id']}: flame_mask() does not reproduce edge.track_frame's mask")
    if not _same(fused["edge_lum_px"], v1["edge_px"]) or not _same(fused["edge_blue_px"], blue["edge_px"]):
        raise AssertionError(f"{cfg['test_id']}: fused tracker's parts differ from the separate tracks")

    ppm = ppm_full / scale
    ref, valid, burn = edge_reference(cfg, t, v1)
    edge_mm = np.where(burn, px_to_mm(v1["edge_px"], ref, ppm, sign), np.nan)          # run.py's edge_mm
    w0, w1 = cfg["burn_window_s"]
    in_burn = (t >= w0) & (t <= w1)
    gate = cfg.get("min_area_frame", 3000)
    blue_ok = ~np.isnan(blue["edge_px"]) & (blue["area"] >= gate) & in_burn            # gate as in blue_edge.py
    blue_mm = np.where(blue_ok, px_to_mm(blue["edge_px"], ref, ppm, sign), np.nan)
    fused_ok = ~np.isnan(fused["edge_px"]) & (fused["area"] >= gate) & in_burn         # gate as in v2_eval.py
    fused_mm = np.where(fused_ok, px_to_mm(fused["edge_px"], ref, ppm, sign), np.nan)
    flame_len = np.where(has_mask, (v1["edge_px"] - v1["tail_px"]) * sign / ppm, np.nan)   # run.py's flame length
    area_mm2 = np.where(has_mask, v1["area"] / ppm ** 2, np.nan)

    windows = step_windows(cfg, float(t[burn].max()))
    fit_step = np.zeros(n, dtype=int)      # step whose 25-90% time range holds the photo (time only)
    fit_used = np.zeros(n, dtype=int)      # step whose rate fit would use the photo (time range and a v1 edge)
    for k, (ws, we) in enumerate(windows, start=1):
        fit_step[steady_fit(t, np.zeros(n), ws, we)[2]] = k        # steady_fit's own time rule
        fit_used[steady_fit(t, edge_mm, ws, we)[2]] = k            # the photos the rate fit uses
    return {"t": t, "edge_mm": edge_mm, "blue_edge_mm": blue_mm, "fused_minus_v1_mm": fused_mm - edge_mm,
            "flame_len_mm": flame_len, "area_mm2": area_mm2, "blue_frac": v1["blue_frac"],
            "brightness_p999": p999, "r_share": shares[:, 0], "g_share": shares[:, 1], "b_share": shares[:, 2],
            "in_burn_window": in_burn.astype(int), "fit_step": fit_step, "fit_used": fit_used,
            "brightness_p999_band": p999_band, "windows": windows,
            "meta": {"px_per_mm_full": float(ppm_full), "cache_scale": scale, "frame_rows": int(img.shape[1]),
                     "frame_cols": int(img.shape[2]), "band_rows": int(band.stop - band.start)}}


# ---------- CSV in and out ----------

def read_edges(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as h:
        return list(csv.DictReader(h))


def table_rows(test_id: str, feat: dict, edges: list[dict]) -> list[dict]:
    """Printed rows. Checks t_s and edge_mm cell by cell against the committed edges CSV, and that
    the edges CSV's segment marks exactly the photos the rate fit uses."""
    n = len(feat["t"])
    if len(edges) != n:
        raise AssertionError(f"{test_id}: edges CSV has {len(edges)} rows, the cache has {n} photos (wrong cache?)")
    rows = []
    for i in range(n):
        r = {"test_id": test_id, "t_s": f"{feat['t'][i]:.2f}", "segment": edges[i]["segment"],
             "in_burn_window": str(int(feat["in_burn_window"][i])),
             "fit_step": str(int(feat["fit_step"][i])) if feat["fit_step"][i] else ""}
        for c, fmt in FORMATS.items():
            v = feat[c][i]
            r[c] = "" if np.isnan(v) else fmt.format(v)
        if r["t_s"] != edges[i]["t_s"] or r["edge_mm"] != edges[i]["edge_mm"]:
            raise AssertionError(f"{test_id} row {i + 1}: t_s/edge_mm {r['t_s']}/{r['edge_mm']!r} here, "
                                 f"{edges[i]['t_s']}/{edges[i]['edge_mm']!r} in the edges CSV")
        seg = int(edges[i]["segment"]) if edges[i]["segment"] else 0
        if seg and (seg != feat["fit_used"][i] or seg != feat["fit_step"][i]):
            raise AssertionError(f"{test_id} row {i + 1}: segment {seg} is not this script's fit range")
        rows.append(r)
    for k in sorted({int(e["segment"]) for e in edges if e["segment"]}):   # a fitted step uses all its fit photos
        if [i for i in range(n) if feat["fit_used"][i] == k] != [i for i, e in enumerate(edges) if e["segment"] == str(k)]:
            raise AssertionError(f"{test_id}: segment {k} photos differ from this script's fit photos")
    return rows


def header_line(cfg: dict, meta: dict) -> str:
    return (f"# {AI_NOTE}. Per-photo flame features (diagnostic), test {cfg['test_id']} (PSI {cfg.get('psi_test', '')}). "
            f"Photos: {SOURCE}. px_per_mm_full={meta['px_per_mm_full']:.2f}; cache_scale={meta['cache_scale']}; "
            f"frame_rows={meta['frame_rows']}; frame_cols={meta['frame_cols']}; band_rows={meta['band_rows']}. "
            f"Columns: README.md in this folder.")


def write_table(path: str, cfg: dict, meta: dict, rows: list[dict]) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as h:
        h.write(header_line(cfg, meta) + "\n")
        w = csv.DictWriter(h, COLUMNS, lineterminator="\n")
        w.writeheader(); w.writerows(rows)


def read_table(path: str) -> tuple[str, list[dict]]:
    """(comment line, rows) of a feature CSV. Lines that start with '#' are comments."""
    with open(path, newline="", encoding="utf-8") as h:
        lines = h.read().splitlines()
    comment = next((ln for ln in lines if ln.startswith("#")), "")
    return comment, list(csv.DictReader([ln for ln in lines if not ln.startswith("#")]))


# ---------- README ----------

COLUMN_DOCS = [
    ("test_id", "text", "Table S1 sample ID, the same ID as in `data/derived/spread_rates.csv`."),
    ("t_s", "s", "Seconds since the test's first photo (EXIF time). Same clock and same text as the edges CSV."),
    ("segment", "number", "Copied from the edges CSV. The flow step whose rate fit used this photo. Empty when no fit used it."),
    ("edge_mm", "mm", "The v1 edge. This is the only edge behind the reported rates. Position along the rod, increasing in the spread direction, 0 at the first burn photo. Empty outside the burn window and when the mask is under the area gate (`min_area_frame` in the config, 3000 px in these tests). The script stops if a cell differs from the edges CSV."),
    ("blue_edge_mm", "mm", "Diagnostic line. The same edge rule run on the blue channel alone, on the same zero and scale as `edge_mm`. Empty outside the burn window and when the blue mask is under the area gate. It is not the leading edge used for any rate."),
    ("fused_minus_v1_mm", "mm", "How far the blue-light front is ahead of the v1 edge. It is the fused edge (the front-most of the brightness edge and the blue edge, `edge.track_test_fused`) minus `edge_mm`. Positive means ahead in the spread direction. 0 means the blue front is not ahead. It is never negative. Empty when `edge_mm` is empty. For the signed gap use `blue_edge_mm - edge_mm`."),
    ("flame_len_mm", "mm", "Length of the v1 mask along the rod: front edge minus tail edge. The per-step `flame_len_mm` in spread_rates.csv is the median of this over the fit photos. Empty when there is no mask."),
    ("area_mm2", "mm^2", "Pixel count of the v1 mask divided by (px/mm)^2. Empty when there is no mask."),
    ("blue_frac", "fraction 0 to 1", "The tracker's own definition: the share of mask pixels whose blue value is above their red value. Empty when there is no mask."),
    ("brightness_p999", "linear value per second of exposure", "The photo's 99.9th percentile of mean brightness (mean of R, G, B). The flame threshold is 0.3 times this number. Filled for every photo. The percentile is taken over the cached frame, the same pixels the tracker sees (see the Frame rows column in the table above)."),
    ("r_share, g_share, b_share", "fraction 0 to 1", "Mean colour shares inside the v1 mask. For each mask pixel take R/(R+G+B), G/(R+G+B) and B/(R+G+B). Then average over the mask pixels. The three add up to 1. Every pixel counts the same. Empty when there is no mask."),
    ("in_burn_window", "0 or 1", "1 when `t_s` is inside the config's `burn_window_s`. Outside it a mask can be a lit rod or the igniter, not a flame."),
    ("fit_step", "number", "The flow step whose fit range (25 to 90 percent of the step window, the rule in `run.py` `steady_fit`) holds this photo by time alone. It is filled even when the photo has no edge. Empty outside every fit range. Where `segment` is filled, the two are equal."),
    ("brightness_p999_band", "linear value per second of exposure", "The same percentile as `brightness_p999`, taken only over the rows within `half_band` of the rod axis. These rows are the same in every test, so this value does not depend on how the cache was cropped. Used only as a cross-check."),
]


def v2_sentence(repo: str) -> str:
    """One sentence with the held-out v1/v2 medians, read from the eval file (empty if the file is missing)."""
    try:
        with open(os.path.join(repo, V2_EVAL_REL), encoding="utf-8") as h:
            ho = json.load(h)["held_out"]
        a, b = ho["v1"], ho["v2"]
        if a["median_all"] is None or b["median_all"] is None:
            return ""
        return (f"On the held-out steps the median error was {a['median_all']:.1f}% for v1 and "
                f"{b['median_all']:.1f}% for the fused edge ({a['n_all']} steps, `docs/research/v2_eval_heldout.json`). ")
    except (OSError, KeyError, ValueError, TypeError):
        return ""


def folder_summary(out_dir: str) -> list[dict]:
    """One line per feature CSV in the folder, read back from the files themselves."""
    out = []
    for p in sorted(glob.glob(os.path.join(out_dir, "*.csv"))):
        comment, rows = read_table(p)
        meta = dict(re.findall(r"(\w+)=([0-9.]+?)[;.]\s", comment + " "))
        psi = re.search(r"\(PSI ([^)]*)\)", comment)
        flame = [r for r in rows if r["in_burn_window"] == "1" and r["b_share"] != ""]
        ratio = [float(r["brightness_p999"]) / float(r["brightness_p999_band"]) for r in flame
                 if float(r["brightness_p999_band"]) > 0]
        out.append({"test": os.path.splitext(os.path.basename(p))[0], "psi": psi.group(1) if psi else "",
                    "rows": len(rows), "flame": len(flame),
                    "ratio": f"{np.median(ratio):.2f}" if ratio else "",
                    "edge": sum(1 for r in rows if r["edge_mm"] != ""),
                    "ppm": meta.get("px_per_mm_full", ""), "frame_rows": meta.get("frame_rows", "")})
    return out


def write_readme(out_dir: str, repo: str, order: list[str]) -> str:
    summ = folder_summary(out_dir)
    rank = {t: i for i, t in enumerate(order)}
    summ.sort(key=lambda s: rank.get(s["test"], len(order)))
    L = [f"<!-- {AI_NOTE} -->", "# Per-photo flame features", "",
         "One CSV per test. One row per photo, in time order. Row i is the same photo as row i of "
         "`data/derived/edges/<test>.csv` and frame i of the overlay video.", "",
         "These tables are a diagnostic. They change no reported spread rate and they do not change the headline. "
         "`pipeline/diagnostics/flame_features.py` writes them and this file. Do not edit them by hand.", "",
         "## Source",
         f"Photos: {SOURCE}. The raw Nikon photos are decoded to linear light and divided by the shutter time "
         "(`pipeline/METHOD.md`, step 1). No published spread rate is used anywhere in these tables.", "",
         "## Files",
         "| Test | PSI test | Photos (rows) | Flame photos | Photos with a v1 edge | px/mm (full resolution) | Frame rows | Frame / band brightness |",
         "|---|---|---|---|---|---|---|---|"]
    for s in summ:
        L.append(f"| {s['test']} | {s['psi']} | {s['rows']} | {s['flame']} | {s['edge']} | {s['ppm']} | {s['frame_rows']} | {s['ratio']} |")
    L += ["",
          "- A flame photo is a photo inside the burn window where the tracker found a mask. The phase model "
          "(`docs/research/flame_phase_model.md`) uses these photos.",
          "- px/mm is measured from the rod width by `run.py` `calibrate`. The cached frames are 4 times smaller, "
          "so one cached pixel is 4/(px/mm) mm.",
          "- Frame rows is the height of the cached frame. `brightness_p999` is taken over all of it. "
          "`brightness_p999_band` is taken over the rod band only, the same rows in every test.",
          "- Frame / band brightness is the median of `brightness_p999` divided by `brightness_p999_band` over the flame "
          "photos. Below 1 means the larger frame adds dark background. Above 1 means light outside the band rows is "
          "brighter than the light inside them. We did not look at what that light is.", "",
          "## File format",
          "- UTF-8, comma separated, dot decimals. An empty cell means the value is not defined.",
          "- Line 1 is a comment that starts with `#`. Line 2 is the header. In pandas: `pd.read_csv(path, comment=\"#\")`.", "",
          "## Columns",
          "| Column | Unit | How it is computed |", "|---|---|---|"]
    L += [f"| `{c.replace(', ', '`, `')}` | {u} | {how} |" for c, u, how in COLUMN_DOCS]
    L += ["",
          "## How the mask is made",
          "The mask is the tracker's own v1 flame mask (`pipeline/stillair_tracker/edge.py`, `track_frame`): pixels "
          "brighter than 0.3 times the photo's 99.9th percentile, cleaned by a morphological opening, limited to a "
          "band around the rod axis, largest connected region, at least 300 px. The script checks for every photo "
          "that its mask has the same pixel count and the same `blue_frac` as the tracker's.", "",
          "## The blue line is a diagnostic line",
          "Only `edge_mm` (v1) is behind the reported rates. `blue_edge_mm` and `fused_minus_v1_mm` show where blue "
          "light reaches further than the brightness edge. They help explain where v1 struggles. "
          "A fused edge that uses both was tested on held-out tests under a rule fixed in advance "
          "(`pipeline/PREREGISTRATION.md`). It did not beat v1, so v1 stays. " + v2_sentence(repo) +
          "In figures and videos, label the blue line as a diagnostic line, not as the leading edge.", "",
          "## Reproduce",
          "From `pipeline/`: `python -m diagnostics.flame_features`. It needs the frame caches and, for the scale, "
          "the raw photos (`python -m stillair_tracker.fetch`). Tests: `python -m pytest -q tests/test_flame_features.py`.", ""]
    path = os.path.join(out_dir, "README.md")
    with open(path, "w", encoding="utf-8", newline="\n") as h:
        h.write("\n".join(L))
    return path


# ---------- CLI ----------

def resolve_config(cfg: dict, base: str) -> dict:
    """Copy of cfg with absolute photo folders (a config's nef_dir is relative to the pipeline folder)."""
    out = json.loads(json.dumps(cfg))
    out["nef_dir"] = os.path.abspath(os.path.join(base, cfg["nef_dir"]))
    if "nef_dir" in cfg.get("calibration", {}):
        out["calibration"]["nef_dir"] = os.path.abspath(os.path.join(base, cfg["calibration"]["nef_dir"]))
    return out


def cache_path(cfg: dict, cache_dir: str) -> str:
    """Same rule as run_all.cache_path: the config's cache_file, else <psi_test lowercase>_cache.npz."""
    return os.path.join(cache_dir, cfg.get("cache_file", f"{cfg['psi_test'].lower()}_cache.npz"))


def run_test(test_id: str, config_dir: str, cache: str | None, cache_dir: str, repo: str, out_dir: str) -> dict:
    cfg_path = os.path.join(config_dir, f"{test_id}.json")
    with open(cfg_path, encoding="utf-8") as h:
        cfg = resolve_config(json.load(h), os.path.dirname(os.path.dirname(os.path.abspath(cfg_path))))
    cache = cache or cache_path(cfg, cache_dir)
    if not os.path.exists(cache):
        raise SystemExit(f"{test_id}: no frame cache at {cache} (pass --cache {test_id}=<file>)")
    edges_path = os.path.join(repo, EDGES_REL, f"{test_id}.csv")
    if not os.path.exists(edges_path):
        raise SystemExit(f"{test_id}: no {edges_path}; run stillair_tracker.run for this test first")
    d = load_test(cfg["nef_dir"], cache, tuple(cfg["cache_rows"]) if "cache_rows" in cfg else None)
    ppm_full, _ = run_mod.calibrate(cfg)
    feat = compute_features(cfg, d, ppm_full)
    rows = table_rows(test_id, feat, read_edges(edges_path))
    out = os.path.join(out_dir, f"{test_id}.csv")
    write_table(out, cfg, feat["meta"], rows)
    return {"test": test_id, "rows": len(rows), "path": out,
            "flame": sum(1 for r in rows if r["in_burn_window"] == "1" and r["b_share"] != ""),
            "edge": sum(1 for r in rows if r["edge_mm"] != "")}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Per-photo flame feature tables (diagnostic only).")
    ap.add_argument("--tests", nargs="+", default=DEFAULT_TESTS, help="test IDs (config file names)")
    ap.add_argument("--repo", default=os.path.join(PIPELINE_DIR, ".."), help="repo root")
    ap.add_argument("--configs", default=CONFIG_DIR)
    ap.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR)
    ap.add_argument("--cache", action="append", default=[], metavar="TEST=FILE", help="frame cache for one test")
    ap.add_argument("--out", default=None, help="output folder (default <repo>/docs/research/flame_features)")
    ap.add_argument("--readme-only", action="store_true", help="rewrite README.md from the CSVs already in the folder")
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)
    out_dir = a.out or os.path.join(repo, OUT_REL)
    caches = dict(c.split("=", 1) for c in a.cache)
    for tid in ([] if a.readme_only else a.tests):
        r = run_test(tid, a.configs, caches.get(tid), a.cache_dir, repo, out_dir)
        print(f"{r['test']}: {r['rows']} rows, {r['flame']} flame photos, {r['edge']} with a v1 edge; "
              f"edge_mm matches the edges CSV -> {os.path.basename(r['path'])}")
    print(write_readme(out_dir, repo, DEFAULT_TESTS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
