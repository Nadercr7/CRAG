"""Live check of the Groq setup: one plain and one JSON call per configured model.

Run twice: the second run must be served entirely from the cache.
"""

from vrag.config import get_config
from vrag.llm import LLMClient


def main() -> None:
    cfg = get_config().llm
    client = LLMClient()
    models = dict.fromkeys([cfg.answer_model, cfg.rewrite_model, cfg.judge_model])
    for model in models:
        plain = client.complete([{"role": "user", "content": "Reply with exactly: OK"}], model)
        data = client.complete_json(
            [
                {"role": "system", "content": "Answer in JSON."},
                {"role": "user", "content": 'Capital of Egypt? Return {"answer": "..."}'},
            ],
            model,
        )
        print(
            f"{model:24s} plain={plain.text.strip()!r:8s} json={data} "
            f"cached={plain.cached} tokens={plain.usage.get('total_tokens')}"
        )
    print(f"cache entries: {len(client.cache)}")


if __name__ == "__main__":
    main()
