"""Kaggle job: fine-tune a cross-encoder: the verifier (phase 3) or the sufficiency model (4).

The launcher (scripts/kaggle_job.py) fills in CONFIG. Inputs, all in the training-data
dataset: hotpot_train.jsonl, hotpot_dev.jsonl, beir_pairs.jsonl, msmarco_pairs.jsonl.
For task "sufficiency": sufficiency_train.jsonl, sufficiency_dev.jsonl.
Outputs in /kaggle/working: model/, train_report.json.
"""

import glob
import json
import os
import random
import subprocess
import sys
import time
from pathlib import Path

CONFIG = json.loads(__CONFIG__)  # noqa: F821 (the launcher fills in a JSON string literal)

# One GPU: with two visible, the HF Trainer wraps the model in DataParallel, which
# sentence-transformers' losses do not support (they read model.device).
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")
INPUT = CONFIG.get("input_dir", "/kaggle/input")
OUTPUT = Path(CONFIG.get("output_dir", "/kaggle/working"))
if not CONFIG.get("skip_install"):
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "sentence-transformers==6.2.0"], check=True
    )

import torch  # noqa: E402
from datasets import Dataset  # noqa: E402
from sentence_transformers.cross_encoder import (  # noqa: E402
    CrossEncoder,
    CrossEncoderTrainer,
    CrossEncoderTrainingArguments,
)
from sentence_transformers.cross_encoder.evaluation import (  # noqa: E402
    CrossEncoderClassificationEvaluator,
    CrossEncoderRerankingEvaluator,
)
from sentence_transformers.cross_encoder.losses import BinaryCrossEntropyLoss  # noqa: E402
from sentence_transformers.evaluation import SequentialEvaluator  # noqa: E402


def read(name: str) -> list[dict]:
    path = glob.glob(f"{INPUT}/**/{name}", recursive=True)[0]
    # split on "\n" only: str.splitlines also breaks on U+2028 etc. inside JSON strings
    return [json.loads(line) for line in Path(path).read_text().split("\n") if line]


def rerank_samples(pairs: list[dict], level: str) -> list[dict]:
    """Group dev pairs by question into reranking samples (queries with >=1 positive)."""
    groups: dict[str, dict] = {}
    for p in pairs:
        if p["level"] != level:
            continue
        g = groups.setdefault(p["group"], {"query": p["query"], "positive": [], "negative": []})
        g["positive" if p["label"] else "negative"].append(p["text"])
    return [g for g in groups.values() if g["positive"] and g["negative"]]


start = time.time()
random.seed(CONFIG["seed"])
torch.manual_seed(CONFIG["seed"])

TASK = CONFIG.get("task", "verifier")
if TASK == "sufficiency":
    train = [
        {"query": e["question"], "text": e["context"], "label": e["label"], "source": e["kind"]}
        for e in read("sufficiency_train.jsonl")
    ]
    dev = read("sufficiency_dev.jsonl")
else:
    hotpot = CONFIG.get("hotpot_file", "hotpot_train.jsonl")
    train = read(hotpot) + read("beir_pairs.jsonl") + read("msmarco_pairs.jsonl")
    dev = read("hotpot_dev.jsonl")
if CONFIG.get("exclude_sources"):
    train = [p for p in train if p["source"] not in CONFIG["exclude_sources"]]
if CONFIG.get("max_pairs") and len(train) > CONFIG["max_pairs"]:
    train = random.sample(train, CONFIG["max_pairs"])
random.shuffle(train)

train_ds = Dataset.from_dict(
    {
        "query": [p["query"] for p in train],
        "text": [p["text"] for p in train],
        "label": [float(p["label"]) for p in train],
    }
)

model = CrossEncoder(
    CONFIG["base_model"],
    num_labels=1,
    max_length=CONFIG["max_length"],
    trust_remote_code=CONFIG.get("trust_remote_code", False),
)
if TASK == "sufficiency":
    evaluator = CrossEncoderClassificationEvaluator(
        [[e["question"], e["context"]] for e in dev],
        [e["label"] for e in dev],
        name="sufficiency-dev",
    )
else:
    evaluators = [
        CrossEncoderRerankingEvaluator(rerank_samples(dev, "passage"), name="hotpot-dev-passage"),
        CrossEncoderRerankingEvaluator(rerank_samples(dev, "sentence"), name="hotpot-dev-sentence"),
    ]
    # BEIR dev queries with hybrid candidates: the out-of-domain early warning.
    beir_dev = (
        read("beir_dev_samples.jsonl")
        if glob.glob(f"{INPUT}/**/beir_dev_samples.jsonl", recursive=True)
        else []
    )
    for source in sorted({item["source"] for item in beir_dev}):
        samples = [
            {"query": i["query"], "positive": i["positives"], "negative": i["candidates"]}
            for i in beir_dev
            if i["source"] == source and i["candidates"]
        ]
        evaluators.append(CrossEncoderRerankingEvaluator(samples, name=f"{source}-dev"))
    evaluator = SequentialEvaluator(evaluators)
before = evaluator(model)

args = CrossEncoderTrainingArguments(
    output_dir=str(OUTPUT / "checkpoints"),
    num_train_epochs=CONFIG["epochs"],
    per_device_train_batch_size=CONFIG["batch_size"],
    learning_rate=CONFIG["lr"],
    warmup_ratio=0.1,
    weight_decay=0.01,
    fp16=CONFIG.get("fp16", True),
    eval_strategy="steps",
    eval_steps=CONFIG["eval_steps"],
    save_strategy="no",
    logging_steps=100,
    seed=CONFIG["seed"],
    dataloader_num_workers=CONFIG.get("workers", 2),
    max_steps=CONFIG.get("max_steps", -1),
    report_to="none",
)
trainer = CrossEncoderTrainer(
    model=model,
    args=args,
    train_dataset=train_ds,
    loss=BinaryCrossEntropyLoss(model),
    evaluator=evaluator,
)
trainer.train()
after = evaluator(model)
model.save_pretrained(str(OUTPUT / "model"))

report = {
    "config": CONFIG,
    "train_pairs": len(train),
    "train_sources": {
        s: sum(p["source"] == s for p in train) for s in sorted({p["source"] for p in train})
    },
    "dev_before": before,
    "dev_after": after,
    "log": [e for e in trainer.state.log_history if "loss" in e or "eval_loss" in e][-50:],
    "minutes": round((time.time() - start) / 60, 1),
    "gpus": [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())],
}
(OUTPUT / "train_report.json").write_text(json.dumps(report, indent=2))
print(json.dumps({k: report[k] for k in ("dev_before", "dev_after", "minutes")}, indent=2))
