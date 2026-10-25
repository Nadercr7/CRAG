"""Data for the explainer, the slides and the speaker guide (docs/explain/data.js).

Every number those pages show comes from this file, and this file comes from results/ and
web/data/examples.json, so nothing on them is typed by hand.

    python scripts/build_explain_data.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "results"
OUT = ROOT / "docs" / "explain" / "data.js"

# Real dev traces shown as walk-throughs: (key, question prefix, slice).
SCENARIOS = [
    ("support", "Which documentary is the oldest", "supportive"),
    ("missing", "Are Guildford Cathedral", "missing"),
    ("fooled", "Which tendencies does a group like Uyoku", "misleading"),
    ("fail", "What town host an annual media finance", "misleading"),
    ("cost", "Which eight-time Academy Award nominee", "supportive"),
]
ARMS = "ABCDEFG"
SLICES = ("supportive", "missing", "misleading")


def words(lines: list[str]) -> int:
    return sum(len(x.split()) for x in lines)


def arm_a(a: dict) -> dict:
    sent = [c for c in a["chunks"] if c.get("selected")]
    return {
        "passages": [{"title": c["title"], "gold": bool(c.get("gold"))} for c in sent],
        "words_sent": words([c["text"] for c in sent]),
        "answer": a.get("answer"),
        "outcome": a.get("outcome"),
    }


def arm_f(f: dict) -> dict:
    chunks = sorted(f["chunks"], key=lambda c: -(c.get("prob") or 0))
    sents = f.get("sentences") or []
    return {
        "queries": f["queries"],
        "n_retrieved": len(f["chunks"]),
        "top": [
            {
                "title": c["title"],
                "prob": round(c["prob"], 3) if c.get("prob") is not None else None,
                "selected": bool(c.get("selected")),
                "gold": bool(c.get("gold")),
                "rewrite": c.get("round", 0) > 0,
            }
            for c in chunks[:8]
        ],
        "best_prob": round(chunks[0]["prob"], 3) if chunks and chunks[0].get("prob") else None,
        "decision": f.get("decision"),
        "final_decision": f.get("final_decision"),
        "sentences": [
            {
                "text": s["text"],
                "prob": round(s["prob"], 3),
                "kept": bool(s["kept"]),
                "gold": bool(s.get("gold")),
            }
            for s in sents
        ],
        "context": f.get("context") or [],
        "words_sent": words(f.get("context") or []),
        "sufficiency": round(f["sufficiency_prob"], 3)
        if f.get("sufficiency_prob") is not None
        else None,
        "abstain": bool(f.get("abstain")),
        "abstain_reason": f.get("abstain_reason"),
        "generator_insufficient": bool(f.get("insufficient")),
        "answer": f.get("answer"),
        "citations": f.get("citations") or [],
        "outcome": f.get("outcome"),
    }


def scenarios() -> dict:
    ex = json.loads((ROOT / "web" / "data" / "examples.json").read_text())
    out = {}
    for key, prefix, kind in SCENARIOS:
        e = next(
            x for x in ex["examples"] if x["question"].startswith(prefix) and x["slice"] == kind
        )
        out[key] = {
            "slice": kind,
            "question": e["question"],
            "gold": e["gold"],
            "planted": e.get("planted"),
            "A": arm_a(e["arms"]["A"]),
            "F": arm_f(e["arms"]["F"]),
        }
    return out


def qa(run: str) -> dict:
    m = json.loads((RES / "qa" / run / "metrics.json").read_text())
    keep = (
        "n",
        "correct",
        "abstain",
        "hallucinate",
        "planted",
        "coverage",
        "selective_accuracy",
        "context_tokens",
        "all_facts_in_context",
        "llm_calls_per_question",
    )
    agg = {a: {s: {k: m["aggregate"][a][s][k] for k in keep} for s in SLICES} for a in ARMS}
    comps = [
        {
            k: c[k]
            for k in ("a", "b", "slice", "metric", "mean_diff", "ci_low", "ci_high", "p_value")
        }
        for c in m["comparisons"]
    ]
    curves = {
        s: {
            "auc_normalized": c["auc_normalized"],
            "max_coverage": c["max_coverage"],
            # thin the step curve to at most ~120 points for drawing
            "points": [
                [
                    round(p["coverage"], 4),
                    round(p["selective_accuracy"], 4),
                    round(p["threshold"], 4),
                ]
                for p in c["points"][:: max(1, len(c["points"]) // 120)]
            ],
        }
        for s, c in m["risk_coverage"].items()
    }
    return {
        "n_traces": m["n_traces"],
        "tau_abstain": m["meta"]["tau_abstain"]["F"],
        "aggregate": agg,
        "comparisons": comps,
        "risk_coverage": curves,
    }


def beir() -> list[dict]:
    rows = []
    pat = re.compile(r"^\| (\w+) \| ([^|]+) \| ([\d.]+) \| ([\d.]+) \| ([\d.]+) \| ([\d.]+) \|$")
    for line in (RES / "retrieval" / "summary.md").read_text().splitlines():
        if m := pat.match(line.strip()):
            rows.append({"dataset": m[1], "method": m[2].strip(), "ndcg10": float(m[3])})
    return rows


def md_table(path: Path) -> list[list[str]]:
    out = []
    for line in path.read_text().splitlines():
        if line.startswith("|") and not line.startswith("|---"):
            out.append([c.strip().strip("*") for c in line.strip("|").split("|")])
    return out


def main() -> None:
    judge = json.loads((RES / "qa" / "test_main" / "judge.json").read_text())
    suff = md_table(RES / "tuning" / "sufficiency.md")[1:]
    wise = md_table(RES / "tuning" / "wise_ft.md")[1:]
    latency = md_table(RES / "latency.md")[1:]
    data = {
        "source": "generated by scripts/build_explain_data.py from results/ and examples.json",
        "thresholds": json.loads((ROOT / "web" / "data" / "examples.json").read_text())[
            "thresholds"
        ],
        "scenarios": scenarios(),
        "test": qa("test_main"),
        "dev": qa("dev_main"),
        "beir": beir(),
        "wise_ft": [
            {"alpha": r[0], "hotpot": float(r[1]), "nfcorpus": float(r[2]), "fiqa": float(r[3])}
            for r in wise
        ],
        "sufficiency_auc": [
            {
                "model": r[0],
                "missing_hop": float(r[1]),
                "no_evidence": float(r[2]),
                "pooled": float(r[3]),
            }
            for r in suff
        ],
        "latency_ms": [{"model": r[0], "passages": r[1], "sentences": r[2]} for r in latency],
        "judge": {
            k: judge[k]
            for k in (
                "n",
                "agreement",
                "kappa",
                "both_correct",
                "both_wrong",
                "judge_only_correct",
                "outcome_only_correct",
                "judge_model",
            )
        },
        "counts": {
            "pool_paragraphs": len(
                json.loads((ROOT / "data" / "indexes" / "hotpot" / "bm25" / "ids.json").read_text())
            ),
            "test_questions": 300,
            "dev_questions": 200,
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// "
        + data["source"]
        + "\nwindow.VRAG_DATA = "
        + json.dumps(data, ensure_ascii=False)
        + ";\n"
    )
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
