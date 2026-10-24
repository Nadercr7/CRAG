from types import SimpleNamespace

import httpx2 as httpx
import openai
import pytest

from vrag.config import LLMConfig, RateLimits
from vrag.llm.cache import LLMCache
from vrag.llm.client import (
    LLMClient,
    QuotaExhausted,
    parse_duration,
    parse_json,
    retry_after,
)
from vrag.llm.limiter import RateLimiter


def ok_response(text="OK", total=50, finish="stop"):
    parsed = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text), finish_reason=finish)],
        usage=SimpleNamespace(
            model_dump=lambda: {
                "prompt_tokens": 10,
                "completion_tokens": total - 10,
                "total_tokens": total,
                "prompt_tokens_details": None,
            }
        ),
    )
    return SimpleNamespace(headers={"x-ratelimit-remaining-tokens": "7000"}, parse=lambda: parsed)


def rate_limit_error(headers=None, message="Rate limit reached"):
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    response = httpx.Response(429, headers=headers or {}, request=request)
    return openai.RateLimitError(message, response=response, body=None)


class FakeAPI:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []
        create = self._create
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(with_raw_response=SimpleNamespace(create=create))
        )

    def _create(self, **payload):
        self.calls.append(payload)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.fixture
def make_client(tmp_path):
    def _make(outcomes):
        api = FakeAPI(outcomes)
        slept = []
        cfg = LLMConfig(max_retries=3, limits=RateLimits(tokens_per_minute=10**6))
        client = LLMClient(
            config=cfg,
            cache=LLMCache(tmp_path / "c.sqlite"),
            limiter=RateLimiter(cfg.limits, sleep=slept.append),
            api=api,
            sleep=slept.append,
        )
        return client, api, slept

    return _make


MSG = [{"role": "user", "content": "hi"}]


def test_complete_and_cache(make_client):
    client, api, _ = make_client([ok_response("hello")])
    first = client.complete(MSG, "openai/gpt-oss-20b")
    second = client.complete(MSG, "openai/gpt-oss-20b")
    assert first.text == second.text == "hello"
    assert not first.cached and second.cached
    assert len(api.calls) == 1
    assert api.calls[0]["reasoning_effort"] == "low"
    assert first.usage["total_tokens"] == 50 and "prompt_tokens_details" not in first.usage


def test_reasoning_effort_only_for_gpt_oss(make_client):
    client, api, _ = make_client([ok_response()])
    client.complete(MSG, "qwen/qwen3.8-27b")
    assert "reasoning_effort" not in api.calls[0]


def test_retries_on_429_then_succeeds(make_client):
    client, api, slept = make_client([rate_limit_error({"retry-after": "3"}), ok_response()])
    assert client.complete(MSG, "m").text == "OK"
    assert len(api.calls) == 2 and 3.0 in slept


def test_long_retry_after_raises_quota_exhausted(make_client):
    err = rate_limit_error(
        message="Limit 200000 on tokens per day (TPD). Please try again in 7m12.5s."
    )
    client, _, _ = make_client([err])
    with pytest.raises(QuotaExhausted) as info:
        client.complete(MSG, "m")
    assert info.value.retry_after_s == pytest.approx(432.5)


def test_truncated_output_not_cached(make_client):
    client, api, _ = make_client([ok_response("partial", finish="length"), ok_response("full")])
    assert client.complete(MSG, "m").text == "partial"
    assert client.complete(MSG, "m").text == "full"
    assert len(api.calls) == 2


def test_complete_json(make_client):
    client, api, _ = make_client([ok_response('```json\n{"a": 1}\n```')])
    assert client.complete_json(MSG, "m") == {"a": 1}
    assert api.calls[0]["response_format"] == {"type": "json_object"}


@pytest.mark.parametrize(
    ("text", "seconds"),
    [
        ("7.5", 7.5),
        ("1m26.4s", 86.4),
        ("585ms", 0.585),
        ("2h3m", 7380.0),
        ("bad", None),
        (None, None),
    ],
)
def test_parse_duration(text, seconds):
    assert parse_duration(text) == (pytest.approx(seconds) if seconds is not None else None)


def test_retry_after_prefers_header():
    assert retry_after({"retry-after": "4"}, "try again in 9s") == 4
    assert retry_after({}, "Please try again in 1m2s.") == 62


def test_parse_json_errors():
    with pytest.raises(ValueError):
        parse_json("no json here")


def test_json_validate_failed_retries_without_json_mode(make_client):
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    err = openai.BadRequestError(
        "Error code: 400 - json_validate_failed",
        response=httpx.Response(400, request=request),
        body=None,
    )
    client, api, _ = make_client([err, ok_response('{"a": 2}')])
    assert client.complete_json(MSG, "m") == {"a": 2}
    assert "response_format" not in api.calls[1]
    assert client.complete_json(MSG, "m") == {"a": 2}  # cached under the JSON-mode request
    assert len(api.calls) == 2
