"""Run the verifier GPU jobs on Kaggle from here: upload data, push a kernel, wait, pull.

    python scripts/kaggle_job.py dataset                       # create/update the data
    python scripts/kaggle_job.py prep                          # teacher filter + MS MARCO
    python scripts/kaggle_job.py train minilm-l6-s13 --base cross-encoder/ms-marco-MiniLM-L6-v2
    python scripts/kaggle_job.py run rerank-offshelf --cmd "..." --out results   # any repo script
    python scripts/kaggle_job.py wait <kernel-slug>            # poll, then download output

Kernels run the code at a pushed git commit (installed from GitHub), so push first.
Outputs land in data/kaggle/<kernel-slug>/.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

from vrag.config import REPO_ROOT, get_config

USER = "naderelakany"
DATASET = "vrag-train-data"
PREP_KERNEL = "vrag-prep"
DATA_FILES = ("hotpot_train.jsonl", "hotpot_dev.jsonl", "beir_candidates.jsonl")
RERANK_DATASETS = ("scifact", "nfcorpus", "fiqa")


def kaggle(*args: str) -> str:
    out = subprocess.run(["kaggle", *args], capture_output=True, text=True)
    if out.returncode:
        sys.exit(f"kaggle {' '.join(args)} failed:\n{out.stdout}\n{out.stderr}")
    return out.stdout


def head_commit() -> str:
    """HEAD, which must already be on GitHub because the job clones it from there."""
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, text=True)
    remote = subprocess.check_output(["git", "ls-remote", "origin"], cwd=REPO_ROOT, text=True)
    if commit.strip() not in remote:
        sys.exit("HEAD is not the tip of any remote branch: push before launching a Kaggle job")
    return commit.strip()


def work_dir(slug: str) -> Path:
    path = get_config().paths.data_dir / "kaggle" / slug
    path.mkdir(parents=True, exist_ok=True)
    return path


def upload_dataset() -> None:
    src = get_config().paths.data_dir / "processed" / "train"
    stage = work_dir("_dataset")
    for f in DATA_FILES:
        shutil.copy2(src / f, stage / f)
    # Rerank candidates (scripts/run_rerank_eval.py --export-only), flattened with a prefix.
    rerank = get_config().paths.data_dir / "processed" / "rerank"
    for name in RERANK_DATASETS:
        if (rerank / f"{name}.json").exists():
            shutil.copy2(rerank / f"{name}.json", stage / f"rerank_{name}.json")
    meta = {"title": DATASET, "id": f"{USER}/{DATASET}", "licenses": [{"name": "CC-BY-SA-4.0"}]}
    (stage / "dataset-metadata.json").write_text(json.dumps(meta, indent=2))
    exists = subprocess.run(
        ["kaggle", "datasets", "status", f"{USER}/{DATASET}"], capture_output=True, text=True
    )
    if exists.returncode == 0 and "ready" in exists.stdout.lower():
        print(kaggle("datasets", "version", "-p", str(stage), "-m", "update", "-q"))
    else:
        print(kaggle("datasets", "create", "-p", str(stage), "-q"))


def push_kernel(slug: str, script: Path, replacements: dict[str, str], kernel_sources: list[str]):
    stage = work_dir(slug) / "kernel"
    stage.mkdir(exist_ok=True)
    code = script.read_text()
    for key, value in replacements.items():
        code = code.replace(key, value)
    (stage / script.name).write_text(code)
    meta = {
        "id": f"{USER}/{slug}",
        "title": slug,
        "code_file": script.name,
        "language": "python",
        "kernel_type": "script",
        "is_private": True,
        "enable_gpu": True,
        "enable_internet": True,
        "dataset_sources": [f"{USER}/{DATASET}"],
        "kernel_sources": kernel_sources,
        "competition_sources": [],
    }
    (stage / "kernel-metadata.json").write_text(json.dumps(meta, indent=2))
    print(kaggle("kernels", "push", "-p", str(stage)))


def wait(slug: str, poll_s: int = 60) -> None:
    while True:
        status = kaggle("kernels", "status", f"{USER}/{slug}").lower()
        if any(s in status for s in ("complete", "error", "cancel")):
            break
        time.sleep(poll_s)
    print(status.strip())
    out = work_dir(slug) / "output"
    out.mkdir(exist_ok=True)
    print(kaggle("kernels", "output", f"{USER}/{slug}", "-p", str(out), "-o"))
    if "complete" not in status:
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="command", required=True)
    sub.add_parser("dataset")
    sub.add_parser("prep")
    t = sub.add_parser("train")
    t.add_argument("name")
    t.add_argument("--base", required=True)
    t.add_argument("--max-length", type=int, default=384)
    t.add_argument("--lr", type=float, default=2e-5)
    t.add_argument("--epochs", type=float, default=1)
    t.add_argument("--batch-size", type=int, default=64)
    t.add_argument("--seed", type=int, default=13)
    t.add_argument("--max-pairs", type=int, default=0)
    t.add_argument("--eval-steps", type=int, default=1000)
    t.add_argument("--exclude-sources", nargs="*", default=[])
    t.add_argument("--trust-remote-code", action="store_true")
    r = sub.add_parser("run")
    r.add_argument("name")
    r.add_argument("--cmd", action="append", required=True, help="shell command, repo root")
    r.add_argument("--out", action="append", default=["results"], help="repo path to keep")
    r.add_argument("--after", nargs="*", default=[], help="kernel slugs whose output to mount")
    w = sub.add_parser("wait")
    w.add_argument("slug")
    args = ap.parse_args()

    kaggle_dir = REPO_ROOT / "kaggle"
    if args.command == "dataset":
        upload_dataset()
    elif args.command == "prep":
        push_kernel(
            PREP_KERNEL,
            kaggle_dir / "prep_verifier" / "prep.py",
            {"__COMMIT__": head_commit()},
            [],
        )
    elif args.command == "train":
        config = {
            "name": args.name,
            "commit": head_commit(),
            "base_model": args.base,
            "max_length": args.max_length,
            "lr": args.lr,
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "seed": args.seed,
            "max_pairs": args.max_pairs,
            "eval_steps": args.eval_steps,
            "exclude_sources": args.exclude_sources,
            "trust_remote_code": args.trust_remote_code,
        }
        push_kernel(
            f"vrag-train-{args.name}",
            kaggle_dir / "train_verifier" / "train.py",
            {"__CONFIG__": json.dumps(json.dumps(config))},
            [f"{USER}/{PREP_KERNEL}"],
        )
    elif args.command == "run":
        job = {"commit": head_commit(), "commands": args.cmd, "outputs": sorted(set(args.out))}
        push_kernel(
            f"vrag-run-{args.name}",
            kaggle_dir / "run" / "run.py",
            {"__JOB__": json.dumps(json.dumps(job))},
            [f"{USER}/{s}" for s in args.after],
        )
    else:
        wait(args.slug)


if __name__ == "__main__":
    main()
