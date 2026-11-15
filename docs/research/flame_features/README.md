<!-- Written with AI assistance (Claude Code) -->
# Per-photo flame features

One CSV per test. One row per photo, in time order. Row i is the same photo as row i of `data/derived/edges/<test>.csv` and frame i of the overlay video.

These tables are a diagnostic. They change no reported spread rate and they do not change the headline. `pipeline/diagnostics/flame_features.py` writes them and this file. Do not edit them by hand.

## Source
Photos: NASA PSI-25 BASS-II archive, CC0, DOI 10.60555/4qc4-de67. The raw Nikon photos are decoded to linear light and divided by the shutter time (`pipeline/METHOD.md`, step 1). No published spread rate is used anywhere in these tables.

## Files
| Test | PSI test | Photos (rows) | Flame photos | Photos with a v1 edge | px/mm (full resolution) | Frame rows | Frame / band brightness |
|---|---|---|---|---|---|---|---|
| B16 | P16 | 140 | 127 | 127 | 34.83 | 717 | 0.94 |
| B19 | P19 | 286 | 241 | 238 | 34.83 | 310 | 0.96 |
| B12 | P12 | 270 | 262 | 141 | 34.18 | 310 | 1.10 |
| P17 | P17 | 189 | 182 | 181 | 33.70 | 310 | 0.97 |
| B13b | P13b | 81 | 72 | 39 | 32.83 | 310 | 1.40 |
| B13a | P13a | 255 | 237 | 100 | 32.00 | 310 | 1.55 |

- A flame photo is a photo inside the burn window where the tracker found a mask. The phase model (`docs/research/flame_phase_model.md`) uses these photos.
- px/mm is measured from the rod width by `run.py` `calibrate`. The cached frames are 4 times smaller, so one cached pixel is 4/(px/mm) mm.
- Frame rows is the height of the cached frame. `brightness_p999` is taken over all of it. `brightness_p999_band` is taken over the rod band only, the same rows in every test.
- Frame / band brightness is the median of `brightness_p999` divided by `brightness_p999_band` over the flame photos. Below 1 means the larger frame adds dark background. Above 1 means light outside the band rows is brighter than the light inside them. We did not look at what that light is.

## File format
- UTF-8, comma separated, dot decimals. An empty cell means the value is not defined.
- Line 1 is a comment that starts with `#`. Line 2 is the header. In pandas: `pd.read_csv(path, comment="#")`.

## Columns
| Column | Unit | How it is computed |
|---|---|---|
| `test_id` | text | Table S1 sample ID, the same ID as in `data/derived/spread_rates.csv`. |
| `t_s` | s | Seconds since the test's first photo (EXIF time). Same clock and same text as the edges CSV. |
| `segment` | number | Copied from the edges CSV. The flow step whose rate fit used this photo. Empty when no fit used it. |
| `edge_mm` | mm | The v1 edge. This is the only edge behind the reported rates. Position along the rod, increasing in the spread direction, 0 at the first burn photo. Empty outside the burn window and when the mask is under the area gate (`min_area_frame` in the config, 3000 px in these tests). The script stops if a cell differs from the edges CSV. |
| `blue_edge_mm` | mm | Diagnostic line. The same edge rule run on the blue channel alone, on the same zero and scale as `edge_mm`. Empty outside the burn window and when the blue mask is under the area gate. It is not the leading edge used for any rate. |
| `fused_minus_v1_mm` | mm | How far the blue-light front is ahead of the v1 edge. It is the fused edge (the front-most of the brightness edge and the blue edge, `edge.track_test_fused`) minus `edge_mm`. Positive means ahead in the spread direction. 0 means the blue front is not ahead. It is never negative. Empty when `edge_mm` is empty. For the signed gap use `blue_edge_mm - edge_mm`. |
| `flame_len_mm` | mm | Length of the v1 mask along the rod: front edge minus tail edge. The per-step `flame_len_mm` in spread_rates.csv is the median of this over the fit photos. Empty when there is no mask. |
| `area_mm2` | mm^2 | Pixel count of the v1 mask divided by (px/mm)^2. Empty when there is no mask. |
| `blue_frac` | fraction 0 to 1 | The tracker's own definition: the share of mask pixels whose blue value is above their red value. Empty when there is no mask. |
| `brightness_p999` | linear value per second of exposure | The photo's 99.9th percentile of mean brightness (mean of R, G, B). The flame threshold is 0.3 times this number. Filled for every photo. The percentile is taken over the cached frame, the same pixels the tracker sees (see the Frame rows column in the table above). |
| `r_share`, `g_share`, `b_share` | fraction 0 to 1 | Mean colour shares inside the v1 mask. For each mask pixel take R/(R+G+B), G/(R+G+B) and B/(R+G+B). Then average over the mask pixels. The three add up to 1. Every pixel counts the same. Empty when there is no mask. |
| `in_burn_window` | 0 or 1 | 1 when `t_s` is inside the config's `burn_window_s`. Outside it a mask can be a lit rod or the igniter, not a flame. |
| `fit_step` | number | The flow step whose fit range (25 to 90 percent of the step window, the rule in `run.py` `steady_fit`) holds this photo by time alone. It is filled even when the photo has no edge. Empty outside every fit range. Where `segment` is filled, the two are equal. |
| `brightness_p999_band` | linear value per second of exposure | The same percentile as `brightness_p999`, taken only over the rows within `half_band` of the rod axis. These rows are the same in every test, so this value does not depend on how the cache was cropped. Used only as a cross-check. |

## How the mask is made
The mask is the tracker's own v1 flame mask (`pipeline/stillair_tracker/edge.py`, `track_frame`): pixels brighter than 0.3 times the photo's 99.9th percentile, cleaned by a morphological opening, limited to a band around the rod axis, largest connected region, at least 300 px. The script checks for every photo that its mask has the same pixel count and the same `blue_frac` as the tracker's.

## The blue line is a diagnostic line
Only `edge_mm` (v1) is behind the reported rates. `blue_edge_mm` and `fused_minus_v1_mm` show where blue light reaches further than the brightness edge. They help explain where v1 struggles. A fused edge that uses both was tested on held-out tests under a rule fixed in advance (`pipeline/PREREGISTRATION.md`). It did not beat v1, so v1 stays. On the held-out steps the median error was 8.7% for v1 and 11.0% for the fused edge (3 steps, `docs/research/v2_eval_heldout.json`). In figures and videos, label the blue line as a diagnostic line, not as the leading edge.

## Reproduce
From `pipeline/`: `python -m diagnostics.flame_features`. It needs the frame caches and, for the scale, the raw photos (`python -m stillair_tracker.fetch`). Tests: `python -m pytest -q tests/test_flame_features.py`.
