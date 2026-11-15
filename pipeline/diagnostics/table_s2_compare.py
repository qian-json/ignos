# Written with AI assistance (Claude Code)
"""Link et al. 2018 Table S2 (normal gravity, 1 g): checked transcription, repeatability summary, and a 0 g vs 1 g
comparison with Table S1 (microgravity). Analysis only; nothing reported changes.

Input: docs/research/accuracy/table_s2/transcription_A.csv (PDF text layer) and transcription_B.csv (image only),
which agree in all 46 rows; the script re-checks that and writes link2018_table_s2.csv.
Units: the table prints "V_f x 10^3 (cm/s)" on both blocks, so mm/s = printed value x 0.01 (same rule as Table S1).
The +-(%) column is the spread over "at least 3 repeating tests" (Table S2 caption).

Usage (from pipeline/): python -m diagnostics.table_s2_compare --repo ..
"""
from __future__ import annotations
import argparse, csv, json, os, statistics


def read(path):
    with open(path, encoding="utf-8") as h:
        return list(csv.DictReader(line for line in h if not line.startswith("#")))


def check_agree(A, B) -> int:
    def eq(x, y):
        x, y = (x or "").strip(), (y or "").strip()
        if x == y:
            return True
        try:
            return abs(float(x) - float(y)) < 1e-9
        except ValueError:
            return False
    bad = 0
    for a, b in zip(A, B):
        pa = (a["d_cm"], a["o2_pct"], a["vg_cm_s"], a["vf_x1e3"], a["pm_pct"])
        pb = (b["d_cm"], b["o2_pct"], b["vg_cm_s"], b["vf_x1e3_printed"], b["pm_pct_printed"])
        bad += not all(eq(x, y) for x, y in zip(pa, pb))
    return bad + abs(len(A) - len(B))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    ap.add_argument("--no-fig", action="store_true")
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)
    d = os.path.join(repo, "docs", "research", "accuracy", "table_s2")
    A, B = read(os.path.join(d, "transcription_A.csv")), read(os.path.join(d, "transcription_B.csv"))
    n_diff = check_agree(A, B)
    if n_diff:
        raise SystemExit(f"transcriptions disagree in {n_diff} rows; adjudicate before use")
    rows = []
    for r in A:
        v = r["vf_x1e3"].strip()
        rows.append({"d_cm": float(r["d_cm"]), "o2_pct": float(r["o2_pct"]), "vg_cm_s": float(r["vg_cm_s"]),
                     "vf_x1e3_printed": v, "rate_mm_s": round(float(v) * 0.01, 5) if v else "",
                     "repeat_spread_pct": r["pm_pct"].strip(), "value_printed": bool(v), "table_half": r["table_half"]})
    out_csv = os.path.join(d, "link2018_table_s2.csv")
    with open(out_csv, "w", encoding="utf-8", newline="\n") as h:
        h.write("# Written with AI assistance (Claude Code). Link et al. 2018, Sci Rep 8:120, Supplementary Table S2 "
                "(normal gravity, 1 g), SI PDF page 2. Two independent transcriptions (PDF text layer; image only) agree in "
                "all 46 rows, and every row was checked by eye against a 300 dpi render. rate_mm_s = printed Vf x10^3 "
                "(cm/s) value x 0.01. repeat_spread_pct = the printed +-(%) column (spread over at least 3 repeated tests). "
                "value_printed false = the table prints '-' (no value).\n")
        w = csv.DictWriter(h, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    spreads = [float(r["repeat_spread_pct"]) for r in rows if r["repeat_spread_pct"]]
    summary = {
        "_note": "Written with AI assistance (Claude Code). Analysis only.",
        "n_rows": len(rows), "n_with_value": sum(r["value_printed"] for r in rows),
        "transcriptions_disagreeing_rows": n_diff,
        "repeat_spread_pct": {"n": len(spreads), "median": statistics.median(spreads), "min": min(spreads), "max": max(spreads)},
        "lowest_o2_with_value_by_diameter": {
            str(dc): min(r["o2_pct"] for r in rows if r["d_cm"] == dc and r["value_printed"])
            for dc in sorted({r["d_cm"] for r in rows})},
        "highest_o2_without_value_by_diameter": {
            str(dc): max([r["o2_pct"] for r in rows if r["d_cm"] == dc and not r["value_printed"]] or [None] , key=lambda x: -1 if x is None else x)
            for dc in sorted({r["d_cm"] for r in rows})},
    }
    with open(os.path.join(d, "table_s2_summary.json"), "w", encoding="utf-8", newline="\n") as h:
        json.dump(summary, h, indent=1)
    if not a.no_fig:
        plot(repo, rows, os.path.join(repo, "docs", "research", "figures", "gravity_comparison_table_s1_s2.png"))
    print(json.dumps(summary, indent=1))
    return summary


def plot(repo, s2, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    with open(os.path.join(repo, "data", "reference", "link2018_table_s1.csv"), encoding="utf-8") as h:
        s1 = list(csv.DictReader(l for l in h if not l.startswith("#")))
    diams = [0.64, 0.95, 1.27]
    fig, axes = plt.subplots(1, 3, figsize=(12, 4.2), sharey=True)
    for ax, dc in zip(axes, diams):
        mu = [r for r in s1 if abs(float(r["rod_d_cm"]) - dc) < 1e-6]
        ax.scatter([float(r["o2_pct"]) for r in mu], [float(r["rate_x1e3"]) * 0.01 for r in mu], s=22, color="#1f6fd1",
                   label="0 g, Table S1 (flow 0.4-8 cm/s)", zorder=3)
        for vg, mk, col in ((2.0, "s", "#d1621f"), (25.0, "^", "#7a4fb5")):
            g = [r for r in s2 if r["d_cm"] == dc and r["vg_cm_s"] == vg]
            ok = [r for r in g if r["value_printed"]]
            ax.scatter([r["o2_pct"] for r in ok], [r["rate_mm_s"] for r in ok], marker=mk, s=30, color=col,
                       label=f"1 g, Table S2, forced flow {vg:g} cm/s", zorder=3)
        ax.set_title(f"rod diameter {dc:g} cm")
        ax.set_xlabel("O2 (% by volume; Table S1 = pre-burn value)")
        ax.grid(alpha=0.3)
    axes[0].set_ylabel("flame spread rate (mm/s)")
    axes[0].legend(fontsize=7, loc="upper left", frameon=False)
    fig.suptitle("Published data: Link et al. 2018, Sci Rep 8:120, Supplementary Tables S1 (0 g) and S2 (1 g). Not a Moon or partial-gravity value.", fontsize=9)
    fig.text(0.01, 0.01, "Rows where Table S2 prints '-' have no rate and are omitted. Written with AI assistance (Claude Code).", fontsize=7, color="#555")
    fig.tight_layout(rect=(0, 0.04, 1, 0.94))
    fig.savefig(path, dpi=150)
    plt.close(fig)


if __name__ == "__main__":
    main()
