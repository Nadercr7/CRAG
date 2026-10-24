"""Answer prompt and tolerant parsing of the generator's JSON output."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from vrag.llm.client import Message, parse_json

SYSTEM = """Answer the question using only the numbered context lines.
Give the shortest answer that works: a name, date, number or yes/no for factual questions.
Cite the numbers of the lines that support it.
If the context does not contain the answer, set "insufficient" to true.
Reply with JSON only: {"answer": str, "citations": [int], "confidence": float 0-1, \
"insufficient": bool}"""

_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def context_line(n: int, title: str, text: str) -> str:
    return f"[{n}] {title}: {text.strip()}"


def build_messages(question: str, lines: list[str]) -> list[Message]:
    user = "Context:\n" + "\n".join(lines) + f"\n\nQuestion: {question}"
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]


@dataclass
class ParsedAnswer:
    answer: str | None = None
    citations: list[int] = field(default_factory=list)
    dropped: list[int] = field(default_factory=list)  # out-of-range or malformed citations
    confidence: float | None = None
    insufficient: bool = False
    valid: bool = False
    error: str | None = None


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and (m := re.fullmatch(r"\s*\[?(\d+)\]?\s*", value)):
        return int(m.group(1))
    return None


def _as_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1"}
    return bool(value)


def parse_answer(raw: str | None, n_lines: int) -> ParsedAnswer:
    """Parse the generator output; citations outside ``1..n_lines`` are dropped.

    ``valid`` is False when no JSON object is found or when there is neither an answer nor an
    insufficient flag. An insufficient output has ``answer=None``.
    """
    if not raw or not raw.strip():
        return ParsedAnswer(error="empty output")
    try:
        data = parse_json(_THINK.sub("", raw))
    except ValueError as e:
        return ParsedAnswer(error=str(e)[:120])
    if not isinstance(data, dict):
        return ParsedAnswer(error="JSON output is not an object")

    citations: list[int] = []
    dropped: list[int] = []
    raw_cites = data.get("citations", [])
    for c in raw_cites if isinstance(raw_cites, list) else [raw_cites]:
        n = _as_int(c)
        if n is None:
            continue
        if not 1 <= n <= n_lines:
            dropped.append(n)
        elif n not in citations:
            citations.append(n)

    conf = data.get("confidence")
    confidence = (
        min(1.0, max(0.0, float(conf)))
        if isinstance(conf, int | float) and not isinstance(conf, bool)
        else None
    )
    insufficient = _as_bool(data.get("insufficient", False))
    value = data.get("answer")
    answer = str(value).strip() if isinstance(value, str | int | float) else ""
    if insufficient:
        return ParsedAnswer(None, citations, dropped, confidence, True, True)
    if not answer:
        return ParsedAnswer(None, citations, dropped, confidence, False, False, "no answer")
    return ParsedAnswer(answer, citations, dropped, confidence, False, True)
