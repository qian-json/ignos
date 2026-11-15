<!-- Written with AI assistance (Claude Code) -->
# Cross-check with Flame Tracker on B19 (PSI P19)

**Result:** on B19's two low-flow steps, Flame Tracker's own luma tracking gives **0.0606 and 0.0535 mm/s**. Our tracker gives 0.0617 and 0.0529, and Table S1 gives 0.0625 and 0.0544. That is only true for the linear 8-bit export. With the gamma export we declared first, Flame Tracker locked onto fixed bright parts of the scene and gave no usable rate. Both runs are reported below.

## What was run
- **Tool:** Flame Tracker (Carmignani, SoftwareX 15:100791, 2021), GPL-3.0, cloned at commit `b7c37d7` (2026-09-22) into `space-apps-2026/tools/flameTracker`. It is not vendored into this repo.
- **Headless run:** Flame Tracker is a PyQt6 GUI. `space-apps-2026/tools/ft_crosscheck.py` imports its `scripts/lumaTracking.py` without changes. It replaces the GUI widgets and the two GUI modules it imports (`flameTracker`, `boxesGUI_OS`) with stand-ins and calls its `getFilteredFrame` / `findFlameEdges` on each frame. The tracking itself is Flame Tracker's code, not a re-implementation: Y channel of YCrCb > threshold, 8-connected components smaller than the minimum area removed, leading edge = mean x of the 5 outermost flame pixels.
- **Settings:** Flame Tracker's GUI defaults from `boxesGUI_OS.py`: luma threshold 30 (0-255), minimum particle area 10 px, 5 points averaged for the edge, moving average +/-2, direction "Left to right". The ROI is the whole cache band (0, 0, 1080, 310). Nothing was tuned to any rate.
- **Frames:** all 70 P19 photos in 1942.5-2351.5 s, taken from `p19_cache_band.npz` (1/4 resolution, linear light, exposure-normalized). Each frame was divided by its own 99.9th-percentile luminance, clipped to 1 and written as 8-bit BGR PNG. Two encodings:
  - **gamma** (declared as primary before any run): then raised to the power 1/2.2, roughly what a camera JPEG looks like;
  - **linear:** no gamma.
- **Time and scale:** EXIF time of each photo, in seconds since the first photo. Flame Tracker itself assumes a constant fps for image sequences, but the P19 photos are spaced irregularly (1.3-10 s), so the nominal-fps result is listed only as a check. Scale: our rod measurement of 34.83 px/mm at full resolution, which is 8.7075 px/mm in the 1/4-resolution cache.
- **Rate:** fitted on 25-90% of each video-overlay window, the same frozen rule our tracker uses. Flame Tracker has no single-line fit over a window: it outputs a moving-average rate (a local `np.polyfit` over 5 points). So we report (a) one `np.polyfit` line through its edge positions in the fit window, with a 95% t-interval, and (b) the median and mean of its own moving-average rates in that window.

## Numbers (mm/s)

| Step | n | Flame Tracker, linear: polyfit | FT moving-avg median / mean | FT nominal fps | FT, gamma: polyfit | Ours | Table S1 |
|---|---|---|---|---|---|---|---|
| 0.83 cm/s, 1942.5-2113.5 s | 19 | **0.0606 +/- 0.0025** | 0.0624 / 0.0601 | 0.0602 | 0.0820 +/- 0.0661 (failed) | 0.0617 +/- 0.0027 | 0.0625 |
| 0.72 cm/s, 2113.5-2351.5 s | 24 | **0.0535 +/- 0.0020** | 0.0535 / 0.0526 | 0.0596 | 0.0704 +/- 0.0530 (failed) | 0.0529 +/- 0.0019 | 0.0544 |

The linear Flame Tracker run differs from ours by -1.8% and +1.1%, and from Table S1 by -3.0% and -1.7%. Our and Flame Tracker's 95% intervals overlap on both steps. Frame by frame, Flame Tracker's edge and ours correlate at r = 0.996 and 0.993 in the two fit windows. Their difference stays constant to within 0.19 mm and 0.29 mm (SD). Its mean value, about 40 mm, is only the different zero point: ours is measured from the first burn frame, Flame Tracker's from the image column.

## Why the gamma run failed (decided from the track, not from rates)
With the gamma encoding, the faint background and the rod's specular streak upstream of the flame both pass Y > 30. The streak touches the flame. Flame Tracker's edge is the mean of the 5 outermost pixels of all kept regions, so it locked onto fixed columns: about 800 px (the end of the rod streak) and about 862 px (a vertical wire or holder feature). It ignored the moving front, which went from 505 to 699 px in the linear run. We judged the run failed because the edge stayed on fixed columns and the interval was about 80% of the slope, not by looking at any rate. It would need an ROI or threshold chosen to exclude those features. We didn't do that, to avoid tuning.

## How the two tools differ
| | Ignos tracker | Flame Tracker (luma) |
|---|---|---|
| Threshold | relative: 0.3 x the frame's 99.9th percentile of linear mean RGB | absolute Y > 30 on the 8-bit image (here, after a per-frame stretch: 0.12 x the frame's 99.9th percentile in linear) |
| Noise removal | morphological opening, then the largest component inside a band around the rod axis | drop components < 10 px, keep all the rest |
| Edge | 90th percentile over rows of each row's front-most pixel | mean x of the 5 outermost flame pixels |
| Rate | one least-squares line over 25-90% of the step, with Student-t CI | moving-average local slope (5 points), time = frame / fps |

The two edge rules respond differently to thin bright features attached to the flame. That is why Flame Tracker needs a clean image (or an ROI that excludes the rod streak) and ours doesn't.

## Limitations
- One test (B19), two steps, and one tool configuration. It shows agreement on these steps, not on the high-flow steps or the other tests.
- The export (per-frame stretch, linear vs gamma) is our choice and changes the outcome. A Flame Tracker user would load camera JPEGs or video instead, and could choose an ROI. The working run uses linear encoding, chosen after the declared gamma run failed. That choice was based on the failure, not on any rate, but it was still made after a first try.
- Both tools use our px/mm scale, our step windows and our fit rule, so this checks the edge detection only. Scale, windowing and the fit rule are not checked.
- The Flame Tracker code was run headlessly through stand-ins. Its GUI preprocessing (rotation, perspective, brightness/contrast, crop) was not used. All of these are off or zero by default except the crop, which is our full-band ROI.

## Reproduce
```
python -I space-apps-2026/tools/ft_crosscheck.py export --stretch linear
python -I space-apps-2026/tools/ft_crosscheck.py track  --stretch linear --roi 0,0,1080,310
python -I space-apps-2026/tools/ft_crosscheck.py fit    --stretch linear
```
(same with `--stretch gamma`). Outputs: `space-apps-2026/data/derived/ft_crosscheck_p19/` (frames, `ft_track_*.json`, `ft_rates_*.json`).

## Source
Carmignani, L. (2021). Flame Tracker: An image analysis program to measure flame characteristics. SoftwareX 15:100791, doi 10.1016/j.softx.2021.100791. Code: github.com/combustionTools/flameTracker (GPL-3.0).
