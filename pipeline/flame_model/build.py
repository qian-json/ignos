# Written with AI assistance (Claude Code)
"""Fits the flame model, validates it, and writes data/derived/flame_model.json (contract flame_model/1)
and docs/research/flame_model.md.

  python3 -I pipeline/flame_model/build.py <repo root> [--bootstrap 300]

Validation only (team decision, 2026-11-15): the file holds the fit, its held-out
errors, the failed cross-gravity tests and the fitted 1 g flame flow. It makes NO prediction at the
Moon or any gravity between 0 g and 1 g: the training data sit only at 0 g and 1 g, so how flow
changes with gravity (the exponent) is not identified by the data, and every exponent fits the same.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model import PARAMS, TABLE_S1, TABLE_S2, UNITS, fit, load_rows, predict, score, sha256  # noqa: E402

LABEL = "model, not a NASA measurement"
OUT = "data/derived/flame_model.json"
REPORT = "docs/research/flame_model.md"
SPREAD = "data/derived/spread_rates.csv"
SPREAD_TEST_TO_GROUP = {"B16": "B16", "B19": "B19", "B12": "B12", "P17": "P17"}


def sig(x, n=4):
    return None if x is None or not np.isfinite(x) else float(f"{x:.{n}g}")


def ci(values):
    v = np.asarray([x for x in values if x is not None and np.isfinite(x)], dtype=float)
    return [sig(np.percentile(v, 2.5)), sig(np.percentile(v, 97.5))] if v.size else [None, None]


def main(root: Path, n_boot: int):
    rows = load_rows(root)
    orbit = [r for r in rows if r.domain == "orbit"]
    earth = [r for r in rows if r.domain == "earth"]
    p = fit(rows, seeds=16).x
    burns = sum(r.rate_mm_s is not None for r in rows)

    fit_all = {"all": score(p, rows), "orbit": score(p, orbit), "earth": score(p, earth)}

    # Leave one group out, refits from random starts only (nothing from the all-data fit).
    groups = sorted({r.group for r in rows})
    errs, ok, missed, held_params = [], 0, 0, {}
    for gname in groups:
        train = [r for r in rows if r.group != gname]
        test = [r for r in rows if r.group == gname]
        pg = fit(train, seeds=12).x
        held_params[gname] = pg
        for r in test:
            pr = float(predict(pg, r.d_cm, r.o2_pct, r.fan_cm_s, r.g_earth)[0])
            ok += (pr > 0) == (r.rate_mm_s is not None)
            if r.rate_mm_s is not None:
                if pr > 0:
                    errs.append(abs(pr - r.rate_mm_s) / r.rate_mm_s * 100)
                else:
                    missed += 1
    n_orbit_groups = len({r.group for r in orbit})
    logo = {
        "groups": len(groups), "orbit_tests": n_orbit_groups, "earth_blocks": len(groups) - n_orbit_groups,
        "median_abs_error_pct": sig(float(np.median(errs))), "rows_with_rate_scored": len(errs),
        "rate_rows_predicted_no_flame": missed, "burn_correct": ok, "rows": len(rows),
        "always_burns_baseline_correct": burns,
        "how": f"each of {n_orbit_groups} orbit tests (Table S1) and each of {len(groups) - n_orbit_groups} Earth rod-diameter blocks (Table S2, not individual tests) hidden in turn; the model is refitted without it from random starts and predicts it. The median is over the {len(errs)} rows where both NASA and the model have a flame; {missed} rows with a NASA rate were predicted as no flame. Burn / no-burn equals the always-burns baseline, so it shows no skill.",
    }

    p_orbit = fit(orbit, seeds=16).x
    p_earth = fit(earth, seeds=16).x
    cross = {
        "orbit_only_to_earth": {**score(p_orbit, earth), "passed": False, "note": "Trained on orbit rows only, it cannot learn Earth's gravity-driven flow. It fails, so the model makes no claim across gravity."},
        "earth_only_to_orbit": {**score(p_earth, orbit), "passed": False, "note": "Trained on Earth rows only (two flow speeds), it cannot learn the low-flow behaviour of orbit."},
    }
    for s in cross.values():
        s["passed"] = bool(s["median_abs_error_pct"] is not None and s["median_abs_error_pct"] < 25 and s["burn_correct"] >= 0.9 * s["rows"])

    # Bootstrap for parameter intervals: resample whole groups, orbit and Earth separately.
    rng = np.random.default_rng(2026)
    og = sorted({r.group for r in orbit}); eg = sorted({r.group for r in earth})
    by_group = {g: [r for r in rows if r.group == g] for g in groups}
    boots = np.array([fit([r for g in list(rng.choice(og, len(og))) + list(rng.choice(eg, len(eg))) for r in by_group[g]], seeds=2, start=p, rng_seed=b + 1).x
                      for b in range(n_boot)])
    suffix = {"%": "_pct", "cm/s": "_cm_s"}
    parameters = {name: {f"value{suffix.get(UNITS[name], '')}": sig(p[i]), f"ci95{suffix.get(UNITS[name], '')}": ci(boots[:, i]), "unit": UNITS[name]}
                  for i, name in enumerate(PARAMS)}
    parameters["earth_wind"]["meaning"] = "the flow that makes orbit and Earth rates match in this model (an effective fit parameter, not a measured buoyant velocity); the interval covers the fit only. Published estimates of the buoyant flow at 1 g run 20 to 35 cm/s. The data cannot say how it changes with gravity."

    # Remeasurement cross-check: our tracker re-measured the same burns whose NASA rates are in Table S1.
    # For each step, use the fit with that test's Table S1 rows held out, so its own NASA rates are not in it.
    cross_rows = []
    with open(root / SPREAD, newline="") as f:
        for i, r in enumerate(csv.DictReader(line for line in f if not line.startswith("#"))):
            if not r["rate_mm_s"] or float(r["flow_cm_s"]) >= 1 or "LOW CONFIDENCE" in r["notes"].upper():
                continue
            g = SPREAD_TEST_TO_GROUP.get(r["test_id"])
            pg = held_params.get(g, p) if g else p
            pr = float(predict(pg, float(r["rod_d_mm"]) / 10, float(r["o2_pct"]), float(r["flow_cm_s"]), 0.0)[0])
            meas = float(r["rate_mm_s"])
            cross_rows.append({"test_id": r["test_id"], "flow_cm_s": float(r["flow_cm_s"]), "ours_mm_s": meas, "model_mm_s": sig(pr),
                               "pct_difference": sig((pr - meas) / meas * 100), "test_held_out_of_fit": g in held_params, "row": i})
    typical = logo["median_abs_error_pct"]
    remeasure = {
        "steps": len(cross_rows),
        "median_abs_difference_pct": sig(float(np.median([abs(x["pct_difference"]) for x in cross_rows]))) if cross_rows else None,
        "within_typical_error": sum(abs(x["pct_difference"]) <= typical for x in cross_rows), "typical_error_pct": typical, "rows": cross_rows,
        "note": "Not an independent test: our tracker re-measured the same burns (B16, B19, B12, P17) whose NASA rates are in the training table. For each step the model is refitted with that test's NASA rows held out.",
    }

    files = {TABLE_S1: sha256(root / TABLE_S1), TABLE_S2: sha256(root / TABLE_S2), SPREAD: sha256(root / SPREAD)}
    doc = {
        "contract": "flame_model/1",
        "_note": "Written with AI assistance (Claude Code). Generated by pipeline/flame_model/build.py; never edit by hand. The idea for this model came from a Claude chat.",
        "label": LABEL,
        "scope": "Black PMMA rods only, flame spreading against the flow, at 0 g (orbit) and 1 g (Earth) only (Link et al. 2018 Tables S1 and S2). No prediction at the Moon or any gravity in between.",
        "model": {
            "equations": ["at 0 g: u = fan; at 1 g: u = hypot(fan, earth_wind)", "amp = k * max(O2 - o2_zero, 0) * d^(-d_power)",
                          "rate = amp * max(1 - quench_wind / u, 0) * max(1 - u / (blowoff_at_18 * exp(blowoff_o2_slope * (O2 - 18))), 0)"],
            "gravity_note": "Trained only at 0 g and 1 g, so how the flame's own flow changes with gravity is not identified: any gravity-scaling exponent fits these data identically (team review). The model is therefore not used between 0 g and 1 g.",
            "fit": "robust least squares (soft L1), multi-start, all 7 parameters",
            "parameters": parameters,
        },
        "validation": {"fit_all": fit_all, "leave_one_group_out": logo, "cross_domain": cross,
                       "bootstrap": {"resamples": n_boot, "how": "resample whole groups with replacement, orbit tests and Earth blocks separately, and refit; intervals cover parameter uncertainty only"},
                       "remeasurement_cross_check": remeasure},
        "caveats": [
            "A model, not a NASA measurement, fitted to NASA's published rates at 0 g and 1 g only. It makes no prediction at the Moon or any gravity in between.",
            "Trained on orbit only, it fails to predict Earth, and the reverse also fails (validation.cross_domain).",
            f"Burn / no-burn on held-out tests ({logo['burn_correct']} of {logo['rows']}) equals an always-burns baseline ({burns} of {len(rows)}); it shows no skill.",
            "The remeasurement cross-check is not independent: our tracker re-measured the same burns whose NASA rates the model trains on.",
            "At 0 g with no flow the model has no flame at any oxygen (no diffusion-only flame); NASA's ACME BRE runs (PSI-20) burned in still microgravity air at about 26% O2 and above.",
            "Black PMMA rods only. Oxygen above 20.9% is outside the training range.",
            "Table S1's sub-1 cm/s flow labels are approximate: NASA's on-screen air sensor (whole cm/s) reads 0 in most low-flow steps and 2 at the 0.82 cm/s steps, so it cannot confirm them, and NASA's fan calibrations do not reproduce them (team check, docs/research/accuracy/air_display/README.md). The fitted low-flow terms (quench_wind) inherit that uncertainty.",
            "Orbit O2 values are Table S1's labels, which equal NASA's pre-burn (initial) readings; O2 fell during each burn, so late low-flow steps ran somewhat below their label. The labels are kept as the working convention (a team check found in-burn estimates fit worse).",
        ],
        "derived_from": [{"file": k, "sha256": v} for k, v in files.items()],
    }
    (root / OUT).write_text(json.dumps(doc, indent=1) + "\n")

    ew = parameters["earth_wind"]
    fa = fit_all["all"]
    lines = [
        "<!-- Written with AI assistance (Claude Code) -->",
        "# Flame model (validation only; a model, not a NASA measurement)",
        "",
        f"Generated by `pipeline/flame_model/build.py` into `{OUT}`. Black PMMA rods, 0 g and 1 g only. The idea came from a Claude chat; the team decided to show it only as a validation result, with no Moon or partial-gravity predictions.",
        "",
        "## Validation",
        f"- Fit to all {fa['rows']} rows: median error {sig(fa['median_abs_error_pct'], 3)}% over {fa['rows_with_rate_scored']} rows where both have a flame ({fa['rate_rows_predicted_no_flame']} NASA-rate rows predicted as no flame); burn / no-burn {fa['burn_correct']} of {fa['rows']}.",
        f"- Each of {logo['orbit_tests']} orbit tests and {logo['earth_blocks']} Earth rod-diameter blocks hidden in turn: median error **{logo['median_abs_error_pct']}%** over {logo['rows_with_rate_scored']} rows ({logo['rate_rows_predicted_no_flame']} predicted as no flame); burn / no-burn {logo['burn_correct']} of {logo['rows']}, the same as always saying \"burns\" ({burns} of {len(rows)}): no skill there.",
        f"- Orbit only -> Earth: median error {sig(cross['orbit_only_to_earth']['median_abs_error_pct'], 3)}% (fails). Earth only -> orbit: {sig(cross['earth_only_to_orbit']['median_abs_error_pct'], 3)}% (fails). The model needs both ends and is not used in between.",
        f"- Remeasurement cross-check (not independent; each test's NASA rows held out): our tracker's {remeasure['steps']} validated low-flow steps differ from the model by a median {remeasure['median_abs_difference_pct']}%; {remeasure['within_typical_error']} within the typical held-out error.",
        f"- Fitted earth_wind: {ew['value_cm_s']} cm/s (95% {ew['ci95_cm_s'][0]} to {ew['ci95_cm_s'][1]}, fit uncertainty only): the flow that makes orbit and Earth rates match in this model, not a measured buoyant velocity (published estimates 20 to 35 cm/s). The data cannot say how it changes with gravity.",
        "",
        "## Caveats",
        *[f"- {c}" for c in doc["caveats"]],
    ]
    (root / REPORT).write_text("\n".join(lines) + "\n")
    print("\n".join(lines[5:12]))


if __name__ == "__main__":
    args = sys.argv[1:]
    nb = int(args[args.index("--bootstrap") + 1]) if "--bootstrap" in args else 300
    main(Path(args[0]).resolve(), nb)
