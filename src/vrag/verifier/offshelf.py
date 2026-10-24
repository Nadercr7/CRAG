"""Off-the-shelf cross-encoder rerankers used as baseline verifiers."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder


class CrossEncoderVerifier:
    """Wraps a ``sentence_transformers.CrossEncoder``; scores are raw logits, not sigmoid."""

    def __init__(
        self,
        model_name: str,
        max_length: int = 512,
        batch_size: int = 16,
        device: str = "cpu",
        **model_kwargs,
    ):
        self.model_name = model_name
        self.max_length = max_length
        self.batch_size = batch_size
        self.device = device
        self.model_kwargs = model_kwargs
        self._model: CrossEncoder | None = None

    @property
    def model(self) -> CrossEncoder:
        if self._model is None:
            from sentence_transformers import CrossEncoder

            self._model = CrossEncoder(
                self.model_name, max_length=self.max_length, device=self.device, **self.model_kwargs
            )
        return self._model

    def score(self, query: str, passages: list[str]) -> np.ndarray:
        if not passages:
            return np.empty(0, dtype=np.float32)
        out = self.model.predict(
            [(query, p) for p in passages],
            batch_size=self.batch_size,
            activation_fn=_identity,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return np.asarray(out, dtype=np.float32).reshape(len(passages), -1)[:, 0]


def _identity(x):
    return x
