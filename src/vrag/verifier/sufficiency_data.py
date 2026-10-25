"""Training examples for the sufficiency model: (question, context, sufficient?).

HotpotQA marks the sentences a human needed to answer each question (supporting facts),
so sufficiency labels come for free: a context is sufficient when it contains every
supporting sentence. Joren et al. (ICLR 2025) define sufficiency as "a plausible answer
can be inferred from the context"; supporting-fact coverage is a stricter, cheaper proxy.
An LLM teacher (their autorater prompt) could check agreement on a sample; this was not run
(the Groq free tier's daily token cap went to the evaluation instead).

Contexts look like the pipeline's refined context: numbered "[n] Title: sentence" lines
(``context_lines``), with the evidence mixed among distractor sentences. Per question:

- sufficient: every supporting sentence plus a few random others.
- missing-hop: the supporting sentences of one gold paragraph removed (multi-hop questions
  need both), plus the same kind of filler. Hard negative: half the evidence is there.
- no-evidence: distractor sentences only.
"""

from __future__ import annotations

import random
from dataclasses import asdict, dataclass

from vrag.verifier.train_data import sentence_text


@dataclass(frozen=True)
class SufficiencyExample:
    question: str
    context: str
    label: int
    kind: str  # "sufficient", "missing-hop" or "no-evidence"
    group: str

    def to_dict(self) -> dict:
        return asdict(self)


def context_lines(lines: list[str]) -> str:
    """The numbered context format shared with the answer prompt."""
    return "\n".join(f"[{i}] {line}" for i, line in enumerate(lines, 1))


def _sentences(row: dict) -> list[tuple[str, int, str]]:
    return [
        (title, i, sent)
        for title, sents in zip(row["context"]["title"], row["context"]["sentences"], strict=True)
        for i, sent in enumerate(sents)
        if sent.strip()
    ]


def _ordered(items: list[tuple[str, int, str]], titles: list[str]) -> list[str]:
    """Group by paragraph in dataset order, sentences in their original order."""
    rank = {t: n for n, t in enumerate(titles)}
    return [sentence_text(t, s) for t, _, s in sorted(items, key=lambda x: (rank[x[0]], x[1]))]


def sufficiency_examples(
    row: dict, rng: random.Random, n_filler: tuple[int, int] = (1, 5)
) -> list[SufficiencyExample]:
    """Up to three examples (sufficient, missing-hop, no-evidence) for one HotpotQA row."""
    q, qid = row["question"], row["id"]
    titles = list(row["context"]["title"])
    support = set(
        zip(row["supporting_facts"]["title"], row["supporting_facts"]["sent_id"], strict=True)
    )
    sentences = _sentences(row)
    evidence = [x for x in sentences if (x[0], x[1]) in support]
    if not evidence:
        return []
    gold_titles = sorted({t for t, _ in support if t in titles}, key=titles.index)
    others = [x for x in sentences if (x[0], x[1]) not in support]
    distractors = [x for x in others if x[0] not in gold_titles]

    def filler(pool: list[tuple[str, int, str]]) -> list[tuple[str, int, str]]:
        return rng.sample(pool, min(rng.randint(*n_filler), len(pool)))

    out = [
        SufficiencyExample(
            q, context_lines(_ordered(evidence + filler(others), titles)), 1, "sufficient", qid
        )
    ]
    if len(gold_titles) >= 2:
        dropped = rng.choice(gold_titles)
        kept = [x for x in evidence if x[0] != dropped]
        pool = [x for x in others if x[0] != dropped or (x[0], x[1]) not in support]
        out.append(
            SufficiencyExample(
                q, context_lines(_ordered(kept + filler(pool), titles)), 0, "missing-hop", qid
            )
        )
    if distractors:
        picked = rng.sample(distractors, min(rng.randint(2, 6), len(distractors)))
        out.append(
            SufficiencyExample(q, context_lines(_ordered(picked, titles)), 0, "no-evidence", qid)
        )
    return out
