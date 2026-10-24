import pytest

from vrag.config import RateLimits
from vrag.llm.limiter import RateLimiter


class FakeClock:
    def __init__(self):
        self.now = 1000.0
        self.slept = []

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


@pytest.fixture
def clock():
    return FakeClock()


def make(clock, **kw):
    limits = RateLimits(
        requests_per_minute=kw.get("rpm", 30),
        requests_per_day=kw.get("rpd", 1000),
        tokens_per_minute=kw.get("tpm", 6000),
        tokens_per_day=kw.get("tpd"),
    )
    return RateLimiter(limits, clock=clock, sleep=clock.sleep)


def test_no_wait_within_budget(clock):
    lim = make(clock)
    assert lim.acquire("m", 2000) == 0
    assert lim.acquire("m", 2000) == 0
    assert clock.slept == []


def test_waits_for_token_refill(clock):
    lim = make(clock, tpm=6000)  # refills 100 tokens/s
    lim.acquire("m", 6000)
    waited = lim.acquire("m", 3000)
    assert waited == pytest.approx(30.0)


def test_request_per_minute_limit(clock):
    lim = make(clock, rpm=2)  # one request every 30 s
    lim.acquire("m", 1)
    lim.acquire("m", 1)
    assert lim.acquire("m", 1) == pytest.approx(30.0)


def test_models_are_independent(clock):
    lim = make(clock, tpm=1000)
    lim.acquire("a", 1000)
    assert lim.acquire("b", 1000) == 0


def test_oversized_request_is_capped_not_deadlocked(clock):
    lim = make(clock, tpm=1000)
    assert lim.acquire("m", 5000) == 0


def test_record_usage_returns_unused_estimate(clock):
    lim = make(clock, tpm=6000)
    lim.acquire("m", 6000)
    lim.record_usage("m", estimated=6000, actual=1000)
    assert lim.acquire("m", 5000) == 0


def test_daily_token_bucket(clock):
    lim = make(clock, tpm=10**6, rpm=10**6, tpd=86_400)  # refills 1 token/s
    lim.acquire("m", 86_400)
    assert lim.acquire("m", 100) == pytest.approx(100.0)


def test_sync_headers_only_lowers(clock):
    lim = make(clock, tpm=6000)
    lim.sync_headers("m", {"x-ratelimit-remaining-tokens": "0"})
    assert lim.acquire("m", 600) == pytest.approx(6.0)
    lim.sync_headers("m", {"x-ratelimit-remaining-tokens": "999999", "junk": "x"})
    assert lim.acquire("m", 600) == pytest.approx(6.0)
