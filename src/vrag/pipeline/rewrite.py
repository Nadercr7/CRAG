"""Query rewrite for the retry path: one LLM call that proposes 1-2 retrieval queries."""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from vrag.llm.client import LLMClient, Message, parse_json

PROMPT = """You write search queries for a passage corpus searched by BM25 and dense \
retrieval (not a web search engine). The first retrieval for the question below did not \
surface good evidence.

Question: {question}

Evidence found so far:
{evidence}

Write {n} short, keyword-rich query or queries that would retrieve what is still missing. \
If answering needs several facts (multi-hop), aim a query at the fact or entity the evidence \
does not cover yet. Do not answer the question and do not repeat it word for word.

Return JSON: {{"queries": ["..."]}}"""


def build_messages(question: str, evidence: Sequence[str], n_queries: int = 2) -> list[Message]:
    lines = "\n".join(f"- {e}" for e in evidence) or "(none)"
    content = PROMPT.format(question=question, evidence=lines, n=f"1-{n_queries}")
    return [{"role": "user", "content": content}]


def _norm(text: str) -> str:
    return re.sub(r"\W+", " ", text.lower()).strip()


def parse_queries(raw: str | Any, question: str, max_queries: int = 2) -> list[str]:
    """Queries from the model output; unparsable output gives ``[]``.

    Accepts ``{"queries": [...]}`` or ``{"query": "..."}``. Drops blanks, duplicates and
    copies of the original question.
    """
    try:
        data = parse_json(raw) if isinstance(raw, str) else raw
    except ValueError:
        return []
    if not isinstance(data, dict):
        return []
    value = data.get("queries", data.get("query"))
    values = value if isinstance(value, list) else [value]
    out: list[str] = []
    seen = {_norm(question)}
    for v in values:
        if not isinstance(v, str) or not _norm(v) or _norm(v) in seen:
            continue
        seen.add(_norm(v))
        out.append(v.strip())
    return out[:max_queries]


def rewrite_query(
    llm: LLMClient,
    question: str,
    evidence: Sequence[str],
    model: str,
    n_queries: int = 2,
    max_tokens: int = 512,
) -> list[str]:
    """One cached LLM call; ``[]`` when the output has no usable query."""
    completion = llm.complete(
        build_messages(question, evidence, n_queries), model, max_tokens=max_tokens, json_mode=True
    )
    return parse_queries(completion.text, question, n_queries)
