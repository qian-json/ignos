<!-- Written with AI assistance (Claude Code) -->
# Ignos

NASA Space Apps 2026, challenge "Flame in Freefall". Team Mare Serenetatis.

NASA's space-station fire archive (PSI-25, BASS-II) has raw photos of flames burning on plastic rods. It has no column for how fast each flame spread. We measured that speed from the raw photos with our own tracker. We checked it against the rates published by Link et al. (2018). We then put the result in a dashboard with a Measure panel, a Moon Gap panel, an Ask panel and an investigations table. Every number on the site shows the file, row and column it came from, or its paper and page. The Ask panel's answers are checked number by number against those files.

**Live site:** https://still-air.vercel.app (health check at `/api/health`)

## What is in the repo

| Path | What |
| --- | --- |
| `pipeline/` | Python flame-edge tracker. Method in `pipeline/METHOD.md`, pre-registration in `pipeline/PREREGISTRATION.md`, run record in `pipeline/MANIFEST.json`. |
| `data/reference/` | Published tables, taken as printed (Link 2018 Table S1, digitized ICES 2025 figures, seed facts). |
| `data/derived/` | Tracker output: `spread_rates.csv` and `edges/<test>.csv`. |
| `web/` | Vite + React site (Measure, Moon Gap, Ask, investigations). |
| `proof/` | Proof layer (`@still-air/proof`). Builds an index of facts and checks every number in an answer against it. |
| `api/` | Vercel functions: `/api/health` and `/api/ask`. |
| `scripts/` | Build and validation steps. |
| `docs/` | Data contracts (`DATA_CONTRACTS.md`), source papers, research notes, figures. |

## Results

| Question | Answer |
| --- | --- |
| Headline accuracy (low flow, below 1 cm/s) | 8 segments from 4 tests. Median error 6.8% against Link et al. Table S1. All 8 within 15%. 6 of 8 within 10%. Mean signed error +1.1%. |
| How sure is that median? | 95% interval about 2 to 13% (bootstrap over whole tests, 20,000 resamples). With only 8 segments it is not tight. |
| Independent tool check | The open-source Flame Tracker (Carmignani 2021), unmodified edge code, on B19's two low-flow steps: 0.0606 and 0.0535 mm/s. Ours: 0.0617 and 0.0529. Table S1: 0.0625 and 0.0544. Edges correlate at r = 0.996 and 0.993. |
| Tests measured | 6: B16, B19, B12, P17, B13b, B13a. The 4 that feed the headline are B16, B19, B12 and P17. |
| Plain limits | Steps at or above 1 cm/s are unreliable; most are flagged LOW CONFIDENCE in the CSV. B13b and B13a give only 2 usable rates, both above 1 cm/s, so neither is in the headline. Flame Tracker was checked on one test, and only its edge detection (scale, windows and fit rule are ours). Link's data "were not systematically taken". Only the low-flow headline is a validation claim. Flow labels below 1 cm/s are approximate, and O2 labels are pre-burn values (O2 fell 0.3 to 1.6 points per burn). Our rates don't depend on these labels. |

Rates use a brightness edge. A fused blue plus brightness edge (v2) was tested under a rule fixed in advance. It was not adopted (see Pre-registration).

## Reproduce every tracker number

You need Python 3.11 or newer, about 10 GB of disk for the NASA photo zips (CC0, no login), and ffmpeg on the PATH for the overlay videos. Run these from `pipeline/`:

```sh
pip install -r requirements.txt
python -m stillair_tracker.fetch --delete-zips
python -m stillair_tracker.run_all --repo .. --overlays --date 2026-11-15
```

- `fetch` downloads, size-checks and extracts the photos and test videos every config lists. It skips anything already there.
- `run_all` builds the frame caches, runs every `configs/*.json`, writes the CSVs, overlays and figure, and writes `MANIFEST.json` (sha256 of every output and config, code commit, library versions).
- To check the committed numbers without changing the repo:

```sh
python -m stillair_tracker.run_all --repo .. --check
```

  `--check` re-runs every config into a temporary folder and compares `spread_rates.csv` and every `edges/*.csv` with the committed files, cell by cell. It exits with code 1 on any difference. It writes nothing in the repo. It proves the committed CSVs are what this code produces from the NASA photos. It does not prove the method is right. The comparison with Table S1 is for that.
- Tracker tests (synthetic data, no network): `python -m pytest -q tests` from `pipeline/`.

## Run the site and the tests

Node 24 (`engines` in `package.json`).

```sh
npm install        # all workspaces
npm run dev        # web dev server
npm run build      # build-info, proof, envelope, facts, ask index, eval summary, api typecheck, web, no-mock check
npm test           # same build steps, then vitest (proof/, api/, scripts/)
npm run validate -- <file>   # check a data file against its contract in docs/DATA_CONTRACTS.md
```

The Ask panel needs `GEMINI_API_KEY` as an environment variable. Without it, production returns `503 not_configured`. Keys are never stored in the repo. Copy `.env.example` to `.env.local` for local work.

## Data sources

| Data | Source | Licence |
| --- | --- | --- |
| BASS-II raw photos, test videos and test table (tests P12, P13a, P13b, P16, P17, P19) | NASA PSI-25 archive, DOI 10.60555/4qc4-de67 | CC0 |
| Reference spread rates | Link et al. (2018), Sci Rep 8:120, Supplement Table S1 (p. 1) | Paper text is CC BY 4.0 (stated in `docs/sources/`) |
| Lunar-gravity flammability limits | Urban, Olson, Dietrich et al., ICES-2025-392, "Solid Fuel Ignition Testing for Lunar Applications, Theory and Experimental Results" (Figs. 7 to 12, Table 2), digitized by us | Published paper. We digitized points only. |
| Material flammability slides | Ferkul et al., LPSC 2026 | Published slides |

Table S1 prints Vf x 10^3. Its right block says "(mm/s)" but the values are cm/s (checked against Fig. S1), so mm/s = printed value / 100.

## Pre-registration

`pipeline/PREREGISTRATION.md` was written on 2026-11-14 before any held-out result existed. It fixed a rule for a fused-edge tracker (v2). Low-flow steps stay on the original method for good. v2 could replace it for steps at or above 1 cm/s only if its median error was smaller on held-out tests.

Result: on the 3 held-out steps with a rate (from B13b and B13a), median error was 8.7% for v1 and 11.0% for v2. v2 did not win, so it was not adopted. No reported rate uses v2. Three steps is too little to say v2 is worse in general. Two other planned held-out tests (B10, C25) were dropped before any measurement. The file also records one timing slip in an amendment. Numbers: `docs/research/v2_eval_heldout.json`.

## Use of AI

- The project framing and the flame-model idea came from conversations with Claude. Ask's answers come from Google Gemini (gemini-3.5-flash-lite, fallback gemini-3.1-flash-lite). Claude Code helped write code. The figure digitizing, the Moon Gap analysis and the flame tracker are the team's own work.
- AI-assisted files carry the header "Written with AI assistance (Claude Code)".
- The Ask panel's answers come through `/api/ask`. Every number in an answer is checked by the proof layer against the data files. A number that does not match is not shown as verified. A speed in a sentence about the Moon is never verified.
- WebPlotDigitizer was used to digitize figure points from ICES 2025-392.

## References

- Link, S. et al. (2018). The effect of gravity on flame spread over PMMA cylinders. Scientific Reports 8:120. Supplement Table S1 (p. 1), Fig. S1 (p. 2).
- NASA PSI-25 BASS-II archive, DOI 10.60555/4qc4-de67.
- Urban, Olson, Dietrich et al. (2025). Solid Fuel Ignition Testing for Lunar Applications, Theory and Experimental Results. ICES-2025-392.
- Ferkul et al. (2026). Material Flammability at Lunar and Martian Gravity, LPSC 2026.
- Carmignani, L. (2021). Flame Tracker. SoftwareX 15:100791, doi 10.1016/j.softx.2021.100791.
- Bhattacharjee, S. et al. (2017). Fire Safety Journal, doi 10.1016/j.firesaf.2017.03.039 (error formula, read via Carmignani 2019).
- Giassi, D. et al. NTRS 20160012298 (DSLR blue channel and CH* emission).

## Sources for the numbers

| Number | File |
| --- | --- |
| 8 segments, 4 tests, per-segment errors, 6 tests measured | `data/derived/spread_rates.csv`, `pipeline/METHOD.md` (Validation) |
| Median 6.8%, within 15%, 6 of 8 within 10%, mean +1.1% | `pipeline/METHOD.md` (Validation headline) |
| Interval about 2 to 13%, 20,000 resamples | `pipeline/METHOD.md` (How certain that is) |
| Flame Tracker values, r = 0.996 and 0.993 | `docs/research/flametracker_crosscheck.md` |
| v1 8.7% vs v2 11.0%, n = 3, date, dropped tests | `pipeline/PREREGISTRATION.md`, `docs/research/v2_eval_heldout.json` |
| About 10 GB download, commands, `--check` behaviour, Python 3.11 | `pipeline/README.md` |
| Node 24, npm scripts | `package.json` |
| DOI and licence of NASA data, Table S1 page | `pipeline/METHOD.md` (Sources) |

Test counts are left out on purpose. Run `npm test` and `python -m pytest -q tests` for the current counts.

## Credits

Built by Mare Serenetatis for NASA Space Apps 2026 (Flame in Freefall challenge). Written with AI assistance (Claude Code).

## License

- Our code and our derived data (`data/derived/`) are released under the MIT License. See `LICENSE`.
- NASA PSI-25 BASS-II data (DOI 10.60555/4qc4-de67) is CC0. Other NASA material follows NASA's media and data terms.
- Link et al. (2018), Scientific Reports 8:120, and its supplement are CC BY 4.0. Table S1 values in `data/reference/` come from that supplement, credited above.
- The ICES-2025-392 paper is not included in this repo. Only our digitized figure points are. Read the paper at NTRS record 20250002114: https://ntrs.nasa.gov/citations/20250002114
- Flame Tracker (GPL-3.0) was used only from a separate clone for a cross-check. It is not included here.
