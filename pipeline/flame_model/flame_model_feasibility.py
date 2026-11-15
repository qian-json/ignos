# Written with AI assistance (Claude)
# ROUGH FEASIBILITY TEST, NOT FINAL CODE. One physics-style model for flame spread over PMMA rods,
# fitted to NASA's orbit data (Link 2018 Table S1) and Earth data (Table S2) together.
# Run: python3 flame_model_feasibility.py <path to the repo root> (needs numpy and scipy)
# Known gaps: the Table S2 values below were typed by hand from the SI PDF text and are NOT
# cross-checked (one 0.64 cm row appears twice at 18.0% O2); no error bars; the "lowest O2 that
# burns" search starts at 14%, so a printed 14.00 means "below the search range", not a result.
#
# Provenance (2026-11-15): copied from the "Flame model feasibility" file shared in
# a team member's Claude chat; the chat preview dropped the indentation, which was restored
# here without changing any statement. Kept only as the starting point and for comparison; the
# real model is pipeline/flame_model/model.py.
import csv, sys, math, numpy as np
from scipy.optimize import least_squares
R = sys.argv[1]
# ---- orbit rows (0 g): d cm, O2 %, fan cm/s, rate mm/s
s1 = [r for r in csv.DictReader(l for l in open(R + "/data/reference/link2018_table_s1.csv") if not l.startswith("#"))]
orbit = [(r["sample_id"], float(r["rod_d_cm"]), float(r["o2_pct"]), float(r["flow_cm_s"]), float(r["rate_x1e3"]) * 0.01, 0.0) for r in s1]
# ---- Earth rows (1 g), typed from Link 2018 SI Table S2 (rate = printed x 0.01 mm/s; None = no flame)
S2 = {1.27: [(20.9,25,7.81),(20.9,2,9.07),(20.0,25,5.08),(20.0,2,6.41),(19.0,25,2.60),(19.0,2,3.99),(18.5,25,1.35),(18.5,2,2.56),(18.3,25,None),(18.1,2,None)],
      0.95: [(20.9,25,9.06),(20.9,2,10.65),(20.0,25,6.29),(20.0,2,8.45),(19.0,25,3.50),(19.0,2,5.01),(18.8,2,2.97),(18.5,25,None),(18.5,2,3.33),(18.1,2,None)],
      0.64: [(20.9,25,11.17),(20.9,2,13.63),(20.0,25,8.16),(20.0,2,9.90),(19.0,25,5.77),(19.0,2,6.96),(18.5,25,3.20),(18.5,2,5.90),(18.2,25,None),(18.0,2,4.69),(18.0,2,3.13),(17.8,2,None),(17.5,2,None)],
      0.32: [(20.9,25,18.40),(20.9,2,23.57),(20.0,25,14.50),(20.0,2,19.00),(19.0,25,10.00),(19.0,2,14.01),(18.5,25,7.50),(18.5,2,11.02),(18.0,25,4.35),(18.0,2,8.00),(17.7,25,None),(17.5,2,3.88),(17.0,2,None)]}
earth = [("E%.2f" % d, d, o, f, (None if v is None else v * 0.01), 1.0) for d, rows in S2.items() for (o, f, v) in rows]
rows = orbit + earth
def wind(fan, g, ub):  # air speed the flame feels: fan plus gravity's own wind
    return np.hypot(fan, ub * g ** (1 / 3))
def model(p, d, o2, fan, g):
    k, o0, n, uq, b0, b1, ub = p
    u = np.maximum(wind(fan, g, ub), 1e-6)
    amp = k * np.maximum(o2 - o0, 0) * d ** (-n)
    quench = 1 - uq / u  # dies when the wind is too weak
    blow = 1 - u / (b0 * np.exp(b1 * (o2 - 18)))  # dies when the wind is too strong
    return amp * np.clip(quench, 0, None) * np.clip(blow, 0, None), amp * quench * blow
def resid(p, data):
    out = []
    for (_, d, o2, fan, v, g) in data:
        pred, raw = model(p, d, o2, fan, g)
        if v is None: out.append(max(raw, 0) / 0.03)  # no flame observed: any predicted flame is an error
        else: out.append((pred - v) / max(v, 0.02))  # relative error on the rate
    return np.array(out)
lo = [1e-4, 10, 0, 0.01, 2, 0.0, 3]; hi = [1, 17.5, 2, 0.6, 2000, 3, 120]
def fit(data, seeds=12):
    best = None; rng = np.random.default_rng(0)
    for i in range(seeds):
        p0 = [10 ** rng.uniform(-3, -1), rng.uniform(13, 16.5), rng.uniform(.2, 1), rng.uniform(.1, .4), rng.uniform(20, 300), rng.uniform(.2, 1.5), rng.uniform(10, 60)]
        r = least_squares(resid, p0, bounds=(lo, hi), args=(data,), loss="soft_l1", max_nfev=4000)
        if best is None or r.cost < best.cost: best = r
    return best
def score(p, data):
    errs = []; ok = tot = 0
    for (_, d, o2, fan, v, g) in data:
        pred, _ = model(p, d, o2, fan, g); tot += 1
        if v is None: ok += pred <= 0
        else:
            ok += pred > 0
            if pred > 0: errs.append(abs(pred - v) / v * 100)
    return np.median(errs) if errs else float("nan"), ok, tot
b = fit(rows); p = b.x
names = ["k", "o2_zero", "d_power", "quench_wind", "blowoff_at_18", "blowoff_o2_slope", "earth_wind"]
print("FIT ON ALL (orbit %d rows + Earth %d rows)" % (len(orbit), len(earth)))
for nme, v in zip(names, p): print("  %-18s %.4g" % (nme, v))
for label, data in (("orbit", orbit), ("Earth", earth), ("all", rows)):
    m, ok, tot = score(p, data); print("  %-6s median abs error %.1f%%, burn/no-burn right %d of %d" % (label, m, ok, tot))
# leave-one-test-out
ids = sorted({r[0] for r in rows}); errs = []; ok = tot = 0
for i in ids:
    tr = [r for r in rows if r[0] != i]; te = [r for r in rows if r[0] == i]
    pp = fit(tr, seeds=4).x
    for (_, d, o2, fan, v, g) in te:
        pred, _ = model(pp, d, o2, fan, g); tot += 1
        if v is None: ok += pred <= 0
        else:
            ok += pred > 0
            if pred > 0: errs.append(abs(pred - v) / v * 100)
print("LEAVE-ONE-TEST-OUT (%d groups): median abs error %.1f%%, burn/no-burn right %d of %d" % (len(ids), np.median(errs), ok, tot))
# blind: orbit only -> Earth
po = fit(orbit).x; m, ok, tot = score(po, earth)
print("BLIND orbit-only -> Earth: median abs error %.1f%%, burn/no-burn right %d of %d (earth_wind unconstrained by orbit data: %.1f)" % (m, ok, tot, po[6]))
# earth wind sensitivity: fix ub and refit the rest
print("EARTH WIND scan (fixed), cost:")
for ub in (5, 10, 15, 20, 25, 30, 35, 45, 60, 80):
    def rf(q, data=rows, ub=ub): return resid(list(q) + [ub], data)
    bb = None; rng = np.random.default_rng(1)
    for s in range(6):
        q0 = [10 ** rng.uniform(-3, -1), rng.uniform(13, 16.5), rng.uniform(.2, 1), rng.uniform(.1, .4), rng.uniform(20, 300), rng.uniform(.2, 1.5)]
        r = least_squares(rf, q0, bounds=(lo[:6], hi[:6]), loss="soft_l1", max_nfev=3000)
        if bb is None or r.cost < bb.cost: bb = r
    print("  %3d cm/s: cost %.3f" % (ub, bb.cost))
# predictions with fans off
print("PREDICTIONS, fans off, 0.64 cm rod:")
def loc(g, fan, d=0.64):
    for o in np.arange(14, 30, 0.01):
        if model(p, d, o, fan, g)[0] > 0: return o
    return float("nan")
for name, g in (("ISS", 0.0), ("1e-5 g", 1e-5), ("1e-4 g", 1e-4), ("1e-3 g", 1e-3), ("1e-2 g", 1e-2), ("Moon", 0.165), ("Mars", 0.379), ("Earth", 1.0)):
    u = wind(0.0, g, p[6]); v21 = model(p, 0.64, 21.0, 0.0, g)[0]; v34 = model(p, 0.64, 34.0, 0.0, g)[0]
    print("  %-7s wind %6.2f cm/s | rate at 21%% O2 %.3f mm/s | lowest O2 that burns %.2f%%" % (name, u, v21, loc(g, 0.0)))
print("  ISS with fan at 1 cm/s: lowest O2 that burns %.2f%%; at 10 cm/s: %.2f%%" % (loc(0.0, 1.0), loc(0.0, 10.0)))
