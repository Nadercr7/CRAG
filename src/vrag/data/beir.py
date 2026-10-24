"""BEIR loaders (corpus, queries, qrels) with an on-disk cache.

Corpus and queries come from ``BeIR/<name>`` parquet files, qrels from the separate
``BeIR/<name>-qrels`` TSVs. The first load downloads and writes plain JSON files under
``<raw_dir>/beir/<name>``; later loads read only those files and need no network.
Only queries that have at least one qrel row in the chosen split are kept.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path

Corpus = dict[str, dict[str, str]]
Queries = dict[str, str]
Qrels = dict[str, dict[str, int]]


@dataclass
class BeirDataset:
    name: str
    split: str
    corpus: Corpus
    queries: Queries
    qrels: Qrels


def doc_text(doc: dict[str, str]) -> str:
    """Text that gets indexed: title and body, as in the BEIR/MTEB convention."""
    return f"{doc['title']} {doc['text']}".strip()


def _read_parquet(repo: str, prefix: str) -> list[dict[str, str]]:
    import pyarrow.parquet as pq
    from huggingface_hub import HfApi, hf_hub_download

    files = sorted(
        f
        for f in HfApi().list_repo_files(repo, repo_type="dataset")
        if f.startswith(prefix + "/") and f.endswith(".parquet")
    )
    rows: list[dict[str, str]] = []
    for f in files:
        rows += pq.read_table(hf_hub_download(repo, f, repo_type="dataset")).to_pylist()
    return rows


def _read_qrels(name: str, split: str) -> Qrels:
    from huggingface_hub import hf_hub_download

    path = hf_hub_download(f"BeIR/{name}-qrels", f"{split}.tsv", repo_type="dataset")
    qrels: Qrels = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            qrels.setdefault(row["query-id"], {})[row["corpus-id"]] = int(row["score"])
    return qrels


def load_beir(name: str, split: str = "test", raw_dir: Path | str = "data/raw") -> BeirDataset:
    root = Path(raw_dir) / "beir" / name
    root.mkdir(parents=True, exist_ok=True)
    corpus_path, queries_path = root / "corpus.json", root / "queries.json"
    qrels_path = root / f"qrels_{split}.json"

    if not corpus_path.exists():
        rows = _read_parquet(f"BeIR/{name}", "corpus")
        corpus = {r["_id"]: {"title": r["title"] or "", "text": r["text"] or ""} for r in rows}
        corpus_path.write_text(json.dumps(corpus, ensure_ascii=False))
    if not queries_path.exists():
        rows = _read_parquet(f"BeIR/{name}", "queries")
        queries_path.write_text(json.dumps({r["_id"]: r["text"] for r in rows}, ensure_ascii=False))
    if not qrels_path.exists():
        qrels_path.write_text(json.dumps(_read_qrels(name, split)))

    corpus = json.loads(corpus_path.read_text())
    all_queries = json.loads(queries_path.read_text())
    qrels = json.loads(qrels_path.read_text())
    queries = {qid: all_queries[qid] for qid in qrels if qid in all_queries}
    qrels = {qid: qrels[qid] for qid in queries}
    return BeirDataset(name, split, corpus, queries, qrels)
