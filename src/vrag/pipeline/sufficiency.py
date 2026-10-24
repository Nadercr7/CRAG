"""Sufficiency: does the refined context contain what the question needs? Plus the abstain rule."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

import numpy as np

if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder


class SufficiencyModel(Protocol):
    def score(self, question: str, context: str) -> float:
        """P(context is sufficient to answer the question), in [0, 1]."""
        ...


class NullSufficiency:
    """Always sufficient: the pipeline never abstains on sufficiency."""

    def score(self, question: str, context: str) -> float:
        return 1.0


class CrossEncoderSufficiency:
    """Sigmoid of a cross-encoder logit on (question, context)."""

    def __init__(self, model_path: str, max_length: int = 512, device: str = "cpu"):
        self.model_path = model_path
        self.max_length = max_length
        self.device = device
        self._model: CrossEncoder | None = None

    @property
    def model(self) -> CrossEncoder:
        if self._model is None:
            from sentence_transformers import CrossEncoder

            self._model = CrossEncoder(
                self.model_path, max_length=self.max_length, device=self.device
            )
        return self._model

    def score(self, question: str, context: str) -> float:
        out = self.model.predict(
            [(question, context)],
            activation_fn=_identity,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        logit = float(np.asarray(out, dtype=np.float64).reshape(-1)[0])
        return float(np.exp(-np.logaddexp(0.0, -logit)))


def _identity(x):
    return x


def abstain_decision(
    sufficiency_prob: float | None,
    threshold: float,
    *,
    has_context: bool = True,
) -> tuple[bool, str | None]:
    """``(abstain, reason)``: no context, or sufficiency below ``threshold``."""
    if not has_context:
        return True, "no_evidence"
    if sufficiency_prob is not None and sufficiency_prob < threshold:
        return True, "insufficient_context"
    return False, None
