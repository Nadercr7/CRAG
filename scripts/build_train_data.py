"""Build verifier training data (phase 3) under data/processed/train/.

- hotpot_train.jsonl: passage + sentence pairs from a seeded HotpotQA train sample
- hotpot_dev.jsonl:   the same construction on our 200 HotpotQA dev questions (for model
                      selection; the 300 test questions are never touched)
- beir_candidates.jsonl: BEIR train queries with positives and hybrid-retrieved candidates,
                      to be teacher-filtered into negatives on the GPU
- beir_dev_samples.jsonl: NFCorpus and FiQA dev queries with hybrid candidates, used as
                      reranking evaluators during training (an early warning for the
                      out-of-domain drop that HotpotQA dev cannot show)
- manifest.json: counts and settings
"""

from __future__ import annotations

import argparse
import json
import random
import re
from collections import Counter
from pathlib import Path

from vrag.config import get_config
from vrag.data.beir import doc_text, load_beir
from vrag.data.hotpot import HOTPOT_REPO, load_hotpot
from vrag.retrieval.bm25 import BM25Index
from vrag.retrieval.dense import DenseIndex
from vrag.retrieval.hybrid import HybridRetriever
from vrag.verifier.train_data import beir_candidates, hotpot_pairs, hotpot_training_pairs

HOTPOT_TRAIN_FILES = [f"distractor/train-0000{i}-of-00002.parquet" for i in range(2)]
COLUMNS = ["id", "question", "answer", "type", "context", "supporting_facts"]


def slug(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", name.split("/")[-1]).strip("-").lower()


def write_jsonl(path: Path, rows) -> int:
    n = 0
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    return n


def hotpot_train_rows() -> list[dict]:
    import pyarrow.parquet as pq
    from huggingface_hub import hf_hub_download

    rows: list[dict] = []
    for f in HOTPOT_TRAIN_FILES:
        path = hf_hub_download(HOTPOT_REPO, f, repo_type="dataset")
        rows += pq.read_table(path, columns=COLUMNS).to_pylist()
    return rows


def build_hotpot(args, cfg, out: Path, manifest: dict) -> None:
    pairs = hotpot_training_pairs(
        hotpot_train_rows(),
        args.hotpot_questions,
        args.seed,
        second_hop=args.second_hop,
        n_distractors=args.distractors,
        n_easy_passages=args.easy_passages,
    )
    name = args.hotpot_out or (
        "hotpot_train.jsonl"
        if args.second_hop == "positive"
        else f"hotpot_train_{args.second_hop}.jsonl"
    )
    write_jsonl(out / name, (p.to_dict() for p in pairs))
    manifest[name.removesuffix(".jsonl")] = Counter(
        f"{p.source}/{p.level}/{p.label}" for p in pairs
    )
    print("hotpot train", len(pairs))

    # Dev pairs come from the pipeline's dev questions (validation split), never from test.
    d = cfg.data
    data = load_hotpot(
        d.hotpot_test_size, d.hotpot_dev_size, d.hotpot_seed, cfg.paths.data_dir / "raw"
    )
    raw = json.loads(
        (
            cfg.paths.data_dir
            / "raw"
            / "hotpot"
            / f"sample_v2_s{d.hotpot_seed}_t{d.hotpot_test_size}_d{d.hotpot_dev_size}.json"
        ).read_text()
    )
    dev_ids = {q.id for q in data.split("dev")}
    rng = random.Random(args.seed)
    dev_pairs = [p for row in raw if row["id"] in dev_ids for p in hotpot_pairs(row, rng)]
    write_jsonl(out / "hotpot_dev.jsonl", (p.to_dict() for p in dev_pairs))
    manifest["hotpot_dev"] = Counter(f"{p.source}/{p.level}/{p.label}" for p in dev_pairs)
    print("hotpot dev", len(dev_pairs))


def build_beir(args, cfg, out: Path, manifest: dict) -> None:
    items: list[dict] = []
    for name in args.beir:
        ds = load_beir(name, "train", cfg.paths.data_dir / "raw")
        index_dir = cfg.paths.data_dir / "indexes" / name
        hybrid = HybridRetriever(
            BM25Index.load(index_dir / "bm25"),
            DenseIndex.load(index_dir / f"dense-{slug(cfg.retrieval.embedder)}"),
        )
        found = beir_candidates(
            ds, lambda q, k, h=hybrid: h.search(q, k), args.depth, args.max_positives
        )
        items += found
        manifest[f"beir_{name}"] = {
            "queries": len(found),
            "positives": sum(len(i["positives"]) for i in found),
        }
        print(name, len(found))
    write_jsonl(out / "beir_candidates.jsonl", items)


def build_beir_dev(args, cfg, out: Path, manifest: dict, max_queries: int = 300) -> None:
    """Dev reranking samples built exactly like the test protocol.

    Every judged document (grade > 0) in the hybrid top-50 is a positive and every
    unjudged one a negative. An earlier version used the top-3 graded documents against
    unjudged candidates only; it rewarded the "less overlap, more relevant" shortcut and
    disagreed with the test metric.
    """
    items: list[dict] = []
    for name in ("nfcorpus", "fiqa"):  # SciFact has no dev split
        ds = load_beir(name, "dev", cfg.paths.data_dir / "raw")
        index_dir = cfg.paths.data_dir / "indexes" / name
        hybrid = HybridRetriever(
            BM25Index.load(index_dir / "bm25"),
            DenseIndex.load(index_dir / f"dense-{slug(cfg.retrieval.embedder)}"),
        )
        found = 0
        for qid in sorted(ds.queries)[:max_queries]:
            hits = [d for d, _ in hybrid.search(ds.queries[qid], cfg.retrieval.rerank_depth)]
            judged = ds.qrels[qid]
            positives = [doc_text(ds.corpus[d]) for d in hits if judged.get(d, 0) > 0]
            negatives = [doc_text(ds.corpus[d]) for d in hits if d not in judged]
            if positives and negatives:
                items.append(
                    {
                        "qid": f"{name}:{qid}",
                        "query": ds.queries[qid],
                        "source": f"beir-{name}",
                        "positives": positives,
                        "candidates": negatives,
                    }
                )
                found += 1
        manifest[f"beir_dev_{name}"] = found
        print(name, "dev", found)
    write_jsonl(out / "beir_dev_samples.jsonl", items)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hotpot-questions", type=int, default=20_000)
    ap.add_argument("--beir", nargs="+", default=["scifact", "nfcorpus", "fiqa"])
    ap.add_argument("--depth", type=int, default=30)
    ap.add_argument("--max-positives", type=int, default=3)
    ap.add_argument(
        "--second-hop", choices=["positive", "skip-passage", "skip"], default="positive"
    )
    ap.add_argument("--distractors", type=int, default=4, help="HotpotQA distractor negatives")
    ap.add_argument("--easy-passages", type=int, default=2, help="random-paragraph negatives")
    ap.add_argument("--hotpot-out", help="file name for the HotpotQA training pairs")
    ap.add_argument("--seed", type=int, default=13)
    ap.add_argument("--beir-only", action="store_true", help="rebuild beir_candidates only")
    ap.add_argument("--hotpot-only", action="store_true", help="rebuild the HotpotQA files only")
    ap.add_argument("--beir-dev-only", action="store_true", help="rebuild beir_dev_samples only")
    args = ap.parse_args()

    cfg = get_config()
    out = cfg.paths.data_dir / "processed" / "train"
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "manifest.json"
    partial = args.beir_only or args.hotpot_only or args.beir_dev_only
    manifest: dict = json.loads(manifest_path.read_text()) if partial else {}
    manifest.update({"seed": args.seed, "depth": args.depth, "max_positives": args.max_positives})

    if not (args.beir_only or args.beir_dev_only):
        build_hotpot(args, cfg, out, manifest)
    if not (args.hotpot_only or args.beir_dev_only):
        build_beir(args, cfg, out, manifest)
    if not (args.beir_only or args.hotpot_only):
        build_beir_dev(args, cfg, out, manifest)
    manifest_path.write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
