"""Retrieval metrics via pytrec_eval: nDCG@k, Recall@k and MRR.

Follows the BEIR convention of dropping hits whose doc id equals the query id (matters for
ArguAna and Quora, where a query is also in the corpus). MRR is computed over the ranked
list passed in, so pass the same depth for every method.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import pytrec_eval

Run = Mapping[str, Sequence[tuple[str, float]]]
Qrels = Mapping[str, Mapping[str, int]]


def metric_names(ndcg_k: int = 10, recall_ks: Sequence[int] = (20, 100)) -> list[str]:
    return [f"ndcg@{ndcg_k}", *(f"recall@{k}" for k in recall_ks), "mrr"]


def evaluate(
    run: Run,
    qrels: Qrels,
    ndcg_k: int = 10,
    recall_ks: Sequence[int] = (20, 100),
    ignore_identical_ids: bool = True,
    return_per_query: bool = False,
) -> dict[str, float] | tuple[dict[str, float], dict[str, dict[str, float]]]:
    """Mean metrics over every query in ``qrels`` (a query missing from ``run`` scores 0).

    With ``return_per_query`` also returns ``{metric: {qid: value}}`` for paired tests.
    """
    trec_run = {}
    for qid in qrels:
        hits = run.get(qid, [])
        # Scores are rank-derived so pytrec_eval's tie handling cannot reorder equal scores.
        trec_run[qid] = {
            doc_id: float(len(hits) - rank)
            for rank, (doc_id, _) in enumerate(
                h for h in hits if not (ignore_identical_ids and h[0] == qid)
            )
        }
    measures = {f"ndcg_cut_{ndcg_k}", "recip_rank", *(f"recall_{k}" for k in recall_ks)}
    per_query = pytrec_eval.RelevanceEvaluator(
        {q: dict(d) for q, d in qrels.items()}, measures
    ).evaluate(trec_run)
    n = len(qrels)

    def mean(measure: str) -> float:
        return sum(m[measure] for m in per_query.values()) / n if n else 0.0

    trec_names = {
        f"ndcg@{ndcg_k}": f"ndcg_cut_{ndcg_k}",
        **{f"recall@{k}": f"recall_{k}" for k in recall_ks},
        "mrr": "recip_rank",
    }
    metrics = {name: mean(measure) for name, measure in trec_names.items()}
    if not return_per_query:
        return metrics
    values = {
        name: {qid: per_query[qid][measure] for qid in qrels}
        for name, measure in trec_names.items()
    }
    return metrics, values
