# Written with AI assistance (Claude Code)
"""Reproduce every tracker output from the configs, then record what was made in MANIFEST.json.

For each config in configs/ (sorted by file name):
  1. build the frame cache from the NEF photos if it is missing (photos from `fetch`);
  2. run `run.main` into --repo (data/derived/spread_rates.csv rows + data/derived/edges/<test_id>.csv);
  3. with --overlays, render web/public/overlays/<test_id>.mp4 (`overlay.main`).
Then rebuild docs/figures/ (`figures.main`) and write pipeline/MANIFEST.json: sha256 of every output
file and config, the git commit of the code, Python and library versions, and the date given with
--date (there is no hidden clock, so the manifest is a pure function of its inputs).

--check re-runs every config into a temporary repo (no overlays, no figures, no manifest) and compares
spread_rates.csv and edges/*.csv with the ones in --repo. Every cell must match exactly; exit code 1
otherwise. Nothing in --repo is written.

Paths: a config's nef_dir is relative to the pipeline folder (the parent of configs/); --raw-dir
replaces its parent folder (nef_dir P16 -> <raw-dir>/P16). Caches are <cache-dir>/<cache_file>
(default <psi_test lowercase>_cache.npz).

Usage (from pipeline/):
  python -m stillair_tracker.run_all --repo .. --overlays --date 2026-11-15
  python -m stillair_tracker.run_all --repo .. --check
"""
from __future__ import annotations
import argparse, csv, gc, glob, hashlib, json, os, platform, shutil, subprocess, sys, tempfile
from importlib import metadata

from . import run as run_mod, overlay as overlay_mod, figures as figures_mod
from .frames import load_test

PIPELINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(PIPELINE_DIR, "configs")
DEFAULT_CACHE_DIR = os.path.normpath(os.path.join(PIPELINE_DIR, "..", "..", "space-apps-2026", "data", "derived"))
SPREAD_REL = "data/derived/spread_rates.csv"
EDGES_REL = "data/derived/edges/{}.csv"
OVERLAY_REL = "web/public/overlays/{}.mp4"
FIGURE_RELS = ["docs/figures/parity_spread_rates.png", "docs/figures/parity_spread_rates.svg"]
LIBRARIES = ["numpy", "scipy", "rawpy", "ExifRead", "matplotlib", "Pillow"]
MANIFEST_COMMENT = ("Written with AI assistance (Claude Code). Reproducibility manifest of the Still Air tracker, "
                    "written by `python -m stillair_tracker.run_all`; regenerate it, never hand-edit. sha256 is over "
                    "each file's bytes as written (data/** is stored byte-exact in git, see .gitattributes). "
                    "Paths are relative to the repo root.")


# ---------- small helpers ----------

def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def list_configs(config_dir: str) -> list[str]:
    paths = sorted(glob.glob(os.path.join(config_dir, "*.json")))
    if not paths:
        raise SystemExit(f"no configs in {config_dir}")
    return paths


def resolve_config(cfg: dict, base: str, raw_dir: str | None) -> dict:
    """Copy of cfg with absolute nef_dir (and calibration nef_dir)."""
    def fix(p):
        if raw_dir:
            return os.path.abspath(os.path.join(raw_dir, os.path.basename(os.path.normpath(p))))
        return os.path.abspath(os.path.join(base, p))
    out = json.loads(json.dumps(cfg))
    out["nef_dir"] = fix(cfg["nef_dir"])
    if "nef_dir" in cfg.get("calibration", {}):
        out["calibration"]["nef_dir"] = fix(cfg["calibration"]["nef_dir"])
    return out


def cache_path(cfg: dict, cache_dir: str) -> str:
    return os.path.join(cache_dir, cfg.get("cache_file", f"{cfg['psi_test'].lower()}_cache.npz"))


def ensure_cache(cfg: dict, cache: str) -> str:
    """'present' if the cache exists, else build it from the NEF photos ('built')."""
    if os.path.exists(cache):
        return "present"
    if not glob.glob(os.path.join(cfg["nef_dir"], "**", "*.NEF"), recursive=True):
        raise SystemExit(f"{cfg['test_id']}: no cache at {cache} and no NEF photos in {cfg['nef_dir']}; "
                         f"run `python -m stillair_tracker.fetch` first")
    os.makedirs(os.path.dirname(os.path.abspath(cache)), exist_ok=True)
    print(f"{cfg['test_id']}: building cache {cache} from {cfg['nef_dir']}")
    load_test(cfg["nef_dir"], cache, tuple(cfg["cache_rows"]) if "cache_rows" in cfg else None)
    return "built"


def read_csv(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as h:
        return list(csv.DictReader(h))


def test_order(path: str) -> list[str]:
    return list(dict.fromkeys(r["test_id"] for r in read_csv(path))) if os.path.exists(path) else []


def order_spread_rates(path: str, order: list[str]) -> None:
    """Group spread_rates rows by test in `order` (tests not listed keep their place at the end),
    keeping each test's row order. Rewrites only when the order changes."""
    rows = read_csv(path)
    order = list(dict.fromkeys(order))            # first occurrence wins
    rank = {t: i for i, t in enumerate(order)}
    new = sorted(rows, key=lambda r: rank.get(r["test_id"], len(order)))   # stable sort
    if new != rows:
        with open(path, "w", newline="", encoding="utf-8") as h:
            w = csv.DictWriter(h, run_mod.COLS); w.writeheader(); w.writerows(new)


def rel(path: str, root: str) -> str:
    """Path relative to the repo root with forward slashes (basename if outside it; no absolute paths
    in the manifest, so no user names)."""
    r = os.path.relpath(os.path.abspath(path), os.path.abspath(root))
    return (os.path.basename(path) if r.startswith("..") else r).replace(os.sep, "/")


def git_info() -> dict:
    def git(*args):
        return subprocess.run(["git", "-C", PIPELINE_DIR, *args], capture_output=True, text=True, check=True).stdout
    try:
        commit = git("rev-parse", "HEAD").strip()
        dirty = [line[3:] for line in git("status", "--porcelain", "--", ".").splitlines()
                 if not line[3:].endswith("MANIFEST.json")]
        return {"git_commit": commit, "uncommitted_pipeline_files": sorted(dirty)}
    except (OSError, subprocess.CalledProcessError):
        return {"git_commit": None, "uncommitted_pipeline_files": None}


def environment() -> dict:
    libs = {}
    for name in LIBRARIES:
        try:
            libs[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            libs[name] = None
    try:
        out = subprocess.run([overlay_mod.ffmpeg_exe(), "-version"], capture_output=True, text=True, check=True).stdout
        ffmpeg = out.splitlines()[0].split(" Copyright")[0]
    except (OSError, RuntimeError, subprocess.CalledProcessError, IndexError):
        ffmpeg = None
    return {"python": platform.python_version(), "python_implementation": platform.python_implementation(),
            "libraries": libs, "ffmpeg": ffmpeg}


# ---------- the run ----------

def run_configs(configs: list[str], repo: str, cache_dir: str, raw_dir: str | None, overlays: bool,
                order: list[str], workdir: str) -> list[dict]:
    """Run every config into `repo`. Returns one record per config."""
    os.makedirs(os.path.join(repo, "data", "derived"), exist_ok=True)
    done = []
    for p in configs:
        cfg = json.load(open(p, encoding="utf-8"))
        rcfg = resolve_config(cfg, os.path.dirname(os.path.dirname(os.path.abspath(p))), raw_dir)
        rpath = os.path.join(workdir, os.path.basename(p))
        with open(rpath, "w", encoding="utf-8") as h:
            json.dump(rcfg, h)
        cache = cache_path(cfg, cache_dir)
        how = ensure_cache(rcfg, cache)
        print(f"== {cfg['test_id']}: run ({os.path.basename(cache)}, {how})")
        run_mod.main([rpath, "--cache", cache, "--repo", repo])
        gc.collect()
        if overlays:
            print(f"== {cfg['test_id']}: overlay")
            overlay_mod.main([rpath, "--cache", cache, "--repo", repo])
            gc.collect()
        done.append({"path": p, "test_id": cfg["test_id"], "psi_test": cfg.get("psi_test"), "cache": how})
    order_spread_rates(os.path.join(repo, SPREAD_REL), order + [d["test_id"] for d in done])
    return done


def write_manifest(path: str, repo: str, done: list[dict], overlays: bool, date: str) -> dict:
    outputs = [SPREAD_REL] + [EDGES_REL.format(d["test_id"]) for d in done]
    if overlays:
        outputs += [OVERLAY_REL.format(d["test_id"]) for d in done]
    outputs += FIGURE_RELS
    man = {
        "_comment": MANIFEST_COMMENT,
        "manifest_version": 1,
        "date": date,
        "run": {"command": "python -m stillair_tracker.run_all" + (" --overlays" if overlays else ""),
                "overlays_rendered": overlays},
        "code": git_info(),
        "environment": environment(),
        "configs": {rel(d["path"], repo): {"sha256": sha256_file(d["path"]), "test_id": d["test_id"],
                                           "psi_test": d["psi_test"], "cache": d["cache"]} for d in done},
        "outputs": {o: sha256_file(os.path.join(repo, o)) for o in outputs},
    }
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as h:
        json.dump(man, h, indent=2)
        h.write("\n")
    return man


# ---------- --check ----------

def diff_rows(old: list[dict], new: list[dict], label: str, limit: int = 10) -> list[str]:
    out = []
    if len(old) != len(new):
        out.append(f"{label}: {len(old)} committed rows, {len(new)} re-run rows")
    for i, (a, b) in enumerate(zip(old, new)):
        for k in sorted(set(a) | set(b)):
            if a.get(k) != b.get(k):
                out.append(f"{label} row {i + 1} {k}: committed {a.get(k)!r}, re-run {b.get(k)!r}")
    return out[:limit] + ([f"{label}: ... {len(out) - limit} more"] if len(out) > limit else [])


def compare(committed: str, fresh: str, test_ids: list[str]) -> tuple[bool, list[str]]:
    """Compare spread_rates rows and edges CSVs of `test_ids`, cell by cell. Returns (ok, report lines)."""
    lines, ok = [], True
    cs, fs = os.path.join(committed, SPREAD_REL), os.path.join(fresh, SPREAD_REL)
    if not os.path.exists(cs):
        return False, [f"no committed {SPREAD_REL}"]
    crow, frow = read_csv(cs), read_csv(fs)
    for t in test_ids:
        a = [r for r in crow if r["test_id"] == t]
        b = [r for r in frow if r["test_id"] == t]
        d = diff_rows(a, b, f"spread_rates {t}")
        rates_same = [r["rate_mm_s"] for r in a] == [r["rate_mm_s"] for r in b]
        lines.append(f"{t}: spread_rates {len(b)} rows, rates {'identical' if rates_same else 'DIFFERENT'}, "
                     f"all cells {'identical' if not d else 'DIFFERENT'}")
        lines += ["  " + x for x in d]
        ok &= not d and bool(a)
        ce, fe = os.path.join(committed, EDGES_REL.format(t)), os.path.join(fresh, EDGES_REL.format(t))
        if not os.path.exists(ce):
            lines.append(f"{t}: no committed {EDGES_REL.format(t)}"); ok = False; continue
        d = diff_rows(read_csv(ce), read_csv(fe), f"edges {t}")
        lines.append(f"{t}: edges {'identical' if not d else 'DIFFERENT'}")
        lines += ["  " + x for x in d]
        ok &= not d
    others = sorted({r["test_id"] for r in crow} - set(test_ids))
    if others:
        lines.append(f"committed spread_rates also has tests without a config (not checked): {', '.join(others)}")
    same_bytes = sha256_file(cs) == sha256_file(fs)
    lines.append(f"spread_rates.csv bytes {'identical' if same_bytes else 'differ'} "
                 f"(re-run sha256 {sha256_file(fs)})")
    return ok, lines


# ---------- CLI ----------

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default="..", help="repo root that receives data/, web/ and docs/ outputs")
    ap.add_argument("--configs", default=CONFIG_DIR, help="folder of config JSON files")
    ap.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR, help="folder of frame caches (.npz)")
    ap.add_argument("--raw-dir", default=None, help="folder holding the extracted photo folders (P16/, P19/, ...); "
                                                     "default: the configs' nef_dir")
    ap.add_argument("--overlays", action="store_true", help="also render web/public/overlays/<test_id>.mp4")
    ap.add_argument("--date", help="date recorded in the manifest, e.g. 2026-11-15 (required unless --check)")
    ap.add_argument("--manifest", default=None, help="manifest path (default <repo>/pipeline/MANIFEST.json)")
    ap.add_argument("--check", action="store_true", help="re-run into a temp dir and compare CSVs with --repo")
    ap.add_argument("--keep-temp", action="store_true", help="--check: keep the temporary repo")
    a = ap.parse_args(argv)
    if not a.check and not a.date:
        ap.error("--date is required (the manifest records it; there is no hidden clock)")
    repo = os.path.abspath(a.repo)
    configs = list_configs(a.configs)
    with tempfile.TemporaryDirectory(prefix="stillair_cfg_") as work:
        if not a.check:
            done = run_configs(configs, repo, a.cache_dir, a.raw_dir, a.overlays, test_order(os.path.join(repo, SPREAD_REL)), work)
            figures_mod.main(["--repo", repo])
            mpath = a.manifest or os.path.join(repo, "pipeline", "MANIFEST.json")
            man = write_manifest(mpath, repo, done, a.overlays, a.date)
            print(f"wrote {mpath}: {len(man['outputs'])} outputs, code {man['code']['git_commit']}")
            return 0
        tmp = tempfile.mkdtemp(prefix="stillair_check_")
        try:
            done = run_configs(configs, tmp, a.cache_dir, a.raw_dir, False, test_order(os.path.join(repo, SPREAD_REL)), work)
            ok, lines = compare(repo, tmp, [d["test_id"] for d in done])
        finally:
            if a.keep_temp:
                print(f"temporary repo kept: {tmp}")
            else:
                shutil.rmtree(tmp, ignore_errors=True)
    print("\n".join(lines))
    print("CHECK PASSED: re-run matches the committed CSVs exactly" if ok else "CHECK FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
