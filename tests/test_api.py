"""API tests: static files, results endpoints and a mocked /api/ask (no models, no network)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from vrag.api import app as api
from vrag.api.engine import (
    Answer,
    AnswerFailed,
    AnswerQuotaExhausted,
    Engine,
    EngineUnavailable,
)
from vrag.config import Config, load_config


def make_results(root: Path, runs: dict[str, str]) -> None:
    for name, split in runs.items():
        d = root / "qa" / name
        d.mkdir(parents=True)
        meta = {"split": split, "arms": ["A", "F"], "tau_abstain": {"F": 0.9}, "generated": "x"}
        (d / "metrics.json").write_text(json.dumps({"run": name, "meta": meta, "n_traces": 3}))
    (root / "retrieval").mkdir()
    (root / "retrieval" / "summary.md").write_text(
        "| dataset | method | ndcg@10 | recall@20 | recall@100 | mrr |\n"
        "|---|---|---|---|---|---|\n"
        "| scifact | bm25 | 68.6 | 85.7 | 91.3 | 65.3 |\n"
        "| scifact | hybrid + verifier-x | 68.0 | 89.2 | 94.4 | 66.0 |\n\n"
        "Embedder `x`. Scores x100.\n"
    )


class FakeEngine(Engine):
    def __init__(self, result=None, error: Exception | None = None, missing=()):
        super().__init__(Config())
        self.result, self.error, self._missing = result, error, list(missing)
        self.asked: list[str] = []

    def missing(self) -> list[str]:
        return self._missing

    def ask(self, question: str) -> Answer:
        self.asked.append(question)
        if self.error:
            raise self.error
        return self.result


def answer() -> Answer:
    trace = {"question": "q", "answer": "Paris", "citations": [1], "abstain": False, "chunks": []}
    return Answer(trace, {"retrieve": 1.0, "total": 2.0}, {"tau_abstain": 0.9}, "F", "m", False)


@pytest.fixture
def client(tmp_path, monkeypatch):
    make_results(tmp_path, {"dev_main": "dev"})
    monkeypatch.setattr(api, "results_dir", lambda: tmp_path)
    api.app.dependency_overrides.clear()
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def use(engine: Engine) -> None:
    api.app.dependency_overrides[api.get_engine] = lambda: engine


def test_runs_fall_back_to_dev_then_prefer_test(client, tmp_path):
    body = client.get("/api/runs").json()
    assert body["headline"] == "dev_main"
    make_results_test = tmp_path / "qa" / "test_main"
    make_results_test.mkdir()
    meta = {"split": "test", "arms": ["A"], "tau_abstain": {"F": 0.9}}
    (make_results_test / "metrics.json").write_text(json.dumps({"meta": meta, "n_traces": 9}))
    body = client.get("/api/runs").json()
    assert body["headline"] == "test_main"
    assert [r["name"] for r in body["runs"]] == ["test_main", "dev_main"]
    assert body["runs"][0]["headline"] and not body["runs"][1]["headline"]


def test_runs_without_results_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "results_dir", lambda: tmp_path / "nothing")
    assert TestClient(api.app).get("/api/runs").json() == {"headline": None, "runs": []}


def test_get_run_and_errors(client):
    assert client.get("/api/runs/dev_main").json()["meta"]["split"] == "dev"
    assert client.get("/api/runs/nope").status_code == 404
    assert client.get("/api/runs/..%2f..%2fsecret").status_code == 404
    assert client.get("/api/runs/a b").status_code == 404


def test_retrieval_table_parsed(client):
    body = client.get("/api/retrieval").json()
    assert body["columns"] == ["ndcg@10", "recall@20", "recall@100", "mrr"]
    assert body["rows"][1] == {
        "dataset": "scifact",
        "method": "hybrid + verifier-x",
        "ndcg@10": 68.0,
        "recall@20": 89.2,
        "recall@100": 94.4,
        "mrr": 66.0,
    }
    assert body["notes"] == ["Embedder `x`. Scores x100."]


def test_examples_served_and_valid():
    path = api.WEB_DIR / "data" / "examples.json"
    if not path.exists():
        pytest.skip("examples.json not built")
    body = TestClient(api.app).get("/api/examples").json()
    assert 15 <= len(body["examples"]) <= 30
    first = body["examples"][0]
    assert {"A", "F"} <= set(first["arms"])
    assert {e["slice"] for e in body["examples"]} == {"supportive", "missing", "misleading"}
    assert {e["verdict"] for e in body["examples"]} >= {"better", "worse"}


def test_static_pages_served():
    c = TestClient(api.app)
    for page in ("/", "/results.html", "/css/app.css", "/js/common.js"):
        if (api.WEB_DIR / page.lstrip("/")).exists() or page == "/":
            assert c.get(page).status_code == 200, page


def test_ask_returns_trace_and_latency(client):
    engine = FakeEngine(answer())
    use(engine)
    r = client.post("/api/ask", json={"question": "  What   is the capital of France? "})
    assert r.status_code == 200
    body = r.json()
    assert body["trace"]["answer"] == "Paris"
    assert body["latency_ms"]["total"] == 2.0
    assert body["arm"] == "F" and body["thresholds"]["tau_abstain"] == 0.9
    assert engine.asked == ["What is the capital of France?"]  # whitespace collapsed


@pytest.mark.parametrize(
    "payload", [{}, {"question": ""}, {"question": "hi"}, {"question": "x" * 501}]
)
def test_ask_validates_input(client, payload):
    use(FakeEngine(answer()))
    assert client.post("/api/ask", json=payload).status_code == 422


@pytest.mark.parametrize(
    ("error", "status", "needle"),
    [
        (EngineUnavailable("indexes missing"), 503, "indexes missing"),
        (AnswerQuotaExhausted("no quota left"), 503, "no quota"),
        (AnswerFailed("bad key"), 502, "bad key"),
    ],
)
def test_ask_errors_are_clear(client, error, status, needle):
    use(FakeEngine(error=error))
    r = client.post("/api/ask", json={"question": "who wrote it?"})
    assert r.status_code == status
    assert needle in r.json()["detail"]


def test_status_reports_missing_pieces(client):
    use(FakeEngine(missing=["bm25 index not found"]))
    body = client.get("/api/status").json()
    assert body["live"] is False and body["problems"] == ["bm25 index not found"]
    use(FakeEngine())
    assert client.get("/api/status").json()["live"] is True


def test_engine_reports_missing_data(tmp_path):
    cfg = Config()
    cfg.paths.data_dir = tmp_path
    engine = Engine(cfg)
    problems = engine.missing()
    assert any("tuned config" in p for p in problems)
    assert any("bm25 index" in p for p in problems)
    with pytest.raises(EngineUnavailable, match="examples and the results page work"):
        engine.ask("anything at all")


def test_sufficiency_model_in_configs():
    from vrag.config import REPO_ROOT

    assert load_config().verifier.sufficiency_model is None
    tuned = load_config(overlay=REPO_ROOT / "configs" / "tuned.toml")
    assert tuned.verifier.sufficiency_model == REPO_ROOT / "data/models/sufficiency-minilm-l12"
