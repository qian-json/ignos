# Written with AI assistance (Claude Code)
# Turns the rendered PNG frames into the web set: web/public/film/<set>/NNN.webp (cwebp, quality 80),
# a JPEG poster for link previews, and web/public/film/manifest.json with the frame count, size,
# fps, the story beats and the per-frame label anchors computed in Blender (scene.py --anchors).
#
#   python3 -I scripts/film/encode.py --frames <dir with desktop PNGs> --anchors <anchors-desktop.json>
#       [--phone-frames <dir> --phone-anchors <anchors-phone.json>] [--quality 80]
import argparse, json, os, shutil, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "web", "public", "film")

# when each label makes sense on screen (1-based frames, inclusive); outside these the label hides
LABEL_FRAMES = {
    "duct": [1, 56],
    "fan": [1, 56],
    "airflow": [66, 124],
    "rod": [138, 168],
    "flame": [1, 168],
}

p = argparse.ArgumentParser()
p.add_argument("--frames", required=True)
p.add_argument("--anchors", required=True)
p.add_argument("--phone-frames")
p.add_argument("--phone-anchors")
p.add_argument("--quality", type=int, default=80)
a = p.parse_args()

def encode_set(src, name, quality):
    dst = os.path.join(OUT, name)
    shutil.rmtree(dst, ignore_errors=True); os.makedirs(dst)
    pngs = sorted(f for f in os.listdir(src) if f.endswith(".png"))
    def one(f):
        subprocess.run(["cwebp", "-quiet", "-q", str(quality), "-m", "6", "-sharp_yuv",
                        os.path.join(src, f), "-o", os.path.join(dst, f.replace(".png", ".webp"))], check=True)
    with ThreadPoolExecutor(8) as ex: list(ex.map(one, pngs))
    total = sum(os.path.getsize(os.path.join(dst, f)) for f in os.listdir(dst))
    print(f"{name}: {len(pngs)} frames, {total / 1e6:.2f} MB")
    return len(pngs), total

def anchors_of(path):
    d = json.load(open(path))
    return d, d["anchors"]

os.makedirs(OUT, exist_ok=True)
n, total = encode_set(a.frames, "desktop", a.quality)
meta, anchors = anchors_of(a.anchors)
assert n == meta["frames"], f"{n} PNGs but the scene has {meta['frames']} frames"
manifest = {
    "illustration": True,
    "frames": n, "width": meta["width"], "height": meta["height"], "fps": meta["fps"],
    "dir": "desktop", "ext": "webp", "pad": 3,
    "poster": "desktop/001.webp", "posterJpg": "poster.jpg",
    "beats": meta["beats"],
    "labelFrames": LABEL_FRAMES,
    "anchors": anchors,   # name -> per frame [x, y, inFrame], x/y in 0..1 of the frame, y down
    "bytes": total,
}
# JPEG poster (first frame) for link previews
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(a.frames, "001.png"),
                "-q:v", "3", os.path.join(OUT, "poster.jpg")], check=True)
if a.phone_frames:
    pn, ptotal = encode_set(a.phone_frames, "phone", a.quality)
    pmeta, panchors = anchors_of(a.phone_anchors)
    assert pn == n, "phone and desktop sets must have the same frame count"
    manifest["phone"] = {"dir": "phone", "width": pmeta["width"], "height": pmeta["height"],
                         "poster": "phone/001.webp", "anchors": panchors, "bytes": ptotal}
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), separators=(",", ":"))
print("manifest ->", os.path.join(OUT, "manifest.json"))
