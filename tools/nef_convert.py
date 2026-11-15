#!/usr/bin/env python3
# Written with AI assistance (Claude Code)
"""Convert Nikon NEF raw frames to 16-bit linear TIFFs plus small 8-bit PNG previews.

For each <name>.NEF in the input folder:
    data/frames/<test_id>/<name>.tiff          16-bit linear RGB (analysis copy)
    data/frames/<test_id>/preview/<name>.png   8-bit, downscaled, display gamma (viewing only)

The TIFF is demosaiced with
    gamma=(1, 1), no_auto_bright=True, use_camera_wb=True, output_bps=16
so pixel values stay proportional to scene radiance and are comparable across frames.
The preview applies a fixed 1/2.2 gamma (no per-frame stretch) and must not be used
for measurements.

Usage:
    python tools/nef_convert.py <nef_folder> --test-id P16
"""
from __future__ import annotations

import argparse
import logging
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

log = logging.getLogger("nef_convert")

POSTPROCESS_KWARGS = dict(
    gamma=(1, 1),
    no_auto_bright=True,
    use_camera_wb=True,
    output_bps=16,
)


def find_nefs(folder: Path, recursive: bool = False):
    walker = folder.rglob("*") if recursive else folder.iterdir()
    return sorted(
        p for p in walker if p.is_file() and p.suffix.lower() == ".nef" and not p.name.startswith("._")
    )


def make_preview(rgb16, max_side: int):
    """16-bit linear RGB array -> small 8-bit PIL image with display gamma."""
    import numpy as np
    from PIL import Image

    step = max(1, max(rgb16.shape[:2]) // (max_side * 2))  # cheap pre-decimation
    small = rgb16[::step, ::step].astype(np.float32) / 65535.0
    small = np.clip(small, 0.0, 1.0) ** (1.0 / 2.2)
    img = Image.fromarray((small * 255.0 + 0.5).astype(np.uint8), mode="RGB")
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    return img


def convert_one(job):
    """Convert a single NEF. Returns (name, status, message); never raises."""
    src, tiff_path, png_path, overwrite, preview_side, compress = job
    src, tiff_path, png_path = Path(src), Path(tiff_path), Path(png_path)
    try:
        if not overwrite and tiff_path.exists() and png_path.exists():
            return src.name, "skipped", "outputs already exist"

        import rawpy
        import tifffile

        with rawpy.imread(str(src)) as raw:
            rgb = raw.postprocess(**POSTPROCESS_KWARGS)
        if rgb.dtype.name != "uint16":
            return src.name, "failed", f"unexpected dtype {rgb.dtype}"

        # Write to a temp name first so an interrupted run never leaves a partial file
        # that a later run would mistake for a finished one.
        tmp_tiff = tiff_path.with_name(tiff_path.name + ".part")
        tifffile.imwrite(
            tmp_tiff,
            rgb,
            photometric="rgb",
            compression="zlib" if compress else None,
        )
        tmp_tiff.replace(tiff_path)

        tmp_png = png_path.with_name(png_path.name + ".part")
        make_preview(rgb, preview_side).save(tmp_png, format="PNG", optimize=True)
        tmp_png.replace(png_path)

        return src.name, "converted", f"{rgb.shape[1]}x{rgb.shape[0]}"
    except Exception as exc:  # corrupt/truncated raw, disk full, ...
        return src.name, "failed", f"{type(exc).__name__}: {exc}"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input_dir", type=Path, help="folder containing .NEF files")
    ap.add_argument("--test-id", required=True, help="test id used for the output folder, e.g. P16")
    ap.add_argument("--out-root", type=Path, default=Path("data/frames"))
    ap.add_argument("--recursive", action="store_true", help="also search sub-folders")
    ap.add_argument("--overwrite", action="store_true", help="re-convert frames whose outputs exist")
    ap.add_argument("--preview-side", type=int, default=1024, help="longest preview side in px")
    ap.add_argument("--compress", action="store_true", help="lossless zlib-compress the TIFFs")
    ap.add_argument("--jobs", type=int, default=1, help="parallel worker processes")
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if not args.input_dir.is_dir():
        log.error("not a directory: %s", args.input_dir)
        return 2
    paths = find_nefs(args.input_dir, args.recursive)
    if not paths:
        log.error("no .NEF files found in %s", args.input_dir)
        return 1

    out_dir = args.out_root / args.test_id
    preview_dir = out_dir / "preview"
    preview_dir.mkdir(parents=True, exist_ok=True)

    stems = [p.stem for p in paths]
    dupes = sorted({s for s in stems if stems.count(s) > 1})
    if dupes:
        log.error("duplicate base filenames would overwrite each other: %s", ", ".join(dupes[:10]))
        return 2

    jobs = [
        (str(p), str(out_dir / f"{p.stem}.tiff"), str(preview_dir / f"{p.stem}.png"),
         args.overwrite, args.preview_side, args.compress)
        for p in paths
    ]

    counts = {"converted": 0, "skipped": 0, "failed": 0}
    sizes = set()

    def record(result):
        name, status, message = result
        counts[status] += 1
        if status == "failed":
            log.warning("%s: FAILED - %s", name, message)
        elif status == "converted":
            sizes.add(message)
        done = sum(counts.values())
        if done % 25 == 0 or done == len(jobs):
            log.info("%d/%d processed", done, len(jobs))

    if args.jobs > 1:
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            for result in pool.map(convert_one, jobs):
                record(result)
    else:
        for job in jobs:
            record(convert_one(job))

    print(f"{args.test_id}: {len(jobs)} NEF found -> {counts['converted']} converted, "
          f"{counts['skipped']} skipped (already done), {counts['failed']} failed")
    if sizes:
        print(f"output size(s): {', '.join(sorted(sizes))} px")
    print(f"TIFFs:    {out_dir}")
    print(f"previews: {preview_dir}")
    return 0 if counts["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
