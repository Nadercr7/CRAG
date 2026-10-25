import json

import pytest

from vrag.data.slices import Slice
from vrag.eval import qa_eval as qa
from vrag.pipeline.types import Chunk, Trace


def test_normalize_squad_style_and_number_words():
    assert qa.normalize_answer("The Eiffel Tower!") == "eiffel tower"
    assert qa.normalize_answer("  An   apple, a day ") == "apple day"
    assert qa.normalize_answer("eight Tony Awards") == "8 tony awards"
    assert qa.normalize_answer("Twenty-one") == "21"
    assert qa.normalize_answer("twenty one pilots") == "21 pilots"
    assert qa.normalize_answer("thirty") == "30" and qa.normalize_answer("Ninety") == "90"
    assert qa.normalize_answer("zero") == "0" and qa.normalize_answer("nineteen") == "19"
    assert qa.normalize_answer("1,000") == "1000"
    assert qa.normalize_answer("Beyoncé") == "beyonce"
    assert qa.normalize_answer(None) == "" and qa.normalize_answer("the") == ""


def test_normalize_yes_no_only_for_whole_answers():
    for yes in ("Yes", "yeah.", "YEP", "True"):
        assert qa.normalize_answer(yes) == "yes"
    for no in ("No", "nope!", "False"):
        assert qa.normalize_answer(no) == "no"
    assert qa.normalize_answer("true story") == "true story"
    assert qa.exact_match("Yeah", "yes") == 1.0 and qa.exact_match("nope", "yes") == 0.0


def test_exact_match_and_f1():
    assert qa.exact_match("eight", "8") == 1.0
    assert qa.exact_match("The Beatles", "beatles") == 1.0
    assert qa.exact_match("Beatles band", "beatles") == 0.0
    assert qa.f1("Beatles band", "the beatles") == pytest.approx(2 * 0.5 * 1 / 1.5)
    assert qa.f1("abc", "xyz") == 0.0
    assert qa.f1("", "") == 1.0 and qa.f1(None, "x") == 0.0
    assert qa.f1("new york city", "new york") == pytest.approx(0.8)


def test_contains_is_token_based_and_needs_a_real_answer():
    assert qa.contains("He won eight Tony Awards", "8")
    assert qa.contains("Paris", "Paris, France")  # prediction inside gold
    assert qa.contains("It is Paris, France.", "Paris")  # gold inside prediction
    assert not qa.contains("Prometheus", "rome")
    assert not qa.contains("", "Paris") and not qa.contains(None, "Paris")
    assert not qa.contains("the", "the")  # normalizes to nothing
    assert not qa.contains("Unknown", "unknown")  # abstention
    assert not qa.contains("The context does not say", "context")
    assert qa.contains("Yes, both are American", "yes")


def make_trace(
    answer="Paris", *, abstain=False, insufficient=False, citations=(1,), dropped=(), arm="F"
):
    chunks = [
        Chunk(
            "c1",
            "France",
            "Paris is the capital. It is big.",
            ["Paris is the capital.", "It is big."],
        ),
        Chunk("c2", "Noise", "Nothing here.", ["Nothing here."]),
    ]
    return Trace(
        question="Capital of France?",
        slice_kind="supportive",
        arm=arm,
        qid="q1",
        chunks=chunks,
        context=["[1] France: Paris is the capital.", "[2] Noise: Nothing here."],
        context_refs=[("c1", 0), ("c2", 0)],
        abstain=abstain,
        insufficient=insufficient,
        answer=answer,
        citations=list(citations),
        citations_dropped=list(dropped),
        llm_calls=1,
    )


MISLEADING = Slice("misleading", original_answer="Paris", substitute="Lyon")


def test_outcome_categories():
    assert qa.outcome(make_trace("Paris"), "Paris") == "correct"
    assert qa.outcome(make_trace("The city of Paris"), "Paris") == "correct"  # containment
    assert qa.outcome(make_trace("Berlin"), "Paris") == "hallucinate"
    assert qa.outcome(make_trace("Paris", abstain=True), "Paris") == "abstain"
    assert qa.outcome(make_trace(None, insufficient=True), "Paris") == "abstain"
    assert qa.outcome(make_trace(""), "Paris") == "abstain"
    assert qa.outcome(make_trace(None), "Paris") == "abstain"
    assert qa.outcome(make_trace("Unknown"), "Paris") == "abstain"


def test_planted_only_on_misleading_slice_and_never_counted_as_correct():
    assert qa.outcome(make_trace("Lyon"), "Paris", MISLEADING) == "planted"
    assert qa.outcome(make_trace("lyon, france"), "Paris", MISLEADING) == "planted"
    assert qa.outcome(make_trace("Berlin"), "Paris", MISLEADING) == "hallucinate"
    assert qa.outcome(make_trace("Paris"), "Paris", MISLEADING) == "correct"
    assert qa.outcome(make_trace("Lyon"), "Paris", Slice("supportive")) == "hallucinate"
    assert qa.outcome(make_trace("Lyon"), "Paris") == "hallucinate"
    assert qa.outcome(make_trace("Lyon", abstain=True), "Paris", MISLEADING) == "abstain"
    assert qa.outcome(make_trace("Paris or Lyon"), "Paris", MISLEADING) == "planted"


FACTS = {("France", 0), ("France", 1)}


def test_citation_validity_and_support():
    t = make_trace(citations=(1, 2), dropped=(9,))
    s = qa.citation_stats(t, FACTS)
    assert s == {"cited": 3, "valid": 2, "supported": 1}  # line 2 is a distractor
    assert qa.citation_stats(make_trace(citations=()), FACTS) == {
        "cited": 0,
        "valid": 0,
        "supported": 0,
    }


def test_paragraph_level_line_supports_when_its_paragraph_holds_a_fact():
    t = make_trace()
    t.context_refs = [("c1", None), ("c2", None)]
    assert qa.citation_stats(t, FACTS)["supported"] == 1
    assert qa.facts_in_context(t, FACTS)


def test_context_stats_and_all_facts():
    t = make_trace()
    s = qa.context_stats(t, FACTS)
    assert s["context_lines"] == 2 and s["context_tokens"] == 9 + 6
    assert not s["all_facts"]  # sentence 1 of France is not in the context
    t.context_refs = [("c1", 0), ("c1", 1)]
    assert qa.context_stats(t, FACTS)["all_facts"]
    assert not qa.facts_in_context(make_trace(), set())


def record(outcome, arm="F", slice="supportive", qid="q", **kw):
    answered = outcome != "abstain"
    base = {
        "qid": qid, "arm": arm, "slice": slice, "outcome": outcome, "outcome_open": outcome,
        "answered": answered, "em": float(outcome == "correct") if answered else None,
        "f1": float(outcome == "correct") if answered else None,
        "contains": outcome == "correct" if answered else None,
        "answer": "x" if answered else None, "gold": "g", "context_lines": 2,
        "context_tokens": 20, "all_facts": outcome == "correct", "cite_cited": 2 if answered else 0,
        "cite_valid": 1 if answered else 0, "cite_supported": 1 if answered else 0,
        "llm_calls": 1, "sufficiency_prob": None,
    }  # fmt: skip
    return {**base, **kw}


def test_aggregate_rates_and_selective_metrics():
    rows = [
        record("correct", qid="1"),
        record("correct", qid="2"),
        record("hallucinate", qid="3"),
        record("planted", qid="4"),
        record("abstain", qid="5"),
    ]
    a = qa.aggregate(rows)
    assert a["n"] == 5 and a["correct"] == 0.4 and a["abstain"] == 0.2
    assert a["hallucinate"] == 0.2 and a["planted"] == 0.2
    assert a["coverage"] == 0.8 and a["selective_accuracy"] == pytest.approx(0.5)
    assert a["em"] == pytest.approx(0.5) and a["contains"] == pytest.approx(0.5)
    assert a["citation_validity"] == pytest.approx(0.5) and a["citation_support"] == 1.0
    assert a["context_lines"] == 2 and a["llm_calls_per_question"] == 1
    assert a["all_facts_in_context"] == pytest.approx(0.4)
    assert a["correct_without_facts"] == 0.0 and a["correct_without_gold"] is None


def test_correct_without_gold_on_the_missing_slice_only():
    rows = [
        record("correct", slice="missing", all_facts=False),
        record("abstain", slice="missing"),
        record("hallucinate", slice="missing"),
        record("abstain", slice="missing"),
    ]
    a = qa.aggregate(rows)
    assert a["correct_without_gold"] == 0.25 and a["correct_without_facts"] == 0.25
    assert a["abstain"] == 0.5


def test_aggregate_with_nothing_answered():
    a = qa.aggregate([record("abstain")])
    assert a["selective_accuracy"] is None and a["em"] is None and a["coverage"] == 0.0
    assert a["citation_validity"] is None


def test_aggregate_all_groups_by_arm_and_slice():
    rows = [record("correct", arm="A"), record("abstain", arm="F", slice="missing")]
    agg = qa.aggregate_all(rows)
    assert set(agg) == {"A", "F"} and set(agg["F"]) == {"missing"}


def test_paired_values_align_on_shared_questions():
    rows = [
        record("correct", arm="A", qid="1"), record("hallucinate", arm="A", qid="2"),
        record("correct", arm="F", qid="2"), record("correct", arm="F", qid="1"),
        record("correct", arm="F", qid="3"),
    ]  # fmt: skip
    qids, a, f = qa.paired_values(rows, "A", "F", "supportive", "correct")
    assert qids == ["1", "2"] and a == [1.0, 0.0] and f == [1.0, 1.0]
    assert qa.paired_values(rows, "A", "F", "supportive", "hallucinate")[1:] == (
        [0.0, 1.0],
        [0.0, 0.0],
    )


def test_apply_abstain_threshold_and_evaluate_trace():
    t = make_trace("Paris")
    t.sufficiency_prob = 0.4
    r = qa.evaluate_trace(t, "Paris", FACTS, None, tau_abstain=0.5)
    assert r["outcome"] == "abstain" and r["outcome_open"] == "correct"
    assert r["abstain_reason"] == "insufficient_context" and r["answered"] is False
    r = qa.evaluate_trace(t, "Paris", FACTS, None, tau_abstain=0.3)
    assert r["outcome"] == "correct" and r["em"] == 1.0 and r["cite_supported"] == 1
    r = qa.evaluate_trace(t, "Paris", FACTS)  # no threshold: the trace as given
    assert r["outcome"] == "correct" and r["context_lines"] == 2
    json.dumps(r)


def test_finalize_trace_parses_without_a_pipeline():
    t = make_trace(None)
    t.answer, t.citations = None, []
    out = qa.finalize_trace(t, '{"answer": "Paris", "citations": [1, 7], "insufficient": false}')
    assert out.answer == "Paris" and out.citations == [1] and out.citations_dropped == [7]
    assert qa.outcome(out, "paris") == "correct"
    assert qa.finalize_trace(t, '{"insufficient": true}').insufficient


def test_risk_coverage_curve_and_auc():
    probs = [0.9, 0.8, 0.7, 0.4, 0.3]
    outs = ["correct", "correct", "hallucinate", "hallucinate", "correct"]
    rows = [
        record(o, sufficiency_prob=p, qid=str(i))
        for i, (p, o) in enumerate(zip(probs, outs, strict=True))
    ]
    rows.append(record("abstain", qid="x"))  # no context: never answered
    rc = qa.risk_coverage(rows)
    pts = rc["points"]
    assert [p["answered"] for p in pts] == [1, 2, 3, 4, 5]
    assert [p["selective_accuracy"] for p in pts] == pytest.approx([1, 1, 2 / 3, 0.5, 0.6])
    assert pts[-1]["coverage"] == pytest.approx(5 / 6) and rc["max_coverage"] == pytest.approx(
        5 / 6
    )
    expected = (1 + 1 + 2 / 3 + 0.5 + 0.6) / 6  # step area, every point adds 1/6 of coverage
    assert rc["auc"] == pytest.approx(expected)
    assert rc["auc_normalized"] == pytest.approx(expected / (5 / 6))


def test_risk_coverage_groups_ties_and_handles_empty():
    rows = [
        record("correct", sufficiency_prob=0.5, qid="1"),
        record("hallucinate", sufficiency_prob=0.5, qid="2"),
    ]
    pts = qa.risk_coverage(rows)["points"]
    assert len(pts) == 1 and pts[0]["selective_accuracy"] == 0.5
    empty = qa.risk_coverage([record("abstain")])
    assert empty["points"] == [] and empty["auc"] == 0 and empty["auc_normalized"] is None


def test_perfect_ranking_beats_reversed_ranking():
    def curve(order):
        rows = [record(o, sufficiency_prob=1 - i / 10, qid=str(i)) for i, o in enumerate(order)]
        return qa.risk_coverage(rows)["auc"]

    good = ["correct"] * 3 + ["hallucinate"] * 3
    assert curve(good) > curve(good[::-1])


def test_judge_parsing_and_messages():
    assert qa.parse_verdict('{"correct": true, "reason": "same"}') is True
    assert qa.parse_verdict('```json\n{"correct": "False"}\n```') is False
    assert qa.parse_verdict('<think>hmm</think>{"correct": false}') is False
    assert qa.parse_verdict("no json") is None and qa.parse_verdict(None) is None
    assert qa.parse_verdict('{"correct": 3}') is None
    m = qa.judge_messages("Q?", "gold", "ans")
    assert m[0]["role"] == "system" and "Reference answer: gold" in m[1]["content"]


def test_stratified_sample_spreads_strata_and_dedupes():
    rows = []
    for i in range(30):
        rows.append(record("correct", qid=f"c{i}", answer=f"a{i}"))
    for i in range(3):
        rows.append(record("hallucinate", qid=f"h{i}", answer=f"b{i}"))
    rows.append(record("hallucinate", qid="h0", arm="A", answer="B0"))  # same answer, other arm
    rows.append(record("abstain", qid="z"))
    picked = qa.stratified_sample(rows, 6, seed=1)
    kinds = [r["outcome"] for r in picked]
    assert len(picked) == 6 and kinds.count("hallucinate") == 3 and kinds.count("correct") == 3
    assert len({(r["qid"], r["answer"]) for r in picked}) == 6
    assert qa.stratified_sample(rows, 6, seed=1) == picked
    assert len(qa.stratified_sample(rows, 500, seed=1)) == 33  # all unique answered ones


def test_judge_agreement_and_kappa():
    pairs = [(True, True)] * 6 + [(False, False)] * 2 + [(True, False)] + [(False, True)]
    a = qa.judge_agreement(pairs)
    assert a["n"] == 10 and a["agreement"] == pytest.approx(0.8)
    assert a["judge_only_correct"] == 1 and a["outcome_only_correct"] == 1
    p_e = (7 * 7 + 3 * 3) / 100
    assert a["kappa"] == pytest.approx((0.8 - p_e) / (1 - p_e))
    assert qa.judge_agreement([])["agreement"] is None
    assert qa.judge_agreement([(True, True)] * 3)["kappa"] is None  # no variation


def test_containment_guards():
    from vrag.eval.qa_eval import contains

    assert contains(
        "University of Pennsylvania", "Wharton School of the University of Pennsylvania"
    )
    assert not contains("Tony", "eight Tony Awards")
    assert contains("He was born in Paris", "Paris")
    long = "the film was released by a studio that was based in Paris at the time of its release"
    assert not contains(long, "Paris")
