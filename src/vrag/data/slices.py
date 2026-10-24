"""Per-question evaluation slices, expressed as overrides on the shared HotpotQA pool.

One index serves every slice. A slice only says what to hide or rewrite for one question:

- supportive: no override, gold paragraphs are in the pool as they are.
- missing: every gold paragraph of the question is excluded from retrieval.
- misleading: the answer is replaced, in every gold paragraph, by a plausible wrong answer
  of the same type. The substitute comes from an LLM (``propose_substitutes``) when one is
  given; otherwise it falls back to the answer of another sampled question of the same coarse
  kind (number/year vs. other), which can mix types (an opera replaced by a person).
  Built only when the answer is not yes/no and occurs verbatim (whole-word, case-sensitive)
  in a gold paragraph.

Retrieval scores use the ORIGINAL index text; ``replace_text`` is applied afterwards, so the
verifier, refiner and generator see the replaced text while ranking is identical to the
supportive slice. ``replace_text`` rewrites the paragraph body only, never its title.
``Slice.substitute`` is the planted entity, so evaluation can flag answers that repeat it.
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass, field

from vrag.data.hotpot import HotpotData, HotpotQuestion

KINDS = ("supportive", "missing", "misleading")
_NUMBER = re.compile(r"\d[\d,.\- /]*")


@dataclass
class Slice:
    kind: str
    exclude_ids: set[str] = field(default_factory=set)
    replace_text: dict[str, str] = field(default_factory=dict)
    original_answer: str | None = None
    substitute: str | None = None


def answer_kind(answer: str) -> str:
    return "number" if _NUMBER.fullmatch(answer.strip()) else "other"


def is_yes_no(answer: str) -> bool:
    return answer.strip().lower() in {"yes", "no"}


def _answer_pattern(answer: str) -> re.Pattern[str]:
    return re.compile(rf"(?<!\w){re.escape(answer)}(?!\w)")


def supportive_slice(q: HotpotQuestion) -> Slice:
    return Slice("supportive")


def missing_slice(q: HotpotQuestion) -> Slice:
    return Slice("missing", exclude_ids=set(q.gold_ids))


def substitute_candidates(
    q: HotpotQuestion, answers: list[str], gold_texts: list[str]
) -> list[str]:
    """Answers of other questions that are safe to plant in place of ``q.answer``."""
    original = q.answer.strip().lower()
    kind = answer_kind(q.answer)
    out: set[str] = set()
    for cand in answers:
        c = cand.strip()
        low = c.lower()
        if not c or is_yes_no(c) or answer_kind(c) != kind:
            continue
        if low in original or original in low:
            continue
        if any(_answer_pattern(c).search(t) for t in gold_texts):
            continue  # already present in the gold text, so the plant would be ambiguous
        out.add(c)
    return sorted(out)


def is_valid_substitute(q: HotpotQuestion, substitute: str, gold_texts: list[str]) -> bool:
    sub, original = substitute.strip().lower(), q.answer.strip().lower()
    return bool(
        sub
        and not is_yes_no(sub)
        and sub not in original
        and original not in sub
        and not any(_answer_pattern(substitute.strip()).search(t) for t in gold_texts)
    )


def misleading_slice(
    q: HotpotQuestion,
    data: HotpotData,
    answers: list[str],
    seed: int,
    proposed: str | None = None,
) -> Slice | None:
    """The misleading slice for ``q``, or None when it cannot be built.

    ``proposed`` (an LLM substitute) is used when it passes ``is_valid_substitute``.
    """
    answer = q.answer.strip()
    if not answer or is_yes_no(answer):
        return None
    pattern = _answer_pattern(answer)
    gold = {pid: data.pool[pid].text for pid in q.gold_ids}
    replaced_ids = [pid for pid, text in gold.items() if pattern.search(text)]
    if not replaced_ids:
        return None
    if proposed and is_valid_substitute(q, proposed, list(gold.values())):
        substitute = proposed.strip()
    else:
        candidates = substitute_candidates(q, answers, list(gold.values()))
        if not candidates:
            return None
        substitute = random.Random(f"{seed}:{q.id}").choice(candidates)
    return Slice(
        "misleading",
        replace_text={pid: pattern.sub(lambda _: substitute, gold[pid]) for pid in replaced_ids},
        original_answer=q.answer,
        substitute=substitute,
    )


def build_slices(
    data: HotpotData, seed: int, substitutes: dict[str, str] | None = None
) -> dict[str, dict[str, Slice]]:
    """``{question_id: {kind: Slice}}``; the misleading entry is absent when not buildable."""
    answers = [q.answer for q in data.questions]
    substitutes = substitutes or {}
    result: dict[str, dict[str, Slice]] = {}
    for q in data.questions:
        slices = {"supportive": supportive_slice(q), "missing": missing_slice(q)}
        misleading = misleading_slice(q, data, answers, seed, substitutes.get(q.id))
        if misleading:
            slices["misleading"] = misleading
        result[q.id] = slices
    return result


SUBSTITUTE_PROMPT = """You are building a counterfactual test for a question-answering system.

Question: {question}
Correct answer: {answer}

Propose ONE different answer that is wrong but plausible: the same kind of thing as the \
correct answer (a person for a person, a film for a film, a year for a year, a city for a \
city) and in a similar format. It must not be a synonym, nickname, abbreviation, or part of \
the correct answer.

Return JSON: {{"substitute": "..."}}"""


def propose_substitutes(questions: list[HotpotQuestion], client, model: str) -> dict[str, str]:
    """Ask an LLM for one same-type wrong answer per question (cached by the client)."""
    out: dict[str, str] = {}
    for q in questions:
        if is_yes_no(q.answer):
            continue
        prompt = SUBSTITUTE_PROMPT.format(question=q.question, answer=q.answer.strip())
        try:
            data = client.complete_json(
                [{"role": "user", "content": prompt}], model, max_tokens=512
            )
        except ValueError:
            continue
        sub = data.get("substitute") if isinstance(data, dict) else None
        if isinstance(sub, str) and sub.strip():
            out[q.id] = sub.strip()
    return out
