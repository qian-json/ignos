# Written with AI assistance (Claude Code)
"""Diagnostic only (frozen method unchanged): track the leading edge on the BLUE channel alone
(CH* chemiluminescence ~431 nm, Giassi et al. NTRS 20160012298) instead of mean luminance, with the
same relative threshold, windows, scale and 25-90% fit rule, and compare per-step rates.

Usage (from pipeline/): python -m diagnostics.blue_edge [--repo ..] [--cache-dir DIR] [--out FILE.json]
Paths default to this checkout and to run_all's default cache folder, so no user-specific path is needed."""
import argparse, csv, json, os, sys
import numpy as np

PIPELINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PIPELINE_DIR)
from stillair_tracker.frames import load_test
from stillair_tracker.edge import track_test
from stillair_tracker.run import steady_fit
from stillair_tracker.run_all import DEFAULT_CACHE_DIR

CACHES = {'B16': 'p16_cache.npz', 'B19': 'p19_cache_band.npz', 'B12': 'p12_cache.npz', 'P17': 'p17_cache.npz'}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--repo', default=os.path.dirname(PIPELINE_DIR), help='repo root (default: this checkout)')
    ap.add_argument('--cache-dir', default=DEFAULT_CACHE_DIR, help='folder of frame caches (.npz)')
    ap.add_argument('--out', help='optional JSON file for the per-step results')
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)
    with open(os.path.join(repo, 'data', 'derived', 'spread_rates.csv'), encoding='utf-8') as h:
        ours = {(r['test_id'], r['flow_cm_s']): r for r in csv.DictReader(h)}
    out = []
    for tid, cache in CACHES.items():
        with open(os.path.join(repo, 'pipeline', 'configs', f'{tid}.json'), encoding='utf-8') as h:
            cfg = json.load(h)
        d = load_test(cfg['nef_dir'], os.path.join(a.cache_dir, cache))
        t, img = d['t'], d['img']
        row0 = int(d.get('row0', 0)); scale = int(d['scale'])
        ppm = float(ours[(tid, str(cfg['steps'][0]['flow_cm_s']))]['notes'].split('scale ')[1].split('+/-')[0]) / scale
        blue = np.repeat(img[..., 2:3].astype(np.float32), 3, axis=-1)
        kw = dict(axis_row=cfg['axis_row'] - row0, half_band=cfg['half_band'], direction=cfg['direction'],
                  rel=cfg.get('rel_threshold', 0.3))
        tb = track_test(blue, **kw)
        w0, w1 = cfg['burn_window_s']
        ok = ~np.isnan(tb['edge_px']) & (tb['area'] >= cfg.get('min_area_frame', 3000)) & (t >= w0) & (t <= w1)
        x = np.where(ok, cfg['direction'] * tb['edge_px'] / ppm, np.nan)
        wins = [tuple(w) for w in cfg['windows_s']]
        for s, (w_a, w_b) in zip(cfg['steps'], wins):
            sl, ci, m = steady_fit(t, x, w_a, w_b)
            r = ours[(tid, str(s['flow_cm_s']))]
            nasa = s['nasa_rate_mm_s']
            out.append((tid, s['flow_cm_s'], float(r['rate_mm_s']), float(r['pct_error']),
                        sl, ci, 100 * (sl - nasa) / nasa if sl is not None else None, int(m.sum())))
    print('test flow | lum rate  err% | blue rate  ci  err% | n')
    for o in out:
        print(f'{o[0]} {o[1]:>5} | {o[2]:.4f} {o[3]:+6.1f} | '
              + (f'{o[4]:.4f} {o[5]:.4f} {o[6]:+6.1f}' if o[4] is not None else 'n/a') + f' | {o[7]}')
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as h:
            json.dump([dict(zip(['test', 'flow', 'lum_rate', 'lum_err', 'blue_rate', 'blue_ci', 'blue_err', 'n'], o))
                       for o in out], h, indent=1)
    return out


if __name__ == '__main__':
    main()
