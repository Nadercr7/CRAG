"""Hybrid retrieval: Reciprocal Rank Fusion of BM25 and dense rankings."""

from __future__ import annotations

from collections.abc import Collection, Sequence

from vrag.retrieval.base import Hit, Retriever


def rrf_fuse(rankings: Sequence[Sequence[str]], rrf_k: int = 60) -> list[Hit]:
    """Fuse ranked id lists: score(d) = sum over lists of 1 / (rrf_k + rank), rank from 1.

    Ties break by first appearance across the input lists, so output is deterministic.
    """
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking, start=1):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (rrf_k + rank)
    order = {doc_id: n for n, doc_id in enumerate(scores)}
    return sorted(scores.items(), key=lambda kv: (-kv[1], order[kv[0]]))


class HybridRetriever:
    def __init__(
        self, bm25: Retriever, dense: Retriever, first_stage_k: int = 100, rrf_k: int = 60
    ):
        self.bm25 = bm25
        self.dense = dense
        self.first_stage_k = first_stage_k
        self.rrf_k = rrf_k

    def search(self, query: str, k: int, exclude_ids: Collection[str] | None = None) -> list[Hit]:
        rankings = [
            [d for d, _ in r.search(query, self.first_stage_k, exclude_ids)]
            for r in (self.bm25, self.dense)
        ]
        return rrf_fuse(rankings, self.rrf_k)[:k]
