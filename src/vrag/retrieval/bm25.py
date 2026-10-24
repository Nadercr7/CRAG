"""BM25 over bm25s with English stopwords and Snowball stemming."""

from __future__ import annotations

import json
from collections.abc import Collection
from pathlib import Path

import bm25s
import numpy as np
import Stemmer

from vrag.retrieval.base import Hit, exclusion_mask, top_k_hits


def _tokenize(texts: list[str] | str, stemmer: Stemmer.Stemmer) -> list[list[str]]:
    return bm25s.tokenize(
        texts, stopwords="en", stemmer=stemmer, return_ids=False, show_progress=False
    )


class BM25Index:
    def __init__(self, ids: list[str], retriever: bm25s.BM25):
        self.ids = ids
        self._bm25 = retriever
        self._stemmer = Stemmer.Stemmer("english")

    @classmethod
    def build(cls, ids: list[str], texts: list[str]) -> BM25Index:
        stemmer = Stemmer.Stemmer("english")
        retriever = bm25s.BM25()
        retriever.index(_tokenize(texts, stemmer), show_progress=False)
        return cls(list(ids), retriever)

    def save(self, path: Path | str) -> None:
        path = Path(path)
        self._bm25.save(path)
        (path / "ids.json").write_text(json.dumps(self.ids))

    @classmethod
    def load(cls, path: Path | str) -> BM25Index:
        path = Path(path)
        retriever = bm25s.BM25.load(path, load_corpus=False)
        return cls(json.loads((path / "ids.json").read_text()), retriever)

    def scores(self, query: str) -> np.ndarray:
        tokens = _tokenize(query, self._stemmer)[0]
        if not tokens:
            return np.zeros(len(self.ids), dtype=np.float32)
        return self._bm25.get_scores(tokens)

    def search(self, query: str, k: int, exclude_ids: Collection[str] | None = None) -> list[Hit]:
        hits = top_k_hits(self.ids, self.scores(query), k, exclusion_mask(self.ids, exclude_ids))
        return [h for h in hits if h[1] > 0]  # documents sharing no term are not hits
