<!-- Written with AI assistance (Claude Code) -->
# Pre-registration: tracker v2 ("fused" edge), committed before any held-out result exists

Written 2026-11-14 22:38 UTC. At this time there are no tracker results for tests B13b or B10 (their scratch output folders do not exist yet). The git commit timestamp of this file is the proof.

## Why
The frozen v1 method finds the flame edge on mean brightness. The blue-channel diagnostic (`pipeline/diagnostics/blue_edge.py`, METHOD.md "Diagnostic") showed that on B12 and P17 a bright sooty core hides the blue leading edge at about 1 cm/s. That diagnostic was run on B16, B19, B12 and P17, so those four tests are **in-sample** for any rule inspired by it and cannot validate it.

## The v2 rule (fixed now; no tuning after held-out results)
For every frame, compute two edges with the unchanged v1 machinery (`track_frame`: relative threshold 0.3 x the channel's 99.9th percentile, opening, largest component in the rod band, 90th-percentile front over rows, area gate `min_area_frame`):
1. `edge_lum`: on mean luminance (v1).
2. `edge_blue`: on the blue channel alone.

**Fused edge = the front-most of the two** in the spread direction. If one is missing, use the other; if both are missing, there is no edge. Everything else stays as in v1: windows, scale, the 25-90% fit rule, Student-t CI, threshold sensitivity and the LOW CONFIDENCE rule.

## Held-out tests
B13b and B10, plus any test added later that was not used to design v2. B16, B19, B12 and P17 are reported for v2 too, but labelled in-sample.

## Success criteria (decided now)
On held-out tests, compared with v1 on the same steps:
- **Primary:** the median |error| over ALL steps that have a rate improves (gets smaller).
- **Guardrail:** for steps below 1 cm/s, the median |error| gets worse by no more than 2 percentage points.
- **Adoption:** v2 replaces v1 for the final CSV only if both hold. Either way, both versions' held-out numbers are published in METHOD.md, including a failure.

## What will not change after held-out results arrive
The fusion rule, the 0.3 threshold, the area gate, the band, the fit rule and these criteria.

## Amendment 1 (committed before any held-out result exists)
**Problem found in review:** the held-out tests B13b and B10 have no steps below 1 cm/s, and neither does any remaining Table S1 sample. Every low-flow step in Table S1 belongs to B16, B19, B12 or P17, which are in-sample. So the low-flow guardrail above could never fail on held-out data, and no fair held-out test of v2 on low-flow steps exists.

**Changed rule (stricter, not looser):**
- **Low-flow steps (below 1 cm/s) stay on v1 permanently.** The 6.8% headline is a v1 result and is never replaced by v2 numbers. v2's in-sample low-flow numbers may be shown only as a labelled in-sample sensitivity check.
- **v2 may replace v1 only for steps at or above 1 cm/s,** and only if the primary criterion holds on held-out steps: the median |error| over held-out steps with a rate is smaller under v2 than under v1.
- Steps at or above 1 cm/s stay out of the validated headline either way. If v2 is adopted for them, they're reported as "v2, held-out-tested" with their own numbers.
- In-sample v2 numbers (recorded now, before held-out): all steps median |error| 10.3% vs v1 14.8%; low-flow 4.0% vs v1 7.1% (`docs/research/v2_eval_insample.json`). These don't count toward adoption.

## Correction to Amendment 1's timing (written before reading any held-out result)
The heading above says Amendment 1 was committed before any held-out result existed. That is not exactly true. A check run one second before the commit (22:42:30 UTC) showed that the B13b agent had just written `scratch_B13b/data/derived/spread_rates.csv`. The main session had not opened or read that file when the amendment was written or committed. B10 had no results. The amendment only makes the rule stricter (no v2 numbers for low-flow steps), so it can't have been tuned toward B13b's results. We record this rather than hide it.

## Interim held-out result (2026-11-14 ~23:05 UTC); decision deferred, rule unchanged
- B10 had to be dropped: NASA's archive has no video for it, so its steps can't be windowed. The only held-out test is **B13b**.
- Step 1.64 cm/s: v1 +5.8%, v2 +5.4%. Step 1.54 cm/s: no usable frames under either version, because of the frozen area gate. Held-out median |error| over steps with a rate: **v1 5.8%, v2 5.4% (n = 1)**.
- The primary criterion is formally met, but it rests on a single step with a 0.4-point difference, far inside the step's 95% CI (+/-0.0017 mm/s, about 2.3%). That is not evidence that v2 is better. **v2 is NOT adopted yet.** The decision waits for at least one more held-out test (C25 is being prepared), with the criteria above unchanged. If no further held-out test can be measured before the Gate 3 freeze (Sun 10 AM), v1 stays for all steps and this interim result is published as is.
- Update: C25 was dropped before any measurement (its flow steps can't be read from the video overlay), so no v2 numbers exist for it. One more held-out attempt (B13a, else B5) is running under the same rule.

## Final held-out result and decision (2026-11-15, before the Gate 3 freeze): v2 is NOT adopted
Two held-out tests could be measured, B13b and B13a (the same 12.7 mm rod, burned twice on one day; every step is at or above 1 cm/s). B10 and C25 were dropped before any measurement, as recorded above. Numbers: `docs/research/v2_eval_heldout.json`.

| Held-out step | v1 (frozen) | v2 (fused) |
|---|---|---|
| B13b, 1.64 cm/s | +5.8% (n = 18) | +5.4% (n = 18) |
| B13b, 1.54 cm/s | no usable rate | no usable rate |
| B13a, 1.64 cm/s | fitted slope -0.0127 mm/s (-124.3%) | fitted slope -0.0113 mm/s (-121.6%) |
| B13a, 1.54 cm/s | +8.7% (n = 6) | +11.0% (n = 7) |
| B13a, 1.43 cm/s | no usable rate | no usable rate |
| B13a, 1.38 cm/s | no usable rate | no usable rate |

- **Primary criterion:** median |error| over held-out steps with a rate is **8.7% for v1 and 11.0% for v2 (n = 3)**. v2 is not smaller, so the criterion fails.
- **Decision: v1 stays for every step. No reported rate uses v2.** The 6.8% headline was always v1 and doesn't change.
- **Same decision either way the negative step is counted.** After seeing this result we added a rule to `run.py`: a fitted slope of zero or less is not physical for a spreading flame, so that row is written as unusable, with the fitted value kept in its note. That rule came after the held-out numbers, so we check that it can't have changed the outcome: leaving the B13a 1.64 cm/s step out, the medians are 7.3% for v1 and 8.2% for v2 (n = 2). v2 still isn't smaller.
- **What this does and doesn't show.** Three steps from two burns of one rod is very little data. The result doesn't show that v2 is worse in general. It shows that v2 didn't earn its place under the rule we fixed in advance, and that neither version rescues these steps: 4 of the 6 held-out steps have no usable rate under either.
- **Where the blue-light edge is still used:** only as a dashed "diagnostic" line in the overlay videos, and in the diagnostic section of METHOD.md. It's never the measurement.
