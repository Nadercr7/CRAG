import json

import numpy as np
import pytest

from vrag.config import PipelineConfig
from vrag.data.slices import Slice, _answer_pattern
from vrag.llm.client import Completion
from vrag.pipeline.calibrate import PlattCalibrator
from vrag.pipeline.pipeline import (
    PRESETS,
    ArmConfig,
    VerifiedRAG,
    export_prompts,
    load_outputs,
    make_arm,
)

CORPUS = {
    "g1": {
        "title": "Gold One",
        "text": "Gold One is a city. It is the capital of Zed. The weather is mild.",
        "sentences": ["Gold One is a city.", "It is the capital of Zed.", "The weather is mild."],
    },
    "g2": {
        "title": "Gold Two",
        "text": "Zed is led by Mayor Kim of Zed. Trees grow here.",
        "sentences": ["Zed is led by Mayor Kim of Zed.", "Trees grow here."],
    },
    **{
        f"n{i}": {
            "title": f"Noise {i}",
            "text": "Noise sentence a. Noise sentence b.",
            "sentences": ["Noise sentence a.", "Noise sentence b."],
        }
        for i in range(1, 8)
    },
}
NOISE = [f"n{i}" for i in range(1, 8)]
QUESTION = "Who leads the capital?"
REWRITTEN = "mayor of zed"


class FakeRetriever:
    """Fixed ranking per query; unknown queries get the noise list. Honors exclude_ids."""

    def __init__(self):
        self.calls = []

    def search(self, query, k, exclude_ids=None):
        self.calls.append((query, k, set(exclude_ids or ())))
        ids = {QUESTION: [*NOISE[:4], "g1", "g2", *NOISE[4:]], REWRITTEN: ["g2", "g1"]}.get(
            query, NOISE
        )
        ids = [i for i in ids if i not in (exclude_ids or ())]
        return [(i, 1.0 / n) for n, i in enumerate(ids[:k], start=1)]


class FakeVerifier:
    """Each occurrence of 'zed' is worth 6 logits, nothing is -3."""

    def __init__(self):
        self.calls = 0

    def score(self, query, passages):
        self.calls += 1
        return np.array([6.0 * p.lower().count("zed") - 3.0 for p in passages])


class FakeLLM:
    def __init__(self, queries=(REWRITTEN,)):
        self.queries = list(queries)
        self.calls = []

    def complete(self, messages, model=None, **kw):
        self.calls.append((messages, model))
        return Completion(json.dumps({"queries": self.queries}), model or "m")


class FakeSufficiency:
    def __init__(self, p):
        self.p = p

    def score(self, question, context):
        return self.p


def build(arm, *, queries=(REWRITTEN,), suff=0.9, retriever=None, **overrides):
    verifier, llm = FakeVerifier(), FakeLLM(queries)
    rag = VerifiedRAG(
        retriever or FakeRetriever(),
        verifier if arm != "A" else None,
        PlattCalibrator(),
        FakeSufficiency(suff),
        llm,
        CORPUS,
        make_arm(arm, PipelineConfig(), **overrides),
        rewrite_model="rewrite-model",
    )
    return rag, verifier, llm


def test_preset_table_matches_plan():
    flags = {
        name: (a.use_verifier, a.use_decision, a.refine, a.rewrite, a.sufficiency, a.two_thresholds)
        for name, a in ((n, make_arm(n, PipelineConfig())) for n in PRESETS)
    }
    assert flags == {
        "A": (False, False, False, False, False, True),
        "B": (True, False, False, False, False, True),
        "C": (True, True, False, False, False, True),
        "D": (True, True, True, False, False, True),
        "E": (True, True, True, True, False, True),
        "F": (True, True, True, True, True, True),
        "G": (True, True, True, True, True, False),
    }
    with pytest.raises(ValueError):
        make_arm("H", PipelineConfig())
    with pytest.raises(ValueError):
        ArmConfig(use_verifier=False, use_decision=True)
    with pytest.raises(ValueError):
        ArmConfig(refine=False, rewrite=True)


def test_arm_a_never_calls_the_verifier_or_the_llm():
    class Boom:
        def score(self, *a):
            raise AssertionError("verifier called")

    rag = VerifiedRAG(
        FakeRetriever(), Boom(), None, None, None, CORPUS, make_arm("A", PipelineConfig())
    )
    t = rag.prepare(QUESTION)
    assert t.decision is None and t.llm_calls == 0
    assert [c.id for c in t.chunks] == [*NOISE[:4], "g1"]  # plain top-5, retrieval order
    assert all(c.prob is None and c.verifier_logit is None for c in t.chunks)
    assert len(t.context) == 5 and t.context[0].startswith("[1] Noise 1: ")
    assert "verify" not in t.timings_ms and not t.abstain and t.prompt


def test_arm_b_reranks_without_decision_or_filter():
    rag, verifier, _ = build("B")
    t = rag.prepare(QUESTION)
    assert [cid for cid, _ in t.context_refs[:2]] == ["g2", "g1"]
    assert t.decision is None and t.final_decision is None
    assert len(t.context) == 5 and verifier.calls == 1  # noise fills the rest: no filtering
    assert t.context[0].startswith("[1] Gold Two: ")


def test_arm_c_filters_chunks_below_low_threshold_and_records_decision():
    rag, _, _ = build("C")
    t = rag.prepare(QUESTION)
    assert t.decision == "correct" and t.final_decision == "correct"
    assert {c.id for c in t.chunks if c.selected} == {"g1", "g2"}
    assert len(t.context) == 2 and t.sentences == []
    assert t.context_refs == [("g2", None), ("g1", None)]


def test_arm_d_refines_to_kept_sentences_in_order():
    rag, _, llm = build("D")
    t = rag.prepare(QUESTION)
    assert t.context == [
        "[1] Gold Two: Zed is led by Mayor Kim of Zed.",
        "[2] Gold One: It is the capital of Zed.",
    ]
    assert t.context_refs == [("g2", 0), ("g1", 1)]
    assert len(t.sentences) == 5 and sum(s.kept for s in t.sentences) == 2
    assert llm.calls == [] and t.llm_calls == 0


def test_arm_d_falls_back_to_chunks_when_nothing_passes_and_cannot_abstain():
    rag, _, _ = build("D", tau_keep=0.99999)
    t = rag.prepare(QUESTION)
    assert "fallback_unfiltered_chunks" in t.notes and t.final_decision == "incorrect"
    assert len(t.context) == 5 and t.prompt


def test_arm_e_rewrites_after_incorrect_decision_and_unions_chunks():
    retriever = FakeRetriever()
    # The first query only surfaces noise.
    retriever.search = lambda q, k, exclude_ids=None, _r=retriever.search: (
        [(i, 1.0) for i in NOISE[:5]] if q == QUESTION else _r(q, k, exclude_ids)
    )
    rag, _, llm = build("E", retriever=retriever)
    t = rag.prepare(QUESTION)
    assert t.decision == "incorrect" and t.final_decision == "correct"
    assert t.queries == [QUESTION, REWRITTEN] and t.llm_calls == 1
    assert {c.round for c in t.chunks} == {0, 1}
    assert [c.id for c in t.chunks if c.round == 1] == ["g2", "g1"]
    assert t.context[0] == "[1] Gold Two: Zed is led by Mayor Kim of Zed."
    assert llm.calls[0][1] == "rewrite-model" and "rewrite" in t.timings_ms


def test_rewrite_sees_evidence_when_decision_is_ambiguous():
    rag, _, llm = build("E", tau_hi=0.99999)
    t = rag.prepare(QUESTION)
    assert t.decision == "ambiguous" and len(t.queries) == 2
    prompt = llm.calls[0][0][0]["content"]
    assert "Gold Two: Zed is led by Mayor Kim of Zed." in prompt


def test_arm_e_correct_decision_skips_rewrite():
    rag, _, llm = build("E")
    t = rag.prepare(QUESTION)
    assert t.decision == "correct" and llm.calls == [] and t.queries == [QUESTION]


def test_arm_e_unusable_rewrite_is_recorded_and_pipeline_continues():
    rag, _, _ = build("E", queries=("   ",), tau_hi=0.99999)
    t = rag.prepare(QUESTION)
    assert t.queries == [QUESTION] and "rewrite produced no usable query" in t.notes
    assert t.llm_calls == 1 and t.context


def test_arm_f_abstains_on_low_sufficiency_but_keeps_prompt():
    rag, _, _ = build("F", suff=0.1)
    t = rag.prepare(QUESTION)
    assert t.abstain and t.abstain_reason == "insufficient_context" and t.sufficiency_prob == 0.1
    assert t.prompt  # kept so threshold sweeps can generate it later
    assert rag.answer(t, lambda m: pytest.fail("generated for an abstained trace")) is t


def test_arm_f_answers_when_sufficient():
    rag, _, _ = build("F", suff=0.9)
    t = rag.prepare(QUESTION)
    assert not t.abstain and t.sufficiency_prob == 0.9
    done = rag.answer(
        t,
        lambda m: (
            '{"answer": "Kim", "citations": [1, 7], "confidence": 0.8, "insufficient": false}'
        ),
    )
    assert (done.answer, done.citations, done.citations_dropped) == ("Kim", [1], [7])
    assert done.confidence == 0.8 and done.output_valid and done.llm_calls == 1
    assert "generate" in done.timings_ms and t.answer is None  # the input trace is untouched


def test_missing_slice_excludes_gold_and_arm_f_abstains_without_evidence():
    retriever = FakeRetriever()
    rag, _, _ = build("F", retriever=retriever, queries=("anything",))
    t = rag.prepare(QUESTION, Slice("missing", exclude_ids={"g1", "g2"}))
    assert all(call[2] == {"g1", "g2"} for call in retriever.calls)
    assert t.slice_kind == "missing" and not {"g1", "g2"} & {c.id for c in t.chunks}
    assert t.decision == "incorrect" and t.final_decision == "incorrect"
    assert t.abstain and t.abstain_reason == "no_evidence"
    assert t.context == [] and t.prompt == [] and t.sufficiency_prob is None


def test_misleading_slice_reaches_context_and_verifier_text():
    text = CORPUS["g2"]["text"]
    sl = Slice(
        "misleading",
        replace_text={"g2": _answer_pattern("Kim").sub(lambda _: "Lee", text)},
        original_answer="Kim",
        substitute="Lee",
    )
    rag, _, _ = build("D")
    t = rag.prepare(QUESTION, sl)
    assert t.context[0] == "[1] Gold Two: Zed is led by Mayor Lee of Zed."
    assert (
        "Kim" not in " ".join(t.context) and CORPUS["g2"]["text"].count("Kim") == 1
    )  # source intact


def test_arm_g_uses_a_single_threshold():
    rag, _, _ = build("G", tau_single=0.99, suff=0.9)
    t = rag.prepare(QUESTION)
    # g2 has prob ~1.0 (logit 9); g1 has prob ~0.95 (logit 3) and is filtered at 0.99.
    assert t.decision == "correct" and [c.id for c in t.chunks if c.selected] == ["g2"]
    rag, _, _ = build("G", tau_single=0.9999999, queries=("none",))
    t = rag.prepare(QUESTION)
    assert t.decision == "incorrect" and len(t.queries) == 2  # no ambiguous band: rewrite


def test_every_arm_runs_end_to_end_with_a_serializable_trace():
    for name in PRESETS:
        rag, _, _ = build(name)
        t = rag.answer(
            rag.prepare(QUESTION, qid="q1"), lambda m: '{"answer": "Kim", "citations": [1]}'
        )
        assert t.arm == name and t.answer == "Kim" and t.timings_ms["prepare"] >= 0
        assert t.timings_ms["retrieve"] >= 0
        from vrag.pipeline.types import Trace

        assert Trace.from_dict(json.loads(json.dumps(t.to_dict()))) == t


def test_batch_export_import_finalize(tmp_path):
    rag, _, _ = build("F", suff=0.9)
    ok = rag.prepare(QUESTION, qid="a")
    abstained = build("F", suff=0.1)[0].prepare(QUESTION, qid="b")
    path = tmp_path / "prompts.jsonl"
    assert export_prompts([ok, abstained], path) == 1
    assert export_prompts([ok, abstained], path, include_abstained=True) == 2
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    assert rows[0]["id"] == "a|F|-" and rows[0]["messages"] == ok.prompt
    out = tmp_path / "out.jsonl"
    out.write_text(
        json.dumps({"id": "a|F|-", "output": '{"answer": "Kim", "citations": [2]}'}) + "\n"
    )
    outputs = load_outputs(out)
    done = rag.finalize(ok, outputs[ok.key])
    assert done.answer == "Kim" and done.citations == [2]
    assert rag.finalize(abstained, None) is abstained
    bad = rag.finalize(ok, "garbage")
    assert bad.output_valid is False and bad.answer is None and any("parse" in n for n in bad.notes)
