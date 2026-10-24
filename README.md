# Verified RAG

A retrieval-augmented generation pipeline with a small cross-encoder **verifier** between retrieval and generation. The verifier checks each retrieved chunk, re-retrieves when the evidence is bad, trims chunks to the sentences that matter, and abstains when the context can't support an answer.

Status: in development. The design and the reasoning behind it are in [`PLAN.md`](PLAN.md); background reading notes are in [`research/`](research/).

## Setup

```bash
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -e ".[train,eval,dev]"
cp .env.example .env   # then fill in GROQ_API_KEY
```

`requirements.lock` pins the exact versions the results were produced with.

## Checks

```bash
.venv/bin/pytest                         # unit tests, no network
.venv/bin/ruff check src tests
.venv/bin/python scripts/smoke_llm.py    # one live call per model; a second run is served from cache
```

## LLM access

Generation, query rewriting and teacher labelling go through Groq's OpenAI-compatible API. `vrag.llm.LLMClient` adds two things on top of the SDK:

- **A sqlite response cache** (`data/cache/llm.sqlite`), keyed on the full request. Re-running an evaluation costs nothing, and a run that stops halfway resumes where it left off.
- **A per-model rate limiter.** It covers requests per minute and per day, and tokens per minute and per day. The buckets refill continuously and are corrected from Groq's `x-ratelimit-*` headers. When Groq asks for a wait longer than three minutes, the daily quota is gone, and the client raises `QuotaExhausted` instead of sleeping.
