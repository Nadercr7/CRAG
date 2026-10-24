"""Dense retrieval: sentence-transformers embeddings, normalised, exact numpy top-k.

``BAAI/bge-small-en-v1.5`` expects the instruction "Represent this sentence for searching
relevant passages: " on queries only (its model card recommends it for short-query to
long-passage retrieval; passages are encoded as-is). ``thenlper/gte-small`` takes no prefix.
Embeddings are saved as ``embeddings.npy`` next to ``ids.json`` and ``meta.json``.
"""

from __future__ import annotations

import json
import time
from collections.abc import Collection
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from vrag.retrieval.base import Hit, exclusion_mask, top_k_hits

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

BGE_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "


def default_query_prefix(embedder: str) -> str:
    name = embedder.lower()
    return BGE_QUERY_INSTRUCTION if "bge-" in name and "-en-v1.5" in name else ""


def _load_model(embedder: str, max_seq_length: int) -> SentenceTransformer:
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(embedder, device="cpu")
    model.max_seq_length = max_seq_length
    return model


class DenseIndex:
    def __init__(
        self,
        ids: list[str],
        embeddings: np.ndarray,
        embedder: str,
        query_prefix: str | None = None,
        max_seq_length: int = 512,
        meta: dict | None = None,
    ):
        self.ids = ids
        self.embeddings = embeddings
        self.embedder = embedder
        self.query_prefix = default_query_prefix(embedder) if query_prefix is None else query_prefix
        self.max_seq_length = max_seq_length
        self.meta = meta or {}
        self._model: SentenceTransformer | None = None

    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            self._model = _load_model(self.embedder, self.max_seq_length)
        return self._model

    @classmethod
    def build(
        cls,
        ids: list[str],
        texts: list[str],
        embedder: str,
        query_prefix: str | None = None,
        max_seq_length: int = 512,
        batch_size: int = 32,
        show_progress: bool = False,
    ) -> DenseIndex:
        index = cls(list(ids), np.empty((0, 0), np.float32), embedder, query_prefix, max_seq_length)
        start = time.perf_counter()
        index.embeddings = index.model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=show_progress,
        ).astype(np.float32)
        index.meta = {"embed_time_s": time.perf_counter() - start, "num_docs": len(ids)}
        return index

    def save(self, path: Path | str) -> None:
        path = Path(path)
        path.mkdir(parents=True, exist_ok=True)
        np.save(path / "embeddings.npy", self.embeddings)
        (path / "ids.json").write_text(json.dumps(self.ids))
        meta = {
            **self.meta,
            "embedder": self.embedder,
            "query_prefix": self.query_prefix,
            "max_seq_length": self.max_seq_length,
        }
        (path / "meta.json").write_text(json.dumps(meta, indent=2))

    @classmethod
    def load(cls, path: Path | str) -> DenseIndex:
        path = Path(path)
        meta = json.loads((path / "meta.json").read_text())
        return cls(
            json.loads((path / "ids.json").read_text()),
            np.load(path / "embeddings.npy"),
            meta["embedder"],
            meta["query_prefix"],
            meta["max_seq_length"],
            meta,
        )

    def encode_queries(self, queries: list[str], batch_size: int = 32) -> np.ndarray:
        return self.model.encode(
            [self.query_prefix + q for q in queries],
            batch_size=batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        ).astype(np.float32)

    def search_vector(
        self, vector: np.ndarray, k: int, exclude_ids: Collection[str] | None = None
    ) -> list[Hit]:
        scores = self.embeddings @ vector
        return top_k_hits(self.ids, scores, k, exclusion_mask(self.ids, exclude_ids))

    def search(self, query: str, k: int, exclude_ids: Collection[str] | None = None) -> list[Hit]:
        return self.search_vector(self.encode_queries([query])[0], k, exclude_ids)
