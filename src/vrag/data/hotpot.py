"""HotpotQA (distractor, validation): a seeded sample and one shared retrieval pool.

Questions are drawn once from the validation split with a seeded RNG: the first
``n_test`` of the draw form the test set, the next ``n_dev`` the dev set, so the two
are disjoint. Every paragraph of every sampled question goes into one pool.
Paragraph ids are a hash of title + text, which makes them stable across runs and dedupes
paragraphs that several questions share. Each question keeps the ids of its 10 paragraphs
and of its gold ones (those named by a supporting fact).
"""

from __future__ import annotations

import hashlib
import json
import random
from dataclasses import dataclass
from pathlib import Path

HOTPOT_REPO = "hotpotqa/hotpot_qa"
HOTPOT_FILE = "distractor/validation-00000-of-00001.parquet"


@dataclass(frozen=True)
class Paragraph:
    id: str
    title: str
    sentences: tuple[str, ...]

    @property
    def text(self) -> str:
        # HotpotQA sentences carry their own leading space, so plain concatenation restores it.
        return "".join(self.sentences).strip()


@dataclass(frozen=True)
class HotpotQuestion:
    id: str
    question: str
    answer: str
    type: str
    level: str
    split: str  # "test" or "dev"
    paragraph_ids: tuple[str, ...]  # all 10, in dataset order
    gold_ids: tuple[str, ...]
    supporting_facts: tuple[tuple[str, int], ...]  # (title, sentence index)


@dataclass
class HotpotData:
    questions: list[HotpotQuestion]
    pool: dict[str, Paragraph]

    def split(self, name: str) -> list[HotpotQuestion]:
        return [q for q in self.questions if q.split == name]

    def corpus(self) -> dict[str, dict[str, str]]:
        """The pool in the same shape as a BEIR corpus."""
        return {p.id: {"title": p.title, "text": p.text} for p in self.pool.values()}


def paragraph_id(title: str, text: str) -> str:
    digest = hashlib.sha1(f"{title}\n{text}".encode()).hexdigest()
    return f"hp_{digest[:12]}"


def sample_rows(rows: list[dict], n_test: int, n_dev: int, seed: int) -> list[dict]:
    """Seeded draw of ``n_test`` + ``n_dev`` rows; the order of the draw decides the split."""
    ordered = sorted(rows, key=lambda r: r["id"])
    if n_test + n_dev > len(ordered):
        raise ValueError(f"need {n_test + n_dev} questions but only {len(ordered)} available")
    return random.Random(seed).sample(ordered, n_test + n_dev)


def build_hotpot(rows: list[dict], n_test: int, n_dev: int, seed: int) -> HotpotData:
    """Sample ``n_test`` + ``n_dev`` disjoint questions from raw rows and build the pool."""
    return assemble(sample_rows(rows, n_test, n_dev, seed), n_test)


def assemble(sample: list[dict], n_test: int) -> HotpotData:
    """Build questions and pool from already-sampled rows: the first ``n_test`` are test."""
    pool: dict[str, Paragraph] = {}
    questions: list[HotpotQuestion] = []
    for n, row in enumerate(sample):
        titles = row["context"]["title"]
        by_title: dict[str, str] = {}
        pids: list[str] = []
        for title, sents in zip(titles, row["context"]["sentences"], strict=True):
            para = Paragraph(paragraph_id(title, "".join(sents).strip()), title, tuple(sents))
            pool.setdefault(para.id, para)
            by_title.setdefault(title, para.id)
            pids.append(para.id)
        facts = tuple(
            zip(row["supporting_facts"]["title"], row["supporting_facts"]["sent_id"], strict=True)
        )
        gold = tuple(dict.fromkeys(by_title[t] for t, _ in facts if t in by_title))
        questions.append(
            HotpotQuestion(
                id=row["id"],
                question=row["question"],
                answer=row["answer"],
                type=row["type"],
                level=row["level"],
                split="test" if n < n_test else "dev",
                paragraph_ids=tuple(pids),
                gold_ids=gold,
                supporting_facts=facts,
            )
        )
    return HotpotData(questions, pool)


def load_hotpot(
    n_test: int = 300, n_dev: int = 200, seed: int = 13, raw_dir: Path | str = "data/raw"
) -> HotpotData:
    """Load the sample, downloading the validation parquet on first use only.

    Only the sampled rows are cached, so later runs are offline.
    """
    root = Path(raw_dir) / "hotpot"
    root.mkdir(parents=True, exist_ok=True)
    # The cache stores the rows in draw order, so re-loading never re-samples.
    cache = root / f"sample_v2_s{seed}_t{n_test}_d{n_dev}.json"
    if cache.exists():
        sample = json.loads(cache.read_text())
    else:
        import pyarrow.parquet as pq
        from huggingface_hub import hf_hub_download

        path = hf_hub_download(HOTPOT_REPO, HOTPOT_FILE, repo_type="dataset")
        sample = sample_rows(pq.read_table(path).to_pylist(), n_test, n_dev, seed)
        cache.write_text(json.dumps(sample, ensure_ascii=False))
    return assemble(sample, n_test)
