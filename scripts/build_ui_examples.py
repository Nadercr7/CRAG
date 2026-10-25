"""Build ``web/data/examples.json``: curated real traces for the UI, without the 600 MB data dir.

    build_ui_examples.py [--run dev_main] [--outputs <outputs.jsonl>] [--per-slice 8]

Joins the prepared traces (data/eval/<run>/traces.jsonl) with the generator outputs and the
outcomes in results/qa/<run>/per_question.jsonl. Every example holds the same question under
arm A (plain RAG) and arm F (full system). Picks are seeded and cover good and bad cases:
F better than A, F worse than A, both right, both wrong, per slice. The abstain threshold is
the one the run was finalized with (``metrics.json``), so outcomes match the results page.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from run_qa_eval import load_run, raw_outputs, read_jsonl

from vrag.config import REPO_ROOT, load_config
from vrag.eval import qa_eval as qa
from vrag.pipeline.types import Trace

UTILITY = {"correct": 1, "abstain": 0, "hallucinate": -1, "planted": -1}
TEXT_LIMIT = 420  # characters kept of a retrieved passage that did not reach the context
ARMS = ("A", "F")
SEED = 7


def slim_trace(trace: Trace, rec: dict[str, Any], facts: set[tuple[str, int]]) -> dict[str, Any]:
    """The trace as the UI needs it: no prompt, passages shortened unless they were used.

    Timings are left out on purpose: the eval run memoizes retrieval and verifier calls across
    arms, so they do not measure a real request.
    """
    chunks = []
    titles = {c.id: c.title for c in trace.chunks}
    for c in trace.chunks:
        used = c.selected
        text = c.text if used or len(c.text) <= TEXT_LIMIT else c.text[:TEXT_LIMIT].rstrip() + "..."
        chunks.append(
            {
                "id": c.id,
                "title": c.title,
                "text": text,
                "retrieval_rank": c.retrieval_rank,
                "prob": c.prob,
                "round": c.round,
                "selected": c.selected,
                "gold": any(t == c.title for t, _ in facts),
            }
        )
    return {
        "arm": trace.arm,
        "queries": trace.queries,
        "decision": trace.decision,
        "final_decision": trace.final_decision,
        "chunks": chunks,
        "sentences": [
            {
                "chunk_id": s.chunk_id,
                "index": s.index,
                "text": s.text,
                "prob": s.prob,
                "gold": qa.line_is_supporting(titles.get(s.chunk_id, ""), s.index, facts),
                "kept": s.kept,
            }
            for s in trace.sentences
        ],
        "context": trace.context,
        "context_refs": [list(r) for r in trace.context_refs],
        "context_gold": [
            qa.line_is_supporting(titles.get(cid, ""), sent, facts)
            for cid, sent in trace.context_refs
        ],
        "sufficiency_prob": trace.sufficiency_prob,
        "abstain": trace.abstain,
        "abstain_reason": trace.abstain_reason,
        "answer": trace.answer,
        "citations": trace.citations,
        "citations_dropped": trace.citations_dropped,
        "confidence": trace.confidence,
        "insufficient": trace.insufficient,
        "notes": trace.notes,
        "llm_calls": trace.llm_calls,
        "outcome": rec["outcome"],
        "em": rec["em"],
        "f1": rec["f1"],
    }


def tag_of(a: str, f: str) -> str:
    d = UTILITY[f] - UTILITY[a]
    return "better" if d > 0 else "worse" if d < 0 else "same"


# (slice, predicate(A outcome, F outcome), how many, short title)
WANTS = [
    ("supportive", lambda a, f: f == "correct" and a != "correct", 2, "F answers, A does not"),
    ("supportive", lambda a, f: a == "correct" and f == "abstain", 2, "F abstains, A was right"),
    (
        "supportive",
        lambda a, f: a == "correct" and f == "hallucinate",
        1,
        "F is wrong, A was right",
    ),
    ("supportive", lambda a, f: a == "correct" and f == "correct", 1, "Both right"),
    ("supportive", lambda a, f: f == "hallucinate" and a != "correct", 1, "Both wrong"),
    ("supportive", lambda a, f: f == "abstain" and a != "correct", 1, "Both fail to answer"),
    (
        "missing",
        lambda a, f: f == "abstain" and a == "hallucinate",
        2,
        "F abstains, A guessed wrong",
    ),
    ("missing", lambda a, f: f == "abstain" and a == "correct", 1, "A was right without gold"),
    ("missing", lambda a, f: f == "hallucinate", 2, "F guesses wrong"),
    ("missing", lambda a, f: f == "abstain" and a == "abstain", 1, "Both abstain"),
    ("missing", lambda a, f: f == "correct", 1, "F is right without gold"),
    ("misleading", lambda a, f: f == "planted", 2, "F repeats the planted answer"),
    ("misleading", lambda a, f: f == "abstain" and a == "planted", 2, "F abstains, A is fooled"),
    ("misleading", lambda a, f: f == "abstain" and a == "abstain", 1, "Both abstain"),
    ("misleading", lambda a, f: f == "correct", 1, "F resists the swap"),
    ("misleading", lambda a, f: f == "hallucinate" and a != "planted", 1, "F answers wrongly"),
]


def pick(
    pairs: dict[tuple[str, str], dict[str, Any]], per_slice: int
) -> list[tuple[str, str, str]]:
    """(qid, slice, title) picks; seeded, no question twice, F with a rewrite preferred first."""
    rng = random.Random(SEED)
    used: set[tuple[str, str]] = set()
    out: list[tuple[str, str, str]] = []
    counts: Counter[str] = Counter()
    for kind, pred, k, title in WANTS:
        pool = sorted(
            key
            for key, p in pairs.items()
            if key[1] == kind
            and key not in used
            and "A" in p
            and "F" in p
            and pred(p["A"]["outcome"], p["F"]["outcome"])
        )
        rewrites = [key for key in pool if len(pairs[key]["F"]["trace"].queries) > 1]
        rng.shuffle(pool)
        rng.shuffle(rewrites)
        ordered = rewrites[:1] + [x for x in pool if x not in rewrites[:1]]
        for key in ordered[:k]:
            if counts[kind] >= per_slice:
                break
            used.add(key)
            counts[kind] += 1
            out.append((key[0], kind, title))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run", default="dev_main")
    ap.add_argument("--outputs", default=None, help="generator outputs.jsonl for the run")
    ap.add_argument("--per-slice", type=int, default=9)
    ap.add_argument("--out", default=str(REPO_ROOT / "web" / "data" / "examples.json"))
    args = ap.parse_args()

    cfg = load_config()
    run = REPO_ROOT / "data" / "eval" / args.run
    outputs = Path(
        args.outputs
        or REPO_ROOT / f"data/kaggle/vrag-gen-answers-{args.run.split('_')[0]}/output/outputs.jsonl"
    )
    meta, golds, traces = load_run(run)
    raw = raw_outputs(run, outputs)
    metrics = json.loads((cfg.paths.results_dir / "qa" / args.run / "metrics.json").read_text())
    tau = metrics["meta"]["tau_abstain"]["F"]
    per_q = {
        (r["qid"], r["arm"], r["slice"]): r
        for r in read_jsonl(cfg.paths.results_dir / "qa" / args.run / "per_question.jsonl")
    }

    pairs: dict[tuple[str, str], dict[str, Any]] = {}
    for t in traces:
        if t.arm not in ARMS:
            continue
        rec = per_q[(t.qid, t.arm, t.slice_kind)]
        done = qa.finalize_trace(t, raw.get(t.key))
        if t.arm == "F":
            done = qa.apply_abstain_threshold(done, tau)
        pairs.setdefault((t.qid, t.slice_kind), {})[t.arm] = {
            "trace": done,
            "outcome": rec["outcome"],
            "rec": rec,
        }

    examples = []
    for qid, kind, title in pick(pairs, args.per_slice):
        gold = golds[qid]
        facts = {(a, b) for a, b in gold["facts"]}
        info = gold["slices"].get(kind) or {}
        arms = {
            a: slim_trace(pairs[(qid, kind)][a]["trace"], pairs[(qid, kind)][a]["rec"], facts)
            for a in ARMS
        }
        examples.append(
            {
                "id": f"{qid}:{kind}",
                "qid": qid,
                "slice": kind,
                "question": gold["question"],
                "gold": gold["answer"],
                "type": gold["type"],
                "level": gold["level"],
                "planted": info.get("substitute") if kind == "misleading" else None,
                "title": title,
                "verdict": tag_of(arms["A"]["outcome"], arms["F"]["outcome"]),
                "arms": arms,
            }
        )
    order = {"better": 0, "same": 1, "worse": 2}
    kinds = {"supportive": 0, "missing": 1, "misleading": 2}
    examples.sort(key=lambda e: (kinds[e["slice"]], order[e["verdict"]]))

    # Thresholds shown by the UI: the tuned overlay, not default.toml.
    tuned = load_config(overlay=REPO_ROOT / "configs" / "tuned.toml").pipeline
    doc = {
        "run": args.run,
        "split": meta["split"],
        "generated": meta["generated"],
        "thresholds": {
            "tau_hi": tuned.tau_hi,
            "tau_lo": tuned.tau_lo,
            "tau_keep": tuned.tau_keep,
            "tau_chunk": tuned.tau_chunk,
            "tau_abstain": tau,
        },
        "note": "Real traces from the dev split; arm F abstain threshold as finalized in the run.",
        "examples": examples,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    c = Counter((e["slice"], e["verdict"]) for e in examples)
    print(f"{len(examples)} examples, {out.stat().st_size / 1024:.0f} KB -> {out}")
    for k, n in sorted(c.items()):
        print(" ", k, n)


if __name__ == "__main__":
    main()
