"""CPU latency of cross-encoder scoring: 1 query x 20 passages and 1 query x 60 sentences.

Inputs are real SciFact queries, abstracts (title + text) and abstract sentences, a different
random draw for every timed run. Writes results/latency.json and results/latency.md.
Models that fail to load are reported as failures, not worked around.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import statistics
import time
from pathlib import Path

import numpy as np
import torch

from vrag.config import get_config
from vrag.data.beir import doc_text, load_beir
from vrag.verifier.offshelf import CrossEncoderVerifier

MODELS = (
    "cross-encoder/ms-marco-MiniLM-L6-v2",
    "cross-encoder/ms-marco-MiniLM-L12-v2",
    "BAAI/bge-reranker-base",
    "Alibaba-NLP/gte-reranker-modernbert-base",
)
SCENARIOS = {"1x20 passages": ("passages", 20), "1x60 sentences": ("sentences", 60)}
ONNX_NOTE = (
    'ONNX for MiniLM-L6 skipped: sentence-transformers\' backend="onnx" needs onnxruntime '
    "and optimum, which are not installed (and no new dependencies were added)."
)


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z])", text) if len(s.split()) >= 5]


def make_inputs(corpus: dict, queries: dict, runs: int, seed: int) -> dict[str, list]:
    rng = random.Random(seed)
    docs = list(corpus.values())
    sentences = [s for d in rng.sample(docs, 500) for s in split_sentences(d["text"])]
    qs = list(queries.values())
    return {
        kind: [
            (rng.choice(qs), pool)
            for pool in (
                [doc_text(d) for d in rng.sample(docs, n)]
                if kind == "passages"
                else rng.sample(sentences, n)
                for _ in range(runs)
            )
        ]
        for kind, n in (("passages", 20), ("sentences", 60))
    }


def percentiles(ms: list[float]) -> dict[str, float]:
    ordered = sorted(ms)
    p95 = ordered[min(len(ordered) - 1, int(np.ceil(0.95 * len(ordered))) - 1)]
    return {"p50_ms": statistics.median(ms), "p95_ms": p95, "mean_ms": statistics.fmean(ms)}


def bench(verifier: CrossEncoderVerifier, inputs: list, warmup: int) -> dict[str, float]:
    for q, passages in inputs[:warmup]:
        verifier.score(q, passages)
    times = []
    for q, passages in inputs:
        t = time.perf_counter()
        verifier.score(q, passages)
        times.append(1000 * (time.perf_counter() - t))
    return {**percentiles(times), "runs": len(times)}


def write_markdown(path: Path, results: dict, notes: list[str]) -> None:
    lines = [
        "| model | 1x20 passages p50 / p95 (ms) | 1x60 sentences p50 / p95 (ms) |",
        "|---|---|---|",
    ]
    for model, res in results.items():
        if "error" in res:
            lines.append(f"| {model} | load failed | load failed |")
            continue
        cells = " | ".join(f"{res[s]['p50_ms']:.0f} / {res[s]['p95_ms']:.0f}" for s in SCENARIOS)
        lines.append(f"| {model} | {cells} |")
    for model, res in results.items():
        if "error" in res:
            lines += ["", f"`{model}` failed to load: {res['error']}"]
    lines += ["", *notes]
    path.write_text("\n".join(lines) + "\n")


def main() -> None:
    cfg = get_config()
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=list(MODELS))
    ap.add_argument("--runs", type=int, default=30)
    ap.add_argument("--warmup", type=int, default=3)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--seed", type=int, default=13)
    ap.add_argument("--out-dir", type=Path, default=cfg.paths.results_dir)
    args = ap.parse_args()

    torch.set_num_threads(args.threads)
    ds = load_beir("scifact", cfg.data.beir_split, cfg.paths.data_dir / "raw")
    inputs = make_inputs(ds.corpus, ds.queries, args.runs + args.warmup, args.seed)
    results: dict[str, dict] = {}
    for model in args.models:
        verifier = CrossEncoderVerifier(model, batch_size=cfg.retrieval.rerank_batch_size)
        if "gte-reranker" in model:
            verifier.model_kwargs["trust_remote_code"] = True
        try:
            _ = verifier.model
        except Exception as e:  # report the load failure as a result
            results[model] = {"error": f"{type(e).__name__}: {str(e)[:300]}"}
            print(f"{model}: load failed: {results[model]['error']}", flush=True)
            continue
        results[model] = {
            label: bench(verifier, inputs[kind], args.warmup)
            for label, (kind, _) in SCENARIOS.items()
        }
        print(model, json.dumps(results[model]), flush=True)

    notes = [
        f"CPU, torch threads={args.threads}, batch size {cfg.retrieval.rerank_batch_size}, "
        f"max_length 512, {args.runs} timed runs after {args.warmup} warmup runs, "
        "SciFact texts.",
        ONNX_NOTE,
    ]
    out = {
        "threads": args.threads,
        "runs": args.runs,
        "warmup": args.warmup,
        "batch_size": cfg.retrieval.rerank_batch_size,
        "torch": torch.__version__,
        "models": results,
        "notes": notes,
    }
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "latency.json").write_text(json.dumps(out, indent=2))
    write_markdown(args.out_dir / "latency.md", results, notes)


if __name__ == "__main__":
    main()
