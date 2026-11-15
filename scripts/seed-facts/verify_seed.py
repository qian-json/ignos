# Written with AI assistance (Claude Code)
"""Verify each seed fact: quote is verbatim (whitespace-normalized) on the stated PDF page, and the
printed number text appears in the quote (with number boundaries) and parses to `value`.
Tries pdftotext -layout first, then default mode, then -raw. Usage: python3 -I verify_seed.py"""
import json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(os.path.dirname(HERE)), "docs", "sources")
PDF = {"ices2025": "ICES_2025-392-correctedcaptions.pdf", "link2018_si": "Link2018_SciRep_SI.pdf", "fm2_2026": "Ferkul_LPSC_2026_v2.pdf"}
UNITS = {"mm/s", "cm/s", "m/s", "%", "psia", "psi", "kPa", "s", "min", "mm", "cm", "in", "s/cm", "g", None}
LUNAR = re.compile(r"lunar|moon|mars|martian", re.I)
norm = lambda s: re.sub(r"\s+", " ", s).strip()
cache = {}
def page_text(paper, page, mode):
    k = (paper, page, mode)
    if k not in cache:
        args = ["pdftotext"] + ([mode] if mode else []) + ["-f", str(page), "-l", str(page), os.path.join(SRC, PDF[paper]), "-"]
        cache[k] = norm(subprocess.run(args, capture_output=True, text=True, check=True).stdout)
    return cache[k]
facts = json.load(open(os.path.join(os.path.dirname(os.path.dirname(HERE)), "data", "reference", "seed_facts.json")))["facts"]
printed = json.load(open(os.path.join(HERE, "printed_text.json")))
ok = 0
for f in facts:
    errs, mode_hit = [], None
    q = norm(f["quote"])
    for mode in ("-layout", None, "-raw"):
        if q in page_text(f["paper"], f["page"], mode):
            mode_hit = mode or "default"; break
    if not mode_hit: errs.append("quote not on page")
    pr = printed.get(f["id"])
    if not pr: errs.append("no printed text")
    else:
        if not re.search(r"(?<![\d.])" + re.escape(pr) + r"(?!\d|\.\d)", q): errs.append(f"printed '{pr}' not in quote")
        if float(pr) != float(f["value"]): errs.append(f"value {f['value']} != printed {pr}")
    if f["unit"] not in UNITS: errs.append(f"bad unit {f['unit']}")
    if len(f["quote"]) > 200: errs.append("quote > 200 chars")
    if f["unit"] in {"cm/s", "mm/s", "m/s"} and LUNAR.search(f["quote"] + " " + f["label"]):
        errs.append("velocity fact mentions lunar/Mars: check airflow rule")
    if errs: print(f"FAIL {f['id']}: {'; '.join(errs)}")
    else: ok += 1; print(f"PASS {f['id']} [p{f['page']}, {mode_hit}]")
print(f"\n{ok}/{len(facts)} passed")
sys.exit(0 if ok == len(facts) else 1)
