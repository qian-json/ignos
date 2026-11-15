# Written with AI assistance (Claude Code)
"""Download the NASA PSI-25 (BASS-II, CC0) files that a config lists in "psi_files", verify their
sizes and extract the photo zips.

Source, no login: https://psi.nasa.gov/geode-py/ws/studies/PSI-25/download?file=<url-encoded name>

- A file already present at its listed size is never downloaded again. A photo zip whose NEF photos
  are already extracted (count and first/last name match "nef_count", "nef_first", "nef_last") is
  not downloaded at all, even if the zip itself was deleted after extraction.
- Downloads go to <name>.part first and resume with an HTTP Range request when the server allows it.
  The final size must equal "bytes" from the PSI file listing, or the file is not used.
- Some PSI-25 zips use Deflate64 (zip method 9), which Python's zipfile cannot decompress. Those are
  extracted with PowerShell 7 `Expand-Archive` (.NET) on Windows, otherwise with `7z` or `unzip`.
- The default destination is the folder that holds the configs' "nef_dir" (relative to pipeline/),
  so `run_all` finds the photos without extra flags.

Usage (from pipeline/):
  python -m stillair_tracker.fetch                       # every config in configs/
  python -m stillair_tracker.fetch configs/B16.json --no-videos --delete-zips
"""
from __future__ import annotations
import argparse, glob, json, os, shutil, subprocess, sys, urllib.parse, urllib.request, zipfile

PIPELINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(PIPELINE_DIR, "configs")
BASE_URL = "https://psi.nasa.gov/geode-py/ws/studies/PSI-25/download?file="
USER_AGENT = "stillair-tracker-fetch/1.0"   # generic client name, no personal data
CHUNK = 1 << 20
DEFLATE64 = 9


def url_for(name: str) -> str:
    return BASE_URL + urllib.parse.quote(name, safe="")


def config_paths(paths: list[str] | None) -> list[str]:
    return list(paths) if paths else sorted(glob.glob(os.path.join(CONFIG_DIR, "*.json")))


def default_dest(cfg: dict, base: str = PIPELINE_DIR) -> str:
    """Folder holding the test's photo folder: parent of the config's nef_dir (relative to `base`)."""
    return os.path.dirname(os.path.normpath(os.path.join(base, cfg["nef_dir"])))


def nef_names(folder: str) -> list[str]:
    return [os.path.basename(p) for p in glob.glob(os.path.join(folder, "**", "*.NEF"), recursive=True)]


def photos_present(folder: str, entry: dict) -> bool:
    """True when `folder` already holds this zip's photos: at least nef_count NEF files named
    between nef_first and nef_last (inclusive). Entries without these keys are never 'present'."""
    if not all(k in entry for k in ("nef_count", "nef_first", "nef_last")) or not os.path.isdir(folder):
        return False
    lo, hi = entry["nef_first"].lower(), entry["nef_last"].lower()
    return sum(lo <= n.lower() <= hi for n in nef_names(folder)) >= entry["nef_count"]


def download(url: str, path: str, size: int, opener=urllib.request.urlopen, log=print) -> None:
    """Stream `url` to `path` via `path`.part, resuming a partial .part with a Range request.
    Raises RuntimeError (keeping the .part) if the final size is not `size`."""
    part = path + ".part"
    have = os.path.getsize(part) if os.path.exists(part) else 0
    if have > size:
        os.remove(part); have = 0
    if have < size:
        headers = {"User-Agent": USER_AGENT}
        if have:
            headers["Range"] = f"bytes={have}-"
        with opener(urllib.request.Request(url, headers=headers), timeout=120) as r:
            status = getattr(r, "status", None) or r.getcode()
            mode = "ab" if have and status == 206 else "wb"
            done = have if mode == "ab" else 0
            next_report = done + max(size // 20, CHUNK)
            with open(part, mode) as h:
                while True:
                    b = r.read(CHUNK)
                    if not b:
                        break
                    h.write(b); done += len(b)
                    if done >= next_report:
                        log(f"  {os.path.basename(path)}: {done / 1e6:.0f} / {size / 1e6:.0f} MB")
                        next_report = done + max(size // 20, CHUNK)
    got = os.path.getsize(part)
    if got != size:
        raise RuntimeError(f"{os.path.basename(path)}: got {got} bytes, expected {size} (partial file kept as .part; rerun to resume)")
    os.replace(part, path)


def zip_methods(path: str) -> set[int]:
    """Compression methods used in the zip (listing works even for Deflate64)."""
    with zipfile.ZipFile(path) as z:
        return {i.compress_type for i in z.infolist()}


def _check_member_paths(path: str, out_dir: str) -> None:
    root = os.path.realpath(out_dir)
    with zipfile.ZipFile(path) as z:
        for n in z.namelist():
            p = os.path.realpath(os.path.join(root, n))
            if p != root and not p.startswith(root + os.sep):
                raise RuntimeError(f"{os.path.basename(path)}: member {n!r} would extract outside {out_dir}")


def external_extract_cmd(path: str, out_dir: str, which=shutil.which, platform: str = sys.platform) -> list[str]:
    """Command that extracts a Deflate64 zip: PowerShell 7 Expand-Archive on Windows, else 7z, else unzip."""
    if platform.startswith("win") and which("pwsh"):
        q = lambda s: "'" + s.replace("'", "''") + "'"
        return [which("pwsh"), "-NoProfile", "-NonInteractive", "-Command",
                f"Expand-Archive -LiteralPath {q(path)} -DestinationPath {q(out_dir)} -Force"]
    for exe in ("7z", "7za"):
        if which(exe):
            return [which(exe), "x", "-y", f"-o{out_dir}", path]
    if which("unzip"):
        return [which("unzip"), "-o", "-q", path, "-d", out_dir]
    raise RuntimeError("this zip uses Deflate64: install PowerShell 7 (Windows), 7-Zip or unzip to extract it")


def extract(path: str, out_dir: str, runner=subprocess.run, which=shutil.which, platform: str = sys.platform) -> str:
    """Extract `path` into `out_dir`. Returns 'zipfile' or the external tool's name."""
    os.makedirs(out_dir, exist_ok=True)
    _check_member_paths(path, out_dir)
    if DEFLATE64 not in zip_methods(path):
        with zipfile.ZipFile(path) as z:
            z.extractall(out_dir)
        return "zipfile"
    cmd = external_extract_cmd(path, out_dir, which, platform)
    runner(cmd, check=True)
    return os.path.basename(cmd[0])


def fetch_config(cfg: dict, dest: str, videos: bool = True, delete_zips: bool = False, dry_run: bool = False,
                 opener=urllib.request.urlopen, runner=subprocess.run, log=print) -> list[tuple[str, str]]:
    """Fetch one config's psi_files into `dest`. Returns [(file, action)] with action in
    'present', 'extracted-present', 'skipped-video', 'would-download', 'downloaded', 'extracted'."""
    if "psi_files" not in cfg:
        raise SystemExit(f"{cfg.get('test_id')}: config has no psi_files list")
    os.makedirs(dest, exist_ok=True)
    out = []
    for e in cfg["psi_files"]:
        name, size = e["file"], int(e["bytes"])
        path = os.path.join(dest, name)
        is_zip = "extract_to" in e
        target = os.path.join(dest, e["extract_to"]) if is_zip else None
        if not is_zip and not videos:
            out.append((name, "skipped-video")); continue
        if is_zip and photos_present(target, e):
            if delete_zips and os.path.exists(path):
                os.remove(path)
            out.append((name, "extracted-present")); log(f"{name}: photos already in {target}"); continue
        have = os.path.exists(path) and os.path.getsize(path) == size
        if not have:
            if dry_run:
                out.append((name, "would-download")); log(f"{name}: would download {size / 1e6:.0f} MB"); continue
            if os.path.exists(path):   # wrong size: treat as a partial download and resume / restart
                os.replace(path, path + ".part")
            part = os.path.getsize(path + ".part") if os.path.exists(path + ".part") else 0
            free = shutil.disk_usage(dest).free
            if free < (size - part) + (size if is_zip else 0) + (1 << 30):
                raise SystemExit(f"{name}: not enough free disk in {dest} ({free / 1e9:.1f} GB free; "
                                 f"needs the download{' and its extracted photos' if is_zip else ''} plus 1 GB)")
            log(f"{name}: downloading {size / 1e6:.0f} MB")
            download(url_for(name), path, size, opener=opener, log=log)
            action = "downloaded"
        else:
            action = "present"; log(f"{name}: present ({size} bytes)")
        if is_zip and not dry_run:
            tool = extract(path, target, runner=runner)
            if not photos_present(target, e):
                raise RuntimeError(f"{name}: extracted with {tool}, but {target} does not hold the "
                                   f"{e.get('nef_count')} expected NEF photos")
            log(f"{name}: extracted to {target} ({tool})")
            action = "extracted"
            if delete_zips:
                os.remove(path)
        out.append((name, action))
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("configs", nargs="*", help="config JSON files (default: every pipeline/configs/*.json)")
    ap.add_argument("--dest", help="download/extract folder (default: parent of each config's nef_dir)")
    ap.add_argument("--no-videos", action="store_true", help="skip the test videos (only needed to re-read step windows)")
    ap.add_argument("--delete-zips", action="store_true", help="delete each zip after its photos are extracted")
    ap.add_argument("--dry-run", action="store_true", help="list what would be downloaded")
    a = ap.parse_args(argv)
    for p in config_paths(a.configs):
        cfg = json.load(open(p, encoding="utf-8"))
        dest = os.path.abspath(a.dest) if a.dest else default_dest(cfg)
        print(f"== {cfg['test_id']} ({os.path.basename(p)}) -> {dest}")
        fetch_config(cfg, dest, videos=not a.no_videos, delete_zips=a.delete_zips, dry_run=a.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
