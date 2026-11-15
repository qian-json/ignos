<!-- Written with AI assistance (Claude Code) -->
# Link et al. 2018 Table S2 (Earth gravity): checked transcription and what it adds

Files:
- `link2018_table_s2.csv`: the checked table.
- `table_s2_summary.json`: summary numbers.
- `transcription_A.csv` and `transcription_B.csv` (+ notes): the two transcriptions.
- `../../figures/gravity_comparison_table_s1_s2.png`: the comparison figure.

Code: `pipeline/diagnostics/table_s2_compare.py`. Source: Link et al. 2018, Sci Rep 8:120, Supplementary Information, PDF page 2. Analysis only.

## How it was checked
- **Two independent transcriptions:** one from the PDF text layer and one from a rendered image only. They agree in **all 46 rows** (0 differing cells; the script refuses to run otherwise).
- **Check by eye:** every row was then read against a 300 dpi render (`render/`: full page, table and six row strips).
- **Contents:** 37 rows have a value; 9 print "-".
- **Units:** both blocks print "V_f x 10^3 (cm/s)". So mm/s = printed value x 0.01, the same rule as Table S1, and Table S2 has no unit typo.

## What it adds
1. **The only published repeatability for these spread rates.** The "±(%)" column is the spread over "at least 3 repeating tests" (caption). Median 1.1%, range 0.2 to 8.0% (37 values).
   - This is Earth-gravity repeatability. No equivalent is published for the space-station rates in Table S1.
2. **The paper's text and its own table disagree on the Earth oxygen limit.**
   - The Results text says: "flame cannot exist in normal gravity for X_O2 = 18% and below" (`docs/sources/Link2018_SciRep_main.txt`, line 138).
   - Table S2 lists Earth-gravity spread rates at **18.0%** for the 0.64 cm and 0.32 cm rods, and at **17.5%** for the 0.32 cm rod.
   - The text matches the 1.27 cm and 0.95 cm rods, whose lowest values are at 18.5%. So the sentence holds for the thicker rods, not for every diameter in the paper.
   - This is the same kind of finding as the Table S1 unit typo: a check of the paper against itself, not a claim about the physics.
3. **0 g vs 1 g, side by side (figure):**
   - The paper describes faster spread in microgravity below 19% O2, but the tabulated points do not support that as a universal pairwise rule. At 18.5% O2 and 2 cm/s opposed flow for the 0.95 cm rod, Table S1 gives 0.0325 mm/s in 0 g and Table S2 gives 0.0333 mm/s in 1 g. Compare rates only with diameter, oxygen and flow matched; the 25 cm/s Earth series is not flow-matched to Table S1. A dash in Table S2 means no rate is printed, not a measured zero or a confirmed extinction.
   - Table S1 O2 values are pre-burn readings (see `../uncertainty_floor.md`).
   - This is published data only: no lunar or partial-gravity value is drawn or implied.

## Sources for the numbers
- **46, 37, 9 rows; median 1.1%, range 0.2 to 8.0%; lowest O2 with a value per diameter:** `table_s2_summary.json`.
- **Quotes:** `docs/sources/Link2018_SciRep_main.txt` line 138 (Results, text on Fig. 8) and the Table S2 caption (SI p. 2).

