from vrag.llm.cache import LLMCache, request_key


def test_key_ignores_dict_order():
    assert request_key({"a": 1, "b": [1, 2]}) == request_key({"b": [1, 2], "a": 1})
    assert request_key({"a": 1}) != request_key({"a": 2})


def test_roundtrip_and_persistence(tmp_path):
    path = tmp_path / "c.sqlite"
    payload = {"model": "m", "messages": [{"role": "user", "content": "hi"}]}
    cache = LLMCache(path)
    assert cache.get(payload) is None
    cache.put(payload, {"text": "héllo"})
    cache.close()

    reopened = LLMCache(path)
    assert reopened.get(payload) == {"text": "héllo"}
    assert len(reopened) == 1
