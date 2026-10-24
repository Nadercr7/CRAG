"""Rerank the hybrid top-50 with off-the-shelf cross-encoders on the BEIR test splits.

Writes results/rerank/<dataset>_<model-slug>.json, per-query metrics to
results/per_query/<dataset>_<method>.json (bm25, dense, hybrid and every reranker), and
regenerates results/retrieval/summary.md from the phase-1 files plus the rerank files.
Phase-1 metric files are never rewritten; their per-query values are recomputed from the
cached indexes and checked against the stored means. Reranker recall@100 is capped by the
50 candidates. A (dataset, model) pair with an existing result file is skipped unless --force.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from run_retrieval_eval import METHODS, PrecomputedDense, run_queries, slug

from vrag.config import get_config
from vrag.data.beir import doc_text, load_beir
from vrag.eval.retrieval_eval import evaluate, metric_names
from vrag.retrieval.bm25 import BM25Index
from vrag.retrieval.dense import DenseIndex
from vrag.retrieval.hybrid import HybridRetriever
from vrag.verifier.base import rerank
from vrag.verifier.offshelf import CrossEncoderVerifier

MODELS = (
    "cross-encoder/ms-marco-MiniLM-L6-v2",
    "cross-encoder/ms-marco-MiniLM-L12-v2",
    "BAAI/bge-reranker-base",
)


def write_summary(retrieval_dir: Path, rerank_dir: Path, datasets: list[str], names: list[str]):
    """Summarise phase-1 and rerank result files that exist (partial runs keep other rows)."""
    lines = ["| dataset | method | " + " | ".join(names) + " |", "|---|---|" + "---|" * len(names)]
    embed_s: dict[str, float] = {}
    embedder = ""
    for name in datasets:
        paths = [(m, retrieval_dir / f"{name}_{m}.json") for m in METHODS]
        paths += [(f"hybrid + {slug(m)}", rerank_dir / f"{name}_{slug(m)}.json") for m in MODELS]
        for label, path in paths:
            if not path.exists():
                continue
            res = json.loads(path.read_text())
            cells = " | ".join(f"{res['metrics'][k] * 100:.1f}" for k in names)
            lines.append(f"| {name} | {label} | {cells} |")
            if label in METHODS:
                embedder = res["config"]["embedder"]
                if res["timing"]["embed_docs_s"]:
                    embed_s[name] = res["timing"]["embed_docs_s"]
    times = ", ".join(f"{n} {t:.0f}" for n, t in embed_s.items())
    lines += [
        "",
        f"Embedder `{embedder}`. Scores x100. Doc embedding time (s): {times}",
        "Rerankers score the hybrid top-50 only, so their recall@100 equals recall@50.",
    ]
    (retrieval_dir / "summary.md").write_text("\n".join(lines) + "\n")


def main() -> None:
    cfg = get_config()
    r = cfg.retrieval
    ap = argparse.ArgumentParser()
    ap.add_argument("--datasets", nargs="+", default=cfg.data.beir_datasets)
    ap.add_argument("--models", nargs="+", default=list(MODELS))
    ap.add_argument("--depth", type=int, default=r.rerank_depth)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    results = cfg.paths.results_dir
    retrieval_dir, rerank_dir, pq_dir = (
        results / "retrieval",
        results / "rerank",
        results / "per_query",
    )
    rerank_dir.mkdir(parents=True, exist_ok=True)
    pq_dir.mkdir(parents=True, exist_ok=True)
    names = metric_names(r.ndcg_k, r.recall_ks)

    for name in args.datasets:
        todo = [
            m
            for m in args.models
            if args.force or not (rerank_dir / f"{name}_{slug(m)}.json").exists()
        ]
        if not todo:
            print(f"[{name}] all rerank results exist, skipping", flush=True)
            continue
        ds = load_beir(name, cfg.data.beir_split, cfg.paths.data_dir / "raw")
        index_dir = cfg.paths.data_dir / "indexes" / name
        bm25 = BM25Index.load(index_dir / "bm25")
        dense = DenseIndex.load(index_dir / f"dense-{slug(r.embedder)}")
        qids = list(ds.queries)
        vectors = dense.encode_queries([ds.queries[q] for q in qids], r.batch_size)
        cached = PrecomputedDense(
            dense, {ds.queries[q]: v for q, v in zip(qids, vectors, strict=True)}
        )
        retrievers = {
            "bm25": bm25,
            "dense": cached,
            "hybrid": HybridRetriever(bm25, cached, r.first_stage_k, r.rrf_k),
        }
        runs = {m: run_queries(retrievers[m], ds, r.eval_depth)[0] for m in METHODS}
        for method, run in runs.items():
            metrics, per_query = evaluate(
                run, ds.qrels, r.ndcg_k, r.recall_ks, return_per_query=True
            )
            stored = json.loads((retrieval_dir / f"{name}_{method}.json").read_text())["metrics"]
            drift = max(abs(metrics[k] - stored[k]) for k in names)
            print(
                f"[{name}] {method} per-query saved (max drift vs phase 1: {drift:.1e})", flush=True
            )
            (pq_dir / f"{name}_{method}.json").write_text(json.dumps(per_query))

        candidates = {q: runs["hybrid"][q][: args.depth] for q in qids}
        for model in todo:
            verifier = CrossEncoderVerifier(model, batch_size=r.rerank_batch_size)
            _ = verifier.model  # load outside the timed region
            start = time.perf_counter()
            run = {}
            for n, q in enumerate(qids, 1):
                hits = candidates[q]
                texts = [doc_text(ds.corpus[d]) for d, _ in hits]
                run[q] = rerank(verifier, ds.queries[q], hits, texts, len(hits))
                if n % 50 == 0:
                    elapsed = time.perf_counter() - start
                    print(f"[{name}] {slug(model)} {n}/{len(qids)} {elapsed:.0f}s", flush=True)
            rerank_s = time.perf_counter() - start
            metrics, per_query = evaluate(
                run, ds.qrels, r.ndcg_k, r.recall_ks, return_per_query=True
            )
            out = {
                "dataset": name,
                "split": ds.split,
                "method": f"hybrid+{slug(model)}",
                "model": model,
                "metrics": metrics,
                "config": {
                    "rerank_depth": args.depth,
                    "max_length": verifier.max_length,
                    "batch_size": verifier.batch_size,
                    "first_stage": "hybrid",
                    "embedder": r.embedder,
                },
                "timing": {
                    "num_queries": len(qids),
                    "num_pairs": sum(len(c) for c in candidates.values()),
                    "rerank_total_s": rerank_s,
                    "rerank_ms_per_query": 1000 * rerank_s / max(len(qids), 1),
                },
            }
            (pq_dir / f"{name}_hybrid+{slug(model)}.json").write_text(json.dumps(per_query))
            (rerank_dir / f"{name}_{slug(model)}.json").write_text(json.dumps(out, indent=2))
            print(
                f"[{name}] {slug(model)} {rerank_s:.0f}s: "
                + " ".join(f"{k}={v:.4f}" for k, v in metrics.items()),
                flush=True,
            )
            write_summary(retrieval_dir, rerank_dir, cfg.data.beir_datasets, names)

    write_summary(retrieval_dir, rerank_dir, cfg.data.beir_datasets, names)


if __name__ == "__main__":
    main()
