"""Serializable records of one pipeline run: chunks, sentence scores and the Trace."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields
from typing import Any

Message = dict[str, str]


@dataclass
class Chunk:
    id: str
    title: str
    text: str
    sentences: list[str] = field(default_factory=list)
    retrieval_rank: int = 0  # 1-based rank in the list of the round that found it
    retrieval_score: float = 0.0
    verifier_logit: float | None = None
    prob: float | None = None  # calibrated P(relevant)
    round: int = 0  # 0 = first retrieval, 1 = after the rewrite
    selected: bool = False  # among the chunks handed to refinement / the prompt


@dataclass
class SentenceScore:
    chunk_id: str
    index: int
    text: str
    prob: float
    kept: bool = False


@dataclass
class Trace:
    question: str
    slice_kind: str | None = None
    arm: str = ""
    qid: str | None = None
    queries: list[str] = field(default_factory=list)  # question first, then rewrites
    decision: str | None = None  # CRAG decision on the first retrieval
    final_decision: str | None = None  # after the retry and refinement
    chunks: list[Chunk] = field(default_factory=list)
    sentences: list[SentenceScore] = field(default_factory=list)
    context: list[str] = field(default_factory=list)  # numbered lines, as in the prompt
    context_refs: list[tuple[str, int | None]] = field(default_factory=list)  # (chunk id, sentence)
    sufficiency_prob: float | None = None
    abstain: bool = False
    abstain_reason: str | None = None
    prompt: list[Message] = field(default_factory=list)
    raw_output: str | None = None
    answer: str | None = None
    citations: list[int] = field(default_factory=list)
    citations_dropped: list[int] = field(default_factory=list)
    confidence: float | None = None
    insufficient: bool = False  # the generator said the context is insufficient
    output_valid: bool | None = None  # None until finalized
    notes: list[str] = field(default_factory=list)
    timings_ms: dict[str, float] = field(default_factory=dict)
    llm_calls: int = 0

    @property
    def key(self) -> str:
        """Identifier used in batch generation files."""
        return f"{self.qid or self.question}|{self.arm}|{self.slice_kind or '-'}"

    @property
    def refused(self) -> bool:
        return self.abstain or self.insufficient

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Trace:
        known = {f.name for f in fields(cls)}
        kw = {k: v for k, v in data.items() if k in known}
        kw["chunks"] = [Chunk(**c) for c in data.get("chunks", [])]
        kw["sentences"] = [SentenceScore(**s) for s in data.get("sentences", [])]
        kw["context_refs"] = [(cid, i) for cid, i in data.get("context_refs", [])]
        return cls(**kw)
