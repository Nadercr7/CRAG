"""Client-side rate limiter for per-model request and token quotas.

Groq enforces limits per model: requests per minute and per day, tokens per
minute and per day. Each limit is modelled as a token bucket that refills
continuously, which matches how Groq reports resets (the daily request quota
refills one request every 86.4 s). The buckets are corrected from the
``x-ratelimit-remaining-*`` response headers whenever those are present.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field

from vrag.config import RateLimits


@dataclass
class Bucket:
    capacity: float
    period_s: float
    level: float = field(init=False)
    updated: float = field(init=False, default=0.0)

    def __post_init__(self) -> None:
        self.level = self.capacity

    @property
    def rate(self) -> float:
        return self.capacity / self.period_s

    def refill(self, now: float) -> None:
        if self.updated:
            self.level = min(self.capacity, self.level + (now - self.updated) * self.rate)
        self.updated = now

    def wait_time(self, amount: float) -> float:
        """Seconds until ``amount`` is available (0 if it already is)."""
        amount = min(amount, self.capacity)
        return 0.0 if self.level >= amount else (amount - self.level) / self.rate


class RateLimiter:
    def __init__(
        self,
        limits: RateLimits,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.limits = limits
        self._clock = clock
        self._sleep = sleep
        self._lock = threading.Lock()
        self._models: dict[str, dict[str, Bucket]] = {}

    def _buckets(self, model: str) -> dict[str, Bucket]:
        if model not in self._models:
            lim = self.limits
            buckets = {
                "rpm": Bucket(lim.requests_per_minute, 60),
                "rpd": Bucket(lim.requests_per_day, 86_400),
                "tpm": Bucket(lim.tokens_per_minute, 60),
            }
            if lim.tokens_per_day:
                buckets["tpd"] = Bucket(lim.tokens_per_day, 86_400)
            self._models[model] = buckets
        return self._models[model]

    def acquire(self, model: str, tokens: int) -> float:
        """Block until one request of ``tokens`` fits every bucket; return seconds waited."""
        waited = 0.0
        while True:
            with self._lock:
                now = self._clock()
                buckets = self._buckets(model)
                for b in buckets.values():
                    b.refill(now)
                need = {"rpm": 1, "rpd": 1, "tpm": tokens, "tpd": tokens}
                delay = max(b.wait_time(need[name]) for name, b in buckets.items())
                if delay <= 0:
                    for name, b in buckets.items():
                        b.level -= min(need[name], b.capacity)
                    return waited
            self._sleep(delay)
            waited += delay

    def record_usage(self, model: str, estimated: int, actual: int) -> None:
        """Correct the token buckets once the real token count is known."""
        with self._lock:
            for name in ("tpm", "tpd"):
                bucket = self._buckets(model).get(name)
                if bucket:
                    bucket.level = min(bucket.capacity, bucket.level + estimated - actual)

    def sync_headers(self, model: str, headers: Mapping[str, str]) -> None:
        """Lower bucket levels to what the server says is left (never raise them)."""
        with self._lock:
            buckets = self._buckets(model)
            for header, name in (
                ("x-ratelimit-remaining-requests", "rpd"),
                ("x-ratelimit-remaining-tokens", "tpm"),
            ):
                value = headers.get(header)
                if value is None:
                    continue
                try:
                    remaining = float(value)
                except ValueError:
                    continue
                buckets[name].refill(self._clock())
                buckets[name].level = min(buckets[name].level, remaining)
