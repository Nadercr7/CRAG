"""Verifier interface (query-passage relevance scoring) and reranking on top of it."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

import numpy as np

from vrag.retrieval.base import Hit


class Verifier(Protocol):
    def score(self, query: str, passages: list[str]) -> np.ndarray:
        """One score per passage, higher = more relevant."""
        ...


def rerank(
    verifier: Verifier, query: str, hits: Sequence[Hit], texts: Sequence[str], k: int
) -> list[Hit]:
    """Top-``k`` of ``hits`` re-ordered by verifier score, which replaces the hit score.

    ``texts[i]`` is the passage for ``hits[i]``. Ties keep the incoming order.
    """
    if len(hits) != len(texts):
        raise ValueError(f"{len(hits)} hits but {len(texts)} texts")
    if k <= 0 or not hits:
        return []
    scores = np.asarray(verifier.score(query, list(texts)), dtype=np.float64)
    order = np.argsort(-scores, kind="stable")[:k]
    return [(hits[i][0], float(scores[i])) for i in order]
