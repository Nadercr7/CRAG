import pytest

from vrag.eval.retrieval_eval import evaluate, metric_names

QRELS = {"q1": {"a": 1, "b": 1}, "q2": {"c": 2}}


def test_metrics_on_toy_run():
    run = {
        "q1": [("x", 3.0), ("a", 2.0), ("b", 1.0)],
        "q2": [("c", 5.0), ("y", 1.0)],
    }
    m = evaluate(run, QRELS, ndcg_k=10, recall_ks=(1, 3))
    assert m["recall@1"] == pytest.approx((0 + 1) / 2)
    assert m["recall@3"] == pytest.approx(1.0)
    assert m["mrr"] == pytest.approx((1 / 2 + 1) / 2)
    dcg = 1 / 1.5849625 + 1 / 2  # q1: a at rank 2, b at rank 3
    idcg = 1 + 1 / 1.5849625
    assert m["ndcg@10"] == pytest.approx((dcg / idcg + 1) / 2, abs=1e-4)


def test_missing_query_scores_zero_and_names():
    m = evaluate({"q2": [("c", 1.0)]}, QRELS, recall_ks=(20,))
    assert m["recall@20"] == pytest.approx(0.5)
    assert metric_names(10, (20, 100)) == ["ndcg@10", "recall@20", "recall@100", "mrr"]


def test_drops_hits_identical_to_query_id():
    qrels = {"q1": {"a": 1}}
    run = {"q1": [("q1", 9.0), ("a", 1.0)]}
    assert evaluate(run, qrels, recall_ks=(1,))["recall@1"] == 1.0
    assert evaluate(run, qrels, recall_ks=(1,), ignore_identical_ids=False)["recall@1"] == 0.0
