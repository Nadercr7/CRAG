"""Platt scaling: p = sigmoid(a * logit + b), fitted on dev logits with damped Newton steps."""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return np.exp(-np.logaddexp(0.0, -z))


def _nll(x: np.ndarray, y: np.ndarray, a: float, b: float, l2: float) -> float:
    z = a * x + b
    return float(np.sum(np.logaddexp(0.0, z) - y * z) + 0.5 * l2 * (a * a + b * b))


@dataclass(frozen=True)
class PlattCalibrator:
    """Identity-on-sigmoid by default: a=1, b=0 means "uncalibrated"."""

    a: float = 1.0
    b: float = 0.0

    def __call__(self, logits: Sequence[float] | np.ndarray) -> np.ndarray:
        x = np.asarray(logits, dtype=np.float64)
        return _sigmoid(self.a * x + self.b)

    @property
    def is_identity(self) -> bool:
        return self.a == 1.0 and self.b == 0.0

    @classmethod
    def fit(
        cls,
        logits: Sequence[float] | np.ndarray,
        labels: Sequence[int] | np.ndarray,
        l2: float = 1e-6,
        max_iter: int = 100,
        tol: float = 1e-10,
    ) -> PlattCalibrator:
        """Maximum likelihood fit; the tiny ``l2`` keeps separable data finite."""
        x = np.asarray(logits, dtype=np.float64)
        y = np.asarray(labels, dtype=np.float64)
        if x.shape != y.shape or x.ndim != 1 or len(x) == 0:
            raise ValueError("logits and labels must be equal-length, non-empty 1-D arrays")
        if not np.isin(y, (0.0, 1.0)).all():
            raise ValueError("labels must be 0 or 1")
        a, b = 1.0, 0.0
        loss = _nll(x, y, a, b, l2)
        for _ in range(max_iter):
            p = _sigmoid(a * x + b)
            r = p - y
            grad = np.array([np.sum(r * x) + l2 * a, np.sum(r) + l2 * b])
            w = p * (1.0 - p)
            hess = np.array(
                [[np.sum(w * x * x) + l2, np.sum(w * x)], [np.sum(w * x), np.sum(w) + l2]]
            )
            step = np.linalg.solve(hess, grad)
            t = 1.0
            while t > 1e-8:
                new = _nll(x, y, a - t * step[0], b - t * step[1], l2)
                if new <= loss:
                    break
                t /= 2
            else:
                break
            a, b = a - t * step[0], b - t * step[1]
            done = loss - new < tol
            loss = new
            if done:
                break
        return cls(float(a), float(b))

    def save(self, path: Path | str) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2))

    @classmethod
    def load(cls, path: Path | str) -> PlattCalibrator:
        data = json.loads(Path(path).read_text())
        return cls(float(data["a"]), float(data["b"]))
