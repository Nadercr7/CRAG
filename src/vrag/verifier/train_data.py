"""Training pairs for the verifier: (query, text, label) at passage and sentence level.

Three sources, chosen so the verifier learns "does this text help answer the question"
rather than "does this text mention the same entities" (the failure an independent CRAG
reproduction found in its T5 evaluator):

- HotpotQA train. Positives are the gold paragraphs. Negatives are the dataset's own
  distractors (retrieved for lexical overlap, so they are hard), **stripped gold** (a gold
  paragraph with its supporting sentences removed: same title and entities, no answer),
  and **easy negatives** (paragraphs and sentences of other questions). Sentence-level
  pairs come from the supporting-fact labels, which gives the refinement step free,
  human-annotated targets.

  Without the easy negatives the model unlearns lexical relevance altogether: supporting
  sentences often share no words with the question while stripped gold shares nearly all
  of them, so overlap stops meaning anything. The first L6 run scored a nonsense query
  ("zebra") against medical abstracts at +0.6 (the base checkpoint: -9.6) and fell from
  69.6 to 52.7 nDCG@10 on SciFact.
- BEIR train splits (scifact, nfcorpus, fiqa). Positives from qrels; negatives are
  candidates mined from our own hybrid retriever. False negatives are filtered later by a
  teacher cross-encoder on the GPU (``filter_candidates``), RocketQA style.
- MS MARCO triplets, streamed inside the training job, to keep the general ranking skill
  the base checkpoint already has.

Passage text uses ``doc_text`` (title + body), the same string retrieval indexes and the
pipeline scores. Sentence text uses ``sentence_text`` (title + sentence).
"""

from __future__ import annotations

import random
import re
from collections.abc import Callable, Iterable, Sequence
from dataclasses import asdict, dataclass

from vrag.data.beir import BeirDataset, doc_text


@dataclass(frozen=True)
class Pair:
    query: str
    text: str
    label: int
    source: str
    level: str  # "passage" or "sentence"
    group: str  # query id, so splits never cut a query in half

    def to_dict(self) -> dict:
        return asdict(self)


def sentence_text(title: str, sentence: str) -> str:
    """How a sentence is shown to the verifier, here and at refinement time."""
    return f"{title}: {sentence.strip()}"


def _contains_answer(text: str, answer: str) -> bool:
    answer = answer.strip()
    if not answer or answer.lower() in {"yes", "no"}:
        return False
    return re.search(rf"(?<!\w){re.escape(answer)}(?!\w)", text, re.IGNORECASE) is not None


def hotpot_pairs(
    row: dict,
    rng: random.Random,
    n_distractors: int = 4,
    n_sentence_distractors: int = 2,
) -> list[Pair]:
    """Passage and sentence pairs for one HotpotQA (distractor) row."""
    q, qid, answer = row["question"], row["id"], row["answer"]
    titles: list[str] = list(row["context"]["title"])
    paragraphs: list[list[str]] = [list(s) for s in row["context"]["sentences"]]
    support: dict[str, set[int]] = {}
    for title, idx in zip(
        row["supporting_facts"]["title"], row["supporting_facts"]["sent_id"], strict=True
    ):
        support.setdefault(title, set()).add(idx)

    def passage(title: str, sents: Sequence[str]) -> str:
        return doc_text({"title": title, "text": "".join(sents).strip()})

    pairs: list[Pair] = []
    gold = [(t, s) for t, s in zip(titles, paragraphs, strict=True) if t in support]
    others = [(t, s) for t, s in zip(titles, paragraphs, strict=True) if t not in support]

    for title, sents in gold:
        pairs.append(Pair(q, passage(title, sents), 1, "hotpot", "passage", qid))
        rest = [s for i, s in enumerate(sents) if i not in support[title]]
        rest_text = "".join(rest).strip()
        if rest and rest_text and not _contains_answer(rest_text, answer):
            pairs.append(Pair(q, passage(title, rest), 0, "hotpot-stripped", "passage", qid))
        for i, sent in enumerate(sents):
            if sent.strip():
                label = int(i in support[title])
                pairs.append(Pair(q, sentence_text(title, sent), label, "hotpot", "sentence", qid))

    for title, sents in rng.sample(others, min(n_distractors, len(others))):
        pairs.append(Pair(q, passage(title, sents), 0, "hotpot-distractor", "passage", qid))
    pool = [(t, s) for t, sents in others for s in sents if s.strip()]
    for title, sent in rng.sample(pool, min(n_sentence_distractors, len(pool))):
        pairs.append(Pair(q, sentence_text(title, sent), 0, "hotpot-distractor", "sentence", qid))
    return pairs


def easy_negatives(
    row: dict, others: Sequence[dict], rng: random.Random, n_passages: int = 2, n_sentences: int = 2
) -> list[Pair]:
    """Paragraphs and sentences drawn from other questions: unrelated, labelled 0."""
    q, qid = row["question"], row["id"]
    pairs: list[Pair] = []
    for other in rng.sample(list(others), min(n_passages + n_sentences, len(others))):
        k = rng.randrange(len(other["context"]["title"]))
        title, sents = other["context"]["title"][k], list(other["context"]["sentences"][k])
        if len(pairs) < n_passages:
            text = doc_text({"title": title, "text": "".join(sents).strip()})
            pairs.append(Pair(q, text, 0, "hotpot-random", "passage", qid))
        elif any(s.strip() for s in sents):
            sent = rng.choice([s for s in sents if s.strip()])
            pairs.append(Pair(q, sentence_text(title, sent), 0, "hotpot-random", "sentence", qid))
    return pairs


def hotpot_training_pairs(
    rows: Iterable[dict], n_questions: int, seed: int, easy: bool = True
) -> list[Pair]:
    rows = sorted(rows, key=lambda r: r["id"])
    rng = random.Random(seed)
    sample = rng.sample(rows, min(n_questions, len(rows)))
    pairs: list[Pair] = []
    for n, row in enumerate(sample):
        pairs += hotpot_pairs(row, rng)
        if easy:
            # Neighbours in the shuffled sample are unrelated questions.
            neighbours = sample[max(0, n - 3) : n] + sample[n + 1 : n + 4]
            pairs += easy_negatives(row, neighbours, rng)
    return pairs


Search = Callable[[str, int], list[tuple[str, float]]]


def beir_candidates(
    dataset: BeirDataset, search: Search, depth: int = 50, max_positives: int = 3
) -> list[dict]:
    """Per training query: positive texts and retrieved non-positive candidates, best first.

    Positives are the ``max_positives`` highest-graded judged documents (NFCorpus has ~43
    graded positives per query, mostly partial matches, which would swamp the mix).
    Candidates are not yet negatives: some are unlabelled relevant documents. The teacher
    filter in ``filter_candidates`` decides which ones are safe to use.
    """
    out = []
    for qid, query in dataset.queries.items():
        graded = sorted(
            ((rel, d) for d, rel in dataset.qrels[qid].items() if rel > 0 and d in dataset.corpus),
            key=lambda x: (-x[0], x[1]),
        )
        positives = [d for _, d in graded[:max_positives]]
        if not positives:
            continue
        hits = search(query, depth + len(positives))
        candidates = [d for d, _ in hits if d not in dataset.qrels[qid]][:depth]
        out.append(
            {
                "qid": f"{dataset.name}:{qid}",
                "query": query,
                "source": f"beir-{dataset.name}",
                "positives": [doc_text(dataset.corpus[d]) for d in positives],
                "candidates": [doc_text(dataset.corpus[d]) for d in candidates],
            }
        )
    return out


def false_negative_floor(
    pos_scores: Sequence[float], confident: float = 0.9, trusted_positive: float = 0.5
) -> float:
    """Teacher probability at or above which a candidate is treated as an unlabelled positive.

    A candidate is dropped when the teacher is confident it is relevant (``confident``), or
    when it scores at least as high as the best judged positive *and* the teacher itself
    finds that positive relevant (``trusted_positive``). Comparing against the weakest
    positive instead drops most candidates where the teacher disagrees with the qrels
    (on NFCorpus it would discard 81% of them).
    """
    best = max(pos_scores)
    return min(confident, best) if best >= trusted_positive else confident


def filter_candidates(
    item: dict,
    pos_scores: Sequence[float],
    cand_scores: Sequence[float],
    rng: random.Random,
    n_hard: int = 3,
    n_random: int = 3,
) -> list[Pair]:
    """Turn one ``beir_candidates`` item into pairs, given teacher probabilities.

    Candidates at or above ``false_negative_floor`` are dropped as likely positives. Of the
    rest, the ``n_hard`` best-ranked are kept, plus ``n_random`` drawn from the remainder.
    """
    floor = false_negative_floor(pos_scores)
    kept = [t for t, s in zip(item["candidates"], cand_scores, strict=True) if s < floor]
    hard, rest = kept[:n_hard], kept[n_hard:]
    negatives = hard + rng.sample(rest, min(n_random, len(rest)))
    q, qid, src = item["query"], item["qid"], item["source"]
    return [Pair(q, t, 1, src, "passage", qid) for t in item["positives"]] + [
        Pair(q, t, 0, src, "passage", qid) for t in negatives
    ]
