"""Run ``prepare`` (no answer generation) on HotpotQA dev questions and print compact traces.

Uses the real pool (BM25 + bge-small, built once under data/indexes/hotpot) and the
off-the-shelf MiniLM-L6 as an uncalibrated verifier. Slices cycle through
supportive / missing / misleading. The only LLM call is the query rewrite, which is cached.
"""

from __future__ import annotations

import argparse
import json
from itertools import cycle

from vrag.config import get_config
from vrag.data.beir import doc_text
from vrag.data.hotpot import load_hotpot
from vrag.data.slices import KINDS, build_slices
from vrag.llm import LLMClient
from vrag.pipeline.pipeline import VerifiedRAG, hotpot_lookup, make_arm
from vrag.pipeline.types import Trace
from vrag.retrieval.bm25 import BM25Index
from vrag.retrieval.dense import DenseIndex
from vrag.retrieval.hybrid import HybridRetriever
from vrag.verifier.offshelf import CrossEncoderVerifier


def load_indexes(data, cfg, rebuild: bool) -> HybridRetriever:
    r = cfg.retrieval
    root = cfg.paths.data_dir / "indexes" / "hotpot"
    if rebuild or not (root / "bm25").exists():
        corpus = data.corpus()
        ids = list(corpus)
        texts = [doc_text(corpus[i]) for i in ids]
        root.mkdir(parents=True, exist_ok=True)
        BM25Index.build(ids, texts).save(root / "bm25")
        DenseIndex.build(
            ids, texts, r.embedder, r.query_prefix, r.max_seq_length, r.batch_size, True
        ).save(root / "dense")
    return HybridRetriever(
        BM25Index.load(root / "bm25"), DenseIndex.load(root / "dense"), r.first_stage_k, r.rrf_k
    )


def show(t: Trace, gold: str) -> None:
    print(f"\n=== [{t.slice_kind}] {t.question}  (gold: {gold})")
    print(f"decision {t.decision} -> {t.final_decision} | queries {t.queries}")
    for c in sorted((c for c in t.chunks if c.selected), key=lambda c: -(c.prob or 0))[:5]:
        print(
            f"  chunk r{c.round}#{c.retrieval_rank:<2} logit {c.verifier_logit:6.2f} "
            f"p {c.prob:.3f}  {c.title}"
        )
    n_kept = sum(s.kept for s in t.sentences)
    print(f"sentences scored {len(t.sentences)}, kept {n_kept}; context ({len(t.context)} lines):")
    for line in t.context:
        print("  " + (line if len(line) <= 150 else line[:147] + "..."))
    print(f"abstain {t.abstain} ({t.abstain_reason}) sufficiency {t.sufficiency_prob}")
    print(f"llm_calls {t.llm_calls} notes {t.notes}")
    print("timings_ms " + json.dumps({k: round(v, 1) for k, v in t.timings_ms.items()}))


def main() -> None:
    cfg = get_config()
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--arm", default="F")
    ap.add_argument("--split", default="dev")
    ap.add_argument("--verifier", default="cross-encoder/ms-marco-MiniLM-L6-v2")
    ap.add_argument("--rebuild-index", action="store_true")
    args = ap.parse_args()

    d = cfg.data
    data = load_hotpot(
        d.hotpot_test_size, d.hotpot_dev_size, d.hotpot_seed, cfg.paths.data_dir / "raw"
    )
    subs_path = cfg.paths.data_dir / "processed" / "hotpot_substitutes.json"
    subs = json.loads(subs_path.read_text()) if subs_path.exists() else {}
    # The saved file maps ids to one string; build_slices expects a list of proposals.
    subs = {k: [v] if isinstance(v, str) else v for k, v in subs.items()}
    slices = build_slices(data, d.slice_seed, subs)

    rag = VerifiedRAG(
        load_indexes(data, cfg, args.rebuild_index),
        CrossEncoderVerifier(args.verifier),
        None,  # uncalibrated: sigmoid of the raw logit
        None,  # no sufficiency model yet
        LLMClient(),
        hotpot_lookup(data.pool),
        make_arm(args.arm, cfg.pipeline),
        rewrite_model=cfg.llm.rewrite_model,
    )
    for q, kind in zip(data.split(args.split)[: args.n], cycle(KINDS), strict=False):
        sl = slices[q.id].get(kind) or slices[q.id]["supportive"]
        show(rag.prepare(q.question, sl, qid=q.id), q.answer)


if __name__ == "__main__":
    main()
