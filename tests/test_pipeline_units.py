import json

import numpy as np
import pytest

from vrag.data.slices import Slice, _answer_pattern
from vrag.pipeline.answer import build_messages, parse_answer
from vrag.pipeline.calibrate import PlattCalibrator
from vrag.pipeline.decide import decide, decide_single
from vrag.pipeline.pipeline import apply_slice
from vrag.pipeline.refine import kept, refine
from vrag.pipeline.rewrite import build_messages as rewrite_messages
from vrag.pipeline.rewrite import parse_queries
from vrag.pipeline.sufficiency import (
    CrossEncoderSufficiency,
    NullSufficiency,
    abstain_decision,
)
from vrag.pipeline.types import Chunk, SentenceScore, Trace
from vrag.verifier.train_data import sentence_text

# ---------------------------------------------------------------- decide


def test_decide_boundaries():
    assert decide([0.7, 0.1], 0.7, 0.2) == "correct"  # max >= tau_hi
    assert decide([0.699, 0.1], 0.7, 0.2) == "ambiguous"
    assert decide([0.2], 0.7, 0.2) == "ambiguous"  # max == tau_lo is not below it
    assert decide([0.199, 0.0], 0.7, 0.2) == "incorrect"
    assert decide([], 0.7, 0.2) == "incorrect"


def test_decide_rejects_inverted_thresholds():
    with pytest.raises(ValueError):
        decide([0.5], 0.2, 0.7)


def test_decide_single_has_no_ambiguous_band():
    assert decide_single([0.5], 0.5) == "correct"
    assert decide_single([0.49], 0.5) == "incorrect"
    assert decide_single([], 0.5) == "incorrect"


# ------------------------------------------------------------- calibrate


def test_platt_recovers_known_parameters():
    rng = np.random.default_rng(0)
    x = rng.normal(0, 3, 30000)
    y = (rng.random(30000) < 1 / (1 + np.exp(-(2.0 * x - 1.0)))).astype(int)
    cal = PlattCalibrator.fit(x, y)
    assert cal.a == pytest.approx(2.0, abs=0.1)
    assert cal.b == pytest.approx(-1.0, abs=0.1)


def test_platt_is_deterministic_and_finite_on_separable_data():
    x = np.array([-3.0, -2.0, -1.0, 1.0, 2.0, 3.0])
    y = np.array([0, 0, 0, 1, 1, 1])
    a, b = PlattCalibrator.fit(x, y), PlattCalibrator.fit(x, y)
    assert a == b
    assert np.isfinite([a.a, a.b]).all() and a.a > 0


def test_platt_identity_default_save_load(tmp_path):
    cal = PlattCalibrator()
    assert cal.is_identity
    assert cal([0.0, 2.0]) == pytest.approx(1 / (1 + np.exp(-np.array([0.0, 2.0]))))
    fitted = PlattCalibrator(1.5, -0.25)
    fitted.save(tmp_path / "sub" / "cal.json")
    assert PlattCalibrator.load(tmp_path / "sub" / "cal.json") == fitted
    assert not fitted.is_identity


def test_platt_handles_extreme_logits_and_bad_input():
    assert PlattCalibrator()([-1000.0, 1000.0]) == pytest.approx([0.0, 1.0])
    with pytest.raises(ValueError):
        PlattCalibrator.fit([1.0, 2.0], [1, 2])
    with pytest.raises(ValueError):
        PlattCalibrator.fit([1.0], [1, 0])


# ---------------------------------------------------------------- refine


class TableVerifier:
    """Logit by sentence text lookup; counts scored passages."""

    def __init__(self, table):
        self.table = table
        self.scored = 0

    def score(self, query, passages):
        self.scored += len(passages)
        return np.array([self.table.get(p, -10.0) for p in passages])


def _chunk(cid, title, sentences, prob):
    return Chunk(cid, title, " ".join(sentences), list(sentences), prob=prob)


def _identity_cal():
    return PlattCalibrator()


def test_refine_orders_chunks_by_prob_and_sentences_by_position():
    lo = _chunk("lo", "Lo", ["l0.", "l1."], prob=0.4)
    hi = _chunk("hi", "Hi", ["h0.", "h1.", "h2."], prob=0.9)
    table = {sentence_text("Hi", "h2."): 5, sentence_text("Hi", "h0."): 3}
    table[sentence_text("Lo", "l1.")] = 4
    out = refine("q", [lo, hi], TableVerifier(table), _identity_cal(), 0.5, 10)
    assert [(s.chunk_id, s.index) for s in kept(out)] == [("hi", 0), ("hi", 2), ("lo", 1)]
    assert all(
        not s.kept for s in out if (s.chunk_id, s.index) not in {("hi", 0), ("hi", 2), ("lo", 1)}
    )


def test_refine_cap_drops_lowest_probabilities_but_keeps_presentation_order():
    c = _chunk("c", "C", ["a.", "b.", "c.", "d."], prob=0.9)
    table = {sentence_text("C", s): v for s, v in {"a.": 1, "b.": 4, "c.": 2, "d.": 3}.items()}
    out = refine("q", [c], TableVerifier(table), _identity_cal(), 0.5, 2)
    assert [s.index for s in kept(out)] == [1, 3]  # the two best, in sentence order
    assert len(out) == 4  # dropped sentences stay in the record


def test_refine_nothing_passes_gives_empty_kept():
    c = _chunk("c", "C", ["a.", "b."], prob=0.9)
    out = refine("q", [c], TableVerifier({}), _identity_cal(), 0.3, 5)
    assert kept(out) == [] and len(out) == 2


def test_refine_splits_text_when_chunk_has_no_sentences_and_uses_memo():
    c = Chunk("c", "C", "First one. Second one.", prob=0.9)
    verifier = TableVerifier({sentence_text("C", "Second one."): 3})
    memo: dict = {}
    out = refine("q", [c], verifier, _identity_cal(), 0.5, 5, memo)
    assert [s.text for s in kept(out)] == ["Second one."]
    assert verifier.scored == 2
    refine("q", [c], verifier, _identity_cal(), 0.5, 5, memo)
    assert verifier.scored == 2  # nothing rescored


# ----------------------------------------------------------------- slices


def test_slice_replacement_is_applied_per_sentence_with_whole_words():
    sentences = ["Paris is big.", "The Parisian cafe is in Paris.", "No city here."]
    text = " ".join(sentences)
    pattern = _answer_pattern("Paris")
    sl = Slice(
        "misleading",
        replace_text={"c": pattern.sub(lambda _: "Rome", text)},
        original_answer="Paris",
        substitute="Rome",
    )
    chunk = Chunk("c", "Paris", text, list(sentences))
    apply_slice(chunk, sl)
    assert chunk.sentences == ["Rome is big.", "The Parisian cafe is in Rome.", "No city here."]
    assert chunk.text == "Rome is big. The Parisian cafe is in Rome. No city here."
    assert chunk.title == "Paris"
    other = Chunk("other", "T", "Paris.", ["Paris."])
    apply_slice(other, sl)
    assert other.sentences == ["Paris."]  # ids without an override are untouched
    apply_slice(other, None)


def test_slice_replacement_without_original_answer_resplits_text():
    chunk = Chunk("c", "T", "Old. Text.", ["Old.", "Text."])
    apply_slice(chunk, Slice("misleading", replace_text={"c": "New one. Two."}))
    assert chunk.sentences == ["New one.", "Two."]


# ----------------------------------------------------------------- answer


def test_parse_answer_valid_and_drops_out_of_range_citations():
    raw = (
        '{"answer": "Kim", "citations": [2, 9, 0, 2, "1", true],'
        ' "confidence": 1.7, "insufficient": false}'
    )
    p = parse_answer(raw, 3)
    assert (p.valid, p.answer, p.citations, p.dropped) == (True, "Kim", [2, 1], [9, 0])
    assert p.confidence == 1.0 and not p.insufficient


def test_parse_answer_tolerates_fences_prose_and_think_blocks():
    raw = '<think>{"x": 1}</think>Sure!\n```json\n{"answer": 1998, "citations": [1]}\n```'
    p = parse_answer(raw, 2)
    assert p.valid and p.answer == "1998" and p.citations == [1] and p.confidence is None


@pytest.mark.parametrize("raw", [None, "", "no json here", "{broken", "[1, 2]", '{"answer": ""}'])
def test_parse_answer_marks_bad_output_invalid(raw):
    p = parse_answer(raw, 3)
    assert not p.valid and p.answer is None and p.error


def test_parse_answer_insufficient_flag():
    p = parse_answer('{"answer": "maybe", "citations": [1], "insufficient": true}', 2)
    assert p.valid and p.insufficient and p.answer is None
    assert parse_answer('{"insufficient": "true"}', 2).insufficient


def test_answer_prompt_is_short_and_numbered():
    msgs = build_messages("Who?", ["[1] A: x.", "[2] B: y."])
    assert [m["role"] for m in msgs] == ["system", "user"]
    assert "[1] A: x.\n[2] B: y." in msgs[1]["content"] and "Who?" in msgs[1]["content"]
    assert sum(len(m["content"]) for m in msgs) < 800


# ---------------------------------------------------------------- rewrite


def test_parse_queries_variants():
    q = "Who is mayor of Zed?"
    assert parse_queries('{"queries": ["a b", "c d", "e f"]}', q, 2) == ["a b", "c d"]
    assert parse_queries('```json\n{"query": "mayor zed"}\n```', q) == ["mayor zed"]
    assert parse_queries({"queries": [q, "who is MAYOR of zed", "  ", 3, "x y", "x y"]}, q) == [
        "x y"
    ]
    assert parse_queries("not json", q) == []
    assert parse_queries('{"queries": "oops"}', q) == ["oops"]
    assert parse_queries("[1]", q) == []


def test_rewrite_prompt_includes_evidence_and_says_corpus():
    content = rewrite_messages("Q?", ["T: fact one"], 2)[0]["content"]
    assert "T: fact one" in content and "passage corpus" in content and "multi-hop" in content
    assert "(none)" in rewrite_messages("Q?", [], 2)[0]["content"]


# ------------------------------------------------------------ sufficiency


def test_abstain_decision_reasons():
    assert abstain_decision(0.9, 0.5) == (False, None)
    assert abstain_decision(0.5, 0.5) == (False, None)
    assert abstain_decision(0.49, 0.5) == (True, "insufficient_context")
    assert abstain_decision(1.0, 0.5, has_context=False) == (True, "no_evidence")
    assert abstain_decision(None, 0.5) == (False, None)
    assert NullSufficiency().score("q", "c") == 1.0


def test_cross_encoder_sufficiency_applies_sigmoid_without_downloading():
    class FakeCE:
        def predict(self, pairs, **kw):
            assert pairs == [("q", "ctx")]
            return np.array([[0.0]])

    suf = CrossEncoderSufficiency("unused")
    suf._model = FakeCE()
    assert suf.score("q", "ctx") == pytest.approx(0.5)


# ------------------------------------------------------------------ trace


def test_trace_json_round_trip():
    t = Trace(
        question="q?",
        slice_kind="missing",
        arm="F",
        qid="x1",
        queries=["q?", "r"],
        decision="ambiguous",
        chunks=[Chunk("c", "T", "txt", ["txt"], 1, 0.5, -1.0, 0.27, round=1, selected=True)],
        sentences=[SentenceScore("c", 0, "txt", 0.9, True)],
        context=["[1] T: txt"],
        context_refs=[("c", 0), ("d", None)],
        sufficiency_prob=0.8,
        abstain=True,
        abstain_reason="insufficient_context",
        prompt=[{"role": "user", "content": "hi"}],
        timings_ms={"retrieve": 1.5},
        llm_calls=1,
    )
    again = Trace.from_dict(json.loads(json.dumps(t.to_dict())))
    assert again == t
    assert again.key == "x1|F|missing"
