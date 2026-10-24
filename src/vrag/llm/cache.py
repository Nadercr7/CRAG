"""Persistent sqlite cache for LLM responses.

Every request is keyed by a hash of its full payload (model, messages, sampling
parameters), so an evaluation can be re-run or resumed without spending quota.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

_SCHEMA = """
CREATE TABLE IF NOT EXISTS responses (
    key        TEXT PRIMARY KEY,
    model      TEXT NOT NULL,
    request    TEXT NOT NULL,
    response   TEXT NOT NULL,
    created_at REAL NOT NULL
)
"""


def request_key(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


class LLMCache:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(_SCHEMA)
        self._conn.commit()

    def get(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT response FROM responses WHERE key = ?", (request_key(payload),)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def put(self, payload: dict[str, Any], response: dict[str, Any]) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO responses VALUES (?, ?, ?, ?, ?)",
                (
                    request_key(payload),
                    payload.get("model", ""),
                    json.dumps(payload, ensure_ascii=False),
                    json.dumps(response, ensure_ascii=False),
                    time.time(),
                ),
            )
            self._conn.commit()

    def __len__(self) -> int:
        with self._lock:
            return self._conn.execute("SELECT COUNT(*) FROM responses").fetchone()[0]

    def close(self) -> None:
        with self._lock:
            self._conn.close()
