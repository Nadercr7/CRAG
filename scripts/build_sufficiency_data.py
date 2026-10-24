"""Build sufficiency-model data under data/processed/train/ from HotpotQA supporting facts.

- sufficiency_train.jsonl: a seeded sample of HotpotQA train questions (a different seed
  from the verifier sample, so the two models do not see the same draw)
- sufficiency_dev.jsonl: the pipeline's 200 dev questions; test questions are never used
"""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter

from build_train_data import hotpot_train_rows, write_jsonl

from vrag.config import get_config
from vrag.data.hotpot import load_hotpot
from vrag.verifier.sufficiency_data import sufficiency_examples


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--questions", type=int, default=20_000)
    ap.add_argument("--seed", type=int, default=14)
    args = ap.parse_args()

    cfg = get_config()
    d = cfg.data
    out = cfg.paths.data_dir / "processed" / "train"
    out.mkdir(parents=True, exist_ok=True)

    rows = sorted(hotpot_train_rows(), key=lambda r: r["id"])
    rng = random.Random(args.seed)
    sample = rng.sample(rows, min(args.questions, len(rows)))
    train = [e for row in sample for e in sufficiency_examples(row, rng)]
    write_jsonl(out / "sufficiency_train.jsonl", (e.to_dict() for e in train))

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
    dev_rows = [r for r in raw if r["id"] in dev_ids]
    dev = [e for row in dev_rows for e in sufficiency_examples(row, random.Random(args.seed))]
    write_jsonl(out / "sufficiency_dev.jsonl", (e.to_dict() for e in dev))

    for name, examples in (("train", train), ("dev", dev)):
        print(name, len(examples), dict(Counter(e.kind for e in examples)))


if __name__ == "__main__":
    main()
