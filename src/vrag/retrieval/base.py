"""Common search interface shared by BM25, dense and hybrid retrieval."""

from __future__ import annotations

from collections.abc import Collection
from typing import Protocol

import numpy as np

Hit = tuple[str, float]


class Retriever(Protocol):
    def search(self, query: str, k: int, exclude_ids: Collection[str] | None = None) -> list[Hit]:
        """Top-``k`` ``(doc_id, score)`` pairs, best first, never containing ``exclude_ids``."""
        ...


def exclusion_mask(ids: list[str], exclude_ids: Collection[str] | None) -> np.ndarray | None:
    """Boolean mask over ``ids`` that is True for excluded documents (None if nothing is)."""
    if not exclude_ids:
        return None
    excluded = set(exclude_ids)
    mask = np.fromiter((i in excluded for i in ids), dtype=bool, count=len(ids))
    return mask if mask.any() else None


def top_k_hits(
    ids: list[str], scores: np.ndarray, k: int, mask: np.ndarray | None = None
) -> list[Hit]:
    """Best ``k`` entries of ``scores`` as hits, skipping masked entries.

    Ties break by corpus order so results are deterministic.
    """
    if mask is not None:
        scores = np.where(mask, -np.inf, scores)
        k = min(k, int((~mask).sum()))
    k = min(k, len(ids))
    if k <= 0:
        return []
    top = np.argpartition(-scores, k - 1)[:k]
    top = top[np.lexsort((top, -scores[top]))]
    return [(ids[i], float(scores[i])) for i in top]
