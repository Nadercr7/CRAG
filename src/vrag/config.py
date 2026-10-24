"""Typed project configuration loaded from a TOML file."""

from __future__ import annotations

import os
import tomllib
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPO_ROOT / "configs" / "default.toml"


class Paths(BaseModel):
    data_dir: Path = Path("data")
    cache_db: Path = Path("data/cache/llm.sqlite")
    results_dir: Path = Path("results")

    def resolve(self, root: Path) -> Paths:
        """Return a copy with every relative path anchored at ``root``."""
        return Paths(**{k: v if v.is_absolute() else root / v for k, v in self})


class RateLimits(BaseModel):
    requests_per_day: int = 1000
    requests_per_minute: int = 30
    request_burst: int = 3
    tokens_per_minute: int = 8000
    tokens_per_day: int | None = None


class LLMConfig(BaseModel):
    base_url: str = "https://api.groq.com/openai/v1"
    api_key_env: str = "GROQ_API_KEY"
    answer_model: str = "openai/gpt-oss-120b"
    rewrite_model: str = "openai/gpt-oss-20b"
    teacher_model: str = "openai/gpt-oss-120b"
    judge_model: str = "qwen/qwen3.8-27b"
    timeout_s: float = 60
    max_retries: int = 5
    limits: RateLimits = Field(default_factory=RateLimits)


class DataConfig(BaseModel):
    beir_datasets: list[str] = ["scifact", "nfcorpus", "fiqa"]
    beir_split: str = "test"
    hotpot_seed: int = 13
    hotpot_test_size: int = 300
    hotpot_dev_size: int = 200
    slice_seed: int = 13


class RetrievalConfig(BaseModel):
    embedder: str = "BAAI/bge-small-en-v1.5"
    # None picks the model's documented default (see retrieval.dense.default_query_prefix).
    query_prefix: str | None = None
    max_seq_length: int = 512
    batch_size: int = 32
    first_stage_k: int = 100
    rrf_k: int = 60
    top_k: int = 20
    eval_depth: int = 100
    rerank_depth: int = 50
    rerank_batch_size: int = 16
    recall_ks: list[int] = [20, 100]
    ndcg_k: int = 10


class PipelineConfig(BaseModel):
    """Defaults of the verified pipeline. Thresholds are placeholders until tuned on dev."""

    retrieve_k: int = 20  # fused list handed to the verifier
    top_k_context: int = 5  # chunks kept per query before refinement
    tau_hi: float = 0.7  # max chunk prob >= tau_hi: "correct"
    tau_lo: float = 0.2  # max chunk prob < tau_lo: "incorrect"; also the chunk filter
    tau_single: float = 0.5  # the one threshold of the single-threshold arm
    tau_chunk: float | None = None  # chunk filter; None: reuse tau_lo (tau_single in arm G)
    tau_keep: float = 0.3  # sentence kept when its prob >= tau_keep
    max_sentences: int = 8  # cap on kept sentences across all chunks
    max_context_lines: int = 8  # hard cap on numbered lines sent to the generator
    tau_abstain: float = 0.5  # abstain when sufficiency prob < tau_abstain
    rewrite_queries: int = 2  # queries a rewrite may produce
    rewrite_evidence: int = 3  # top kept sentences shown to the rewriter
    rewrite_max_tokens: int = 512
    answer_max_tokens: int = 256


class VerifierConfig(BaseModel):
    """Where the tuned verifier lives. Unset in default.toml; ``configs/tuned.toml`` fills it."""

    model: Path | None = None
    calibration_passage: Path | None = None
    calibration_sentence: Path | None = None

    def resolve(self, root: Path) -> VerifierConfig:
        """Return a copy with every relative path anchored at ``root``."""
        return VerifierConfig(
            **{k: v if v is None or v.is_absolute() else root / v for k, v in self}
        )


class Config(BaseModel):
    paths: Paths = Field(default_factory=Paths)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    data: DataConfig = Field(default_factory=DataConfig)
    retrieval: RetrievalConfig = Field(default_factory=RetrievalConfig)
    pipeline: PipelineConfig = Field(default_factory=PipelineConfig)
    verifier: VerifierConfig = Field(default_factory=VerifierConfig)


def load_dotenv(path: Path = REPO_ROOT / ".env") -> None:
    """Load KEY=VALUE lines into os.environ without overriding existing variables."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def merge(base: dict, overlay: dict) -> dict:
    """``base`` with ``overlay`` merged over it, section by section (neither is modified)."""
    out = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = merge(out[key], value)
        else:
            out[key] = value
    return out


def load_config(path: Path | str | None = None, overlay: Path | str | None = None) -> Config:
    """Load ``path`` (default: default.toml); keys of the ``overlay`` TOML win over it."""
    path = Path(path) if path else DEFAULT_CONFIG
    with path.open("rb") as f:
        data = tomllib.load(f)
    if overlay:
        with Path(overlay).open("rb") as f:
            data = merge(data, tomllib.load(f))
    cfg = Config.model_validate(data)
    cfg.paths = cfg.paths.resolve(REPO_ROOT)
    cfg.verifier = cfg.verifier.resolve(REPO_ROOT)
    return cfg


@lru_cache(maxsize=1)
def get_config() -> Config:
    load_dotenv()
    return load_config(os.environ.get("VRAG_CONFIG"), os.environ.get("VRAG_CONFIG_OVERLAY"))
