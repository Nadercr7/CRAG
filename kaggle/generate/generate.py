"""Kaggle job: batch-generate answers for exported pipeline prompts with vLLM.

The launcher (scripts/kaggle_job.py generate) fills in JOB: the model, the prompt file
name inside the prompts dataset, and sampling settings. Input rows are {"id", "messages"};
output rows in /kaggle/working/outputs.jsonl are {"id", "output"}.
"""

import glob
import json
import subprocess
import sys
import time
from pathlib import Path

JOB = json.loads(__JOB__)  # noqa: F821 (the launcher fills in a JSON string literal)
OUT = Path("/kaggle/working")

start = time.time()
subprocess.run([sys.executable, "-m", "pip", "install", "-q", f"vllm=={JOB['vllm']}"], check=True)

import torch  # noqa: E402
from vllm import LLM, SamplingParams  # noqa: E402

path = glob.glob(f"/kaggle/input/**/{JOB['prompts']}", recursive=True)[0]
rows = [json.loads(line) for line in Path(path).read_text().split("\n") if line.strip()]

llm = LLM(
    model=JOB["model"],
    dtype="half",  # T4 has no bf16
    tensor_parallel_size=torch.cuda.device_count(),
    max_model_len=JOB["max_model_len"],
    gpu_memory_utilization=0.9,
    seed=JOB["seed"],
)
params = SamplingParams(
    temperature=JOB["temperature"], max_tokens=JOB["max_tokens"], seed=JOB["seed"]
)
results = llm.chat([r["messages"] for r in rows], params, use_tqdm=True)

with (OUT / "outputs.jsonl").open("w", encoding="utf-8") as f:
    for row, res in zip(rows, results, strict=True):
        f.write(
            json.dumps({"id": row["id"], "output": res.outputs[0].text}, ensure_ascii=False) + "\n"
        )

report = {
    "job": JOB,
    "prompts": len(rows),
    "minutes": round((time.time() - start) / 60, 1),
    "gpus": [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())],
}
(OUT / "generate_report.json").write_text(json.dumps(report, indent=2))
print(report)
