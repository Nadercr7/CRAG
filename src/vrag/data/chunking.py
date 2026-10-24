"""Dependency-free sentence splitter.

Used to refine BEIR documents into sentences. HotpotQA paragraphs arrive already split.
BEIR documents themselves stay document-level, because their qrels are.

A boundary is sentence-final punctuation, optional closing quotes or brackets, whitespace,
and a plausible sentence start (capital, digit, opening quote or bracket). Periods that end
a known abbreviation, an initial or a dotted acronym ("U.S.", "e.g.") never split.
Decimals such as "0.016" contain no whitespace, so they never match.
Known limit: "... in the U.S. The next day" is not split, because "U.S." is ambiguous.
"""

from __future__ import annotations

import re

_ABBREVIATIONS = frozenset(
    [
        "dr",
        "mr",
        "mrs",
        "ms",
        "prof",
        "sr",
        "jr",
        "st",
        "mt",
        "vs",
        "etc",
        "al",
        "fig",
        "figs",
        "eq",
        "eqs",
        "ref",
        "refs",
        "no",
        "nos",
        "vol",
        "vols",
        "approx",
        "ca",
        "cf",
        "inc",
        "ltd",
        "co",
        "corp",
        "dept",
        "univ",
        "est",
        "ed",
        "eds",
        "pp",
        "sec",
        "ch",
        "jan",
        "feb",
        "mar",
        "apr",
        "jun",
        "jul",
        "aug",
        "sep",
        "sept",
        "oct",
        "nov",
        "dec",
    ]
)

_BOUNDARY = re.compile(r"([.!?]+)([\"')\]”’]*)(\s+)")  # noqa: RUF001 (curly quotes are intended)
_STARTER = re.compile(r"[A-Z0-9\"'“‘(\[]")  # noqa: RUF001 (curly quotes are intended)
_DOTTED = re.compile(r"^(?:[A-Za-z]\.){2,}$")
_INITIAL = re.compile(r"^[A-Z]\.$")
_BLOCKS = re.compile(r"\n\s*\n")


def _is_abbreviation(text: str, end: int) -> bool:
    """Whether the period that ends at ``text[:end]`` belongs to an abbreviation."""
    token = text[:end].split()[-1].lstrip("\"'“‘([")  # noqa: RUF001 (curly quotes are intended)
    if _DOTTED.match(token) or _INITIAL.match(token):
        return True
    return token.endswith(".") and token[:-1].lower() in _ABBREVIATIONS


def split_sentences(text: str) -> list[str]:
    """Split ``text`` into stripped, non-empty sentences."""
    sentences: list[str] = []
    for block in _BLOCKS.split(text):
        block = " ".join(block.split())
        start = 0
        for m in _BOUNDARY.finditer(block):
            nxt = block[m.end() : m.end() + 1]
            if not _STARTER.match(nxt):
                continue
            if m.group(1) == "." and _is_abbreviation(block, m.start(2)):
                continue
            sentences.append(block[start : m.end(2)])
            start = m.end()
        if block[start:]:
            sentences.append(block[start:])
    return [s.strip() for s in sentences if s.strip()]
