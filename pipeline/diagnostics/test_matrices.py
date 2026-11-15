# Written with AI assistance (Claude Code)
"""NASA BASS-II test matrices and fan calibration vs Link et al. 2018 Table S1 and the PSI-25 experimental table.
Analysis only; nothing reported changes and no data file is modified.

Reads .xlsx files with the standard library only (zipfile + xml), because openpyxl is not installed.
Outputs go to docs/research/accuracy/test_matrices/ (raw sheet dumps, planned_vs_table_s1.csv,
fan_calibration_by_date.csv).

Usage (from pipeline/): python -m diagnostics.test_matrices --repo .. [--psi-dir PATH]
"""
from __future__ import annotations
import argparse, csv, datetime, os, re, zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
RNS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
MATRIX_FILE = "PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx"
CAL_FILE = "PSI-25_Reference Data_Fan calibration data.xlsx"
EXP_FILE = "PSI-25_Experimental table_BASS-II.csv"
OUR_PSI_TESTS = ["P16", "P19", "P12", "P17", "P13a", "P13b"]       # B16, B19, B12, P17, B13a, B13b

HEADERS = ["date_serial", "gmt", "test", "sample", "material", "restrictor", "fan_display", "air_display", "gain",
           "frames", "o2_initial", "o2_final", "co2_initial", "co2_final", "co_initial", "co_final"]
PSI_COLS = {"test": "Test #", "date": "Date", "gmt": "GMT", "sample": "Sample #", "material": "Fuel Sample Material",
            "restrictor": "Flow restrictor", "fan_display": "Fan display", "air_display": "Air display",
            "o2_initial": "Calibrated  initial O2 % by vol", "o2_final": "Calibrated final O2 % by vol"}
ROD_CM = {"1/4": 0.64, "3/8": 0.95, "0.5": 1.27, "1/2": 1.27}
CAL_SECTIONS = ["none", "1", "2"]          # order of the three calibration tables inside each date block
U_FACTOR = 1.0066                           # footnote in the calibration sheet: U = 1.0066 * AIR
PSI_OF_SAMPLE = {"C25": "P25", "B22": "P22a", "C3a": "P3a", "C3b": "P3b"}


# ---------------------------------------------------------------- xlsx reader (stdlib only)
def col_index(ref: str) -> int:
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def col_letter(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def read_xlsx(path: str) -> dict:
    """Return {sheet_name: {(row, col): text}} with 1-based rows and 0-based cols. Values are raw cell text."""
    z = zipfile.ZipFile(path)
    strings = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            strings.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    rels = {r.get("Id"): r.get("Target")
            for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")).iter(RNS + "Relationship")}
    out = {}
    for sh in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS):
        target = rels[sh.get("{%s}id" % NS["r"])].lstrip("/")
        target = target if target.startswith("xl/") else "xl/" + target
        cells = {}
        for c in ET.fromstring(z.read(target)).iter("{%s}c" % NS["m"]):
            v = c.find("m:v", NS)
            if c.get("t") == "inlineStr":
                txt = "".join(t.text or "" for t in c.iter("{%s}t" % NS["m"]))
            elif v is None or v.text is None:
                continue
            elif c.get("t") == "s":
                txt = strings[int(v.text)]
            else:
                txt = v.text
            ref = c.get("r")
            cells[(int(re.search(r"\d+", ref).group(0)), col_index(ref))] = txt
        out[sh.get("name")] = cells
    return out


def dump_sheets(sheets: dict, outdir: str) -> list:
    os.makedirs(outdir, exist_ok=True)
    written = []
    for name, cells in sheets.items():
        safe = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")
        path = os.path.join(outdir, safe + ".csv")
        nrow = max(r for r, _ in cells)
        ncol = max(c for _, c in cells) + 1
        with open(path, "w", encoding="utf-8", newline="") as h:
            w = csv.writer(h)
            w.writerow(["row"] + [col_letter(c) for c in range(ncol)])
            for r in range(1, nrow + 1):
                w.writerow([r] + [cells.get((r, c), "") for c in range(ncol)])
        written.append(path)
    return written


# ---------------------------------------------------------------- helpers
def serial_to_date(x):
    try:
        return datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(x)))
    except (TypeError, ValueError):
        return None


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def norm_text(x):
    return re.sub(r"[\s,]+", " ", str(x or "")).strip()


def same(a, b):
    fa, fb = num(a), num(b)
    if fa is not None and fb is not None:
        return abs(fa - fb) < 1e-6
    return norm_text(a) == norm_text(b)


def psi_id(sample):
    return PSI_OF_SAMPLE.get(sample, "P" + sample[1:])


def read_matrix_rows(sheets: dict) -> dict:
    """{(sheet, test_id): {header: text}} from the six PI sheets (row 1 is a header, columns A..P)."""
    rows = {}
    for name, cells in sheets.items():
        for r in sorted({r for r, _ in cells if r > 1}):
            rec = {h: cells.get((r, i), "") for i, h in enumerate(HEADERS)}
            rec["_row"] = r
            if rec["test"]:
                rows[(name, rec["test"])] = rec
    return rows


def read_psi_table(path):
    with open(path, encoding="utf-8-sig") as h:
        return {r["Test #"].strip(): {k.strip(): v for k, v in r.items()} for r in csv.DictReader(h)}


def read_s1(path):
    with open(path, encoding="utf-8") as h:
        return list(csv.DictReader(line for line in h if not line.startswith("#")))


# ---------------------------------------------------------------- calibration workbook
def read_calibration(sheets: dict) -> list:
    """One dict per calibration date block: date, gmt, tables {restrictors: [(pot, fan, air)]}.
    Each block is three columns (Pot, Fan Display, Air Display) starting at a 'DATE' cell in row 3, holding three
    tables stacked top to bottom (no restrictor, 1 restrictor, 2 restrictors). A new table starts when the pot
    value stops decreasing."""
    s = sheets["Fan Calibration data"]
    blocks = []
    for (r, c), v in sorted(s.items()):
        if r != 3 or v != "DATE":
            continue
        raw_date = s.get((3, c + 1), "")
        secs, last = [], None
        for rr in range(7, 40):
            pot, fan, air = s.get((rr, c), ""), s.get((rr, c + 1), ""), s.get((rr, c + 2), "")
            if num(pot) is None or num(fan) is None:
                continue
            if last is None or float(pot) >= last:
                secs.append([])
            last = float(pot)
            secs[-1].append((float(pot), float(fan), num(air)))
        blocks.append({"col": col_letter(c), "date_raw": raw_date, "date": serial_to_date(raw_date) or _text_date(raw_date),
                       "gmt": s.get((4, c + 1), ""), "tables": dict(zip(CAL_SECTIONS, secs)), "n_tables": len(secs)})
    return blocks


def _text_date(raw):
    m = re.match(r"(\d+)/(\d+)/(\d{4})", raw or "")
    return datetime.date(int(m.group(3)), int(m.group(1)), int(m.group(2))) if m else None


def interp_air(table, pot):
    """Linear interpolation of the air reading over pots that have a reading. Returns (value, note)."""
    # pot 0 is excluded: the sheet says the fan stops at a finite voltage, so the 0 reading is not a flow point
    pts = sorted((p, a) for p, _, a in table if a is not None and p > 0)
    if not pts:
        return None, "no air readings on this date"
    lo, hi = pts[0][0], pts[-1][0]
    if pot < lo:
        return None, f"below lowest calibrated pot with a reading ({lo})"
    if pot > hi:
        return None, f"above highest calibrated pot ({hi})"
    for (p0, a0), (p1, a1) in zip(pts, pts[1:]):
        if p0 <= pot <= p1:
            v = a0 + (a1 - a0) * (pot - p0) / (p1 - p0) if p1 > p0 else a0
            return round(v, 3), ("lower bracket reading is 0 (below display resolution)" if a0 == 0 and pot > p0 else "")
    return None, "n/a"


def block_for(blocks, date):
    """(block, is_exact). The first sheet column is a worked example, so it is skipped."""
    real = [b for b in blocks if b["col"] != "A" and b["date"]]
    exact = [b for b in real if b["date"] == date]
    if exact:
        return exact[0], True
    return min(real, key=lambda b: abs((b["date"] - date).days)), False


# ---------------------------------------------------------------- hand alignment of Table S1 steps to the matrix
# (pot, fan_display, nominal air display, confidence, note). The matrix lists are free text with unequal lengths, so
# each Table S1 step was matched by reading the row; this is inferred, not read from the file.
def A(pot, fan=None, air=None, conf="medium", note=""):
    return (pot, fan, air, conf, note)


_UNRES = "matrix lists only pots 0.36 and 0.32"
ALIGN = {
    "B13a": [A(.4), A(.36), A(.32), A(.3)], "B13b": [A(.4), A(.36)], "B5": [A(.4), A(.36)],
    "B9": [A(.4), A(.36), A(.32), A(.3)],
    "C25": [A(.36), A(.34), A(.33)],
    "B22": [A(.36, conf="low", note=_UNRES)] + [A(None, conf="low", note=_UNRES)] * 3,
    "B4": [A(.4, 41), A(.36, 41), A(.32, 41)], "B6": [A(.4, 41), A(.36, 41), A(.32, 41)],
    "B10": [A(.4, 41), A(.36, 41), A(.32, 41)],
    "B15": [A(.36, 41, 5)],
    "B14": [A(None, conf="low", note="matrix lists pots .85 .4 .32; which one is the Table S1 step is not stated")],
    "B16": [A(2.8, 62, 8, "high"), A(.7, 44, 2, "high"), A(.4, 41.5, None, "medium", "air display says 'low'"),
            A(.36, 41, None, "medium", "air display says 'low'")],
    "B19": [A(2.8, 62, 8, "high"), A(.7, 44, 2, "high"),
            A(.4, 41.5, None, "medium", "same fan list as B16 but a pot-10 blowoff (fan 122) is inserted later"),
            A(.36, None, None, "medium", "fan list omits the fan display for pot 0.36 (lists 41.5, 122, 41); order of the pot-10 blowoff step is ambiguous")],
    "B1": [A(None, None, 5, "low", "matrix gives air 5 then 2, no pots"), A(None, None, 2, "low", "matrix gives air 5 then 2, no pots")],
    "C3a": [A(.5, None, 2.5, "low", "matrix air list is '5 2.5'; pots listed 1.15 .5 .35 .33 .32 .315 .31 .3"),
            A(None, None, None, "low", "matrix has no entry that gives 2.0")],
    "B2": [A(.5, None, 2.5, "low", "pots listed .9 .5 .35 .33; air 5 2.5 2"), A(.35, None, 2, "low", "pots listed .9 .5 .35 .33; air 5 2.5 2")],
    "C3b": [A(None, None, None, "low", "matrix lists pots .85 .32 .31 .305 .30 .295 and 'very low'")],
    "B12": [A(None, None, None, "low", "unresolved; plan pots 2.6 1.6 1.2 .75 .5 .4 .36 .34 (air 5 3 2 1 0.5 lower)")] * 4,
    "P17": [A(None, None, None, "low", "unresolved; plan pots 2.6 1.6 1.2 10 1.2 .36 .34 (air 5 3 2 22 2 low)")] * 3,
}


def pots_for_sample(sample):
    return sorted({a[0] for a in ALIGN.get(sample, []) if a[0] is not None})


# Pots listed in the matrix text for our tests (read by hand), used only to show calibrated air at every listed pot.
PLAN_POTS = {"B12": [2.6, 1.6, 1.2, .75, .5, .4, .36, .34], "P17": [2.6, 1.6, 1.2, 10, 1.2, .36, .34],
             "B16": [1.3, 2.8, .7, .4, .36, .32], "B19": [1.3, 2.8, .7, .4, .36, 10, .32],
             "B13a": [1.1, .4, .36, .32, .3, .28, .26, 0], "B13b": [1.3, .4, .36, .32]}


def build_comparison(repo, blocks, mrows, exp):
    s1 = read_s1(os.path.join(repo, "data", "reference", "link2018_table_s1.csv"))
    steps_by = {}
    for r in s1:
        steps_by.setdefault(r["sample_id"], []).append(r)
    out = []
    for sid, steps in steps_by.items():
        pid = psi_id(sid)
        m = mrows.get(("Fernandez-Pello", pid))
        e = exp.get(pid)
        sflags, diffs, date = [], [], None
        if m is None or e is None:
            sflags.append("no matrix or experimental-table row for " + pid)
        if m and e:
            date = serial_to_date(m["date_serial"])
            ed = datetime.datetime.strptime(e["Date"], "%m/%d/%Y").date()
            if date != ed:
                diffs.append(f"date {date} vs {ed}")
            for k in ["gmt", "sample", "restrictor", "fan_display", "air_display", "o2_initial", "o2_final", "material"]:
                if not same(m[k], e[PSI_COLS[k]]):
                    diffs.append(f"{k}: matrix '{norm_text(m[k])}' vs table '{norm_text(e[PSI_COLS[k]])}'")
        b, exact = block_for(blocks, date) if date else (None, None)
        tab = b["tables"].get("2") if b else None
        rod_txt = (m or {}).get("material", "")
        mm = re.match(r'\s*([\d./]+)"', rod_txt)
        rod_cm = ROD_CM.get(mm.group(1)) if mm else None
        o2_s1 = float(steps[0]["o2_pct"])
        o2_i, o2_f = (num(m["o2_initial"]), num(m["o2_final"])) if m else (None, None)
        if o2_i is not None and abs(o2_s1 - o2_i) > 1e-6:
            sflags.append(f"O2 MISMATCH: Table S1 {o2_s1} vs matrix initial {round(o2_i, 2)}")
        if o2_i is not None and o2_f is not None and (o2_f > o2_i + 0.3 or o2_f < 0.8 * o2_i):
            sflags.append(f"final O2 {round(o2_f, 2)} is implausible for initial {round(o2_i, 2)} (likely typo in source)")
        if rod_cm is not None and abs(float(steps[0]["rod_d_cm"]) - rod_cm) > 0.02:
            sflags.append(f"ROD MISMATCH: Table S1 {steps[0]['rod_d_cm']} cm vs matrix '{rod_txt}'")
        if diffs:
            sflags.append("matrix differs from experimental table: " + "; ".join(diffs))
        if b and not exact:
            sflags.append(f"no calibration on {date}; nearest block is {b['date']} (GMT {b['gmt']})")
        if b and b["n_tables"] != 3:
            sflags.append("calibration block does not have three tables")
        cal_pots = ""
        plist = PLAN_POTS.get(sid) or pots_for_sample(sid)
        if tab and plist:
            vals = []
            for p in plist:
                v, _ = interp_air(tab, p)
                vals.append(f"{p}:{'n/a' if v is None else round(v * U_FACTOR, 2)}")
            cal_pots = "; ".join(vals)
        al = ALIGN.get(sid, [])
        for i, r in enumerate(steps):
            pot, fan, air, conf, note = al[i] if i < len(al) else A(None, conf="none", note="not aligned")
            flow = float(r["flow_cm_s"])
            fl = list(sflags)
            cal_v = None
            if pot is not None and tab:
                v, cal_note = interp_air(tab, pot)
                if v is not None:
                    cal_v = round(v * U_FACTOR, 3)
                    if abs(flow - cal_v) > max(0.5, 0.25 * flow):
                        fl.append(f"FLOW vs calibration: Table S1 {flow} vs calibrated U {cal_v} at pot {pot}")
                    if cal_note:
                        fl.append(f"calibration note: {cal_note}")
                else:
                    fl.append(f"flow cannot be checked against the calibration at pot {pot}: {cal_note}")
            if num(air) is not None and abs(flow - float(air)) > max(0.5, 0.25 * flow):
                fl.append(f"FLOW vs plan air display: Table S1 {flow} vs nominal {air}")
            if conf in ("low", "none"):
                fl.append("step alignment to matrix is unresolved or low confidence" + (": " + note if note else ""))
            elif note:
                fl.append("note: " + note)
            out.append({
                "sample_id": sid, "psi_test": pid, "step": r["step"], "rod_s1_cm": r["rod_d_cm"],
                "matrix_material": rod_txt, "matrix_date": date.isoformat() if date else "",
                "matrix_fan_display_raw": norm_text(m["fan_display"]) if m else "",
                "matrix_air_display_raw": norm_text(m["air_display"]) if m else "",
                "aligned_pot": "" if pot is None else pot, "aligned_fan_display": "" if fan is None else fan,
                "aligned_air_display": "" if air is None else air, "alignment_confidence": conf,
                "s1_o2_pct": r["o2_pct"], "s1_flow_cm_s": r["flow_cm_s"], "s1_dt_s": r["dt_s"],
                "n_s1_steps": len(steps),
                "psi_fan_display_raw": norm_text(e["Fan display"]) if e else "",
                "psi_air_display_raw": norm_text(e["Air display"]) if e else "",
                "psi_initial_o2": e[PSI_COLS["o2_initial"]].strip() if e else "",
                "psi_final_o2": e[PSI_COLS["o2_final"]].strip() if e else "",
                "psi_flow_restrictor": e["Flow restrictor"] if e else "",
                "cal_block_date": b["date"].isoformat() if b and b["date"] else "",
                "cal_block_gmt": b["gmt"] if b else "", "cal_exact_date": "yes" if exact else "no",
                "cal_U_at_aligned_pot": "" if cal_v is None else cal_v,
                "cal_U_at_all_plan_pots": cal_pots, "flags": " | ".join(fl)})
    return out


def write_csv(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as h:
        w = csv.DictWriter(h, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def calibration_rows(blocks, exp):
    ours = {}
    for t in OUR_PSI_TESTS:
        ours.setdefault(datetime.datetime.strptime(exp[t]["Date"], "%m/%d/%Y").date(), []).append(t)
    rows = []
    for b in blocks:
        for sec, tab in b["tables"].items():
            for pot, fan, air in tab:
                focus = pot in (0.5, 1.0, 2.0) or 41 <= fan <= 42
                rows.append({"sheet_column": b["col"], "date": b["date"].isoformat() if b["date"] else b["date_raw"],
                             "date_raw": b["date_raw"], "gmt_label": b["gmt"], "restrictors": sec, "pot": pot,
                             "fan_display": fan, "air_display": "" if air is None else air,
                             "U_cm_s": "" if air is None else round(U_FACTOR * air, 3),
                             "focus_low_flow": "yes" if focus else "",
                             "our_tests_on_this_date": " ".join(ours.get(b["date"], [])) if sec == "2" else ""})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="..")
    ap.add_argument("--psi-dir", default=None)
    a = ap.parse_args()
    psi = a.psi_dir or os.path.normpath(os.path.join(a.repo, "..", "space-apps-2026", "data", "raw", "psi25"))
    outdir = os.path.join(a.repo, "docs", "research", "accuracy", "test_matrices")
    sheets = read_xlsx(os.path.join(psi, MATRIX_FILE))
    for p in dump_sheets(sheets, outdir):
        print("wrote", p)
    blocks = read_calibration(read_xlsx(os.path.join(psi, CAL_FILE)))
    exp = read_psi_table(os.path.join(psi, EXP_FILE))
    write_csv(os.path.join(outdir, "fan_calibration_by_date.csv"), calibration_rows(blocks, exp))
    comp = build_comparison(a.repo, blocks, read_matrix_rows(sheets), exp)
    write_csv(os.path.join(outdir, "planned_vs_table_s1.csv"), comp)
    print("rows:", len(comp), "flagged:", sum(1 for r in comp if r["flags"]))


if __name__ == "__main__":
    main()
