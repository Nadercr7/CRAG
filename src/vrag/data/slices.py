"""Per-question evaluation slices, expressed as overrides on the shared HotpotQA pool.

One index serves every slice. A slice only says what to hide or rewrite for one question:

- supportive: no override, gold paragraphs are in the pool as they are.
- missing: every gold paragraph of the question is excluded from retrieval.
- misleading: the answer is replaced, in every gold paragraph, by a plausible wrong answer
  of the same type, proposed by an LLM (``propose_substitutes``): the first proposal that
  passes ``is_valid_substitute`` wins, and the slice is skipped when none does. The old
  fallback (the answer of another sampled question of the same coarse kind) mixes types,
  e.g. an opera replaced by a person, so it is only used when ``allow_fallback`` is set.
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
from collections.abc import Sequence
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
    proposed: Sequence[str] = (),
    allow_fallback: bool = False,
) -> Slice | None:
    """The misleading slice for ``q``, or None when it cannot be built.

    The first of ``proposed`` (LLM substitutes) that passes ``is_valid_substitute`` is used.
    """
    answer = q.answer.strip()
    if not answer or is_yes_no(answer):
        return None
    pattern = _answer_pattern(answer)
    gold = {pid: data.pool[pid].text for pid in q.gold_ids}
    replaced_ids = [pid for pid, text in gold.items() if pattern.search(text)]
    if not replaced_ids:
        return None
    valid = [p.strip() for p in proposed if is_valid_substitute(q, p, list(gold.values()))]
    if valid:
        substitute = valid[0]
    elif not allow_fallback:
        return None
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
    data: HotpotData,
    seed: int,
    substitutes: dict[str, list[str] | str] | None = None,
    allow_fallback: bool = False,
) -> dict[str, dict[str, Slice]]:
    """``{question_id: {kind: Slice}}``; the misleading entry is absent when not buildable."""
    answers = [q.answer for q in data.questions]
    # Older substitute files store one string per question; a bare string would be
    # iterated character by character.
    proposals = {k: [v] if isinstance(v, str) else list(v) for k, v in (substitutes or {}).items()}
    result: dict[str, dict[str, Slice]] = {}
    for q in data.questions:
        slices = {"supportive": supportive_slice(q), "missing": missing_slice(q)}
        misleading = misleading_slice(
            q, data, answers, seed, proposals.get(q.id, ()), allow_fallback
        )
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

# Second attempt for questions whose first proposal was unusable, typically because it
# already appears in the gold text (e.g. another opera by the same composer).
RETRY_PROMPT = """You are building a counterfactual test for a question-answering system.

Question: {question}
Correct answer: {answer}

Supporting text:
{context}

Propose FIVE different answers that are wrong but plausible: each the same kind of thing as \
the correct answer and in a similar format. None may be a synonym, nickname, abbreviation, \
or part of the correct answer, and none may appear anywhere in the supporting text above.

Return JSON: {{"substitutes": ["...", "...", "...", "...", "..."]}}"""


def _ask(client, model: str, prompt: str, key: str) -> list[str]:
    try:
        data = client.complete_json([{"role": "user", "content": prompt}], model, max_tokens=768)
    except ValueError:
        return []
    value = data.get(key) if isinstance(data, dict) else None
    values = value if isinstance(value, list) else [value]
    return [v.strip() for v in values if isinstance(v, str) and v.strip()]


def propose_substitutes(
    data: HotpotData, client, model: str, questions: list[HotpotQuestion] | None = None
) -> dict[str, list[str]]:
    """LLM proposals of same-type wrong answers per question (calls are cached by the client).

    One proposal first; questions where it fails validation get a second request that
    shows the gold text and asks for five alternatives.
    """
    out: dict[str, list[str]] = {}
    for q in questions if questions is not None else data.questions:
        if is_yes_no(q.answer):
            continue
        answer = q.answer.strip()
        first = _ask(
            client,
            model,
            SUBSTITUTE_PROMPT.format(question=q.question, answer=answer),
            "substitute",
        )
        gold = [data.pool[pid].text for pid in q.gold_ids]
        if any(is_valid_substitute(q, f, gold) for f in first):
            out[q.id] = first
            continue
        context = "\n".join(
            f"- {data.pool[pid].title}: {t}" for pid, t in zip(q.gold_ids, gold, strict=True)
        )
        retry = RETRY_PROMPT.format(question=q.question, answer=answer, context=context)
        out[q.id] = first + _ask(client, model, retry, "substitutes")
    return out
