import numpy as np
import pytest

from vrag.retrieval.base import top_k_hits
from vrag.retrieval.bm25 import BM25Index
from vrag.retrieval.dense import DenseIndex, default_query_prefix
from vrag.retrieval.hybrid import HybridRetriever, rrf_fuse

IDS = ["d0", "d1", "d2", "d3"]
TEXTS = [
    "cats purr and sleep on sofas",
    "dogs bark at the mailman",
    "the stock market fell sharply today",
    "cats and dogs are common pets",
]


def test_rrf_math():
    fused = dict(rrf_fuse([["a", "b", "c"], ["b", "a"]], rrf_k=60))
    assert fused["a"] == pytest.approx(1 / 61 + 1 / 62)
    assert fused["b"] == pytest.approx(1 / 62 + 1 / 61)
    assert fused["c"] == pytest.approx(1 / 63)


def test_rrf_order_and_tie_break():
    # a and b tie exactly; a appeared first so it wins. A doc in both lists beats singles.
    out = rrf_fuse([["a", "x"], ["b", "x"]])
    assert [d for d, _ in out] == ["x", "a", "b"]
    assert rrf_fuse([]) == []


def test_top_k_hits_mask_and_ties():
    scores = np.array([1.0, 3.0, 3.0, 2.0])
    assert [i for i, _ in top_k_hits(IDS, scores, 3)] == ["d1", "d2", "d3"]
    mask = np.array([False, True, False, False])
    assert [i for i, _ in top_k_hits(IDS, scores, 10, mask)] == ["d2", "d3", "d0"]
    assert top_k_hits(IDS, scores, 2, np.ones(4, dtype=bool)) == []


def test_bm25_exclude_ids_and_roundtrip(tmp_path):
    index = BM25Index.build(IDS, TEXTS)
    hits = [d for d, _ in index.search("cats", 5)]
    assert hits == ["d0", "d3"] or hits == ["d3", "d0"]
    assert [d for d, _ in index.search("cats", 5, exclude_ids={"d0"})] == ["d3"]
    assert index.search("", 5) == []

    index.save(tmp_path / "bm25")
    loaded = BM25Index.load(tmp_path / "bm25")
    assert loaded.search("cats", 5) == index.search("cats", 5)


class FakeDense(DenseIndex):
    """Dense index over hand-made vectors with a fixed query vector (no model download)."""

    def encode_queries(self, queries, batch_size=32):
        return np.tile(np.array([1.0, 0.0], dtype=np.float32), (len(queries), 1))


def make_dense():
    emb = np.array([[1, 0], [0.8, 0.6], [0, 1], [0.6, 0.8]], dtype=np.float32)
    return FakeDense(IDS, emb, "fake")


def test_dense_exclude_ids_and_roundtrip(tmp_path):
    index = make_dense()
    assert [d for d, _ in index.search("q", 3)] == ["d0", "d1", "d3"]
    assert [d for d, _ in index.search("q", 3, exclude_ids={"d0", "d1"})] == ["d3", "d2"]

    index.save(tmp_path / "dense")
    loaded = DenseIndex.load(tmp_path / "dense")
    assert loaded.ids == IDS and np.array_equal(loaded.embeddings, index.embeddings)
    assert loaded.query_prefix == ""


def test_query_prefix_defaults():
    assert default_query_prefix("BAAI/bge-small-en-v1.5").startswith("Represent this sentence")
    assert default_query_prefix("thenlper/gte-small") == ""


def test_hybrid_respects_exclude_ids():
    hybrid = HybridRetriever(BM25Index.build(IDS, TEXTS), make_dense(), first_stage_k=3)
    full = [d for d, _ in hybrid.search("cats", 4)]
    assert full[0] in {"d0", "d3"}
    out = [d for d, _ in hybrid.search("cats", 4, exclude_ids={"d0", "d3"})]
    assert "d0" not in out and "d3" not in out and out
