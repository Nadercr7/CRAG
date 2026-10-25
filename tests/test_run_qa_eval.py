import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import run_qa_eval as rq

from vrag.pipeline.types import Trace


def test_parse_arms():
    assert rq.parse_arms(["A..G"]) == list("ABCDEFG")
    assert rq.parse_arms(["A", "C,F", "A"]) == ["A", "C", "F"]
    assert rq.parse_arms(["B..D", "G"]) == ["B", "C", "D", "G"]
    with pytest.raises(SystemExit):
        rq.parse_arms(["A..H"])


def trace(arm, prompt, qid="q1", slice_kind="supportive"):
    t = Trace(question="Q?", arm=arm, qid=qid, slice_kind=slice_kind)
    t.prompt = [{"role": "user", "content": prompt}] if prompt else []
    return t


def test_prompts_are_deduped_and_mapped(tmp_path):
    traces = [
        trace("A", "ctx one"),
        trace("C", "ctx one"),  # same prompt as A
        trace("D", "ctx two"),
        trace("F", "ctx two"),
        trace("F", "", qid="q2"),  # no prompt: not exported
    ]
    with_prompt, unique = rq.write_prompts(tmp_path, traces)
    assert (with_prompt, unique) == (4, 2)
    rows = [
        json.loads(line) for line in (tmp_path / "prompts.jsonl").read_text().split("\n") if line
    ]
    assert [r["id"] for r in rows] == ["q1|A|supportive", "q1|D|supportive"]
    mapping = json.loads((tmp_path / "prompt_map.json").read_text())
    assert sorted(map(sorted, mapping.values())) == [
        ["q1|A|supportive", "q1|C|supportive"],
        ["q1|D|supportive", "q1|F|supportive"],
    ]
    # An output for the first key of a group serves every trace of the group.
    outputs = tmp_path / "out.jsonl"
    outputs.write_text(json.dumps({"id": "q1|A|supportive", "output": "X"}) + "\n")
    assert rq.raw_outputs(tmp_path, outputs) == {"q1|A|supportive": "X", "q1|C|supportive": "X"}


def test_prompt_hash_depends_on_messages_only():
    m = [{"role": "user", "content": "x"}]
    assert (
        rq.prompt_hash(m)
        == rq.prompt_hash([dict(m[0])])
        != rq.prompt_hash([{"role": "user", "content": "y"}])
    )


def test_check_resume_rejects_changed_arm_settings():
    old = {
        "split": "dev",
        "overlay_sha": "a",
        "sufficiency": None,
        "arm_configs": {"C": {"tau_hi": 0.6}},
    }
    rq.check_resume(old, {**old, "arm_configs": {"C": {"tau_hi": 0.6}, "D": {}}})
    with pytest.raises(SystemExit):
        rq.check_resume(old, {**old, "arm_configs": {"C": {"tau_hi": 0.7}}})
    with pytest.raises(SystemExit):
        rq.check_resume(old, {**old, "split": "test"})


def test_summary_renders_from_records():
    from vrag.eval import qa_eval as qa

    def rec(arm, slice_, outcome, qid, prob=0.5):
        answered = outcome != "abstain"
        return {
            "qid": qid, "arm": arm, "slice": slice_, "outcome": outcome, "outcome_open": outcome,
            "answered": answered, "em": 1.0 if outcome == "correct" else 0.0 if answered else None,
            "f1": 1.0 if outcome == "correct" else 0.0 if answered else None,
            "contains": outcome == "correct" if answered else None, "answer": "a", "gold": "g",
            "context_lines": 3, "context_tokens": 30, "all_facts": True, "cite_cited": 1,
            "cite_valid": 1, "cite_supported": 1, "llm_calls": 0, "sufficiency_prob": prob,
        }  # fmt: skip

    records = [
        rec(arm, kind, o, f"q{i}", prob=0.1 * i)
        for arm, outs in (("A", ["hallucinate", "correct", "correct"]), ("F", ["correct"] * 3))
        for kind in ("supportive", "misleading")
        for i, o in enumerate(outs)
    ]
    comps = rq.comparison_rows(records)
    assert {(c["a"], c["b"]) for c in comps} == {("F", "A")}
    assert {c["metric"] for c in comps if c["slice"] == "misleading"} == {
        "correct", "hallucinate", "planted",
    }  # fmt: skip
    meta = {"split": "dev", "generated": "t", "verifier": "v", "offshelf": "o", "overlay": None,
            "overlay_sha": None, "tau_abstain": {"F": 0.5}, "sufficiency": "x"}  # fmt: skip
    text = rq.render_summary(
        "r",
        meta,
        qa.aggregate_all(records),
        comps,
        rq.rc_curves(records),
        0,
        "no png",
        {"supportive": 3},
    )
    assert "## supportive" in text and "F vs A" in text and "Risk-coverage" in text
    assert "no png" in text and "| F | 3 |" in text
