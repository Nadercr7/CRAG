"""The verified RAG pipeline, split into stages that can run on different machines.

    prepare(question, slice)  retrieve, verify, decide, rewrite + re-retrieve, refine,
                              sufficiency, abstain decision, answer prompt   -> Trace
    generation                ``answer(trace, generate_fn)`` live, or ``export_prompts`` /
                              ``load_outputs`` for batch generation elsewhere
    finalize(trace, raw)      parse the JSON answer, validate citations     -> Trace

The only LLM call inside ``prepare`` is the query rewrite. Arms A-G of PLAN.md §4 are
``ArmConfig`` presets (``make_arm``); arm B uses the same code path as C with the off-the-shelf
reranker as ``verifier`` and no decision logic.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable, Collection, Iterable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any

import numpy as np

from vrag.config import PipelineConfig, get_config
from vrag.data.beir import doc_text
from vrag.data.chunking import split_sentences
from vrag.data.hotpot import Paragraph
from vrag.data.slices import Slice, _answer_pattern
from vrag.llm.client import LLMClient, Message, QuotaExhausted
from vrag.pipeline.answer import build_messages, context_line, parse_answer
from vrag.pipeline.calibrate import PlattCalibrator
from vrag.pipeline.decide import decide, decide_single
from vrag.pipeline.refine import Memo, ensure_sentences, kept, refine
from vrag.pipeline.rewrite import rewrite_query
from vrag.pipeline.sufficiency import NullSufficiency, SufficiencyModel, abstain_decision
from vrag.pipeline.types import Chunk, SentenceScore, Trace
from vrag.retrieval.base import Hit, Retriever
from vrag.verifier.base import Verifier

Doc = dict[str, Any]  # {"title": str, "text": str, "sentences": list[str] (optional)}
GenerateFn = Callable[[list[Message]], str]
_D = PipelineConfig()


@dataclass(frozen=True)
class ArmConfig:
    name: str = "custom"
    use_verifier: bool = True  # score chunks and rank by the score
    use_decision: bool = True  # calibrated decision + chunk filter at the low threshold
    refine: bool = False
    rewrite: bool = False
    sufficiency: bool = False  # sufficiency model + abstain decision
    two_thresholds: bool = True  # False: one threshold, no ambiguous band
    abstain_on_incorrect: bool = True  # abstain when no evidence is left (needs sufficiency)
    top_k_context: int = _D.top_k_context
    retrieve_k: int = _D.retrieve_k
    tau_hi: float = _D.tau_hi
    tau_lo: float = _D.tau_lo
    tau_single: float = _D.tau_single
    tau_keep: float = _D.tau_keep
    tau_abstain: float = _D.tau_abstain
    max_sentences: int = _D.max_sentences
    max_context_lines: int = _D.max_context_lines
    rewrite_queries: int = _D.rewrite_queries
    rewrite_evidence: int = _D.rewrite_evidence
    rewrite_max_tokens: int = _D.rewrite_max_tokens

    def __post_init__(self) -> None:
        if self.use_decision and not self.use_verifier:
            raise ValueError("use_decision needs use_verifier")
        if (self.refine or self.rewrite) and not self.use_decision:
            raise ValueError("refine and rewrite need use_decision")
        if self.rewrite and not self.refine:
            raise ValueError("rewrite needs refine (its evidence comes from kept sentences)")

    @property
    def chunk_threshold(self) -> float:
        """Chunks below this probability never reach the context."""
        return self.tau_lo if self.two_thresholds else self.tau_single

    def decide(self, probs: Sequence[float]) -> str:
        if self.two_thresholds:
            return decide(probs, self.tau_hi, self.tau_lo)
        return decide_single(probs, self.tau_single)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# Flags per arm (PLAN.md §4). A has no verifier at all; B ranks with a verifier but takes no
# decision, so "verifier" there should be the off-the-shelf reranker.
PRESETS: dict[str, dict[str, Any]] = {
    "A": {"use_verifier": False, "use_decision": False},
    "B": {"use_verifier": True, "use_decision": False},
    "C": {},
    "D": {"refine": True},
    "E": {"refine": True, "rewrite": True},
    "F": {"refine": True, "rewrite": True, "sufficiency": True},
    "G": {"refine": True, "rewrite": True, "sufficiency": True, "two_thresholds": False},
}


def make_arm(name: str, pcfg: PipelineConfig | None = None, **overrides: Any) -> ArmConfig:
    """Arm ``A``..``G`` with thresholds and sizes from ``pcfg`` (default: the config file)."""
    if name not in PRESETS:
        raise ValueError(f"unknown arm {name!r}; choose from {sorted(PRESETS)}")
    p = pcfg or get_config().pipeline
    base = {k: getattr(p, k) for k in ArmConfig.__dataclass_fields__ if hasattr(p, k)}
    return ArmConfig(name=name, **{**base, **PRESETS[name], **overrides})


def hotpot_lookup(pool: Mapping[str, Paragraph]) -> Callable[[str], Doc]:
    """Corpus lookup over a HotpotQA pool; keeps the dataset's own sentence split."""

    def lookup(doc_id: str) -> Doc:
        p = pool[doc_id]
        return {"title": p.title, "text": p.text, "sentences": [s.strip() for s in p.sentences]}

    return lookup


def _mapping_lookup(corpus: Mapping[str, Mapping[str, Any]]) -> Callable[[str], Doc]:
    return lambda doc_id: dict(corpus[doc_id])


class VerifiedRAG:
    def __init__(
        self,
        retriever: Retriever,
        verifier: Verifier | None,
        calibrator: PlattCalibrator | None,
        sufficiency: SufficiencyModel | None,
        llm: LLMClient | None,
        corpus_lookup: Callable[[str], Doc] | Mapping[str, Mapping[str, Any]],
        config: ArmConfig,
        *,
        sentence_calibrator: PlattCalibrator | None = None,
        rewrite_model: str | None = None,
        answer_max_tokens: int | None = None,
    ):
        if config.use_verifier and verifier is None:
            raise ValueError(f"arm {config.name} needs a verifier")
        if config.rewrite and llm is None:
            raise ValueError(f"arm {config.name} needs an LLM client for the rewrite")
        self.retriever = retriever
        self.verifier = verifier
        self.calibrator = calibrator or PlattCalibrator()
        self.sentence_calibrator = sentence_calibrator or self.calibrator
        self.sufficiency = sufficiency or NullSufficiency()
        self.llm = llm
        self.lookup = (
            _mapping_lookup(corpus_lookup) if isinstance(corpus_lookup, Mapping) else corpus_lookup
        )
        self.arm = config
        self.rewrite_model = rewrite_model
        self.answer_max_tokens = answer_max_tokens or _D.answer_max_tokens

    # ------------------------------------------------------------------ prepare

    def prepare(self, question: str, slice: Slice | None = None, qid: str | None = None) -> Trace:
        arm = self.arm
        start = time.perf_counter()
        trace = Trace(
            question=question,
            slice_kind=slice.kind if slice else None,
            arm=arm.name,
            qid=qid,
            queries=[question],
        )
        exclude = set(slice.exclude_ids) if slice and slice.exclude_ids else None
        k = arm.retrieve_k if arm.use_verifier else arm.top_k_context
        with self._stage(trace, "retrieve"):
            hits = self.retriever.search(question, k, exclude)
        trace.chunks = self._make_chunks(hits, slice, 0)

        memo: Memo = {}
        if arm.use_verifier:
            self._verify(trace, trace.chunks)
        if arm.use_decision:
            trace.decision = arm.decide(self._probs(trace.chunks))

        selected, scores = self._settle(trace, memo)
        retried = False
        if arm.rewrite and trace.decision != "correct":
            self._retry(trace, scores, exclude, slice)
            retried = True
            selected, scores = self._settle(trace, memo)
        if arm.rewrite and not retried and not self._has_evidence(selected, scores):
            trace.notes.append("refine_empty_retry")  # nothing passed: treated as incorrect
            self._retry(trace, scores, exclude, slice)
            selected, scores = self._settle(trace, memo)

        if arm.use_decision:
            trace.final_decision = (
                arm.decide(self._probs(trace.chunks))
                if self._has_evidence(selected, scores)
                else "incorrect"
            )
        trace.sentences = scores
        self._build_context(trace, selected, scores)
        self._abstain(trace)
        if trace.context:
            trace.prompt = build_messages(question, trace.context)
        trace.timings_ms["prepare"] = (time.perf_counter() - start) * 1000
        return trace

    # ----------------------------------------------------------------- finalize

    def finalize(self, trace: Trace, raw_output: str | None) -> Trace:
        """Parse ``raw_output`` into answer, citations and confidence (returns a new Trace)."""
        if trace.abstain and not raw_output:
            return trace
        parsed = parse_answer(raw_output, len(trace.context))
        notes = [*trace.notes, f"parse: {parsed.error}"] if parsed.error else list(trace.notes)
        return replace(
            trace,
            raw_output=raw_output,
            answer=parsed.answer,
            citations=parsed.citations,
            citations_dropped=parsed.dropped,
            confidence=parsed.confidence,
            insufficient=parsed.insufficient,
            output_valid=parsed.valid,
            notes=notes,
        )

    def answer(self, trace: Trace, generate_fn: GenerateFn) -> Trace:
        """Generate live with ``generate_fn(messages) -> text`` and finalize."""
        if trace.abstain or not trace.prompt:
            return trace
        start = time.perf_counter()
        raw = generate_fn(trace.prompt)
        out = self.finalize(trace, raw)
        out.timings_ms = {**trace.timings_ms, "generate": (time.perf_counter() - start) * 1000}
        out.llm_calls = trace.llm_calls + 1
        return out

    def llm_generate(self, model: str | None = None) -> GenerateFn:
        """A ``generate_fn`` backed by the pipeline's LLM client (cached)."""
        if self.llm is None:
            raise ValueError("no LLM client")
        llm, max_tokens = self.llm, self.answer_max_tokens

        def generate(messages: list[Message]) -> str:
            return llm.complete(messages, model, max_tokens=max_tokens, json_mode=True).text

        return generate

    # ---------------------------------------------------------------- internals

    @contextmanager
    def _stage(self, trace: Trace, name: str) -> Iterator[None]:
        start = time.perf_counter()
        try:
            yield
        finally:
            ms = (time.perf_counter() - start) * 1000
            trace.timings_ms[name] = trace.timings_ms.get(name, 0.0) + ms

    def _make_chunks(self, hits: Iterable[Hit], slice: Slice | None, round_: int) -> list[Chunk]:
        chunks = []
        for rank, (doc_id, score) in enumerate(hits, start=1):
            doc = self.lookup(doc_id)
            chunk = Chunk(
                id=doc_id,
                title=doc["title"],
                text=doc["text"],
                sentences=[s.strip() for s in doc.get("sentences") or []],
                retrieval_rank=rank,
                retrieval_score=float(score),
                round=round_,
            )
            ensure_sentences(chunk)
            apply_slice(chunk, slice)
            chunks.append(chunk)
        return chunks

    def _verify(self, trace: Trace, chunks: Sequence[Chunk]) -> None:
        if not chunks:
            return
        assert self.verifier is not None
        with self._stage(trace, "verify"):
            texts = [doc_text({"title": c.title, "text": c.text}) for c in chunks]
            logits = np.asarray(self.verifier.score(trace.question, texts), dtype=np.float64)
            probs = self.calibrator(logits)
        for c, logit, p in zip(chunks, logits, probs, strict=True):
            c.verifier_logit, c.prob = float(logit), float(p)

    @staticmethod
    def _probs(chunks: Sequence[Chunk]) -> list[float]:
        return [c.prob for c in chunks if c.prob is not None]

    def _ranked(self, chunks: Sequence[Chunk]) -> list[Chunk]:
        if not self.arm.use_verifier:
            return sorted(chunks, key=lambda c: (c.round, c.retrieval_rank))
        return sorted(chunks, key=lambda c: (-(c.verifier_logit or 0.0), c.round, c.retrieval_rank))

    def _select(self, chunks: Sequence[Chunk]) -> list[Chunk]:
        arm = self.arm
        ranked = self._ranked(chunks)
        if arm.use_decision:
            ranked = [c for c in ranked if (c.prob or 0.0) >= arm.chunk_threshold]
        return ranked[: arm.top_k_context]

    def _settle(self, trace: Trace, memo: Memo) -> tuple[list[Chunk], list[SentenceScore]]:
        """Pick the chunks that go forward and refine them."""
        selected = self._select(trace.chunks)
        ids = {c.id for c in selected}
        for c in trace.chunks:
            c.selected = c.id in ids
        if not self.arm.refine or not selected:
            return selected, []
        assert self.verifier is not None
        with self._stage(trace, "refine"):
            scores = refine(
                trace.question,
                selected,
                self.verifier,
                self.sentence_calibrator,
                self.arm.tau_keep,
                self.arm.max_sentences,
                memo,
            )
        return selected, scores

    def _has_evidence(self, selected: Sequence[Chunk], scores: Sequence[SentenceScore]) -> bool:
        return bool(kept(scores)) if self.arm.refine else bool(selected)

    def _retry(
        self,
        trace: Trace,
        scores: Sequence[SentenceScore],
        exclude: Collection[str] | None,
        slice: Slice | None,
    ) -> None:
        """Rewrite the query, re-retrieve with the new queries and verify the new chunks."""
        arm = self.arm
        assert self.llm is not None
        titles = {c.id: c.title for c in trace.chunks}
        top = sorted(kept(scores), key=lambda s: -s.prob)[: arm.rewrite_evidence]
        evidence = [f"{titles[s.chunk_id]}: {s.text}" for s in top]
        model = self.rewrite_model or get_config().llm.rewrite_model
        with self._stage(trace, "rewrite"):
            trace.llm_calls += 1
            try:
                queries = rewrite_query(
                    self.llm,
                    trace.question,
                    evidence,
                    model,
                    arm.rewrite_queries,
                    arm.rewrite_max_tokens,
                )
            except QuotaExhausted as e:
                trace.notes.append(f"rewrite_failed: {e}")
                queries = []
        if not queries:
            trace.notes.append("rewrite produced no usable query")
            return
        trace.queries.extend(queries)

        with self._stage(trace, "retrieve"):
            lists = [self.retriever.search(q, arm.retrieve_k, exclude) for q in queries]
        seen = {c.id for c in trace.chunks}
        merged: list[Hit] = []
        for rank in range(max(map(len, lists), default=0)):  # round-robin over the queries
            for hits in lists:
                if rank < len(hits) and hits[rank][0] not in seen:
                    seen.add(hits[rank][0])
                    merged.append(hits[rank])
        new = self._make_chunks(merged[: arm.retrieve_k], slice, 1)
        self._verify(trace, new)
        trace.chunks.extend(new)

    def _build_context(
        self, trace: Trace, selected: Sequence[Chunk], scores: Sequence[SentenceScore]
    ) -> None:
        arm = self.arm
        by_id = {c.id: c for c in trace.chunks}
        entries: list[tuple[str, str, int | None, str]] = []  # title, text, sentence, chunk id
        if arm.refine:
            entries = [(by_id[s.chunk_id].title, s.text, s.index, s.chunk_id) for s in kept(scores)]
        elif selected:
            entries = [(c.title, c.text, None, c.id) for c in selected]
        if not entries and not (arm.sufficiency and arm.abstain_on_incorrect):
            # Arms that cannot abstain still need something to answer from: the best chunks.
            fallback = self._ranked(trace.chunks)[: arm.top_k_context]
            entries = [(c.title, c.text, None, c.id) for c in fallback]
            if entries:
                trace.notes.append("fallback_unfiltered_chunks")
                for c in fallback:
                    c.selected = True
        entries = entries[: arm.max_context_lines]
        trace.context = [context_line(n, t, x) for n, (t, x, _, _) in enumerate(entries, start=1)]
        trace.context_refs = [(cid, i) for _, _, i, cid in entries]

    def _abstain(self, trace: Trace) -> None:
        arm = self.arm
        if not arm.sufficiency:
            return
        if trace.context:
            with self._stage(trace, "sufficiency"):
                trace.sufficiency_prob = float(
                    self.sufficiency.score(trace.question, "\n".join(trace.context))
                )
        trace.abstain, trace.abstain_reason = abstain_decision(
            trace.sufficiency_prob, arm.tau_abstain, has_context=bool(trace.context)
        )


def apply_slice(chunk: Chunk, slice: Slice | None) -> None:
    """Apply ``replace_text`` to the chunk text and, sentence by sentence, to its sentences."""
    if slice is None or chunk.id not in slice.replace_text:
        return
    chunk.text = slice.replace_text[chunk.id]
    if slice.original_answer and slice.substitute is not None:
        pattern = _answer_pattern(slice.original_answer.strip())
        sub = slice.substitute
        chunk.sentences = [pattern.sub(lambda _: sub, s) for s in chunk.sentences]
    else:
        chunk.sentences = split_sentences(chunk.text)


def export_prompts(
    traces: Iterable[Trace], path: Path | str, include_abstained: bool = False
) -> int:
    """Write ``{"id", "messages"}`` JSONL for batch generation; returns the number of lines.

    Abstained traces are skipped unless ``include_abstained`` (needed for threshold sweeps).
    """
    n = 0
    with Path(path).open("w") as f:
        for t in traces:
            if not t.prompt or (t.abstain and not include_abstained):
                continue
            f.write(json.dumps({"id": t.key, "messages": t.prompt}, ensure_ascii=False) + "\n")
            n += 1
    return n


def load_outputs(path: Path | str) -> dict[str, str]:
    """Read ``{"id", "output"}`` JSONL written by the batch generator."""
    out: dict[str, str] = {}
    for line in Path(path).read_text().splitlines():
        if line.strip():
            row = json.loads(line)
            out[row["id"]] = row["output"]
    return out
