<!-- Written with AI assistance (Claude Code) -->
# BASS-II test matrices vs Table S1 and the PSI-25 experimental table

Analysis only. Nothing in `data/` or the tracker was changed. Regenerate with `python -m diagnostics.test_matrices --repo ..` from `pipeline/`.

## Files here

- `Bhattacharjee.csv`, `Ferkul.csv`, `Miller.csv`, `Olson.csv`, `Fernandez_Pello.csv`, `T_ien.csv`: every cell of each sheet of `PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx`, raw (column letters as in Excel; the first column is the row number). Dates are Excel serial numbers (41842 = 2014-07-22).
- `planned_vs_table_s1.csv`: one row per Table S1 step (52 rows, 19 samples). It has the matrix text, my inferred step alignment, Table S1 O2, flow and dt, the PSI experimental table's fan display, air display and O2, the calibration block used, and a `flags` column.
- `fan_calibration_by_date.csv`: every reading in `PSI-25_Reference Data_Fan calibration data.xlsx` (sheet "Fan Calibration data"), per date block and restrictor table, with the focus rows (pots 0.5, 1, 2, or fan display 41 to 42) marked and our test IDs on their dates.

## What the "test matrices" are

They are not a separate plan. Each of the six sheets (one per investigator) has the same columns as `PSI-25_Experimental table_BASS-II.csv`: date, GMT, test, sample, material, restrictor, fan display, air display, radiometer gain, frames, calibrated initial and final O2, CO2, CO. Our P tests are on the sheet "Fernandez-Pello" (rows P1 to P25). For all 19 Table S1 samples, the matrix row and the experimental table row agree on date, GMT, sample, restrictor, material, fan display, air display and both O2 values (0 differences, checked in code). So the matrix adds no independent "planned" information. The only planned-condition data is free text in "Fan display" (fan reading, with the pot setting in brackets or after "pot") and "Air display" (the air speed readout in cm/s, or pots in some rows). Those lists have unequal lengths, so matching them to Table S1 steps is my inference, shown in the `alignment_confidence` column (high, medium, low).

Name trap: the PSI table also has rows named B12, B13, B16, B19 and so on. These are different tests (PMMA film, "Bhattacharjee" sheet; for example PSI B16 is dated 2014-07-02 with 17.3 % O2). Table S1's B16 means PSI P16 (Fernandez-Pello sheet, 1/4 inch rod, 2014-07-22, 18.2 %). Everything here uses the P rows.

## Our six tests: what matches

| Ours | PSI | Date (experimental table and matrix agree) | Rod | O2: Table S1 vs initial | Final O2 |
|---|---|---|---|---|---|
| B16 | P16 | 2014-07-22 | 1/4 in = 0.64 cm, matches | 18.2 vs 18.2 | 17.4 |
| B19 | P19 | 2014-07-22 | 0.64, matches | 17.5 vs 17.5 | 16.7 |
| B12 | P12 | 2014-07-29 | 3/8 in = 0.95, matches | 17.5 vs 17.5 | 16.8 |
| P17 | P17 | 2014-07-29 | 0.64, matches | 16.8 vs 16.8 | 16.5 |
| B13a | P13a | 2014-07-14 | 0.5 in = 1.27, matches | 20.7 vs 20.7 | 19.1 |
| B13b | P13b | 2014-07-14 | 1.27, matches | 20.6 vs 20.6 | 20.2 |

Source: columns `psi_initial_o2`, `psi_final_o2`, `matrix_date` in `planned_vs_table_s1.csv`, which come from the PSI experimental table rows for these tests and the matrix sheet "Fernandez-Pello". Table S1's O2 equals the initial O2. The O2 falls during each burn by 0.3 to 1.6 points (P13a is the largest, 20.7 to 19.1), so the label is the start value, not the value at each step. Table S1 rod diameters match the matrix rod text for all 19 samples.

## Flow: what the plan, the calibration and Table S1 say

B16 and B19 alignment is solid. Matrix P16 lists fan 49, 62, 44, 41.5, 41 with pots 1.3, 2.8, 0.7, 0.4, 0.36, 0.32 and air display "5 8 2 low". Table S1's four steps (7.55, 1.67, 0.83, 0.72 cm/s) line up with pots 2.8, 0.7, 0.4, 0.36; the first plan step at pot 1.3 (5 cm/s) is not in Table S1. B19 has the same flows and pots, with a pot-10 blowoff (fan 122) inserted in the list, so the order of its steps 3 and 4 is a little uncertain.

Calibration for 2014-07-22 (GMT 2014-203, 2 restrictors; sheet "Fan Calibration data", block for 2014-203):

| Pot | Fan display | Air display (cm/s) |
|---|---|---|
| 2 | 55 | 6 |
| 1 | 47 | 3.5 |
| 0.5 | 42 | 0 |

- Step 1 (pot 2.8): interpolated U = 8.05 cm/s vs Table S1 7.55. Within 7 %. Plan nominal 8.
- Step 2 (pot 0.7): interpolated 1.41 vs Table S1 1.67 (plan nominal 2). The lower bracket (pot 0.5) reads 0, so this is soft.
- Steps 3 and 4 (pots 0.4 and 0.36, fan 41.5 and 41): the calibration has no reading below pot 0.5, and the pot 0.5 reading is already 0 (below the display resolution). Table S1's 0.83 and 0.72 cm/s therefore cannot be reproduced or checked from this workbook. They come from something else, such as a fit or extrapolation that is not in these files. This is the main uncertainty for the low-flow steps of B16 and B19.

B13a and B13b (2014-07-14, GMT 195): the matrix gives "Fan pot 1.1 (5cm/s), 0.4, 0.36, 0.32, 0.3, 0.28, 0.26, 0 ext" (B13b: 1.3, then 0.4, 0.36, 0.32 ext). Table S1 flows 1.64, 1.54, 1.43, 1.38 (B13b: the first two) fit pots 0.4, 0.36, 0.32, 0.3. B5 and B9 on the same date have the same values, so they behave like a function of the pot. The 07-14 calibration block's lowest reading is pot 1 = 4 cm/s (fan 47); pot 2 = 6. So every Table S1 flow for these tests lies below the lowest calibrated point and cannot be checked. At pot 1.1 the calibration gives about 4.2 cm/s while the matrix says "5cm/s" (about 18 % apart).

B12 and P17 (2014-07-29, GMT 210): alignment is unresolved. P12 pots are 2.6, 1.6, 1.2, 0.75, 0.5, 0.4, 0.36, 0.34 with fan 60, 52, 48, 44.5, 42, 41.5, 41 and air "5 3 2 1 0.5 lower". P17 pots are 2.6, 1.6, 1.2, 10 (fan 233, air 22), 1.2, 0.36, 0.34. Table S1 gives B12 1.01, 0.82, 0.60, 0.48 and P17 1.01, 0.82, 0.41, so the first two match between them. The 07-29 calibration (2 restrictors) reads air 3 at pot 2, 0 at pot 1 and 20 at pot 10, so interpolated U is 4.2 at pot 2.6, 1.8 at pot 1.6 and 0.6 at pot 1.2. The plan air displays (5, 3, 2) are higher than these. Table S1's 1.01 and 0.82 cannot be tied to a pot with this calibration. Also, the 07-29 calibration's 2-restrictor table is identical to its no-restrictor table (20, 15, 10, 7, 3, 0), so it may be a copy; I cannot tell from the file. Treat B12 and P17 flows as the least certain of our six.

## Other mismatches found (all in `flags`)

- B15: Table S1 O2 = 18.4, but PSI P15 initial O2 = 18.0 (matrix and experimental table agree on 18). P14 is 18.4, which matches Table S1's B14. This may be a slip in Table S1 or in the PSI table; not resolved. B15 step 1 is also 2.14 cm/s vs plan air display 5.
- B22 (P22a): PSI final O2 is 0.6, and P22b has initial 20 and final 39.1. These are not physical and look like typos in the source. Table S1's 20.8 matches the initial value. Table S1 has 4 steps (1.58, 1.58, 1.52, 1.48) but the matrix names only pots 0.36 and 0.32. C25 has 1.58, 1.52, 1.48 at pots 0.36, 0.34, 0.33 on the same date, so the B22 plan text is incomplete.
- On 2014-07-08 (C25, B22) the calibration's lowest reading is pot 0.5 (air 1), so Table S1's 1.58 to 1.48 at pots 0.36 to 0.33 are below the calibrated range.
- B1, C3a, B2, C3b (tests on 2014-06-16): no calibration block exists for that date; the nearest is 2014-06-23. B1's 4.00 vs plan nominal 5, and C3a's second step (2.00) has no matching matrix entry.
- B4, B6, B10 (2014-07-03): the same Table S1 flows (2.00, 1.87, 1.73) at pots 0.4, 0.36, 0.32; the calibration has no reading in that range.
- `T_ien.csv`: tests T9 and T18 have date serial 43275 (a 2018 date) with GMT 175 (2014). Looks like a date typo; not used by us.

## What this means for certainty

- O2 labels: reliable as initial O2 for all six tests (Table S1, matrix and PSI table agree). Each burn loses 0.3 to 1.6 points, so the O2 at later steps is lower than the label.
- Flow labels, higher steps (B16 and B19 steps 1 and 2): supported by the calibration and the plan to within about 7 % and 20 %.
- Flow labels, low steps (B16 and B19 steps 3 and 4; B13a and B13b all steps; B12 and P17 all steps): not reproducible from the calibration workbook. The calibration stops at pot 0.5 or 1 and reads 0 or near 0 where our steps are. Treat these Table S1 flows as published values we cannot independently confirm, with no stated uncertainty. The air display resolution in the calibration sheet (about 0.25 to 1 cm/s) is as large as the flow itself in these steps.
- Plan versus Table S1: the plan "air display" is a coarse nominal (5, 3, 2, low). It differs from Table S1 by 20 to 60 % at low steps, so it is not usable as a check.
