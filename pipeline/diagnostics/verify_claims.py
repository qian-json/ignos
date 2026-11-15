# Written with AI assistance (Claude Code and Codex)
"""Inventory every numeric token in pitch docs and check data-backed values.

This is a claim inventory, not a proof that an arbitrary nearby source number has
the right scientific meaning. External citations remain explicit manual checks.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PATHS = [ROOT / "pipeline/METHOD.md", ROOT / "docs/research/pitch_qa.md", *sorted((ROOT / "docs/submission").glob("*.md"))]
NUMBER = re.compile(r"(?<![A-Za-z_\d.])[-+]?\d[\d,]*(?:\.\d+)*(?:[eE][-+]?\d+)?%?(?![A-Za-z_\d])")


def flatten(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from flatten(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from flatten(v, f"{path}[{i}]")
    elif isinstance(obj, (float, int)) and not isinstance(obj, bool):
        yield path, float(obj)


def data_values():
    values = []
    for path in [ROOT / "data/derived/spread_rates.csv", ROOT / "web/src/data/moongap.json",
                 ROOT / "docs/research/v2_eval_heldout.json", ROOT / "docs/research/blue_edge_diagnostic.json"]:
        if path.suffix == ".csv":
            with path.open(newline="", encoding="utf-8") as h:
                for i, row in enumerate(csv.DictReader(h), 2):
                    for key, val in row.items():
                        try: values.append((float(val), f"{path.relative_to(ROOT)}:{i}:{key}"))
                        except (ValueError, TypeError): pass
        else:
            for key, val in flatten(json.loads(path.read_text(encoding="utf-8"))):
                values.append((val, f"{path.relative_to(ROOT)}:{key}"))
    return values


def derived_values():
    d = json.loads((ROOT / "docs/research/accuracy/analysis.json").read_text(encoding="utf-8"))
    vals = []
    for group in ("headline", "all_nine_low_flow_including_flagged"):
        for key, v in d[group].items():
            if isinstance(v, (int, float)) and key != "seed":
                vals.append((float(v), f"docs/research/accuracy/analysis.json:{group}.{key}"))
    return vals


def verify():
    sources = data_values() + derived_values()
    ledger = []
    for file in PATHS:
        for line_no, line in enumerate(file.read_text(encoding="utf-8").splitlines(), 1):
            for match in NUMBER.finditer(line):
                token = match.group()
                numeric = token.rstrip("%").replace(",", "")
                if numeric.count(".") > 1:
                    ledger.append({"file":str(file.relative_to(ROOT)).replace("\\", "/"),"line":line_no,
                                   "token":token,"status":"metadata_or_paper_manual","source":""})
                    continue
                value = float(numeric)
                # Rounding tolerance equals half a unit in the final printed place.
                digits = len(token.rstrip("%").split(".")[1]) if "." in token else 0
                tol = .50001 * 10**(-digits)
                matches = [ref for candidate, ref in sources if abs(candidate - value) <= tol]
                # Percent signs may express CSV pct_error or JSON gap, but matching
                # a lone integer such as 8 is too ambiguous to call verified.
                if matches and digits:
                    status, source = "numeric_candidate_match_only", matches[0]
                elif re.search(r"(?:https?://|doi|NTRS|ISBN|version|Node |React |Vite |vitest|gemini-|^\s*#|^\s*\d+\.)", line, re.I):
                    status, source = "metadata_or_paper_manual", ""
                elif match.start() > 0 and line[max(0,match.start()-2):match.start()] in ("p.", "S1", "S2"):
                    status, source = "paper_page_manual", ""
                else:
                    status, source = "unverified", ""
                ledger.append({"file": str(file.relative_to(ROOT)).replace("\\", "/"), "line": line_no,
                               "token": token, "status": status, "source": source})
    return ledger


def semantic_checks():
    with (ROOT / "data/derived/spread_rates.csv").open(newline="", encoding="utf-8") as h:
        rows = list(csv.DictReader(h))
    low = [r for r in rows if r["rate_mm_s"] and float(r["flow_cm_s"]) < 1]
    head = [r for r in low if not r["notes"].startswith("LOW CONFIDENCE")]
    med = float(np.median([abs(float(r["pct_error"])) for r in head]))
    signed = float(np.mean([float(r["pct_error"]) for r in head]))
    moon = json.loads((ROOT / "web/src/data/moongap.json").read_text(encoding="utf-8"))
    p213 = next(r for r in moon["ranking"] if r["material"] == "p213")
    return {"headline_steps_8":len(head)==8, "tests_4":len({r["test_id"] for r in head})==4,
            "ninth_flagged":len(low)==9, "median_rounds_6_8":round(med,1)==6.8,
            "all_within_15":all(abs(float(r["pct_error"])) <= 15 for r in head),
            "six_within_10":sum(abs(float(r["pct_error"])) <= 10 for r in head)==6,
            "mean_signed_rounds_plus_1_1":round(signed,1)==1.1,
            "p213_gap_rounds_2_7":round(p213["gap_pct"],1)==2.7}


def main():
    out = ROOT / "docs/research/accuracy"
    out.mkdir(parents=True, exist_ok=True)
    ledger = verify()
    checks = semantic_checks()
    report = {"_comment":"Written with AI assistance (Claude Code and Codex)",
              "scope":[str(p.relative_to(ROOT)).replace("\\", "/") for p in PATHS],
              "counts":{s:sum(r["status"]==s for r in ledger) for s in sorted({r["status"] for r in ledger})},
              "semantic_checks":checks, "claims":ledger}
    (out / "claims_report.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"counts":report["counts"], "semantic_checks":checks,
                      "unverified_samples":[r for r in ledger if r["status"]=="unverified"][:35]}, indent=2))
    if not all(checks.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
