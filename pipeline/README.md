<!-- Written with AI assistance (Claude Code) -->
# pipeline/ : Ignos flame-edge tracker

Measures opposed-flow flame spread rates from NASA BASS-II raw photos (PSI-25, CC0) and writes the contract files in `docs/DATA_CONTRACTS.md`: `data/derived/spread_rates.csv` and `data/derived/edges/<test_id>.csv`.

## Method
1. **Frames** (`frames.py`): Nikon `.NEF` decoded with rawpy at 1/4 resolution, linear light, divided by EXIF shutter time (f/2.0 and ISO 1000 are constant within a test). Time = EXIF DateTimeOriginal + SubSecTimeOriginal, seconds since the test's first photo.
2. **Edge** (`edge.py`): flame = pixels above 0.3 x the frame's own 99.9th-percentile brightness (relative, because flame brightness falls ~1000x within a test), morphological opening (hot pixels), largest component in a band around the rod axis. Leading edge = 90th percentile over rows of each row's front-most flame pixel.
3. **Scale** (`calibrate.py`): px/mm from the rod's known diameter in a well-lit full-resolution frame (half-maximum edges). NASA's rates are never used, so the validation is not circular. P16: 221.2 px / 6.35 mm = 34.83 px/mm (Link 2018 states 34).
4. **Segments** (`segment.py`, `run.py`): each config's `windows_s` are the flow-step times read from NASA's test video (FAN display and GMT clock), never from a published rate; Table S1 step durations are only a fallback for configs without `windows_s`. Steps are matched to Table S1 rows by order and duration. An exact DP change-point fit is reported in `notes` as a cross-check only. Slope fit on 25-90% of each window (sensor lag and flow-change jumps), one rule for all steps. 95% CI from the slope's standard error; threshold sensitivity = half-range of rates at threshold x0.8 and x1.2. A fitted slope of zero or less is written as unusable.

## Run
Reproduce every tracker output from scratch (from `pipeline/`; about 10 GB of NASA PSI-25 photo zips, CC0, no login):
```sh
pip install -r requirements.txt                                     # Python 3.11+, plus ffmpeg on PATH for overlays
python -m stillair_tracker.fetch --delete-zips                      # download, size-check and extract the photos and test videos every config lists
python -m stillair_tracker.run_all --repo .. --overlays --date 2026-11-15   # caches, CSVs, overlays, figure, MANIFEST.json
```
- `fetch` never downloads a file twice: a file at its listed size, or a zip whose photos are already extracted, is skipped; a broken download resumes. Deflate64 zips (P17, P19) are extracted with PowerShell 7 `Expand-Archive` on Windows, otherwise `7z` or `unzip`. Files go next to the configs' `nef_dir` (`../../space-apps-2026/data/raw/psi25/`); `--dest DIR` puts them elsewhere (then pass `--raw-dir DIR` to `run_all`). `--no-videos` skips the test videos, which are needed only to re-read the step windows by eye.
- `run_all` builds a missing frame cache from the photos (`--cache-dir`, default `../../space-apps-2026/data/derived`), runs `run.py` for every `configs/*.json`, renders `web/public/overlays/` (`--overlays`), rebuilds `docs/figures/`, and writes `pipeline/MANIFEST.json`: sha256 of every output and config, the code's git commit, Python and library versions, and the `--date` given.
- **Check the committed numbers:** `python -m stillair_tracker.run_all --repo .. --check` re-runs every config into a temporary folder and compares `spread_rates.csv` and `edges/*.csv` with the committed files cell by cell (exit code 1 on any difference). It writes nothing in the repo.
- Tests (synthetic data, no network): `python -m pytest -q tests`.
- One test by hand: `python -m stillair_tracker.run configs/B16.json --cache <cache.npz> --repo ..`.

## Configs
`configs/<test_id>.json`: PSI test, rod diameter, O2, axis row, calibration frame and crop, and Table S1 step flows/durations/rates (Link et al. 2018 Supplement Table S1 p. 1; printed Vf x 1e3 / 100 = mm/s). Switch to `data/reference/link2018_table_s1.csv` (the checked transcription).

## Diagnostics (analysis only; none changes a reported rate)
Run from `pipeline/` as `python -m diagnostics.<name> --repo ..`. Outputs go to `docs/research/` and `docs/research/figures/`; each has a test in `tests/`.
- `blue_edge`: per-step rates from a blue-channel-only edge (`docs/research/blue_edge_diagnostic.json`).
- `v2_eval`: the pre-registered fused-edge test (`pipeline/PREREGISTRATION.md`; not adopted).
- `flame_features`, `phase_model`: per-photo flame features and an exploratory bright/dim phase model (`docs/research/flame_phase_model.md`).
- `orbit_model`: a cross-validated model of Link et al. 2018 Table S1 (`docs/research/orbit_model.md`).
- `accuracy_analysis`, `synthetic_flames`, `figure_s1_check`, `verify_claims`: the accuracy audit (`docs/research/accuracy/README.md`).
- `uncertainty_floor`, `o2_depletion_refit`, `orbit_depletion_check`: condition-label uncertainty from NASA's before/after O2 readings and fan calibration (`docs/research/accuracy/uncertainty_floor.md`). These need NASA's PSI-25 experimental table locally (`--psi-table`).
- `table_s2_compare`: the checked Link 2018 Table S2 (1 g) and a 0 g vs 1 g figure (`docs/research/accuracy/table_s2/README.md`).
- `air_display`: reads the AIR sensor value from NASA's test videos for every step (`docs/research/accuracy/air_display/README.md`).
- `test_matrices`: NASA's BASS-II test-matrix and fan-calibration workbooks compared with Table S1 (`docs/research/accuracy/test_matrices/README.md`).
