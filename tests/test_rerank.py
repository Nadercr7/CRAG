import numpy as np
import pytest

from vrag.eval.retrieval_eval import evaluate
from vrag.verifier.base import rerank


class FakeVerifier:
    """Scores a passage by the number in its text."""

    def score(self, query, passages):
        return np.array([float(p) for p in passages])


HITS = [("a", 0.9), ("b", 0.8), ("c", 0.7), ("d", 0.6)]


def test_rerank_orders_by_verifier_and_replaces_scores():
    out = rerank(FakeVerifier(), "q", HITS, ["1", "4", "2", "3"], k=10)
    assert out == [("b", 4.0), ("d", 3.0), ("c", 2.0), ("a", 1.0)]


def test_rerank_truncates_to_k_and_handles_edges():
    texts = ["1", "4", "2", "3"]
    assert [d for d, _ in rerank(FakeVerifier(), "q", HITS, texts, k=2)] == ["b", "d"]
    assert rerank(FakeVerifier(), "q", HITS, texts, k=0) == []
    assert rerank(FakeVerifier(), "q", [], [], k=5) == []


def test_rerank_ties_keep_input_order_and_length_mismatch_raises():
    assert [d for d, _ in rerank(FakeVerifier(), "q", HITS, ["1"] * 4, k=3)] == ["a", "b", "c"]
    with pytest.raises(ValueError):
        rerank(FakeVerifier(), "q", HITS, ["1"], k=2)


def test_evaluate_per_query_option():
    qrels = {"q1": {"a": 1}, "q2": {"c": 1}}
    run = {"q1": [("a", 2.0), ("x", 1.0)], "q2": [("x", 2.0), ("c", 1.0)]}
    plain = evaluate(run, qrels, recall_ks=(1,))
    assert isinstance(plain, dict)
    metrics, per_query = evaluate(run, qrels, recall_ks=(1,), return_per_query=True)
    assert metrics == plain
    assert set(per_query) == set(plain)
    assert per_query["mrr"] == {"q1": 1.0, "q2": 0.5}
    assert per_query["recall@1"] == {"q1": 1.0, "q2": 0.0}
    for name, values in per_query.items():
        assert sum(values.values()) / 2 == pytest.approx(plain[name])
