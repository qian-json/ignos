<!-- Written with AI assistance (Claude Code) -->
# Condition-label uncertainty for the BASS-II steps (oxygen and flow)

Analysis only. No reported rate, edge or the headline changes. Code: `pipeline/diagnostics/uncertainty_floor.py`. Numbers: `uncertainty_floor.json`. Figure: `../figures/accuracy_uncertainty_floor.png`. Tests: `pipeline/tests/test_uncertainty_floor.py`.

## Correction first
An earlier version of this file (commit `1c820c7`) said our 8 headline steps agree with Table S1 "within 2 SD once NASA's oxygen uncertainty is counted". **That was wrong.**
- **Why:** our rate and the Table S1 rate measure the **same flame in the same burn**. An error in the oxygen or flow *label* can't make the two measurements disagree; it cancels.
- **What stands:** the earlier comparison, with Table S1 taken as given: **3 of 8 within 1 provisional SD, 6 of 8 within 2** (`analysis.json`).
- **What's still unknown:** NASA's own per-step rate uncertainty isn't published (see "Not found" below), so the agreement can't be called calibrated.

Label uncertainty does matter whenever a measured rate is compared with a **model or a condition**: the orbit model, the habitat matcher, Moon or Earth comparisons. That's what this file measures.

## 1. Oxygen labels are starting values, and oxygen fell during every burn
- **Labels are starting values:** NASA's PSI-25 experimental table (CC0) has "Calibrated initial O2" and "Calibrated final O2" for each test. For all six of our tests, **Table S1's O2 equals the initial value** (checked in the test suite).
- **Oxygen fell during every burn:** "The O2 decreased during each burn" (ICES-2015-196, p. 4). Readings were "taken before and after each BASS-II test" (p. 5), so oxygen during a step isn't recorded.

| Test | Label = initial O2 | Final O2 | Drop | Rate effect of the full drop* |
|---|---|---|---|---|
| B16 (P16) | 18.2 | 17.4 | 0.8 | −13% |
| B19 (P19) | 17.5 | 16.7 | 0.8 | −13% |
| B12 (P12) | 17.5 | 16.8 | 0.7 | −12% |
| P17 | 16.8 | 16.5 | 0.3 | −5% |
| B13b (P13b) | 20.6 | 20.2 | 0.4 | −7% |
| B13a (P13a) | 20.7 | 19.1 | 1.6 | −25% |

\*Using Table S1's own log-linear sensitivity: ln(rate) falls 0.180 per O2 point (`../orbit_model.json`; whole-sample bootstrap 95% CI 0.126 to 0.310).

**During the 8 headline low-flow steps:** these come late in each burn. Assuming oxygen falls linearly in time between the before and after readings (an assumption; real depletion follows the burning rate), each step ran **0.17 to 0.69 O2 points below its label**. At the same flow, that predicts rates **3 to 12% below** what the label implies. The bounds are 0 (oxygen stayed at its initial value until the step) to the full drop.

**What follows:**
- Any model trained on Table S1 labels learns rates at slightly too-high oxygen. That includes our orbit model and any O2 dependence read off the published table.
- A habitat comparison that says "BASS-II tested 18.2% O2" is quoting the start of the burn.
- None of this changes our-vs-Table S1 agreement.

## 2. Oxygen: the stated uncertainty
- Link et al. 2018 (Sci Rep 8:120) state "the uncertainty of oxygen concentration in microgravity is ±0.3%" (Fig. 7 caption). It doesn't say whether that's one SD or a bound. The caption belongs to Fig. 7, whose microgravity data are at flows of "around 2 cm/s", so applying the same ±0.3 to the sub-1 cm/s headline steps is a transfer assumption (point raised in a team review).
- In rate terms through the same sensitivity: **5.5%** if one SD (3.8 to 9.7% across the sensitivity's CI), **2.8%** if it's a 95% bound.
- ICES-2015-196 (p. 4) gives the sensor's resolution as 0.1% O2, with its offset set daily against the station's analyzer.

## 3. Flow labels: calibrated at higher flows, low-flow labels sit near fan cut-off
- **Daily calibration:** "The fan voltage was calibrated with the air velocity transducer at the end of every operations day" (ICES-2015-196, p. 3). The transducer "had a response time of approximately one minute" (p. 2). That matches the ~1 min lag our fit rule skips (`pipeline/METHOD.md`).
- **What the calibration file covers:** NASA's "PSI-25_Reference Data_Fan calibration data.xlsx" (CC0) holds daily calibrations at pot settings 10, 8, 6, 4, 2, 1, 0.5 (some blocks) and 0.
  - Its own notes: the velocity conversion is "Based on SPICE fan calibration data at 56 mm downstream, 36 mm from bottom (centerline)".
  - Also: "the fan turns off at a finite voltage (above 3.8 volts), so it is recommended to not use the 3.8 volts zero flow value."
- **Why low-flow labels are weak:** our low-flow steps ran at fan displays 41 to 42, about 4.1 to 4.2 V (the display is 10 × the fan voltage, ICES-2015-196 p. 3). That's just above the cut-off.
  - The calibration file has a pot 0.5 setting at **fan display 42**. Across calibration days and restrictor setups, the air reading there ranged from **0 to 3.75 cm/s**. At fan display 42 there are 13 readings: 0 (4 times), 0.5, 1 (twice), 2 (4 times), 3 and 3.75 (`test_matrices/fan_calibration_by_date.csv`); two more pot-0.5 entries have no fan display recorded.
  - Table S1's low-flow labels are 0.41 to 0.83 cm/s. So at the fan setting used for them, one calibration day can read several times another, and some days read zero.
  - This is consistent with the same display giving 0.72 cm/s on one day and 0.41 cm/s on another.
  - We don't turn this into a single uncertainty: restrictor setups differ between blocks, the readings are coarse near the bottom of the sensor's range, and the file states no uncertainty. But it shows the low-flow labels are the least certain condition in the dataset.

**Cross-check with NASA's test-matrix workbook** (`test_matrices/README.md`): the workbook repeats the PSI experimental table, one sheet per investigator, and matches Table S1 for all 19 samples (date, rod, initial O2). Calibrated settings reproduce the high-flow labels only roughly (B16/B19 step 1: 7.55 vs 8.05 cm/s; step 2: 1.67 vs 1.41 cm/s). None of the low-flow labels can be reproduced from the calibration, because the lowest calibrated setting already reads near zero. NASA's table also has two impossible O2 entries: B22 (P22a) final 0.6%, and P22b final 39.1% from an initial 20%.

## Not found (searched NASA NTRS, Link 2018 and its supplement, the BASS-II poster NTRS 20160000593)
- A numeric uncertainty for any BASS-II spread rate, or test-to-test scatter for repeated microgravity tests.
- A fan-setting-to-velocity curve below pot 0.5, or a duct flow profile.
- Continuous O2 logging during a burn.

## What would settle it
- Time-stamped O2 during a burn.
- A low-flow velocity calibration.
- Table S1 authors' per-step rate uncertainty.

These are concrete questions for the BASS-II team.

## Sources for the numbers
- **Initial and final O2:** NASA PSI-25 experimental table, "Calibrated initial/final O2 % by vol" (local copy, read by the script; values stored in `uncertainty_floor.json` `tests`).
- **Per-step estimates:** `uncertainty_floor.json` `steps`. The windows and burn window come from `pipeline/configs/*.json`.
- **Sensitivity:** `../orbit_model.json` (`effects.loglinear_coefficients.o2_pct`).
- **Quotes:** ICES-2015-196 (Olson, Ferkul et al., NTRS 20150019858) pp. 2-5, checked in the PDF. Link et al. 2018 Fig. 7 caption and Results (`docs/sources/Link2018_SciRep_main.txt` lines 134 and 108). Fan calibration notes: NASA's xlsx, as quoted.
- **3/8 and 6/8:** `analysis.json`.

## 4. Does the starting-O2 labelling bias the published O2 trend? (all 19 Table S1 samples)
Code: `pipeline/diagnostics/o2_depletion_refit.py`. Numbers: `o2_depletion_refit.json`. Tests: `pipeline/tests/test_o2_depletion_refit.py`.

**What was done:**
- NASA's PSI-25 table has before and after O2 for **every** Table S1 sample, not only ours. The label equals the initial reading for 18 of 19 samples. B15 is labelled 18.4% but its PSI initial reading is 18.0%, a discrepancy already noted in our Table S1 mapping.
- Each of the 52 Table S1 steps got an O2 estimate at its midpoint. This assumes the steps are contiguous and in table order, filling the burn, and that O2 falls linearly in time between the readings.
- The log-linear model was refitted with each O2 choice, with whole-sample bootstrap CIs (4,000 resamples, seed 20261115).

**One data-quality flag:** NASA's table lists B22 (PSI P22a) as starting at 20.8% O2 and ending at **0.6%**, a 20.2-point drop. Every other sample drops 0.2 to 1.7 points, so this is very likely a recording or post-purge value, not depletion by one rod burn. **Timing, stated honestly:** the exclusion rule (a drop above 3 points is implausible for one rod burn) was added **after** the first fit had been seen, when B22 alone made that fit collapse. The reason is physical (one rod can't burn 20 points of O2 out of the chamber), not chosen to get a particular coefficient. Both results are shown:
- With B22 (52 rows, 19 samples): the coefficient is 0.180 for the label, 0.022 for the in-burn estimate and −0.006 for the final reading. The last two are driven by B22's 0.6% entry.
- Without B22 (48 rows, 18 samples): the table below.

| O2 used (48 rows, 18 samples) | d ln(rate) / d O2 | Whole-sample 95% CI | Rate ratio per point |
|---|---|---|---|
| Table S1 label (= initial) | 0.195 | 0.121 to 0.352 | 1.21 |
| Estimated at step midpoint | 0.212 | 0.134 to 0.355 | 1.24 |
| Final reading (bound) | 0.214 | 0.131 to 0.345 | 1.24 |

**Reading:** labelling each burn with its starting O2 makes the O2 dependence look about 9% flatter than with the in-burn estimate. That's small and well inside the CIs. **The published O2 trend is robust to this labelling.** What changes is the absolute O2 a given late step really ran at (section 1), not the trend.

## 5. Does the orbit-model check change with in-burn O2? (`orbit_depletion_check.py`, `orbit_depletion_check.json`)
**Method:** the same random forest, band rule and seed as `orbit_model.py`, retrained with the in-burn O2 estimates for Table S1 rows. Our 9 low-flow steps with a rate (8 headline plus flagged B12 0.82) are scored at their own in-burn estimates, each by a forest refitted without that step's own Table S1 sample. B22's rows keep their label O2 in both runs.

| O2 convention | Table S1 held-out median error | Our steps inside the 95% band | Median \|ours − model\| |
|---|---|---|---|
| Label (starting O2), as published in orbit_model.md | 13.9% | 8 of 9 | 15.9% |
| In-burn estimate | 18.1% | 7 of 9 | 22.8% |

**Reading:** with the in-burn estimates the model predicts held-out Table S1 rows *worse*. So at this level our timing assumptions (steps contiguous and filling the burn, O2 falling linearly) add noise rather than signal, and the label convention stays the better working choice. This doesn't show the labels are right. It shows the estimate is too crude to improve on them. Our-vs-model agreement doesn't change in substance.
