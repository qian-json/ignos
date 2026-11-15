<!-- Written with AI assistance (Claude Code) -->
# What we would suggest NASA measure next

The Ignos team is independent. We are not affiliated with NASA, and NASA has not reviewed or endorsed this page. Each suggestion below comes from a place where our analysis of NASA's public data ran into a limit. For each one we give what we found, what new data would settle it, and the source. All numbers come from files in this repo, and every quote is checked against the source page.

This page says **what to measure**. Its companion, [`materials_to_test_first.md`](materials_to_test_first.md), says **which materials NASA's lunar-gravity data leave most open**. That page is not a safety ranking.

## 1. Measure the flow at the flame in lunar gravity

- **What we found.** On a NASA schematic (FM2 slides, PDF p. 17), we found the gravity at which a flame's own flow falls to the lowest flows where orbit tests on PMMA rods still measured spread, and compared the Moon with it. The result depends almost entirely on one exponent read from that schematic. With a cube-root scaling the Moon sits 3,540 to 103,000 times above that gravity. With a square-root scaling it sits 127 to 1,200 times above. Only "at least about 100 times above" holds under both. (`data/derived/envelope.json`, check `exponent-sensitivity`) This compares gravity levels only, through an exponent nobody has measured. Whether a flame on the Moon would die with the fans off has not been tested.
- **What NASA says.** ICES-2025-392 says the velocity induced by the simulated gravity "is not known" (p. 8). It also says the velocity at the flame tip "has not been verified or measured accurately" (p. 10).
- **What would help.** A measured gas velocity near the flame at one partial-gravity level would constrain the exponent. Paired measurements at two or more gravity levels would test it, provided they use the same material, geometry, oxygen and pressure. Today even the Earth reference is a 20 to 35 cm/s band, not one measured value. That could be done on FM2, which aims at the "First-ever observations and measurements of flame spread on the Moon" (FM2 slides, PDF p. 12), or in a centrifuge test, if the hardware allows it.

## 2. Burn the same material at an in-between gravity

- **What we found.** We fitted one flame-spread model to NASA's orbit data (Link et al. 2018 Table S1, 0 g) and Earth data (Table S2, 1 g) together.
  - Fitted to both ends, it reproduces held-out tests to a median 17.7%.
  - Trained on orbit alone, it misses Earth by a median 50%. Trained on Earth alone, it misses orbit by 326%.
  - Any gravity-scaling exponent fits the 0 g and 1 g data equally well. (`data/derived/flame_model.json`)
- **Why it matters.** The challenge brief says microgravity and normal-gravity results "could bound what occurs at intermediate gravity levels". Our model fits both of those ends and still cannot say how the flame's own flow changes in between. The brief also notes there is currently no partial-gravity combustion data in PSI.
- **What would settle it.** Black PMMA rods of the BASS-II sizes, burned at any one partial-gravity level with the same oxygen and flow settings. That makes the in-between behaviour testable instead of assumed.

## 3. Report the flow at which the flame goes out, not only the lowest flow with spread

- **What we found.** Table S1 still shows spread at its lowest flows: 0.48 cm/s for B12 and 0.41 cm/s for P17. These are the lowest flows with measured spread, not the flows at which the flame dies. So our threshold can only be an "at most".
- **What NASA says.** ICES-2025-392 notes that some materials may "experience quenching extinction rather than blow-off at lunar or Martian gravity levels" (p. 3).
- **What would settle it.** A slow flow ramp at fixed oxygen, down to extinction, logged with time stamps. That gives the low-flow (quenching) limit directly.

## 4. A matched-method lunar-gravity and WSTF test

- **What NASA found.** ICES-2025-392 reports that the lunar-gravity limit "was found to be less than the extrapolated value (for any assumed buoyant velocity) from the WSTF testing. This result is contrary to expected behavior" (p. 9). It lists method differences the authors considered: turbulence, ignition times, the delay after ignition before the test starts, and oxygen augmentation.
- **What we found.** In our Moon Gap analysis, the figure captioned P-213 shows the largest gap (the images printed as Figs. 7-9 may be shifted by one material; see 5). Its lunar limit sits 2.7 points of oxygen below the Earth trend (95% range 1.8 to 3.7). PMMA is too close to call (`web/src/data/moongap.json`).
- **What would settle it.** Repeat runs that change one of those method differences at a time, for example matching the ignition time between the two facilities. That would show which difference drives the anomaly.

## 5. Two small corrections that would help anyone reusing the data

- **ICES-2025-392 Figs. 7-9.** We fitted lines to the points in each figure. Fig. 7 (captioned PMMA) matches Table 2's P-213 row, and Fig. 8 (captioned P-213) matches its Beefy-T flaming row. Fig. 9 repeats Fig. 10 (smolder). The images may be shifted by one material. A corrected caption list would remove the doubt. Until then, we quote no per-material numbers from those figures without that caveat.
- **Link et al. 2018 Table S1.** The table prints V_f × 10³. The right half (the 0.64 cm rods, including B16 and B19) labels the unit "(mm/s)", while the left half says cm/s. Three checks say the right half is also cm/s: the edge slopes in Fig. S1, a separate research check, and our own measurement from NASA's raw photos. For B16 at 0.72 cm/s our tracker gives 0.0593 mm/s, against 0.0568 if the label is cm/s and 0.00568 if it is mm/s. A one-line erratum would settle it (`proof/src/contracts.ts`, `tableS1RateMmS`).

## 6. Publish BASS-II step times and logged conditions in machine-readable form

- **What we found.** We re-measured spread rates from NASA's BASS-II photos. At low flow our tracker matches Table S1 to a median 6.8% over 8 segments from 4 tests (`docs/METHOD.md`). To get there, we had to read each flow step's window from the test video's on-screen FAN/AIR overlay.
- **What NASA's authors say.** Link et al. 2018 note that the points "were not systematically taken". They also say it was difficult to determine how accurate the oxygen and flow values were.
- **What would help.** For every test: step start and stop times, logged flow and oxygen, and photo capture times, in a table. Any group could then re-measure every BASS-II test, not just the ones whose windows can be read off the video.

## 7. Fans-off at lunar gravity, at the planned Moon-base atmosphere

- **The gap.** The orbit and Earth data we use (Link et al. 2018) go no higher than 20.9% oxygen, and the lunar-gravity limits in ICES-2025-392 run from 11.0% to 24.0%. The challenge brief puts Moon-base air at "30% or greater" oxygen at "10.2 psi or less". FM2's slides say its hardware "does not support ignition approaches used at WSTF or in Centrifuge. (flow change, oxygen change)" (PDF p. 14).
- **What would help.** A partial-gravity facility with adjustable forced flow, so that turning the airflow down can be tested at lunar gravity, at 30% oxygen or more.

## Limits of this page

- These are suggestions from a student team's analysis, not findings of NASA.
- Every Moon statement is about gravity levels and oxygen limits. We state no airflow for the Moon, because NASA reports the lunar buoyant velocity as not known.
- The flame model and the envelope are our models, not NASA measurements. Their caveats are in `data/derived/flame_model.json` and `data/derived/envelope.json`.
