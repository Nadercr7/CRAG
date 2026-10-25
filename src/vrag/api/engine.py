"""The live pipeline behind ``POST /api/ask``: arm F over the HotpotQA paragraph pool.

Models and indexes load lazily, once, on the first question. ``check()`` says whether
everything the pipeline needs is on disk without loading any of it, so the status endpoint
and the static pages stay cheap.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import openai

from vrag.config import REPO_ROOT, Config, load_config, load_dotenv

OVERLAY = REPO_ROOT / "configs" / "tuned.toml"
ARM = "F"


class EngineUnavailable(RuntimeError):
    """Something the live pipeline needs is missing (models, indexes, key)."""


class AnswerQuotaExhausted(RuntimeError):
    """The LLM provider's quota is used up."""


class AnswerFailed(RuntimeError):
    """The LLM provider rejected or failed the request (bad key, outage)."""


@dataclass
class Answer:
    trace: dict[str, Any]
    latency_ms: dict[str, float]
    thresholds: dict[str, float | None]
    arm: str
    answer_model: str
    answer_cached: bool


def live_config() -> Config:
    """Tuned overlay on the default config (``VRAG_CONFIG_OVERLAY`` overrides the overlay)."""
    load_dotenv()
    overlay = os.environ.get("VRAG_CONFIG_OVERLAY") or OVERLAY
    return load_config(os.environ.get("VRAG_CONFIG"), overlay)


def thresholds(cfg: Config) -> dict[str, float | None]:
    p = cfg.pipeline
    return {
        "tau_hi": p.tau_hi,
        "tau_lo": p.tau_lo,
        "tau_keep": p.tau_keep,
        "tau_chunk": p.tau_chunk,
        "tau_abstain": p.tau_abstain,
    }


class Engine:
    def __init__(self, cfg: Config | None = None):
        self._cfg = cfg
        self._rag: Any = None
        self._lock = threading.Lock()  # one question at a time: the models are not shared-safe

    @property
    def cfg(self) -> Config:
        if self._cfg is None:
            self._cfg = live_config()
        return self._cfg

    def missing(self) -> list[str]:
        """Human-readable list of what is absent; empty when the pipeline can start."""
        cfg, v = self.cfg, self.cfg.verifier
        problems = []
        if not (v.model and v.calibration_passage and v.sufficiency_model):
            problems.append(
                "the tuned config is not active (verifier / sufficiency_model unset): "
                "use configs/tuned.toml as the overlay"
            )
        for label, path in (
            ("verifier model", v.model),
            ("passage calibration", v.calibration_passage),
            ("sentence calibration", v.calibration_sentence),
            ("sufficiency model", v.sufficiency_model),
        ):
            if path and not Path(path).exists():
                problems.append(f"{label} not found at {path}")
        if not os.environ.get("GROQ_API_KEY"):
            problems.append("GROQ_API_KEY is not set (put it in .env)")
        root = cfg.paths.data_dir / "indexes" / "hotpot"
        for name in ("bm25", "dense"):
            if not (root / name).exists():
                problems.append(f"{name} index not found at {root / name}")
        d = cfg.data
        sample = (
            cfg.paths.data_dir
            / "raw"
            / "hotpot"
            / f"sample_v2_s{d.hotpot_seed}_t{d.hotpot_test_size}_d{d.hotpot_dev_size}.json"
        )
        if not sample.exists():
            problems.append(f"HotpotQA paragraph pool not found at {sample}")
        return problems

    def check(self) -> None:
        problems = self.missing()
        if problems:
            raise EngineUnavailable(
                "The live pipeline is not available on this machine: "
                + "; ".join(problems)
                + ". Build the data with the scripts in scripts/ (see README); "
                "the examples and the results page work without it."
            )

    def _build(self) -> Any:
        from vrag.data.hotpot import load_hotpot
        from vrag.llm import LLMClient
        from vrag.pipeline.calibrate import PlattCalibrator
        from vrag.pipeline.pipeline import VerifiedRAG, hotpot_lookup, make_arm
        from vrag.pipeline.sufficiency import CrossEncoderSufficiency
        from vrag.retrieval.bm25 import BM25Index
        from vrag.retrieval.dense import DenseIndex
        from vrag.retrieval.hybrid import HybridRetriever
        from vrag.verifier.offshelf import CrossEncoderVerifier

        cfg, v, r, d = self.cfg, self.cfg.verifier, self.cfg.retrieval, self.cfg.data
        data = load_hotpot(
            d.hotpot_test_size, d.hotpot_dev_size, d.hotpot_seed, cfg.paths.data_dir / "raw"
        )
        root = cfg.paths.data_dir / "indexes" / "hotpot"
        retriever = HybridRetriever(
            BM25Index.load(root / "bm25"), DenseIndex.load(root / "dense"), r.first_stage_k, r.rrf_k
        )
        cal_p = PlattCalibrator.load(v.calibration_passage)
        cal_s = PlattCalibrator.load(v.calibration_sentence) if v.calibration_sentence else cal_p
        return VerifiedRAG(
            retriever,
            CrossEncoderVerifier(str(v.model)),
            cal_p,
            CrossEncoderSufficiency(str(v.sufficiency_model)),
            LLMClient(),
            hotpot_lookup(data.pool),
            make_arm(ARM, cfg.pipeline),
            sentence_calibrator=cal_s,
            rewrite_model=cfg.llm.rewrite_model,
        )

    def ask(self, question: str) -> Answer:
        self.check()
        from vrag.llm import QuotaExhausted

        with self._lock:
            if self._rag is None:
                self._rag = self._build()
            rag = self._rag
            cached = {"hit": False}
            llm, max_tokens = rag.llm, rag.answer_max_tokens
            model = self.cfg.llm.answer_model

            def generate(messages: list[dict[str, str]]) -> str:
                done = llm.complete(messages, model, max_tokens=max_tokens, json_mode=True)
                cached["hit"] = bool(done.cached)
                return done.text

            start = time.perf_counter()
            try:
                trace = rag.prepare(question)  # may call the rewrite model
                trace = rag.answer(trace, generate)
            except openai.APIError as e:
                raise AnswerFailed(
                    f"The LLM provider could not be reached: {type(e).__name__}. "
                    "Check GROQ_API_KEY in .env and the network."
                ) from e
            except QuotaExhausted as e:
                raise AnswerQuotaExhausted(
                    f"The LLM quota is used up right now (retry in about "
                    f"{e.retry_after_s / 60:.0f} min). Try again later or browse the examples."
                ) from e
            total = (time.perf_counter() - start) * 1000
        timings = {k: round(v, 1) for k, v in trace.timings_ms.items() if k != "prepare"}
        timings["total"] = round(total, 1)
        return Answer(
            trace=_clean(trace.to_dict()),
            latency_ms=timings,
            thresholds=thresholds(self.cfg),
            arm=ARM,
            answer_model=model,
            answer_cached=cached["hit"],
        )


def _clean(trace: dict[str, Any]) -> dict[str, Any]:
    """Drop the prompt (large, and the UI shows the numbered context instead)."""
    trace = dict(trace)
    trace.pop("prompt", None)
    for c in trace.get("chunks", []):
        c.pop("sentences", None)
    return trace
