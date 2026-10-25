"""Paired bootstrap for the difference of a per-question metric between two systems."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np

# Resamples are drawn in blocks so n_resamples x n never has to sit in memory at once.
_BLOCK = 2000


@dataclass(frozen=True)
class BootstrapResult:
    mean_diff: float  # mean of (a - b) over the questions
    ci_low: float  # 2.5th percentile of the resampled mean differences
    ci_high: float  # 97.5th percentile
    p_value: float  # two-sided: twice the smaller share of resamples on one side of 0
    n: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @property
    def significant(self) -> bool:
        return self.ci_low > 0 or self.ci_high < 0


def paired_bootstrap(
    a: Sequence[float],
    b: Sequence[float],
    n_resamples: int = 10_000,
    seed: int = 0,
    alpha: float = 0.05,
) -> BootstrapResult:
    """Bootstrap ``mean(a - b)`` by resampling questions with replacement.

    ``a[i]`` and ``b[i]`` are the metric of the two systems on the same question. The p-value
    is the share of resamples whose mean difference is <= 0 or >= 0 (whichever is smaller),
    doubled and capped at 1, so a difference that is exactly zero everywhere gives p = 1.
    """
    x, y = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    if x.shape != y.shape or x.ndim != 1:
        raise ValueError("a and b must be 1-D and have the same length")
    if len(x) == 0:
        raise ValueError("need at least one question")
    diff = x - y
    n = len(diff)
    rng = np.random.default_rng(seed)
    means = np.empty(n_resamples)
    for start in range(0, n_resamples, _BLOCK):
        size = min(_BLOCK, n_resamples - start)
        idx = rng.integers(0, n, size=(size, n))
        means[start : start + size] = diff[idx].mean(axis=1)
    low, high = np.quantile(means, [alpha / 2, 1 - alpha / 2])
    p = min(1.0, 2 * min(float(np.mean(means <= 0)), float(np.mean(means >= 0))))
    return BootstrapResult(float(diff.mean()), float(low), float(high), p, n)
