"""Rebuild beir_pairs.jsonl from teacher scores, so the filter rule can change offline.

Reads data/processed/train/beir_candidates.jsonl and the prep job's teacher_scores.json,
writes data/processed/train/beir_pairs.jsonl.
"""

import argparse
import json
import random
from collections import Counter
from pathlib import Path

from vrag.config import get_config
from vrag.verifier.train_data import false_negative_floor, filter_candidates


def main() -> None:
    cfg = get_config()
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--scores",
        type=Path,
        default=cfg.paths.data_dir / "kaggle/vrag-prep/output/teacher_scores.json",
    )
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args()

    train = cfg.paths.data_dir / "processed" / "train"
    scores = json.loads(args.scores.read_text())
    rng = random.Random(args.seed)
    counts: Counter = Counter()
    with (train / "beir_pairs.jsonl").open("w", encoding="utf-8") as out:
        for line in (train / "beir_candidates.jsonl").open(encoding="utf-8"):
            item = json.loads(line)
            s = scores[item["qid"]]
            floor = false_negative_floor(s["positives"])
            counts["dropped", item["source"]] += sum(c >= floor for c in s["candidates"])
            counts["candidates", item["source"]] += len(s["candidates"])
            for pair in filter_candidates(item, s["positives"], s["candidates"], rng):
                counts[pair.source, pair.label] += 1
                out.write(json.dumps(pair.to_dict(), ensure_ascii=False) + "\n")
    for key, n in sorted(counts.items(), key=str):
        print(key, n)


if __name__ == "__main__":
    main()
