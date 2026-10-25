"""Compare sufficiency classifiers on the HotpotQA-derived dev set.

AUC of "sufficient" against each insufficient kind, plus pooled.

    python scripts/eval_sufficiency.py MODEL_DIR [MODEL_DIR ...] --out results/tuning/sufficiency.md
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from sentence_transformers import CrossEncoder
from sklearn.metrics import roc_auc_score

DEV = Path("data/processed/train/sufficiency_dev.jsonl")


def score(model_dir: str, rows: list[dict], batch_size: int) -> list[float]:
    model = CrossEncoder(model_dir, max_length=512, device="cpu")
    pairs = [(r["question"], r["context"]) for r in rows]
    return model.predict(pairs, batch_size=batch_size, activation_fn=None).tolist()


def aucs(rows: list[dict], scores: list[float]) -> dict[str, float]:
    pos = [s for r, s in zip(rows, scores, strict=True) if r["label"] == 1]
    out = {}
    for kind in ("missing-hop", "no-evidence"):
        neg = [s for r, s in zip(rows, scores, strict=True) if r["kind"] == kind]
        out[kind] = roc_auc_score([1] * len(pos) + [0] * len(neg), pos + neg)
    out["pooled"] = roc_auc_score([r["label"] for r in rows], scores)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("models", nargs="+")
    ap.add_argument("--dev", type=Path, default=DEV)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    rows = [json.loads(line) for line in args.dev.read_text().split("\n") if line]
    lines = [
        f"Sufficiency dev ({len(rows)} examples), ROC AUC of sufficient vs each kind.",
        "",
        "| Model | missing-hop | no-evidence | pooled |",
        "|---|---|---|---|",
    ]
    for m in args.models:
        a = aucs(rows, score(m, rows, args.batch_size))
        cells = " | ".join(f"{a[k]:.3f}" for k in ("missing-hop", "no-evidence", "pooled"))
        lines.append(f"| {m} | {cells} |")
        print(lines[-1], flush=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
