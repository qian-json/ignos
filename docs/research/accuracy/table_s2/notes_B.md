<!-- Written with AI assistance (Claude Code). -->
# Table S2 transcription B (image-based) - notes

## Where it is
Link et al. 2018 SI (docs/sources/Link2018_SciRep_SI.pdf), PDF page 2 of 4 (page 1 holds Table S1; Fig. S1 is below Table S2 on page 2). Rendered at 400 dpi (docs/research/table_s2/render/p2_400dpi.png), table cropped (tbl_full.png), cut into 6 overlapping strips (strip_L1-3, strip_R1-3). The PDF text layer was not used.

## Caption, verbatim as printed
"Table S2: The normal gravity experimental data of black PMMA rod samples on Earth where the reported flame spread rate is the average of at least 3 repeating tests and the flame spread over sample at stead state for at least 5 min or 4 cm." (the typo "stead state" is as printed)

## Structure
Two blocks side by side, each with 5 columns: d, X_O2, V_g, V_f x10^3, +-. Left block holds d = 1.27 cm (10 rows) and d = 0.64 cm (13 rows). Right block holds d = 0.95 cm (10 rows) and d = 0.32 cm (13 rows). Total 46 data rows (check: 10+13+10+13 = 46). Cells for d and X_O2 are merged over several rows in the printed table; the CSV repeats them on every row.

## Printed headers, verbatim
d (cm) | X_O2 (%) | V_g (cm/s) | V_f x 10^3 (cm/s) | +- (%)
(the same 5 headers repeat for the right block). There is no "mm/s" typo in this table's headers.

## Unit belief
- Printed: "V_f x10^3 (cm/s)", so the number printed is V_f times 1000 in cm/s. Rate in cm/s = printed x 1e-3. Rate in mm/s = printed x 0.01. Example: 7.81 means 0.00781 cm/s = 0.0781 mm/s.
- The "+- (%)" column is a percent uncertainty (relative, as the header says %), not a rate.
- Evidence 1: Fig. S3 on page 3 of the same PDF uses the axis label "V_f x 10^3 (cm/s)" for 1 g experiments at 21% O2 with values of roughly 2 to 6, the same size as the 1 g 20.9% rows here (7.81 to 23.57).
- Evidence 2: this agrees with the confirmed Table S1 convention (printed x 0.01 mm/s). Main text says that at 21% O2 flame spread is faster in 1 g than in microgravity for all diameters. Table S1 (0.64 cm, about 2 cm/s, 18.9%) prints 10.00; Table S2 (0.64 cm, 2 cm/s, 20.9%) prints 13.63. Same direction, same magnitude, so the same x10^3 cm/s unit is the likely one.
- Evidence 3: main text says spread rate rises as rod diameter falls; the 20.9%, 25 cm/s rows go 7.81 (1.27), 9.06 (0.95), 11.17 (0.64), 18.40 (0.32), which is monotone.
- Not done: I did not compare against the plotted values in Fig. 6b, 7 and 8 (the main text file is text only, with no plot values), so those figure checks are still open.

## Observations
- d = 0.64 has two rows both at X_O2 = 18.0 and V_g = 2 (4.69 +-1.0 and 3.13 +-2.3). Printed that way; the two rows are separate boxes in the table. No distinguishing label is printed.
- d = 1.27 has a dash at 18.3 (V_g 25) and 18.1 (V_g 2); these match the main text claim that no flame was sustained below 18.5% for 1.27 cm.
- Dashes (no flame spread value) are left empty with dash_printed=1: 1.27 at 18.3/25, 18.1/2; 0.64 at 18.2/25, 17.8/2, 17.5/2; 0.95 at 18.5/25, 18.1/2; 0.32 at 17.7/25, 17.0/2. A dash in V_f is paired with a dash in +-.

## Unsure cells
None. Every digit was read twice: once in the full table image and once in the strips (the first strip cut missed the right columns and was redone; strips L1-L3 and R1-R3 then matched the full image on all 46 rows). Plain note: the "second reading" of each cell is by the same reader on different crops, so it is not an independent human check.
