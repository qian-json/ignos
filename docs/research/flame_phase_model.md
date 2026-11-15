<!-- Written with AI assistance (Claude Code) -->
# Flame phase model: can the photos say where the tracker is unreliable?

**This is an exploratory analysis.** It was designed after the tracker's errors were known. It is a look back, not a test planned in advance. It changes no reported spread rate and it does not change the headline. The sample is small: 21 flow steps from 6 tests, and steps within one test are not independent. B13b and B13a were held-out tests for tracker v2. Here they are in-sample, because their photos helped fit the model.

## What
The tracker finds the flame edge by brightness. `pipeline/METHOD.md` says the tracker fails when a flow step falls in the flame's bright, sooty early phase, and works in the dim blue phase. Today a step counts as reliable by its airflow (below 1 cm/s) plus a confidence-interval rule. Here we ask a different question: can the photos alone give that signal?

## How
1. **Features.** For every flame photo we take two numbers from `docs/research/flame_features/`: log10 of `brightness_p999` and `b_share` (the blue share of the flame's colour). A flame photo is a photo inside the burn window where the tracker found a mask.
2. **Model.** Both features are standardized. Then a Gaussian mixture with 2 components is fitted on the flame photos of all 6 tests together (scikit-learn 1.9.0, full covariance, random_state 0, n_init 10). The component with the higher brightness is named **bright**. The other is named **dim-blue**. The fit sees photo features only. It never sees a spread rate or an error.
3. **Per step.** `bright_share` is the share of bright photos among the photos the step's rate fit uses. These are the photos in 25 to 90 percent of the step window that have a v1 edge (`run.py`, `steady_fit`). If no photo in that range has a v1 edge, all flame photos in the range are used.
4. **Rule.** A step is predicted unreliable if `bright_share` is 0.5 or more. This number was fixed before any result and was not tuned.
5. **Outcome.** Used only to score the rule. A step is **bad** if it has no usable rate, or if its error is above 15%. That is the band `pipeline/METHOD.md` already uses. The error is our rate against Link et al. 2018, Sci Rep 8:120, Supplement Table S1, p. 1.
6. **Current rule.** For comparison, a step is flagged today if its flow is 1 cm/s or more, or if its notes say LOW CONFIDENCE.

## Results

### The two groups of photos
| Group | Share of photos | Centre: log10 brightness | Centre: b_share |
|---|---|---|---|
| dim-blue | 69% | -0.25 | 0.53 |
| bright | 31% | 1.47 | 0.05 |

| Test | Photos | Flame photos | Bright | Dim-blue |
|---|---|---|---|---|
| B16 | 140 | 127 | 66 | 61 |
| B19 | 286 | 241 | 89 | 152 |
| B12 | 270 | 262 | 81 | 181 |
| P17 | 189 | 182 | 82 | 100 |
| B13b | 81 | 72 | 12 | 60 |
| B13a | 255 | 237 | 25 | 212 |
| All | 1221 | 1121 | 355 | 766 |

Figure: `docs/research/figures/flame_phase.png`. Left: the two features, coloured by group, one marker shape per test. Right: `bright_share` against the error of each step.

### Every step
Flow and error are from `data/derived/spread_rates.csv`. The error is against Link et al. 2018, Sci Rep 8:120, Supplement Table S1, p. 1.

| Test | Flow (cm/s) | Error | Outcome | Photos | bright_share | Photo rule | Current rule | bright_share, test left out |
|---|---|---|---|---|---|---|---|---|
| B16 | 7.55 | -20.5% | bad | 18 | 1.00 | unreliable | flagged | 1.00 |
| B16 | 1.67 | -15.6% | bad | 17 | 1.00 | unreliable | flagged | 1.00 |
| B16 | 0.83 | +9.6% | ok | 23 | 0.13 | reliable | not flagged | 0.13 |
| B16 | 0.72 | +1.4% | ok | 20 | 0.00 | reliable | not flagged | 0.00 |
| B19 | 7.55 | -49.7% | bad | 14 | 1.00 | unreliable | flagged | 1.00 |
| B19 | 1.67 | -26.8% | bad | 15 | 1.00 | unreliable | flagged | 1.00 |
| B19 | 0.83 | -1.3% | ok | 19 | 0.00 | reliable | not flagged | 0.00 |
| B19 | 0.72 | -2.8% | ok | 23 | 0.00 | reliable | not flagged | 0.00 |
| B12 | 1.01 | -66.9% | bad | 18 | 1.00 | unreliable | flagged | 1.00 |
| B12 | 0.82 | +93.3% | bad | 21 | 1.00 | unreliable | flagged | 0.71 |
| B12 | 0.6 | -13.2% | ok | 21 | 0.00 | reliable | not flagged | 0.00 |
| B12 | 0.48 | +14.8% | ok | 13 | 0.00 | reliable | not flagged | 0.00 |
| P17 | 1.01 | -23.1% | bad | 20 | 1.00 | unreliable | flagged | 1.00 |
| P17 | 0.82 | -6.5% | ok | 29 | 0.00 | reliable | not flagged | 0.00 |
| P17 | 0.41 | +7.1% | ok | 15 | 0.00 | reliable | not flagged | 0.00 |
| B13b | 1.64 | +5.8% | ok | 18 | 0.00 | reliable | flagged | 0.00 |
| B13b | 1.54 | no usable rate | bad | 22 (fallback) | 0.00 | reliable | flagged | 0.00 |
| B13a | 1.64 | no usable rate | bad | 15 | 1.00 | unreliable | flagged | 1.00 |
| B13a | 1.54 | +8.7% | ok | 6 | 0.00 | reliable | flagged | 0.00 |
| B13a | 1.43 | no usable rate | bad | 26 (fallback) | 0.00 | reliable | flagged | 0.00 |
| B13a | 1.38 | no usable rate | bad | 20 (fallback) | 0.00 | reliable | flagged | 0.00 |

"(fallback)" marks the 3 steps where no photo in the fit range has a v1 edge, so all flame photos in the range were used.

### Photo rule: bright_share at 0.5 or more means unreliable
| | Bad step | Step not bad | Total |
|---|---|---|---|
| Predicted unreliable | 8 | 0 | 8 |
| Predicted reliable | 3 | 10 | 13 |
| Total | 11 | 10 | 21 |

Sensitivity 8/11 (73%). Specificity 10/10 (100%). Correct calls 18 of 21.

### Current rule: flow at 1 cm/s or more, or LOW CONFIDENCE
| | Bad step | Step not bad | Total |
|---|---|---|---|
| Flagged | 11 | 2 | 13 |
| Not flagged | 0 | 8 | 8 |
| Total | 11 | 10 | 21 |

Sensitivity 11/11 (100%). Specificity 8/10 (80%). Correct calls 19 of 21.

### Rank correlation
Spearman rho between `bright_share` and the absolute error is **+0.86** over the 17 steps that have a rate. The permutation p-value is **below 0.0001 (none of 10,000 shuffles reached it)** (two-sided, 10,000 shuffles, seed 20261115). A stricter check shuffles the errors only inside each test, because steps of one test are not independent. That gives p = 0.001.

### Sensitivity check: other thresholds
This is a check only. These thresholds are not the rule and were not used to pick it.

| Threshold | Bad and predicted unreliable | Not bad but predicted unreliable | Bad but predicted reliable | Not bad and predicted reliable | Sensitivity | Specificity |
|---|---|---|---|---|---|---|
| 0.25 | 8 | 0 | 3 | 10 | 8/11 (73%) | 10/10 (100%) |
| 0.5 (the rule) | 8 | 0 | 3 | 10 | 8/11 (73%) | 10/10 (100%) |
| 0.75 | 8 | 0 | 3 | 10 | 8/11 (73%) | 10/10 (100%) |

### Stability: leave one test out
For each test we fitted the mixture again without that test's photos, labelled its photos with that fit, and computed its steps again.
- Step predictions that change: **0 of 21**.
- Photo labels that stay the same: 1113 of 1121.
- With the left-out labels the photo rule's table is 8 / 0 / 3 / 10 (bad and flagged / not bad and flagged / bad and not flagged / not bad and not flagged).

### Other checks
- **Which photos.** Using all flame photos in the fit range for every step, not only the ones with a v1 edge, changes 0 of 21 predictions.
- **Frame size.** `brightness_p999` is taken over the cached frame, and B16's cache keeps more rows than the others. Fitting the same model on `brightness_p999_band` (the same rows in every test) changes 0 of 21 predictions.

## Reading the result
- **Compared with the flow rule: about the same, with different mistakes.** The rules disagree on 5 steps. The photo rule is right on 2 of them and the current rule on 3 (exact McNemar p = 1.00). That is too few steps to tell the rules apart. The photo rule gets 18 of 21 steps right. The current rule gets 19 of 21 right.
- The photo rule misses 3 bad steps: B13b 1.54 cm/s, B13a 1.43 cm/s, B13a 1.38 cm/s.
- The photo rule raises 0 false alarms.
- The current rule misses 0 bad steps. It raises 2 false alarms: B13b 1.64 cm/s, B13a 1.54 cm/s.
- With 21 steps, a difference of one or two steps between the rules is not evidence that one is better.

## Limits
- **Exploratory.** The analysis was designed after the errors were known. The features, the model and the 15% band could have been chosen in other ways. A planned test on new data would be needed to confirm anything here.
- **Small sample.** 21 steps from 6 tests. Steps within a test share a rod, a camera setup and a flame history, so they are not independent. The permutation p-value treats the steps as exchangeable, so it is too optimistic.
- **No held-out test yet.** B13b and B13a were held-out for tracker v2, but they are in-sample here. The leave-one-test-out check refits the mixture, but the rule and the features were still chosen with all six tests in view.
- **One failure type only.** The rule looks for the bright phase. A step can also fail because the flame is too dim or too small for the tracker's area gate. Those photos are dim-blue, so this rule cannot flag them.
- **No reported number changes.** The spread rates, the edges and the headline in `pipeline/METHOD.md` stay as they are. The reliable set is still defined by flow plus the confidence-interval rule.
- **Brightness across tests.** Brightness is compared between tests. That assumes the same aperture and ISO in every test. We did not re-check the camera settings of each test here.
- **The blue line is a diagnostic line.** This model does not use the blue-light edge. It uses the colour inside the v1 mask. A fused edge (blue plus brightness) was tested on held-out tests under a rule fixed in advance (`pipeline/PREREGISTRATION.md`) and it did not beat v1. So v1 stays, and the blue line should be labelled a diagnostic line, not the leading edge.

## Score a new test
The fitted parameters are saved in `docs/research/flame_phase_model.json` (scaler means and scales, component weights, means and covariances). A new test can be scored without a refit:

```sh
cd pipeline
python -m diagnostics.flame_features --tests NEW --cache NEW=<frame cache>   # writes docs/research/flame_features/NEW.csv
python -m diagnostics.phase_model --score ../docs/research/flame_features/NEW.csv
```

A test scored this way is out-of-sample for the mixture. Do not refit with it before its result is written down.

## Reproduce
From `pipeline/`: `python -m diagnostics.flame_features`, then `python -m diagnostics.phase_model`. Tests: `python -m pytest -q tests/test_flame_features.py tests/test_phase_model.py`. The JSON lists the sha256 of every input file.

## Sources for the numbers
- Group centres, shares and photo counts: `docs/research/flame_phase_model.json`, fields `model.means`, `model.weights`, `model.photos_per_test`.
- Flow, error, outcome and the LOW CONFIDENCE flag of every step: `data/derived/spread_rates.csv`, columns `flow_cm_s`, `pct_error`, `rate_mm_s`, `notes` (read only).
- Photo brightness and blue share: `docs/research/flame_features/<test>.csv`, columns `brightness_p999`, `b_share`, `fit_step`, `edge_mm`.
- Both 2x2 tables, sensitivity, specificity, rho, p-values, leave-one-test-out and the threshold check: `docs/research/flame_phase_model.json`, section `metrics`.
- Link et al. 2018, Sci Rep 8:120, Supplement Table S1, p. 1 (published spread rates behind `pct_error`, used only to score the rule).
- NASA PSI-25 BASS-II archive, CC0, DOI 10.60555/4qc4-de67 (raw photos).

## For the humans to decide
- Whether to mention this diagnostic in the pitch at all. It is exploratory and changes no reported number, so the safe choice is to keep it in the repo and out of the headline.
- Whether to keep the flow rule as the only reliability flag. Nothing here argues for replacing it.
- Whether to score the next new test with the saved model (`--score`) and write the result down before looking at its error.
- A fairness note: the LOW CONFIDENCE part of the current rule comes from each fit's confidence interval, which is partly tied to the error. The photo rule does not use it.
