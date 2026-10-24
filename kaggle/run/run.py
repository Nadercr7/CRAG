"""Kaggle job: run repo scripts on a GPU at a pinned commit, then keep chosen outputs.

The launcher (scripts/kaggle_job.py run) fills in JOB: the commit, shell commands run from
the repo root (with $INPUT pointing at /kaggle/input), and repo paths copied to
/kaggle/working when they finish.
"""

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

JOB = json.loads("""__JOB__""")
REPO = Path("/kaggle/tmp/crag")
OUT = Path("/kaggle/working")


def sh(cmd: str, cwd: Path | None = None) -> None:
    print(f"$ {cmd}", flush=True)
    subprocess.run(
        cmd, shell=True, check=True, cwd=cwd, env={**os.environ, "INPUT": "/kaggle/input"}
    )


start = time.time()
sh(f"git clone -q https://github.com/Nadercr7/CRAG {REPO}")
sh(f"git checkout -q {JOB['commit']}", REPO)
DEPS = "sentence-transformers==6.2.0 bm25s PyStemmer pytrec-eval-terrier"
sh(f"{sys.executable} -m pip install -q {DEPS}")
sh(f"{sys.executable} -m pip install -q --no-deps -e .", REPO)

failed = None
try:
    for cmd in JOB["commands"]:
        sh(cmd, REPO)
except subprocess.CalledProcessError as e:
    failed = str(e)
finally:
    for rel in JOB["outputs"]:
        src = REPO / rel
        if src.is_dir():
            shutil.copytree(src, OUT / rel, dirs_exist_ok=True)
        elif src.exists():
            (OUT / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, OUT / rel)
    report = {"job": JOB, "minutes": round((time.time() - start) / 60, 1), "failed": failed}
    (OUT / "run_report.json").write_text(json.dumps(report, indent=2))
if failed:
    sys.exit(failed)
