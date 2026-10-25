"""Groq chat client: OpenAI-compatible SDK + sqlite cache + per-model rate limiting."""

from __future__ import annotations

import json
import logging
import os
import re
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

import openai

from vrag.config import LLMConfig, get_config
from vrag.llm.cache import LLMCache
from vrag.llm.limiter import RateLimiter

log = logging.getLogger(__name__)

Message = dict[str, str]

# A retry-after longer than this means a quota (usually daily) is exhausted:
# better to stop the run and resume later from the cache than to sleep.
MAX_RETRY_WAIT_S = 180.0


class CacheMiss(RuntimeError):
    """Offline mode: the request is not in the cache. ``payload`` is what would be sent."""

    def __init__(self, payload: dict[str, Any]):
        super().__init__(f"{payload.get('model')}: not in the cache (offline mode)")
        self.payload = payload


class QuotaExhausted(RuntimeError):
    """The provider asked us to wait longer than MAX_RETRY_WAIT_S."""

    def __init__(self, model: str, retry_after_s: float, detail: str):
        super().__init__(f"{model}: quota exhausted, retry in {retry_after_s:.0f}s ({detail})")
        self.model = model
        self.retry_after_s = retry_after_s


@dataclass
class Completion:
    text: str
    model: str
    usage: dict[str, int] = field(default_factory=dict)
    finish_reason: str | None = None
    cached: bool = False
    latency_s: float = 0.0

    def json(self) -> Any:
        return parse_json(self.text)


def parse_json(text: str) -> Any:
    """Parse a JSON object, tolerating code fences or prose around it."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return json.loads(text[start : end + 1])
    raise ValueError(f"no JSON object in model output: {text[:200]!r}")


_DURATION = re.compile(r"(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?")


def parse_duration(value: str | None) -> float | None:
    """Parse '7.5', '1m26.4s', '585ms' or '2h3m' into seconds."""
    if not value:
        return None
    value = value.strip()
    try:
        return float(value)
    except ValueError:
        pass
    if value.endswith("ms"):
        try:
            return float(value[:-2]) / 1000
        except ValueError:
            return None
    m = _DURATION.fullmatch(value)
    if not m or not any(m.groups()):
        return None
    h, mins, s = (float(g) if g else 0.0 for g in m.groups())
    return h * 3600 + mins * 60 + s


def retry_after(headers: Mapping[str, str], message: str = "") -> float | None:
    """How long a 429 asks us to wait: retry-after header, then the error text."""
    seconds = parse_duration(headers.get("retry-after"))
    if seconds is not None:
        return seconds
    m = re.search(r"try again in ((?:\d+(?:\.\d+)?(?:ms|h|m|s))+)", message, re.IGNORECASE)
    if m and (seconds := parse_duration(m.group(1))) is not None:
        return seconds
    return parse_duration(headers.get("x-ratelimit-reset-tokens"))


def estimate_tokens(messages: list[Message]) -> int:
    """Rough prompt size (about 4 characters per token plus per-message overhead)."""
    return sum(len(m.get("content", "")) // 4 + 4 for m in messages)


class LLMClient:
    def __init__(
        self,
        config: LLMConfig | None = None,
        cache: LLMCache | None = None,
        limiter: RateLimiter | None = None,
        api: Any = None,
        sleep: Callable[[float], None] = time.sleep,
        offline: bool = False,
    ):
        cfg = get_config()
        self.config = config or cfg.llm
        self.cache = cache if cache is not None else LLMCache(cfg.paths.cache_db)
        self.limiter = limiter or RateLimiter(self.config.limits)
        self._sleep = sleep
        # Offline: answer from the cache only and raise CacheMiss otherwise, so requests can
        # be generated in batch elsewhere (Kaggle) and imported with ``cache.put``.
        self.offline = offline
        self._api = api or openai.OpenAI(
            base_url=self.config.base_url,
            api_key=os.environ.get(self.config.api_key_env, ""),
            timeout=self.config.timeout_s,
            max_retries=0,  # retries are handled here, so they respect the limiter
        )

    def complete(
        self,
        messages: list[Message],
        model: str | None = None,
        *,
        max_tokens: int = 1024,
        temperature: float = 0.0,
        json_mode: bool = False,
        reasoning_effort: str | None = "low",
        seed: int | None = 0,
        use_cache: bool = True,
    ) -> Completion:
        model = model or self.config.answer_model
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_completion_tokens": max_tokens,
            "temperature": temperature,
            "seed": seed,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        if reasoning_effort and model.startswith("openai/gpt-oss"):
            payload["reasoning_effort"] = reasoning_effort

        if use_cache and (hit := self.cache.get(payload)) is not None:
            return Completion(**hit, cached=True)
        if self.offline:
            raise CacheMiss(payload)

        try:
            result = self._call(payload)
        except openai.BadRequestError as e:
            # Groq validates JSON mode server-side and sometimes rejects a reply outright
            # (json_validate_failed). Ask again without JSON mode; parse_json copes with it.
            if not json_mode or "json_validate_failed" not in str(e):
                raise
            log.warning("%s: json_validate_failed, retrying without JSON mode", model)
            result = self._call({k: v for k, v in payload.items() if k != "response_format"})
        if use_cache and result.text and result.finish_reason != "length":
            self.cache.put(
                payload,
                {k: v for k, v in result.__dict__.items() if k not in ("cached", "latency_s")},
            )
        return result

    def complete_json(self, messages: list[Message], model: str | None = None, **kw) -> Any:
        return self.complete(messages, model, json_mode=True, **kw).json()

    def _call(self, payload: dict[str, Any]) -> Completion:
        model = payload["model"]
        estimate = estimate_tokens(payload["messages"]) + payload["max_completion_tokens"]
        delay = 2.0
        for attempt in range(self.config.max_retries + 1):
            self.limiter.acquire(model, estimate)
            start = time.monotonic()
            try:
                raw = self._api.chat.completions.with_raw_response.create(**payload)
            except openai.RateLimitError as e:
                self.limiter.record_usage(model, estimate, 0)
                wait = retry_after(e.response.headers, str(e)) or delay
                if wait > MAX_RETRY_WAIT_S:
                    raise QuotaExhausted(model, wait, str(e)[:300]) from e
                log.warning("429 on %s, waiting %.1fs (attempt %d)", model, wait, attempt + 1)
                self._sleep(wait)
                continue
            except (openai.APITimeoutError, openai.APIConnectionError, openai.InternalServerError):
                self.limiter.record_usage(model, estimate, 0)
                if attempt == self.config.max_retries:
                    raise
                log.warning("transient error on %s, retrying in %.0fs", model, delay)
                self._sleep(delay)
                delay = min(delay * 2, 60)
                continue

            latency = time.monotonic() - start
            self.limiter.sync_headers(model, raw.headers)
            response = raw.parse()
            usage = response.usage.model_dump() if response.usage else {}
            used = {k: v for k, v in usage.items() if isinstance(v, int)}
            self.limiter.record_usage(model, estimate, used.get("total_tokens", estimate))
            choice = response.choices[0]
            text = choice.message.content or ""
            if not text:
                log.warning(
                    "%s returned empty content (finish_reason=%s)", model, choice.finish_reason
                )
            return Completion(
                text=text,
                model=model,
                usage=used,
                finish_reason=choice.finish_reason,
                latency_s=latency,
            )
        raise RuntimeError(f"{model}: still rate limited after {self.config.max_retries} retries")
