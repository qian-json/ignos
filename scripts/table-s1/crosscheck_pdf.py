# Written with AI assistance (Claude Code)
"""Cross-checks data/reference/link2018_table_s1.csv against Table S1 in the Link 2018 supplement.

Reads page 1 with pdftotext -layout and takes every (V_g, dt, V_f x10^3) triple. Two checks:
  - layout-independent: the PDF's 52 triples and the CSV's 52 triples are the same multiset;
  - row by row: when the left/right split comes out as the CSV's (26 and 26), each half is compared
    in reading order, with the printed unit per half. Some pdftotext builds (e.g. xpdf 4.00 on
    Windows) put a few right-half rows on a left-half text line; then this check is skipped with a
    note instead of reporting shifted false mismatches, and the multiset check still decides.
Also checks each sample's rod size and O2 against the printed table, and steps 1..n.
Usage: python3 -I scripts/table-s1/crosscheck_pdf.py
"""
import csv, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PDF = os.path.join(ROOT, "docs", "sources", "Link2018_SciRep_SI.pdf")
CSV = os.path.join(ROOT, "data", "reference", "link2018_table_s1.csv")

text = subprocess.run(["pdftotext", "-layout", "-f", "1", "-l", "1", PDF, "-"], capture_output=True, text=True, check=True).stdout
TRIPLE = re.compile(r"(\d+\.\d{2})\s+(\d+)\s+(\d+\.\d{2})")
pdf = {"left": [], "right": []}
for line in text.splitlines():
    for m in TRIPLE.finditer(line):
        pdf["left" if m.start() < 60 else "right"].append(m.groups())

# Rod size and O2 per sample, read from the ruled boxes of the printed table.
PRINTED = {"B13a": (1.27, 20.7), "B13b": (1.27, 20.6), "B5": (1.27, 19.3), "B9": (1.27, 17.6),
           "C25": (0.95, 20.9), "B22": (0.95, 20.8), "B4": (0.95, 18.5), "B12": (0.95, 17.5),
           "B6": (0.64, 18.9), "B15": (0.64, 18.4), "B14": (0.64, 18.4), "B16": (0.64, 18.2), "B1": (0.64, 17.7),
           "C3a": (0.64, 17.7), "B19": (0.64, 17.5), "B2": (0.64, 17.4), "C3b": (0.64, 17.4), "B10": (0.64, 17.0), "P17": (0.64, 16.8)}
UNIT = {"left": "cm/s", "right": "mm/s"}

rows = list(csv.DictReader(line for line in open(CSV) if not line.startswith("#")))
problems, notes = [], []
triple = lambda r: (f"{float(r['flow_cm_s']):.2f}", str(int(float(r["dt_s"]))), f"{float(r['rate_x1e3']):.2f}")
from collections import Counter
all_pdf = pdf["left"] + pdf["right"]
if len(all_pdf) != len(rows):
    # Some pdftotext builds split a row across text lines; xpdf 4.00 even prints a row's rate one line
    # above its "flow dt" (C3a step 2: "6.42" above "2.00 30"). Joining lines as plain text is not safe:
    # it can glue a "flow dt" to the next row's rod size. Instead, pair each dangling "flow dt" with a
    # lone rate on the line just above or below that starts within a few columns after it, each rate
    # used once, and accept the repair only if it brings the count to the CSV's.
    lines = text.splitlines()
    spans = [[m.span() for m in TRIPLE.finditer(l)] for l in lines]
    in_triple = lambda i, pos: any(a <= pos < b for a, b in spans[i])
    lone = {i: [(m.start(), m.group()) for m in re.finditer(r"\d+\.\d{2}", l) if not in_triple(i, m.start())] for i, l in enumerate(lines)}
    repaired, paired_notes = [], []
    for i, l in enumerate(lines):
        for m in re.finditer(r"(\d+\.\d{2})\s+(\d+)(?!\s+\d+\.\d{2})(?![\d.])", l):
            if in_triple(i, m.start()):
                continue
            for j in (i - 1, i + 1):
                near = [t for t in lone.get(j, []) if m.end() - 2 <= t[0] <= m.end() + 15]
                if len(near) == 1:
                    lone[j].remove(near[0])
                    repaired.append((m.group(1), m.group(2), near[0][1]))
                    paired_notes.append(f"paired '{m.group(1)} {m.group(2)}' (line {i + 1}) with the rate {near[0][1]} on line {j + 1}")
                    break
    notes.append(f"line-by-line reading found {len(all_pdf)} triples; column pairing across adjacent lines added {len(repaired)}")
    notes.extend(paired_notes)
    if len(all_pdf) + len(repaired) == len(rows):
        all_pdf = all_pdf + repaired
in_pdf, in_csv = Counter(all_pdf), Counter(triple(r) for r in rows)
if in_pdf != in_csv:
    problems.append(f"triples only in the PDF: {sorted((in_pdf - in_csv).elements())}; only in the CSV: {sorted((in_csv - in_pdf).elements())}")
split_ok = all(len([r for r in rows if r["table_half"] == h]) == len(pdf[h]) for h in ("left", "right"))
if not split_ok:
    notes.append(f"row-by-row check skipped: this pdftotext split the halves {len(pdf['left'])}/{len(pdf['right'])}, the CSV has "
                 f"{sum(r['table_half'] == 'left' for r in rows)}/{sum(r['table_half'] == 'right' for r in rows)} (a layout difference, not a data one)")
for half in ("left", "right") if split_ok else ():
    ours = [r for r in rows if r["table_half"] == half]
    for r, p in zip(ours, pdf[half]):
        got = triple(r)
        if got != p:
            problems.append(f"{r['sample_id']} step {r['step']}: CSV {got}, PDF {p}")
        if r["rate_unit_printed"] != UNIT[half]:
            problems.append(f"{r['sample_id']}: rate_unit_printed {r['rate_unit_printed']}, printed {UNIT[half]}")
steps = {}
for r in rows:
    d, o2 = PRINTED.get(r["sample_id"], (None, None))
    if d is None:
        problems.append(f"unknown sample {r['sample_id']}")
    elif float(r["rod_d_cm"]) != d or float(r["o2_pct"]) != o2:
        problems.append(f"{r['sample_id']}: d={r['rod_d_cm']} O2={r['o2_pct']}, printed d={d} O2={o2}")
    steps.setdefault(r["sample_id"], []).append(int(r["step"]))
for s, st in steps.items():
    if st != list(range(1, len(st) + 1)):
        problems.append(f"{s}: steps {st}")
print(f"{len(rows)} rows, {len(steps)} samples, PDF rows left {len(pdf['left'])} right {len(pdf['right'])}")
for n in notes:
    print(f"note: {n}")
print("\n".join(problems) if problems else ("all rows match the PDF" if split_ok else "all 52 triples match the PDF (order-free check)"))
sys.exit(1 if problems else 0)
