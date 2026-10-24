"""Sentence-level refinement: score each sentence with the verifier, keep the relevant ones.

Kept sentences keep their original order inside a chunk, and chunks are ordered by chunk
probability. When more than ``max_sentences`` pass, the lowest-scoring ones are dropped.
``refine`` returns every scored sentence with a ``kept`` flag (the trace shows the dropped
ones); an empty ``kept(...)`` means nothing passed, which the caller treats as "incorrect"
(research §9.3), never as an empty context.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

import numpy as np

from vrag.data.chunking import split_sentences
from vrag.pipeline.types import Chunk, SentenceScore
from vrag.verifier.base import Verifier
from vrag.verifier.train_data import sentence_text

Calibrate = Callable[[np.ndarray], np.ndarray]
Memo = dict[tuple[str, int], float]


def ensure_sentences(chunk: Chunk) -> list[str]:
    """The chunk's sentences, splitting its text when the source gave none."""
    if not chunk.sentences:
        chunk.sentences = split_sentences(chunk.text)
    return chunk.sentences


def kept(sentences: Sequence[SentenceScore]) -> list[SentenceScore]:
    return [s for s in sentences if s.kept]


def refine(
    question: str,
    chunks: Sequence[Chunk],
    verifier: Verifier,
    calibrate: Calibrate,
    tau_keep: float,
    max_sentences: int,
    memo: Memo | None = None,
) -> list[SentenceScore]:
    """Score every sentence of ``chunks`` and flag the ones to keep.

    ``memo`` maps ``(chunk id, sentence index)`` to a probability and is filled in, so a second
    pass over a superset of chunks only scores the new sentences.
    """
    memo = memo if memo is not None else {}
    ordered = sorted(chunks, key=lambda c: -(c.prob if c.prob is not None else 0.0))
    pending: list[tuple[str, int, str]] = []
    for c in ordered:
        for i, s in enumerate(ensure_sentences(c)):
            if (c.id, i) not in memo and s.strip():
                pending.append((c.id, i, sentence_text(c.title, s)))
    if pending:
        logits = np.asarray(verifier.score(question, [t for _, _, t in pending]), dtype=np.float64)
        for (cid, i, _), p in zip(pending, calibrate(logits), strict=True):
            memo[(cid, i)] = float(p)

    scores = [
        SentenceScore(c.id, i, s.strip(), memo[(c.id, i)], memo[(c.id, i)] >= tau_keep)
        for c in ordered
        for i, s in enumerate(c.sentences)
        if (c.id, i) in memo
    ]
    passing = [s for s in scores if s.kept]
    if len(passing) > max_sentences:
        # Stable sort: ties go to the earlier chunk and sentence.
        for s in sorted(passing, key=lambda s: -s.prob)[max_sentences:]:
            s.kept = False
    return scores
