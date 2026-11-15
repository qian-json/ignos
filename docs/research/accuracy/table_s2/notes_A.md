<!-- Written with AI assistance (Claude Code) -->
# Table S2 transcription A: notes

Source: docs/sources/Link2018_SciRep_SI.pdf, PDF page 2 (index 1). Method: PyMuPDF word positions only. A rendered image was used just to check the layout, not to read digits.

## Printed caption (verbatim)
"Table S2: The normal gravity experimental data of black PMMA rod samples on Earth where the reported flame spread rate is the average of at least 3 repeating tests and the flame spread over sample at stead state for at least 5 min or 4 cm."

## Column structure
The table is printed as two identical blocks side by side. Each block has 5 columns. The CSV stacks them (left block first, then right block) with a table_half column.

Printed headers, verbatim, same for both blocks:
- d (cm)
- X_O2 (%)  (printed as X with subscript O2)
- V_g (cm/s)
- V_f x 10^3 (cm/s)   (printed "Vf×103" over "(cm/s)")
- ± (%)

CSV columns: d_cm, o2_pct, vg_cm_s, vf_x1e3, pm_pct, table_half, page, notes.
There is no sample ID column in Table S2 (unlike Table S1).

## Row count
46 data rows (23 left block, 23 right block). 37 have numbers and 9 are printed as "-".
Left block: d = 1.27 (10 rows), d = 0.64 (13 rows). Right block: d = 0.95 (10 rows), d = 0.32 (13 rows).

## Merged and staggered cells
- d is one merged cell per diameter group (spans 10 or 13 rows). It is repeated on every row in the CSV.
- X_O2 is usually one merged cell spanning the V_g = 25 row and the V_g = 2 row. It is repeated on both rows.
- Where the two flow rows have different O2 values, each row has its own O2 cell. Examples: 1.27 cm has 18.3 (25 cm/s) and 18.1 (2 cm/s); 0.64 cm has 18.2 (25) then 18.0 (2) twice, two separate cells each with a value.
- Some oxygen levels have only one flow row (for example 0.95 cm, 18.8 with only V_g = 2). Nothing is invented for the missing partner row.
- Assignment of merged O2 cells to rows was done by the vertical distance between the O2 text and each V_g row (merged cells sit halfway between the two rows). It was checked against the rendered image: all 46 rows match.

## Dash cells
"-" means no value was printed. Both V_f and the ± cells are "-" in all 9 cases. They are left empty in the CSV, with a note. They are not zeros.
Dash rows: 1.27 cm 18.3/25; 1.27 cm 18.1/2; 0.64 cm 18.2/25; 0.64 cm 17.8/2; 0.64 cm 17.5/2; 0.95 cm 18.5/25; 0.95 cm 18.1/2; 0.32 cm 17.7/25; 0.32 cm 17.0/2.
These probably mark cases where the flame did not spread (they sit at the lowest oxygen levels). The caption does not say this, so it is an inference.

## Units
Printed exactly: both blocks print "V_f x 10^3" over "(cm/s)". Unlike Table S1, there is no "(mm/s)" typo in Table S2. In Table S1 the right-hand block prints "(mm/s)" while the left prints "(cm/s)".

My belief: the column is V_f times 1000, with V_f in cm/s. So 7.81 means 0.00781 cm/s (about 0.078 mm/s). Evidence:
1. The header text says cm/s in both blocks, and it matches the Table S1 left-hand header, where "mm/s" on the right is a known typo.
2. S1 and S2 values are on the same scale at about 2 cm/s. For example 1.27 cm, 1 g: 9.07 (20.9%), 6.41 (20.0%), 3.99 (19.0%), 2.56 (18.5%); microgravity S1 values for 1.27 cm are about 2 to 7 at 17.5 to 20.7%. This fits the main text: 1 g is faster than microgravity at 21%, and microgravity is faster below about 19% (Fig. 8 discussion).
3. The values rise as the rod gets thinner (1.27 > 0.95 > 0.64 > 0.32 cm), as the main text says for Fig. 7, and rise with oxygen, as the text says.
4. The main text says no flame is sustained in 1 g at X_O2 below 18.5% for the 1.27 cm rod (Fig. 6b caption) and gives 18% as the 1 g limit. In the table the 1.27 cm rod has numbers down to 18.5% and dashes at 18.3 and 18.1. This fits.
Limit of the evidence: the main text file has no numeric Fig. 6b, 7 or 8 values, so the absolute scale (cm/s vs mm/s) is not confirmed against the figures. The check is by trend and by comparison with Table S1. The unit stays "believed cm/s".

## Unsure cells
None on reading the digits: every number came from embedded text and the layout was checked against the render. The only uncertainty is the meaning of the "-" cells and the absolute unit scale above.
Note on the V_g column: it prints only 25 and 2, as integers.
