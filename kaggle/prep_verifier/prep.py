"""Kaggle job: teacher-filter BEIR negatives and sample MS MARCO pairs (verifier phase 3).

Inputs (Kaggle dataset): beir_candidates.jsonl. Outputs in /kaggle/working:
beir_pairs.jsonl, msmarco_pairs.jsonl, teacher_scores.json, prep_report.json.
"""

import glob
import json
import random
import subprocess
import sys
import time
from pathlib import Path

COMMIT = "__COMMIT__"
TEACHER = "BAAI/bge-reranker-base"
MSMARCO_QUERIES = 30_000
SEED = 13

subprocess.run(
    [sys.executable, "-m", "pip", "install", "-q", "sentence-transformers==6.2.0"], check=True
)
subprocess.run(
    [
        sys.executable,
        "-m",
        "pip",
        "install",
        "-q",
        "--no-deps",
        f"git+https://github.com/Nadercr7/CRAG@{COMMIT}",
    ],
    check=True,
)

import torch  # noqa: E402
from datasets import load_dataset  # noqa: E402
from sentence_transformers import CrossEncoder  # noqa: E402

from vrag.verifier.train_data import filter_candidates  # noqa: E402

report: dict = {"teacher": TEACHER, "seed": SEED}
start = time.time()

path = glob.glob("/kaggle/input/**/beir_candidates.jsonl", recursive=True)[0]
items = [json.loads(line) for line in Path(path).read_text().splitlines()]

teacher = CrossEncoder(TEACHER, device="cuda", max_length=384)
teacher.model.half()
flat = [(it["query"], t) for it in items for t in it["positives"] + it["candidates"]]
scores = teacher.predict(flat, batch_size=256, show_progress_bar=True, convert_to_numpy=True)
report["teacher_pairs"] = len(flat)
report["teacher_s"] = round(time.time() - start)

rng = random.Random(SEED)
pairs, cursor, dropped = [], 0, 0
teacher_scores = {}
for it in items:
    n_pos, n_cand = len(it["positives"]), len(it["candidates"])
    pos = scores[cursor : cursor + n_pos].tolist()
    cand = scores[cursor + n_pos : cursor + n_pos + n_cand].tolist()
    cursor += n_pos + n_cand
    teacher_scores[it["qid"]] = {"positives": pos, "candidates": cand}
    dropped += sum(s >= min(pos) for s in cand)
    pairs += [p.to_dict() for p in filter_candidates(it, pos, cand, rng)]
report["beir_pairs"] = len(pairs)
report["beir_candidates_dropped_as_likely_positive"] = int(dropped)

with open("/kaggle/working/beir_pairs.jsonl", "w") as f:
    for p in pairs:
        f.write(json.dumps(p, ensure_ascii=False) + "\n")
Path("/kaggle/working/teacher_scores.json").write_text(json.dumps(teacher_scores))

# MS MARCO: one positive and one BM25 negative per query, first MSMARCO_QUERIES queries
# of a shuffled stream.
stream = load_dataset(
    "sentence-transformers/msmarco-bm25", "triplet", split="train", streaming=True
)
seen: set[str] = set()
ms = []
for row in stream.shuffle(seed=SEED, buffer_size=100_000):
    q = row["query"]
    if q in seen:
        continue
    seen.add(q)
    gid = f"msmarco:{len(seen)}"
    ms.append(
        {
            "query": q,
            "text": row["positive"],
            "label": 1,
            "source": "msmarco",
            "level": "passage",
            "group": gid,
        }
    )
    ms.append(
        {
            "query": q,
            "text": row["negative"],
            "label": 0,
            "source": "msmarco",
            "level": "passage",
            "group": gid,
        }
    )
    if len(seen) >= MSMARCO_QUERIES:
        break
with open("/kaggle/working/msmarco_pairs.jsonl", "w") as f:
    for p in ms:
        f.write(json.dumps(p, ensure_ascii=False) + "\n")
report["msmarco_pairs"] = len(ms)
report["total_s"] = round(time.time() - start)
report["gpu"] = torch.cuda.get_device_name(0)
Path("/kaggle/working/prep_report.json").write_text(json.dumps(report, indent=2))
print(report)
