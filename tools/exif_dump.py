#!/usr/bin/env python3
# Written with AI assistance (Claude Code)
"""Dump per-frame EXIF timing/exposure metadata from a folder of Nikon NEF files.

Writes data/derived/frames_<test_id>.csv, one row per photo, with columns:
    file, datetime_original, subsec, t_s, t_burn_s, f_number, exposure_s, iso,
    width_px, height_px, link_id, phase, gap_prev_s, long_gap, exposure_scale

The format is contract 9 in docs/DATA_CONTRACTS.md (validator: proof/src/contracts.ts);
check a file with `npm run validate -- data/derived/frames_P16.csv`.

Rows are sorted by capture timestamp (DateTimeOriginal + SubSecTimeOriginal), not by
filename. Frames with missing or unreadable EXIF are logged and kept in the CSV (blank
fields, listed after the timestamped frames in filename order); they are never dropped.

t_s             seconds since the test's first photo. Same clock as spread_rates and
                edges in docs/DATA_CONTRACTS.md.
t_burn_s        seconds from the test's t0 frame (T0_FILES / --t0-file): the first frame
                of the burn sequence. Frames taken before it are negative. Blank when no
                t0 frame is configured. t_burn_s = t_s - (t_s of the t0 frame).
link_id         the test's name in Link et al. Table S1 (P16 -> B16, P19 -> B19).
phase           "pretest" for frames before the t0 frame, "burn" for all others.
gap_prev_s      seconds since the previous frame in time order (blank on the first).
long_gap        true if gap_prev_s > 20 s. A flag only; frames are not relabelled.
exposure_scale  f_number^2 / (exposure_s * iso), the exposure-correction factor:
                corrected brightness = linear pixel value * exposure_scale.

Usage:
    python tools/exif_dump.py <nef_folder> --test-id P16
"""
from __future__ import annotations

import argparse
import csv
import logging
import statistics
import struct
import sys
from datetime import datetime, timedelta
from pathlib import Path

log = logging.getLogger("exif_dump")

CSV_COLUMNS = [
    "file",
    "datetime_original",
    "subsec",
    "t_s",
    "t_burn_s",
    "f_number",
    "exposure_s",
    "iso",
    "width_px",
    "height_px",
    "link_id",
    "phase",
    "gap_prev_s",
    "long_gap",
    "exposure_scale",
]

# NASA PSI test number -> the name Link et al. use for the same test.
LINK_IDS = {"P16": "B16", "P19": "B19"}

# First frame of the burn sequence (t_s = 0). Each of these tests starts with one lone
# frame taken long before the sequence; it sorts ahead of t0 and becomes "pretest".
T0_FILES = {"P16": "iss040e072585.NEF", "P19": "iss040e072725.NEF"}

LONG_GAP_S = 20.0

EXIF_DATETIME_FORMAT = "%Y:%m:%d %H:%M:%S"


# --------------------------------------------------------------------------- parsing


def parse_subsec(subsec) -> float:
    """Convert an EXIF SubSecTime* value to a fraction of a second.

    The tag holds the digits that follow the decimal point, so the number of digits
    matters: "5" -> 0.5, "50" -> 0.5, "05" -> 0.05, "123" -> 0.123.
    Missing/blank values give 0.0. Raises ValueError on non-digit content.
    """
    if subsec is None:
        return 0.0
    digits = str(subsec).strip().strip("\x00").strip()
    if not digits:
        return 0.0
    if not digits.isdigit():
        raise ValueError(f"SubSecTime is not all digits: {subsec!r}")
    return int(digits) / (10 ** len(digits))


def parse_timestamp(datetime_original, subsec=None) -> datetime:
    """Combine DateTimeOriginal ("YYYY:MM:DD HH:MM:SS") and SubSecTimeOriginal."""
    if datetime_original is None:
        raise ValueError("DateTimeOriginal is missing")
    text = str(datetime_original).strip().strip("\x00").strip()
    base = datetime.strptime(text, EXIF_DATETIME_FORMAT)
    return base + timedelta(seconds=parse_subsec(subsec))


def compute_t_s(timestamps, t0=None):
    """Seconds since `t0` (default: the earliest timestamp); None entries stay None.

    Timestamps before t0 give negative values.
    """
    valid = [t for t in timestamps if t is not None]
    if not valid:
        return [None] * len(timestamps)
    if t0 is None:
        t0 = min(valid)
    return [None if t is None else round((t - t0).total_seconds(), 6) for t in timestamps]


def compute_gap_prev(t_s_sorted):
    """Seconds since the previous timestamped frame, for values already in time order.

    The first timestamped frame and frames without a timestamp get None.
    """
    gaps, prev = [], None
    for t in t_s_sorted:
        if t is None:
            gaps.append(None)
            continue
        gaps.append(None if prev is None else round(t - prev, 6))
        prev = t
    return gaps


def is_long_gap(gap_prev_s, threshold=LONG_GAP_S):
    """True if the gap is strictly greater than the threshold; None if there is no gap."""
    if gap_prev_s is None:
        return None
    return gap_prev_s > threshold


def exposure_scale(f_number, exposure_s, iso):
    """f_number^2 / (exposure_s * iso), or None if any input is missing or zero."""
    if not f_number or not exposure_s or not iso:
        return None
    return f_number ** 2 / (exposure_s * iso)


def gap_stats(t_s_values):
    """min/max/median gap between consecutive timestamped frames (sorted by time)."""
    ts = sorted(t for t in t_s_values if t is not None)
    gaps = [round(b - a, 6) for a, b in zip(ts, ts[1:])]
    if not gaps:
        return None
    return {
        "n_gaps": len(gaps),
        "min": min(gaps),
        "max": max(gaps),
        "median": statistics.median(gaps),
    }


def _ratio_to_float(value):
    """exifread Ratio / int / str -> float, or None."""
    if value is None:
        return None
    if hasattr(value, "num") and hasattr(value, "den"):
        return value.num / value.den if value.den else None
    try:
        return float(value)
    except (TypeError, ValueError):
        text = str(value)
        if "/" in text:
            num, den = text.split("/", 1)
            return float(num) / float(den) if float(den) else None
        return None


def _first(tag):
    """First value of an exifread tag (or None)."""
    if tag is None:
        return None
    values = getattr(tag, "values", tag)
    if isinstance(values, (list, tuple)):
        return values[0] if values else None
    return values


# ------------------------------------------------------------------- image dimensions

_TIFF_TYPE_FORMAT = {3: "H", 4: "I"}  # SHORT, LONG


def _read_ifd_dimensions(fh, offset, endian):
    """Return (width, height) stored in the TIFF IFD at `offset`, or None."""
    fh.seek(offset)
    raw = fh.read(2)
    if len(raw) < 2:
        return None
    (count,) = struct.unpack(endian + "H", raw)
    width = height = None
    for _ in range(count):
        entry = fh.read(12)
        if len(entry) < 12:
            break
        tag, typ, n = struct.unpack(endian + "HHI", entry[:8])
        if tag in (0x0100, 0x0101) and typ in _TIFF_TYPE_FORMAT and n == 1:
            fmt = _TIFF_TYPE_FORMAT[typ]
            (value,) = struct.unpack(endian + fmt, entry[8 : 8 + struct.calcsize(fmt)])
            if tag == 0x0100:
                width = value
            else:
                height = value
    if width and height:
        return width, height
    return None


def full_resolution_size(path, tags):
    """Full-resolution raw dimensions of a NEF.

    IFD0 of a NEF describes only the 160x120 thumbnail; the raw image lives in a
    SubIFD that exifread does not descend into. We follow the SubIFD offsets
    ourselves and take the largest image found.
    """
    candidates = []
    w, h = _first(tags.get("Image ImageWidth")), _first(tags.get("Image ImageLength"))
    if w and h:
        candidates.append((int(w), int(h)))

    sub = tags.get("Image SubIFDs")
    offsets = list(getattr(sub, "values", []) or []) if sub is not None else []
    if offsets:
        try:
            with open(path, "rb") as fh:
                header = fh.read(2)
                endian = {b"II": "<", b"MM": ">"}.get(header)
                if endian:
                    for off in offsets:
                        dims = _read_ifd_dimensions(fh, int(off), endian)
                        if dims:
                            candidates.append(dims)
        except (OSError, struct.error) as exc:
            log.warning("%s: could not read SubIFD dimensions (%s)", Path(path).name, exc)

    if not candidates:
        return None, None
    return max(candidates, key=lambda d: d[0] * d[1])


# ----------------------------------------------------------------------- per-file read


def read_frame(path: Path) -> dict:
    """Read one NEF. Always returns a row; problems are logged, never raised."""
    import exifread  # imported here so the pure parsing helpers have no dependency

    row = {c: None for c in CSV_COLUMNS}
    row["file"] = path.name
    row["_timestamp"] = None
    problems = []

    try:
        with open(path, "rb") as fh:
            tags = exifread.process_file(fh, details=False)
    except Exception as exc:  # corrupt file etc.
        tags = {}
        problems.append(f"EXIF read failed ({exc})")

    if not tags:
        problems.append("no EXIF tags found")
    else:
        dto = tags.get("EXIF DateTimeOriginal") or tags.get("Image DateTimeOriginal")
        sub = tags.get("EXIF SubSecTimeOriginal")
        if dto is None:
            problems.append("missing DateTimeOriginal")
        else:
            row["datetime_original"] = str(dto).strip()
        if sub is None:
            problems.append("missing SubSecTimeOriginal (using .00)")
        else:
            row["subsec"] = str(sub).strip()
        if dto is not None:
            try:
                row["_timestamp"] = parse_timestamp(str(dto), None if sub is None else str(sub))
            except ValueError as exc:
                problems.append(f"unparseable timestamp ({exc})")

        f_number = _ratio_to_float(_first(tags.get("EXIF FNumber")))
        exposure = _ratio_to_float(_first(tags.get("EXIF ExposureTime")))
        iso = _first(tags.get("EXIF ISOSpeedRatings"))
        row["f_number"] = f_number
        row["exposure_s"] = exposure
        row["iso"] = int(iso) if iso is not None else None
        if f_number is None:
            problems.append("missing FNumber")
        if exposure is None:
            problems.append("missing ExposureTime")
        if iso is None:
            problems.append("missing ISOSpeedRatings")

        row["width_px"], row["height_px"] = full_resolution_size(path, tags)
        if row["width_px"] is None:
            problems.append("missing image dimensions")

    if problems:
        log.warning("%s: %s", path.name, "; ".join(problems))
    row["_problems"] = problems
    return row


# ------------------------------------------------------------------------------- main


def find_nefs(folder: Path, recursive: bool = False):
    walker = folder.rglob("*") if recursive else folder.iterdir()
    return sorted(
        p for p in walker if p.is_file() and p.suffix.lower() == ".nef" and not p.name.startswith("._")
    )


def build_rows(paths, link_id=None, t0_file=None):
    rows = [read_frame(p) for p in paths]
    for row in rows:
        row["link_id"] = link_id
        row["exposure_scale"] = exposure_scale(row["f_number"], row["exposure_s"], row["iso"])
    # Timestamped frames first, in capture order (filename only breaks exact ties);
    # frames without a timestamp follow, in filename order.
    rows.sort(key=lambda r: (r["_timestamp"] is None, r["_timestamp"] or datetime.min, r["file"]))
    t0 = None  # timestamp of the first burn frame
    if t0_file is not None:
        match = [r for r in rows if r["file"].lower() == t0_file.lower()]
        if not match:
            raise ValueError(f"t0 frame {t0_file} is not in the input folder")
        t0 = match[0]["_timestamp"]
        if t0 is None:
            raise ValueError(f"t0 frame {t0_file} has no usable timestamp")

    stamps = [r["_timestamp"] for r in rows]
    for row, t in zip(rows, compute_t_s(stamps)):  # since the test's first photo
        row["t_s"] = t
    if t0 is not None:
        for row, t in zip(rows, compute_t_s(stamps, t0)):  # since the first burn frame
            row["t_burn_s"] = t
            if t is not None:  # frames without a timestamp cannot be placed
                row["phase"] = "pretest" if t < 0 else "burn"
    for row, gap in zip(rows, compute_gap_prev([r["t_s"] for r in rows])):
        row["gap_prev_s"] = gap
        row["long_gap"] = is_long_gap(gap)
    return rows


def _fmt(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        return f"{value:.9f}".rstrip("0").rstrip(".")
    return str(value)


def write_csv(rows, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(CSV_COLUMNS)
        for row in rows:
            writer.writerow([_fmt(row[c]) for c in CSV_COLUMNS])


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input_dir", type=Path, help="folder containing .NEF files")
    ap.add_argument("--test-id", required=True, help="test id used in the output name, e.g. P16")
    ap.add_argument("--link-id", help="Link et al. test name for the link_id column "
                    "(default: looked up from the test id, e.g. P16 -> B16)")
    ap.add_argument("--t0-file", help="first burn frame, where t_burn_s = 0 "
                    "(default: looked up from the test id)")
    ap.add_argument("--out-dir", type=Path, default=Path("data/derived"))
    ap.add_argument("--recursive", action="store_true", help="also search sub-folders")
    ap.add_argument("--head", type=int, default=10, help="rows to print after writing (0 = none)")
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if not args.input_dir.is_dir():
        log.error("not a directory: %s", args.input_dir)
        return 2
    paths = find_nefs(args.input_dir, args.recursive)
    if not paths:
        log.error("no .NEF files found in %s", args.input_dir)
        return 1

    link_id = args.link_id or LINK_IDS.get(args.test_id.upper())
    if link_id is None:
        log.warning("no Link et al. id known for %s; link_id column left blank (use --link-id)",
                    args.test_id)
    t0_file = args.t0_file or T0_FILES.get(args.test_id.upper())
    if t0_file is None:
        log.warning("no t0 frame known for %s; t_burn_s and phase left blank (use --t0-file)",
                    args.test_id)
    try:
        rows = build_rows(paths, link_id, t0_file)
    except ValueError as exc:
        log.error("%s", exc)
        return 2
    out_path = args.out_dir / f"frames_{args.test_id}.csv"
    write_csv(rows, out_path)

    n_untimed = sum(r["_timestamp"] is None for r in rows)
    n_flagged = sum(bool(r["_problems"]) for r in rows)
    log.info("wrote %s: %d frames (%d with EXIF problems, %d without a timestamp)",
             out_path, len(rows), n_flagged, n_untimed)

    n_pretest = sum(r["phase"] == "pretest" for r in rows)
    n_long = sum(r["long_gap"] is True for r in rows)
    log.info("t0 frame: %s | pretest frames: %d | burn frames: %d | long gaps (> %g s): %d",
             t0_file or "(none)", n_pretest, sum(r["phase"] == "burn" for r in rows),
             LONG_GAP_S, n_long)
    if t0_file is not None and n_pretest != 1:
        log.warning("expected exactly one pretest frame before %s, found %d", t0_file, n_pretest)

    stats = gap_stats([r["t_s"] for r in rows])
    if stats:
        print(f"frame gap [s] over {stats['n_gaps']} gaps: "
              f"min={stats['min']:.3f}  max={stats['max']:.3f}  median={stats['median']:.3f}")
    else:
        print("frame gap: fewer than two timestamped frames")

    if args.head:
        print(",".join(CSV_COLUMNS))
        for row in rows[: args.head]:
            print(",".join(_fmt(row[c]) for c in CSV_COLUMNS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
