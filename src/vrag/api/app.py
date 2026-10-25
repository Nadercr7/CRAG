"""FastAPI app: results and examples as JSON, a live ``/api/ask``, and the static UI in ``web/``.

    uvicorn vrag.api.app:app

The static pages and the read-only endpoints need nothing but the repository files; only
``POST /api/ask`` needs the models, indexes and a Groq key, and answers 503 with an
explanation when they are missing.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from vrag.api.engine import (
    AnswerFailed,
    AnswerQuotaExhausted,
    Engine,
    EngineUnavailable,
    thresholds,
)
from vrag.config import REPO_ROOT, get_config

WEB_DIR = REPO_ROOT / "web"
HEADLINE_ORDER = ("test_main", "dev_main")  # the dashboard leads with the first one present
RUN_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")


def results_dir() -> Path:
    return get_config().paths.results_dir


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)


_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = Engine()
    return _engine


EngineDep = Annotated[Engine, Depends(get_engine)]

app = FastAPI(title="Verified RAG", version="0.1.0")


# ------------------------------------------------------------------------------ results


def _run_dirs() -> list[Path]:
    root = results_dir() / "qa"
    if not root.is_dir():
        return []
    return sorted(p for p in root.iterdir() if (p / "metrics.json").is_file())


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def _summary(path: Path) -> dict[str, Any]:
    m = _read_json(path / "metrics.json")
    meta = m.get("meta", {})
    return {
        "name": path.name,
        "split": meta.get("split"),
        "arms": meta.get("arms"),
        "n_traces": m.get("n_traces"),
        "generated": meta.get("generated"),
        "tau_abstain": (meta.get("tau_abstain") or {}).get("F"),
        "sufficiency": meta.get("sufficiency"),
        "dryrun": "dryrun" in path.name,
    }


@app.get("/api/runs")
def list_runs() -> dict[str, Any]:
    """QA runs found under ``results/qa``; ``headline`` is the one the dashboard leads with."""
    runs = [_summary(p) for p in _run_dirs()]
    names = [r["name"] for r in runs]
    headline = next((n for n in HEADLINE_ORDER if n in names), None)
    for r in runs:
        r["headline"] = r["name"] == headline
    runs.sort(key=lambda r: (not r["headline"], r["name"]))
    return {"headline": headline, "runs": runs}


@app.get("/api/runs/{name}")
def get_run(name: str) -> Any:
    if not RUN_NAME.match(name):
        raise HTTPException(404, "unknown run")
    path = results_dir() / "qa" / name / "metrics.json"
    if not path.is_file():
        raise HTTPException(404, f"no results for run {name!r}")
    return _read_json(path)


_ROW = re.compile(r"^\|\s*(\w+)\s*\|\s*(.+?)\s*\|((?:\s*[\d.]+\s*\|)+)\s*$")


def parse_retrieval_summary(text: str) -> dict[str, Any]:
    """The markdown table of ``results/retrieval/summary.md`` as JSON (scores x100)."""
    lines = text.splitlines()
    head = next((i for i, ln in enumerate(lines) if ln.startswith("| dataset")), None)
    if head is None:
        return {"columns": [], "rows": [], "notes": []}
    columns = [c.strip() for c in lines[head].strip("|").split("|")][2:]
    rows = []
    for ln in lines[head + 2 :]:
        m = _ROW.match(ln)
        if not m:
            continue
        values = [float(v) for v in m.group(3).strip(" |").split("|")]
        rows.append(
            {
                "dataset": m.group(1),
                "method": m.group(2),
                **dict(zip(columns, values, strict=False)),
            }
        )
    notes = [ln for ln in lines[head + 2 + len(rows) :] if ln.strip()]
    return {"columns": columns, "rows": rows, "notes": notes}


@app.get("/api/retrieval")
def retrieval_table() -> dict[str, Any]:
    """BEIR retrieval and reranking table (nDCG@10, recall, MRR; base vs fine-tuned verifier)."""
    path = results_dir() / "retrieval" / "summary.md"
    if not path.is_file():
        raise HTTPException(404, "results/retrieval/summary.md not found")
    return parse_retrieval_summary(path.read_text())


@app.get("/api/examples")
def examples() -> Any:
    """Curated real traces (arm A vs F); built by scripts/build_ui_examples.py."""
    path = WEB_DIR / "data" / "examples.json"
    if not path.is_file():
        raise HTTPException(404, "examples.json not built: run scripts/build_ui_examples.py")
    return FileResponse(path, media_type="application/json")


# ------------------------------------------------------------------------------- live


@app.get("/api/status")
def status(engine: EngineDep) -> dict[str, Any]:
    """Whether ``/api/ask`` can run here, and the thresholds it uses."""
    problems = engine.missing()
    return {
        "live": not problems,
        "problems": problems,
        "arm": "F",
        "thresholds": thresholds(engine.cfg),
        "answer_model": engine.cfg.llm.answer_model,
    }


@app.post("/api/ask")
def ask(req: AskRequest, engine: EngineDep) -> dict[str, Any]:
    question = " ".join(req.question.split())
    try:
        out = engine.ask(question)
    except EngineUnavailable as e:
        raise HTTPException(503, str(e)) from e
    except AnswerQuotaExhausted as e:
        raise HTTPException(503, str(e)) from e
    except AnswerFailed as e:
        raise HTTPException(502, str(e)) from e
    return asdict(out)


# ------------------------------------------------------------------------------ static

if WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
