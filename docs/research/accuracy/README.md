<!-- Written with AI assistance (Claude Code and Codex) -->
# Frozen tracker accuracy audit

This audit reads the frozen `data/derived/spread_rates.csv`, `data/derived/edges/*.csv`, and the published rates transcribed from Link et al. (2018), *Scientific Reports* 8:120, Supplement Table S1, p. 1. It does not alter the tracker, step windows, derived data, or published comparison values. The scripts are `pipeline/diagnostics/accuracy_analysis.py`, `synthetic_flames.py`, and `verify_claims.py`; machine-readable results are `analysis.json`, `synthetic.json`, and `claims_report.json` in this folder.

## Method comparison

For the 8 low-flow headline steps from 4 tests, the median absolute difference from Table S1 is **6.78%**. All 8 are within 15%. The mean tracker minus Table S1 difference is **+0.00030 mm/s**, with descriptive Bland-Altman 95% limits of **-0.00693 to +0.00753 mm/s**. Lin's concordance correlation coefficient is **0.979**. Deming regression of tracker rate on Table S1 rate, assuming equal error variances, gives slope **1.052** and intercept **-0.00214 mm/s**. Resampling entire tests 20,000 times gives 95% percentile intervals of **0.752 to 1.496** for the slope and **-0.02829 to +0.00738 mm/s** for the intercept. Both ideal values, 1 and 0, lie inside those intervals. The test-cluster bootstrap median absolute error interval is **2.1 to 13.2%**. These intervals have only 4 independent test clusters, so coverage is uncertain. Source: `analysis.json:headline`, computed from the frozen CSV, with Table S1 p. 1 as the published reference.

| Test | Low-flow steps | Median absolute difference | Mean tracker minus Table S1 |
|---|---:|---:|---:|
| B16 | 2 | 5.50% | +0.00375 mm/s |
| B19 | 2 | 2.02% | -0.00115 mm/s |
| B12 | 2 | 13.96% | -0.00065 mm/s |
| P17 | 2 | 6.78% | -0.00075 mm/s |

The ninth low-flow step, B12 at 0.82 cm/s, was excluded by the frozen confidence rule because its fit CI is wide. It differs from Table S1 by +93.3%. Including it gives a 9-step median absolute difference of **7.08%**, concordance **0.783**, and Bland-Altman limits **-0.01807 to +0.02575 mm/s**. Its inclusion changes the mean difference to **+0.00384 mm/s**. This is not a second validated headline. Source: `analysis.json:all_nine_low_flow_including_flagged` and the B12 CSV row.

The figures show [parity](../figures/accuracy_parity.png), [Bland-Altman differences](../figures/accuracy_bland_altman.png), and [per-test residuals](../figures/accuracy_by_test.png). The Bland-Altman limits describe this small set of steps; they are not a prediction interval for a new test. Table S1 rates are measurements from the same underlying burns, so the two methods are not fully independent. The equal-variance Deming assumption cannot be checked because Table S1 gives no per-step uncertainty.

## Stepwise uncertainty budget

The fit component is the CSV Student-t 95% half-width divided by the matching t critical value. The threshold component is the CSV half-range under threshold multipliers 0.8 and 1.2. The window component refits each edge CSV after independently shifting the window start and end by -10, -5, 0, +5, and +10 seconds, using the frozen 25-90% fit rule. The largest absolute rate change is its sensitivity half-range. Sensitivity half-ranges are divided by sqrt(3) as *provisional* rectangular-distribution standard deviations. The scale SEM is read from the CSV notes. For B16 and B19 only, the 1.2 px variation in the P16 rod-width reading (`pipeline/METHOD.md`, How, step 4) is additionally treated as a rectangular systematic bound; B19 shares that calibration. B12 and P17 have no documented independent systematic scale bound, so their budget is incomplete. The components are combined in quadrature, which also ignores possible dependence among them.

| Test | Flow cm/s | Fit SD | Threshold half-range | Window max shift | Provisional SD | z if Table S1 SD = 0 |
|---|---:|---:|---:|---:|---:|---:|
| B16 | 0.83 | 0.00212 | 0.0057 | 0.0017 | 0.00404 | +1.66 |
| B16 | 0.72 | 0.00157 | 0.0008 | 0.0024 | 0.00214 | +0.37 |
| B19 | 0.83 | 0.00128 | 0.0006 | 0.0011 | 0.00148 | -0.54 |
| B19 | 0.72 | 0.00091 | 0.0007 | 0.0010 | 0.00117 | -1.28 |
| B12 flagged | 0.82 | 0.02914 | 0.0236 | 0.0242 | 0.03508 | +0.92 |
| B12 | 0.60 | 0.00100 | 0.0006 | 0.0021 | 0.00161 | -2.99 |
| B12 | 0.48 | 0.00109 | 0.0006 | 0.0018 | 0.00154 | +2.27 |
| P17 | 0.82 | 0.00107 | 0.0041 | 0.0013 | 0.00270 | -1.15 |
| P17 | 0.41 | 0.00167 | 0.0002 | 0.0074 | 0.00460 | +0.35 |

All rates in this table are mm/s except flow. The Table S1 uncertainty is set to zero only to show the computable portion of the denominator. Under that assumption, **3 of 8** headline steps lie within 1 provisional SD and **6 of 8** within 2. Across all 9 low-flow steps, the counts are **4 of 9** and **7 of 9**. Since the NASA uncertainty is unknown and the two estimates can share errors, these are not calibrated statistical coverage statements. In particular, B12 at 0.60 and 0.48 cm/s lies outside 2 provisional SD. Source: `analysis.json:budget` and the frozen edge/step CSVs.

The Bhattacharjee/Carmignani frame-resolution expression cited in `pipeline/METHOD.md` is `(1 / dt) * (1 / (p * Vf) + 1 / f)`. Using the measured quarter-resolution px/mm, median actual photo interval for `1/f`, and the observed fit span for `dt` gives **5.5% to 14.8%** over the 9 low-flow rows in `analysis.json:budget`. This is a sampling-resolution heuristic, not another independent SD, and it is deliberately excluded from the quadrature budget. The older 2.4-3.3% B16/B19 estimate used different timing assumptions and does not cover the B16 0.83 cm/s discrepancy. The heuristic cannot establish agreement with Table S1.

## Known-truth synthetic flames

`synthetic_flames.py` uses the actual B16 photo timestamps in `data/derived/edges/B16.csv`, the B16 1/4-resolution measured scale, speeds of **0.02, 0.06, and 0.10 mm/s**, a red/yellow sooty core, a blue leading zone, **1000-fold** radiance decay, changing shutter times, sensor noise, and isolated hot pixels. It calls the frozen `edge.track_test` and `run.steady_fit` without changing their thresholds. With a visible blue zone throughout, **6 of 6 synthetic runs** are within **0.12%** of known speed. When the bright early core hides the blue zone until later, **6 of 6 fail** the 1% target: errors are **+13.9% to +69.7%**. The early front is about 36 px behind truth and becomes visible late, so its changing offset creates a false positive slope. Source: `synthetic.json`; the visual comparison is [here](../figures/accuracy_synthetic.png). The two seeds give effectively identical values because the noise is small relative to the mask threshold; these 12 runs do not establish real-photo accuracy or generalize across flame shapes.

## Numeric claim audit

`verify_claims.py` inventories every numeric token in `pipeline/METHOD.md`, `docs/research/pitch_qa.md`, and all four `docs/submission/*.md` files. Its `claims_report.json` records each token, file, line, and source candidate, and looks for numeric candidates in the rate CSV and relevant JSON sources. It also runs 8 context-specific checks for the headline and the gap in the figure captioned P-213; all 8 pass. Of 851 extracted tokens, 205 have a numeric candidate match, 227 are marked as metadata or paper facts needing manual review, and 419 remain unverified by this script. A matching number elsewhere in a source is **only a candidate match**, not proof that a sentence uses the right variable or source. The unresolved set includes identifiers, count words, bounds, and external-paper facts. This audit does not claim 100% verified scientific assertions.

The audit found and corrected a stale tracker-test count, an unconfirmed Ask fact count, an overstatement that a confidence interval containing zero proves no bias, an overgeneralization of the frame-resolution heuristic, and wording that said every early high-flow step was flagged when one was not. Corrections are in `docs/research/pitch_qa.md`, `docs/submission/project_page.md`, and `pipeline/METHOD.md`.

## Whole-curve check against Fig. S1

`figure_s1_check.py` digitizes Link et al. (2018) Supplement Fig. S1, p. 2, twice: from a fresh high-resolution render of the source PDF and from the separately supplied `docs/plan-images/link2018-figS1.png`. Each pass has its own axis calibration. It extracts the four color-coded curves in B16 and B19, then compares interpolated figure positions with the committed edge CSVs over their common times. One vertical offset per curve is removed at the first shared photo because the paper plots separate steps at different position origins. No slope correction is applied. The two passes use the same color-selection logic on different rasters, so they are repeat digitizations, not independent human transcriptions. Source: `figure_s1.json` and [digitized-curve plot](../figures/accuracy_figure_s1.png).

| Test | Flow cm/s | Fig. S1 slope, PDF pass | Frozen CSV rate | Shape RMSE, PDF pass |
|---|---:|---:|---:|---:|
| B16 | 0.72 | 0.0592 | 0.0576 | 0.42 mm |
| B16 | 0.83 | 0.0725 | 0.0766 | 0.55 mm |
| B16 | 1.67 | 0.0791 | 0.0643 | 1.89 mm |
| B16 | 7.55 | 0.0699 | 0.0539 | 2.27 mm |
| B19 | 0.72 | 0.0544 | 0.0529 | 0.37 mm |
| B19 | 0.83 | 0.0621 | 0.0617 | 0.22 mm |
| B19 | 1.67 | 0.0653 | 0.0477 | 1.46 mm |
| B19 | 7.55 | 0.0452 | 0.0236 | 1.64 mm |

The supplied-PNG pass gives 0.35 to 0.62 mm RMSE on the four low-flow curves and 1.41 to 2.30 mm on the four high-flow curves. After removing each pass's constant vertical calibration offset, the median absolute point disagreement between passes is 0.05 to 0.12 mm. The axes and markers are small, so digitization is approximate. The figure's plotted start time may not exactly equal the video-read window start, and the shared photo experiment means this is a cross-check of processing, not independent experimental replication. The high-flow shape failures remain failures.

## Reproduce

From `pipeline/`, run `python -m diagnostics.accuracy_analysis`, `python -m diagnostics.synthetic_flames`, `python -m diagnostics.figure_s1_check`, and `python -m diagnostics.verify_claims`. Those commands write only the audit artifacts in this folder and `docs/research/figures/`. The frozen tracker can then be checked with `python -m stillair_tracker.run_all --repo .. --check`, followed by `python -m pytest -q tests` from `pipeline/` and `npm run build` plus `npm test` from the repo root.
