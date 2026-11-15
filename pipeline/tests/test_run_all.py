# Written with AI assistance (Claude Code)
"""run_all + fetch tests: tiny synthetic configs and caches, no network, no NEF files."""
import sys, os, csv, io, json, glob, shutil, zipfile, importlib.util
import numpy as np
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from stillair_tracker import run as run_mod, overlay as overlay_mod, run_all, fetch

PX_PER_MM_FULL = 40.0     # synthetic full-res scale; cache scale 4 -> 10 px/mm in tracked frames
SPEEDS = (1.0, 2.0)       # px/s in tracked frames -> 0.1 and 0.2 mm/s
needs_mpl = pytest.mark.skipif(importlib.util.find_spec("matplotlib") is None, reason="matplotlib not installed")
has_ffmpeg = bool(shutil.which("ffmpeg") or os.path.exists(r"C:\ffmpeg\bin\ffmpeg.exe"))


def synthetic_cache(path, n=40, dt=5.0, shape=(80, 360), axis=40, seed=0):
    """A bright bar on the rod axis whose right end moves at SPEEDS[0] px/s, then SPEEDS[1] after t=100 s."""
    rng = np.random.default_rng(seed)
    t = np.arange(n) * dt
    img = rng.normal(0.01, 0.003, (n,) + shape + (3,)).clip(0).astype(np.float32)
    for i, ti in enumerate(t):
        right = 60 + SPEEDS[0] * min(ti, 100) + SPEEDS[1] * max(ti - 100, 0)
        img[i, axis - 12:axis + 12, 30:int(round(right))] = 1.0
    np.savez(path, t=t, t_unix=t + 1.4e9, shutter=np.ones_like(t), img=img,
             names=np.array([f"f{i}.NEF" for i in range(n)]), scale=np.array(4), row0=np.array(0))


def synthetic_config(test_id="T1", psi="X1"):
    return {"_comment": "Written with AI assistance (Claude Code). Synthetic test config.",
            "test_id": test_id, "psi_test": psi, "nef_dir": f"raw/{psi}",
            "psi_files": [{"file": f"{psi}.zip", "bytes": 1, "role": "photos", "extract_to": psi}],
            "rod_d_mm": 6.35, "o2_pct": 18.0, "axis_row": 40, "half_band": 30, "direction": 1,
            "rel_threshold": 0.3, "min_area_frame": 200, "burn_window_s": [0, 1e9],
            "calibration": {"frame_index": 0, "crop_full_res": [0, 1, 0, 1]},
            "windows_s": [[0, 100], [100, 195]],
            "steps": [{"flow_cm_s": 0.8, "dt_s": 100, "nasa_rate_mm_s": 0.1},
                      {"flow_cm_s": 0.6, "dt_s": 95, "nasa_rate_mm_s": 0.2}]}


@pytest.fixture
def setup(tmp_path, monkeypatch):
    """configs/ with two tests, caches/ with their caches, an empty repo/. Calibration is stubbed
    (it reads NEF files); everything else is the real pipeline."""
    fake_cal = lambda cfg: (PX_PER_MM_FULL, 0.1)
    monkeypatch.setattr(run_mod, "calibrate", fake_cal)
    monkeypatch.setattr(overlay_mod, "calibrate", fake_cal)
    cfgs, caches, repo = tmp_path / "pipe" / "configs", tmp_path / "caches", tmp_path / "repo"
    for d in (cfgs, caches, repo):
        d.mkdir(parents=True)
    for tid, psi, seed in (("T1", "X1", 0), ("T2", "X2", 1)):
        (cfgs / f"{tid}.json").write_text(json.dumps(synthetic_config(tid, psi)), encoding="utf-8")
        synthetic_cache(caches / f"{psi.lower()}_cache.npz", seed=seed)
    return {"configs": str(cfgs), "caches": str(caches), "repo": str(repo), "tmp": tmp_path}


def args(s, *extra, repo=None, manifest=True):
    a = ["--configs", s["configs"], "--cache-dir", s["caches"], "--repo", repo or s["repo"]]
    if manifest:
        a += ["--manifest", str(s["tmp"] / "MANIFEST.json"), "--date", "2026-11-15"]
    return a + list(extra)


def rows(repo):
    with open(os.path.join(repo, "data", "derived", "spread_rates.csv"), newline="", encoding="utf-8") as h:
        return list(csv.DictReader(h))


@needs_mpl
def test_run_all_outputs_rates_and_manifest(setup):
    assert run_all.main(args(setup)) == 0
    r = rows(setup["repo"])
    assert [x["test_id"] for x in r] == ["T1", "T1", "T2", "T2"]
    for x, want in zip(r, (0.1, 0.2, 0.1, 0.2)):
        assert abs(float(x["rate_mm_s"]) - want) / want < 0.02
    man = json.loads((setup["tmp"] / "MANIFEST.json").read_text(encoding="utf-8"))
    assert man["_comment"].startswith("Written with AI assistance (Claude Code)")
    assert man["date"] == "2026-11-15"
    assert set(man["outputs"]) == {"data/derived/spread_rates.csv", "data/derived/edges/T1.csv",
                                   "data/derived/edges/T2.csv", *run_all.FIGURE_RELS}
    for f, h in man["outputs"].items():
        assert h == run_all.sha256_file(os.path.join(setup["repo"], f))
    assert set(man["configs"]) == {"T1.json", "T2.json"}       # outside the repo -> basename, no absolute paths
    assert man["configs"]["T1.json"]["sha256"] == run_all.sha256_file(os.path.join(setup["configs"], "T1.json"))
    assert man["configs"]["T1.json"]["cache"] == "present"
    assert "git_commit" in man["code"] and man["environment"]["libraries"]["numpy"]
    assert str(setup["tmp"]) not in json.dumps(man)            # no local paths leak into the manifest


@needs_mpl
def test_two_runs_give_identical_outputs(setup):
    other = setup["tmp"] / "repo2"; other.mkdir()
    run_all.main(args(setup))
    m1 = json.loads((setup["tmp"] / "MANIFEST.json").read_text(encoding="utf-8"))
    run_all.main(args(setup, repo=str(other)))
    m2 = json.loads((setup["tmp"] / "MANIFEST.json").read_text(encoding="utf-8"))
    assert m1["outputs"] == m2["outputs"]


@needs_mpl
def test_check_passes_then_fails_on_changed_rate(setup, capsys):
    run_all.main(args(setup))
    assert run_all.main(args(setup, "--check", manifest=False)) == 0
    assert "CHECK PASSED" in capsys.readouterr().out
    p = os.path.join(setup["repo"], "data", "derived", "spread_rates.csv")
    r = rows(setup["repo"])
    r[1]["rate_mm_s"] = f"{float(r[1]['rate_mm_s']) + 0.0001:.4f}"
    with open(p, "w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, run_mod.COLS); w.writeheader(); w.writerows(r)
    assert run_all.main(args(setup, "--check", manifest=False)) == 1
    out = capsys.readouterr().out
    assert "CHECK FAILED" in out and "T1: spread_rates 2 rows, rates DIFFERENT" in out


@needs_mpl
def test_check_fails_on_changed_edge(setup, capsys):
    run_all.main(args(setup))
    p = os.path.join(setup["repo"], "data", "derived", "edges", "T2.csv")
    text = open(p, encoding="utf-8", newline="").read().replace("T2,10.00,", "T2,10.01,", 1)
    open(p, "w", encoding="utf-8", newline="").write(text)
    assert run_all.main(args(setup, "--check", manifest=False)) == 1
    assert "T2: edges DIFFERENT" in capsys.readouterr().out


@needs_mpl
def test_existing_test_order_is_kept(setup):
    run_all.main(args(setup))
    p = os.path.join(setup["repo"], "data", "derived", "spread_rates.csv")
    r = rows(setup["repo"])
    extra = {**r[0], "test_id": "OLD"}
    with open(p, "w", newline="", encoding="utf-8") as h:   # committed order: T2, OLD, T1
        w = csv.DictWriter(h, run_mod.COLS); w.writeheader(); w.writerows(r[2:] + [extra] + r[:2])
    run_all.main(args(setup))
    assert [x["test_id"] for x in rows(setup["repo"])] == ["T2", "T2", "OLD", "T1", "T1"]


def test_date_is_required_without_check(setup):
    with pytest.raises(SystemExit):
        run_all.main(["--configs", setup["configs"], "--cache-dir", setup["caches"], "--repo", setup["repo"]])


def test_missing_cache_and_photos_points_to_fetch(setup):
    os.remove(os.path.join(setup["caches"], "x1_cache.npz"))
    with pytest.raises(SystemExit, match="fetch"):
        run_all.main(args(setup))


@needs_mpl
def test_missing_cache_is_built_from_photos(setup, monkeypatch):
    os.remove(os.path.join(setup["caches"], "x1_cache.npz"))
    raw = os.path.join(os.path.dirname(setup["configs"]), "raw", "X1"); os.makedirs(raw)
    open(os.path.join(raw, "a.NEF"), "wb").close()
    calls = []
    def fake_load(nef_dir, cache, rows_):
        calls.append(nef_dir); synthetic_cache(cache)
    monkeypatch.setattr(run_all, "load_test", fake_load)
    assert run_all.main(args(setup)) == 0
    assert calls == [os.path.abspath(raw)]                    # nef_dir resolved against the pipeline folder
    man = json.loads((setup["tmp"] / "MANIFEST.json").read_text(encoding="utf-8"))
    assert man["configs"]["T1.json"]["cache"] == "built" and man["configs"]["T2.json"]["cache"] == "present"


def test_raw_dir_replaces_photo_parent():
    cfg = {"nef_dir": "../../a/b/P19", "calibration": {"nef_dir": "../../a/b/P16"}}
    r = run_all.resolve_config(cfg, "/base", "/data/raw")
    assert r["nef_dir"] == os.path.abspath("/data/raw/P19")
    assert r["calibration"]["nef_dir"] == os.path.abspath("/data/raw/P16")
    assert cfg["nef_dir"] == "../../a/b/P19"                    # input not modified


@needs_mpl
@pytest.mark.skipif(not has_ffmpeg, reason="ffmpeg not installed")
def test_overlays_are_rendered_and_hashed(setup):
    assert run_all.main(args(setup, "--overlays")) == 0
    man = json.loads((setup["tmp"] / "MANIFEST.json").read_text(encoding="utf-8"))
    for tid in ("T1", "T2"):
        f = f"web/public/overlays/{tid}.mp4"
        assert man["outputs"][f] == run_all.sha256_file(os.path.join(setup["repo"], f))
    assert man["run"]["overlays_rendered"] is True


# ---------------- fetch ----------------

class FakeResponse(io.BytesIO):
    def __init__(self, data, status=200):
        super().__init__(data); self.status = status
    def getcode(self):
        return self.status
    def __enter__(self):
        return self
    def __exit__(self, *a):
        self.close()


def make_zip(names, method=zipfile.ZIP_DEFLATED):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w", method) as z:
        for n in names:
            z.writestr(n, b"raw" + n.encode())
    return b.getvalue()


def zip_entry(data, names, extract_to="P1"):
    return {"file": "PSI-25_Raw Data_TEST P1.zip", "bytes": len(data), "role": "photos", "extract_to": extract_to,
            "nef_count": len(names), "nef_first": min(names), "nef_last": max(names)}


def test_fetch_downloads_verifies_extracts_then_skips(tmp_path):
    names = ["iss1.NEF", "iss2.NEF", "iss3.NEF"]
    data = make_zip(names)
    video = b"mp4bytes"
    cfg = {"test_id": "T", "psi_files": [zip_entry(data, names),
                                         {"file": "PSI-25_Raw Data_TEST P1.mp4", "bytes": len(video), "role": "video"}]}
    seen = []
    def opener(req, timeout=None):
        seen.append((req.full_url, req.get_header("User-agent")))
        return FakeResponse(data if req.full_url.endswith(".zip") else video)
    acts = fetch.fetch_config(cfg, str(tmp_path), opener=opener, log=lambda *a: None)
    assert [a for _, a in acts] == ["extracted", "downloaded"]
    assert seen[0][0] == fetch.BASE_URL + "PSI-25_Raw%20Data_TEST%20P1.zip"
    assert seen[0][1] == fetch.USER_AGENT
    assert sorted(os.listdir(tmp_path / "P1")) == names
    # second run: nothing downloaded, even after the zip is deleted
    os.remove(tmp_path / cfg["psi_files"][0]["file"])
    acts = fetch.fetch_config(cfg, str(tmp_path), opener=lambda *a, **k: pytest.fail("re-downloaded"), log=lambda *a: None)
    assert [a for _, a in acts] == ["extracted-present", "present"]


def test_fetch_size_mismatch_keeps_part_and_resumes(tmp_path):
    names = ["a.NEF"]
    data = make_zip(names)
    cfg = {"test_id": "T", "psi_files": [zip_entry(data, names)]}
    with pytest.raises(RuntimeError, match="expected"):
        fetch.fetch_config(cfg, str(tmp_path), opener=lambda req, timeout=None: FakeResponse(data[:10]), log=lambda *a: None)
    part = tmp_path / (cfg["psi_files"][0]["file"] + ".part")
    assert part.stat().st_size == 10
    ranges = []
    def opener(req, timeout=None):
        ranges.append(req.get_header("Range"))
        return FakeResponse(data[10:], status=206)
    acts = fetch.fetch_config(cfg, str(tmp_path), opener=opener, log=lambda *a: None)
    assert ranges == ["bytes=10-"] and acts == [(cfg["psi_files"][0]["file"], "extracted")]
    assert os.listdir(tmp_path / "P1") == names


def test_fetch_dry_run_and_no_videos(tmp_path):
    cfg = {"test_id": "T", "psi_files": [{"file": "v.mp4", "bytes": 5, "role": "video"},
                                         {"file": "z.zip", "bytes": 5, "role": "photos", "extract_to": "P"}]}
    acts = fetch.fetch_config(cfg, str(tmp_path), videos=False, dry_run=True,
                              opener=lambda *a, **k: pytest.fail("network"), log=lambda *a: None)
    assert acts == [("v.mp4", "skipped-video"), ("z.zip", "would-download")]


def test_deflate64_uses_external_tool(tmp_path, monkeypatch):
    names = ["x.NEF", "y.NEF"]
    zp = tmp_path / "d64.zip"; zp.write_bytes(make_zip(names))
    monkeypatch.setattr(fetch, "zip_methods", lambda p: {fetch.DEFLATE64})
    cmds = []
    def runner(cmd, check):
        cmds.append(cmd)
        with zipfile.ZipFile(zp) as z:      # stand-in for the external tool
            z.extractall(tmp_path / "out")
    which = lambda exe: {"pwsh": "pwsh.exe", "unzip": "/usr/bin/unzip"}.get(exe)
    tool = fetch.extract(str(zp), str(tmp_path / "out"), runner=runner, which=which, platform="win32")
    assert tool == "pwsh.exe" and "Expand-Archive -LiteralPath" in cmds[0][-1]
    assert sorted(os.listdir(tmp_path / "out")) == names
    assert fetch.external_extract_cmd("a.zip", "o", which=which, platform="linux")[:2] == ["/usr/bin/unzip", "-o"]
    with pytest.raises(RuntimeError, match="Deflate64"):
        fetch.external_extract_cmd("a.zip", "o", which=lambda e: None, platform="linux")


def test_zip_slip_is_refused(tmp_path):
    zp = tmp_path / "bad.zip"; zp.write_bytes(make_zip(["../evil.NEF"]))
    with pytest.raises(RuntimeError, match="outside"):
        fetch.extract(str(zp), str(tmp_path / "out"))


def test_real_configs_list_their_psi_files():
    for p in sorted(glob.glob(os.path.join(run_all.CONFIG_DIR, "*.json"))):
        cfg = json.load(open(p, encoding="utf-8"))
        assert "psi_files" in cfg, f"{os.path.basename(p)} has no psi_files list: fetch cannot reproduce it"
        files = cfg["psi_files"]
        photo_dirs = {e["extract_to"] for e in files if "extract_to" in e}
        need = {os.path.basename(cfg["nef_dir"]), os.path.basename(cfg["calibration"].get("nef_dir", cfg["nef_dir"]))}
        assert need <= photo_dirs, p
        assert any(e["role"] == "video" and cfg["psi_test"] in e["file"] for e in files), p
        for e in files:
            assert e["file"].startswith("PSI-25_Raw Data_") and isinstance(e["bytes"], int) and e["bytes"] > 0
            if "extract_to" in e:
                assert e["file"].endswith(".zip") and e["nef_count"] > 0 and e["nef_first"] <= e["nef_last"]
