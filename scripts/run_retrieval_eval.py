"""Build indexes and evaluate bm25 / dense / hybrid on the BEIR test splits.

Writes results/retrieval/<dataset>_<method>.json and results/retrieval/summary.md.
Indexes are cached under data/indexes/<dataset>/ and reused unless --rebuild is passed.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

from vrag.config import get_config
from vrag.data.beir import BeirDataset, doc_text, load_beir
from vrag.eval.retrieval_eval import evaluate, metric_names
from vrag.retrieval.bm25 import BM25Index
from vrag.retrieval.dense import DenseIndex
from vrag.retrieval.hybrid import HybridRetriever

METHODS = ("bm25", "dense", "hybrid")


def slug(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", name.split("/")[-1]).strip("-").lower()


class PrecomputedDense:
    """Dense search over query vectors encoded up front, keyed by query text."""

    def __init__(self, index: DenseIndex, vectors: dict):
        self.index = index
        self.vectors = vectors

    def search(self, query, k, exclude_ids=None):
        return self.index.search_vector(self.vectors[query], k, exclude_ids)


def run_queries(retriever, dataset: BeirDataset, depth: int) -> tuple[dict, float]:
    start = time.perf_counter()
    run = {qid: retriever.search(q, depth) for qid, q in dataset.queries.items()}
    return run, time.perf_counter() - start


def write_summary(out_dir: Path, datasets: list[str], names: list[str]) -> None:
    """Summarise every result file in ``out_dir``, so partial re-runs keep earlier rows."""
    lines = ["| dataset | method | " + " | ".join(names) + " |", "|---|---|" + "---|" * len(names)]
    embed_s: dict[str, float] = {}
    embedder = ""
    for name in datasets:
        for method in METHODS:
            path = out_dir / f"{name}_{method}.json"
            if not path.exists():
                continue
            res = json.loads(path.read_text())
            cells = " | ".join(f"{res['metrics'][k] * 100:.1f}" for k in names)
            lines.append(f"| {name} | {method} | {cells} |")
            embedder = res["config"]["embedder"]
            if res["timing"]["embed_docs_s"]:
                embed_s[name] = res["timing"]["embed_docs_s"]
    times = ", ".join(f"{n} {t:.0f}" for n, t in embed_s.items())
    lines += ["", f"Embedder `{embedder}`. Scores x100. Doc embedding time (s): {times}"]
    (out_dir / "summary.md").write_text("\n".join(lines) + "\n")


def main() -> None:
    cfg = get_config()
    r = cfg.retrieval
    ap = argparse.ArgumentParser()
    ap.add_argument("--datasets", nargs="+", default=cfg.data.beir_datasets)
    ap.add_argument("--embedder", default=r.embedder)
    ap.add_argument("--out-dir", type=Path, default=cfg.paths.results_dir / "retrieval")
    ap.add_argument("--rebuild", action="store_true")
    args = ap.parse_args()

    raw_dir = cfg.paths.data_dir / "raw"
    args.out_dir.mkdir(parents=True, exist_ok=True)
    names = metric_names(r.ndcg_k, r.recall_ks)
    embed_times: dict[str, float] = {}

    for name in args.datasets:
        ds = load_beir(name, cfg.data.beir_split, raw_dir)
        ids = list(ds.corpus)
        texts = [doc_text(ds.corpus[i]) for i in ids]
        index_dir = cfg.paths.data_dir / "indexes" / name
        print(f"[{name}] {len(ids)} docs, {len(ds.queries)} queries", flush=True)

        bm25_dir = index_dir / "bm25"
        build_s = {}
        if args.rebuild or not (bm25_dir / "ids.json").exists():
            t = time.perf_counter()
            bm25 = BM25Index.build(ids, texts)
            build_s["bm25"] = time.perf_counter() - t
            bm25.save(bm25_dir)
        else:
            bm25 = BM25Index.load(bm25_dir)

        dense_dir = index_dir / f"dense-{slug(args.embedder)}"
        prefix = r.query_prefix if args.embedder == r.embedder else None
        if args.rebuild or not (dense_dir / "meta.json").exists():
            dense = DenseIndex.build(
                ids, texts, args.embedder, prefix, r.max_seq_length, r.batch_size, True
            )
            dense.save(dense_dir)
        else:
            dense = DenseIndex.load(dense_dir)
        embed_times[name] = dense.meta["embed_time_s"]
        print(f"[{name}] embedding time {embed_times[name]:.1f}s", flush=True)

        # Encode queries once and reuse them, so dense and hybrid timings are comparable.
        t = time.perf_counter()
        qids = list(ds.queries)
        vectors = dense.encode_queries([ds.queries[q] for q in qids], r.batch_size)
        encode_s = time.perf_counter() - t
        vec = {ds.queries[q]: v for q, v in zip(qids, vectors, strict=True)}

        cached = PrecomputedDense(dense, vec)
        retrievers = {
            "bm25": bm25,
            "dense": cached,
            "hybrid": HybridRetriever(bm25, cached, r.first_stage_k, r.rrf_k),
        }
        for method in METHODS:
            run, search_s = run_queries(retrievers[method], ds, r.eval_depth)
            if method in ("dense", "hybrid"):
                search_s += encode_s
            metrics = evaluate(run, ds.qrels, r.ndcg_k, r.recall_ks)
            out = {
                "dataset": name,
                "split": ds.split,
                "method": method,
                "metrics": metrics,
                "config": {
                    "embedder": args.embedder,
                    "query_prefix": dense.query_prefix,
                    "max_seq_length": dense.max_seq_length,
                    "first_stage_k": r.first_stage_k,
                    "rrf_k": r.rrf_k,
                    "eval_depth": r.eval_depth,
                },
                "timing": {
                    "num_docs": len(ids),
                    "num_queries": len(qids),
                    "search_total_s": search_s,
                    "search_ms_per_query": 1000 * search_s / max(len(qids), 1),
                    "index_build_s": build_s.get(method),
                    "embed_docs_s": embed_times[name] if method != "bm25" else None,
                },
            }
            (args.out_dir / f"{name}_{method}.json").write_text(json.dumps(out, indent=2))
            print(
                f"[{name}] {method}: " + " ".join(f"{k}={v:.4f}" for k, v in metrics.items()),
                flush=True,
            )

    write_summary(args.out_dir, cfg.data.beir_datasets, names)


if __name__ == "__main__":
    main()
