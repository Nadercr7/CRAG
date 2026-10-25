"""Markdown tables for results/report.md, generated from the results JSON (no typed numbers).

python scripts/report_tables.py > results/report_tables.md
"""

from __future__ import annotations

import json
from pathlib import Path

RES = Path("results")
SLICES = ("supportive", "missing", "misleading")
ARMS = "ABCDEFG"


def pct(x: float | None) -> str:
    return "-" if x is None else f"{100 * x:.1f}"


def qa_table(run: str) -> list[str]:
    agg = json.loads((RES / "qa" / run / "metrics.json").read_text())["aggregate"]
    out = []
    for s in SLICES:
        n = agg["A"][s]["n"]
        out += [
            f"**{s}** (n = {n})",
            "",
            "| Arm | Correct | Abstain | Halluc. | Planted | Sel. acc. | Coverage | Ctx tokens |",
            "|---|---|---|---|---|---|---|---|",
        ]
        for a in ARMS:
            m = agg[a][s]
            planted = pct(m["planted"]) if s == "misleading" else "-"
            out.append(
                f"| {a} | {pct(m['correct'])} | {pct(m['abstain'])} | {pct(m['hallucinate'])} "
                f"| {planted} | {pct(m['selective_accuracy'])} | {pct(m['coverage'])} "
                f"| {m['context_tokens']:.0f} |"
            )
        out.append("")
    return out


def comparison_table(run: str, pairs: list[tuple[str, str]]) -> list[str]:
    comps = json.loads((RES / "qa" / run / "metrics.json").read_text())["comparisons"]
    out = [
        "| Comparison | Slice | Metric | Diff (pp) | 95% CI (pp) | p |",
        "|---|---|---|---|---|---|",
    ]
    for c in comps:
        if (c["a"], c["b"]) not in pairs:
            continue
        sig = " *" if c["ci_low"] > 0 or c["ci_high"] < 0 else ""
        ci = f"[{100 * c['ci_low']:+.1f}, {100 * c['ci_high']:+.1f}]"
        out.append(
            f"| {c['a']} vs {c['b']} | {c['slice']} | {c['metric']} | "
            f"{100 * c['mean_diff']:+.1f}{sig} | {ci} | {c['p_value']:.3f} |"
        )
    return out


def main() -> None:
    lines = ["# Generated tables (scripts/report_tables.py)", "", "## Test, all arms", ""]
    lines += qa_table("test_main")
    lines += ["## Test, paired bootstrap", ""]
    lines += comparison_table("test_main", [("F", "A"), ("D", "C"), ("E", "D"), ("F", "E")])
    lines += ["", "## Dev, all arms (tau_abstain 0.90)", ""]
    lines += qa_table("dev_main")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
