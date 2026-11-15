<!-- Written with AI assistance (Claude Code) -->
# Orbit spread-rate model: what NASA's space-station table predicts

A small machine-learning model of NASA's published space-station flame spread rates, with honest cross-validation. Code: `pipeline/diagnostics/orbit_model.py` (`python -m diagnostics.orbit_model --repo ..` from `pipeline/`). Numbers: `docs/research/orbit_model.json`. Figure: `docs/research/figures/orbit_model.png`. Tests: `pipeline/tests/test_orbit_model.py`.

## Data and scope
- **Training data:** Link et al. 2018, Sci Rep 8:120, Supplement Table S1 (p. 1): 52 rows from 19 samples (`data/reference/link2018_table_s1.csv`, sha256 `04d2e390...`). Inputs: opposed flow (cm/s), oxygen (%), rod diameter (mm). Target: spread rate (mm/s).
- **Scope:** microgravity (0 g), opposed forced flow, PMMA rods only, and only inside each rod size's measured flow and oxygen ranges. **It says nothing about the Moon, partial gravity, other materials or zero flow.**

## How it was tested
- **Leave-one-sample-out cross-validation:** rows from one sample share a rod and a burn, so a whole sample is held out each time.
- **Rule fixed before any score was computed:** publish the model with the lowest held-out median absolute % error. If another is within 1 percentage point, publish the simpler one.

| Model | Held-out median error | Mean error | RMSE (mm/s) | Held-out rows inside its 95% band |
|---|---|---|---|---|
| Mean of all rows (no inputs) | 24.4% | 37.2% | 0.0199 | 50/52 |
| Log-linear (physics-shaped) | 15.6% | 21.6% | 0.0139 | 47/52 |
| Gaussian process | 21.0% | 26.5% | 0.0158 | 45/52 |
| Random forest | **13.9%** | 24.5% | 0.0153 | 48/52 |

**Chosen: random forest**, by the rule above. It beats the plain average by about 10 points but the log-linear fit by under 2. That gain is small, so the log-linear fit is the one to quote for "how rate depends on each input".

## What the table says (log-linear fit; 95% intervals resample whole samples)
- **Oxygen matters most:** about 20% faster spread per extra percentage point of O2 (rate ratio 1.20, interval 1.13 to 1.36).
- **Thicker rods spread slower:** going from the 6.4 mm rod to the 12.7 mm rod roughly halves the rate (ratio 0.47, interval 0.30 to 0.58).
- **Flow, within the measured range, is a weak effect:** doubling the flow gives a ratio of 1.12, with an interval of 0.99 to 1.38 that includes "no change".

## Our own measured steps against it (reported, nothing tuned to it)
When the model is refitted **without** the test being checked:
- 8 of our 9 low-flow steps (below 1 cm/s) fall inside its 95% band, with a median difference of 15.9%.
- 14 of all 17 steps with a rate fall inside it.
- The 5 steps our tracker flags as low confidence are where it disagrees most (median difference 66%).

This is a second, independent-in-method check that the low-flow rates are in line with NASA's table. It isn't independent in data: the model learns from Table S1.

## Limits
- **Small data:** 52 rows from 19 samples. The paper says the space-station data are "data points that were not systematically taken" (Link et al. 2018, Results; `docs/sources/Link2018_SciRep_main.txt`, line 108).
- **The forest's 95% band is wide** (for B16 at 7.55 cm/s it spans 0.034 to 0.142 mm/s), so it's a sanity check, not a precise predictor.
- **Exploratory:** it changes no reported rate and not the headline (`pipeline/METHOD.md`).
- **O2 inputs are pre-burn readings.** Table S1's O2 equals NASA's calibrated initial O2, and O2 fell 0.2 to 1.7 points during each burn across Table S1's samples (0.3 to 1.6 in our six tests; B22's final reading of 0.6% is excluded as a recording error) (NASA PSI-25 experimental table; ICES-2015-196 p. 4). Retraining with in-burn O2 estimates made held-out error worse (18.1% vs 13.9%) and put 7 of our 9 low-flow steps inside the band instead of 8. So the starting-value labels stay; read "O2" here as "starting O2" (`docs/research/accuracy/uncertainty_floor.md`, sections 4-5).

## Lines a teammate could use on the site
"We trained a small model on NASA's 52 published space-station spread rates and tested it fairly, holding out one whole test at a time. Oxygen is the strongest driver: about 20% faster spread per extra point of oxygen. Thicker rods burn about half as fast. Our own low-flow measurements fall inside the model's range for 8 of 9 steps, even when the model never saw that test."

## Sources for the numbers
- Cross-validation table, chosen model, effects, outside comparison: `docs/research/orbit_model.json` (`cv`, `effects`, `outside_comparison.summary.sample_held_out`), from the run on 2026-11-15.
- 52 rows, 19 samples, Table S1 sha256: same file, `training`.
- Quote: `docs/sources/Link2018_SciRep_main.txt` line 108.
