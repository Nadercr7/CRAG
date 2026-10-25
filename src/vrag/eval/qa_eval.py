"""End-to-end QA metrics: answer matching, outcomes, citations, context size, risk-coverage.

Everything here is a pure function of traces and gold data, so the numbers do not depend on
where the answers were generated.

Outcomes (``outcome``), checked in this order:

- abstain: the pipeline abstained, the generator said "insufficient", or the answer is empty
  (or only an abstention phrase such as "unknown")
- correct: answered and (exact match or containment) with the gold answer
- planted: misleading slice only, answered with the planted substitute (checked before
  containment with the gold, so an answer that repeats the substitute is never "correct")
- hallucinate: answered and none of the above

``planted`` is a kind of wrong answer, reported next to ``hallucinate``, not inside it.
On the missing slice the gold paragraphs are gone, but the answer may still follow from other
paragraphs or from the model's own knowledge: a correct answer there is "correct" and is
also counted as ``correct_without_gold``.
"""

from __future__ import annotations

import math
import random
import re
import string
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import replace
from typing import Any

from vrag.data.slices import Slice
from vrag.llm.client import parse_json
from vrag.pipeline.pipeline import VerifiedRAG
from vrag.pipeline.sufficiency import abstain_decision
from vrag.pipeline.types import Trace

OUTCOMES = ("correct", "abstain", "hallucinate", "planted")
ANSWERED = ("correct", "hallucinate", "planted")

# --------------------------------------------------------------------------- normalization

_UNIT_WORDS = (
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen "
    "fifteen sixteen seventeen eighteen nineteen"
)
_TEN_WORDS = "twenty thirty forty fifty sixty seventy eighty ninety"
_UNITS = {w: n for n, w in enumerate(_UNIT_WORDS.split())}
_TENS = {w: 10 * n for n, w in enumerate(_TEN_WORDS.split(), start=2)}
_HYPHENATED = re.compile(
    rf"\b({'|'.join(_TENS)})-({'|'.join(w for w in _UNITS if 1 <= _UNITS[w] <= 9)})\b"
)
_ARTICLES = re.compile(r"\b(a|an|the)\b")
_DASHES = str.maketrans({0x2013: " ", 0x2014: " ", 0x2212: " "})  # en dash, em dash, minus
_YES = {"yes", "yeah", "yep", "yup", "true", "correct", "affirmative"}
_NO = {"no", "nope", "nah", "false", "incorrect", "negative"}
_ABSTENTION = re.compile(
    r"\binsufficient\b|\bnot enough (information|context|evidence)\b|\bunanswerable\b"
    r"|\b(cannot|cant|can not) be (determined|answered|found)\b|\bno answer\b|\bunknown\b"
    r"|\bnot (mentioned|specified|provided|stated|available)\b|\bi (do not|dont) know\b"
    r"|\bcontext does not\b|\bcontext doesnt\b"
)


def _strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def _is_punct(ch: str) -> bool:
    return ch in string.punctuation or unicodedata.category(ch).startswith("P")


def normalize_answer(text: str | None) -> str:
    """SQuAD-style normalization plus number words -> digits and yes/no variants.

    Lowercase, strip accents and punctuation, drop articles, collapse whitespace. Number words
    zero..twenty and the tens up to ninety become digits ("twenty-one" -> "21"). An answer that
    is only a yes/no variant ("Yeah.", "Nope") becomes "yes" / "no".
    """
    if not text:
        return ""
    s = _strip_accents(str(text)).lower().translate(_DASHES)
    s = _HYPHENATED.sub(lambda m: f"{m.group(1)} {m.group(2)}", s)
    s = "".join(ch for ch in s if not _is_punct(ch))
    tokens = _ARTICLES.sub(" ", s).split()
    out: list[str] = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
        if tok in _TENS and nxt in _UNITS and 1 <= _UNITS[nxt] <= 9:
            out.append(str(_TENS[tok] + _UNITS[nxt]))
            i += 2
            continue
        out.append(str(_UNITS[tok]) if tok in _UNITS else str(_TENS[tok]) if tok in _TENS else tok)
        i += 1
    if len(out) == 1:
        out = ["yes"] if out[0] in _YES else ["no"] if out[0] in _NO else out
    return " ".join(out)


def is_abstention_text(text: str | None) -> bool:
    """An answer string that only says the context is insufficient ("Unknown", ...)."""
    return bool(text) and bool(_ABSTENTION.search(normalize_answer(text)))


# -------------------------------------------------------------------------------- metrics


def exact_match(prediction: str | None, gold: str) -> float:
    return float(normalize_answer(prediction) == normalize_answer(gold))


def f1(prediction: str | None, gold: str) -> float:
    """SQuAD token F1 on normalized answers (both empty: 1, one empty: 0)."""
    p, g = normalize_answer(prediction).split(), normalize_answer(gold).split()
    if not p or not g:
        return float(p == g)
    common = sum((Counter(p) & Counter(g)).values())
    if not common:
        return 0.0
    precision, recall = common / len(p), common / len(g)
    return 2 * precision * recall / (precision + recall)


def _has_run(hay: Sequence[str], needle: Sequence[str]) -> bool:
    n = len(needle)
    return any(list(hay[i : i + n]) == list(needle) for i in range(len(hay) - n + 1))


def contains(prediction: str | None, gold: str) -> bool:
    """Normalized gold inside the normalized prediction, or the other way round.

    Containment is on whole tokens ("rome" is not in "prometheus"). False for an empty
    prediction and for an abstention phrase. Two guards keep it from rewarding vague or
    padded answers:

    - gold inside prediction counts only while the prediction is at most
      ``3 * len(gold) + 3`` tokens (a sentence that happens to name the answer is not one);
    - prediction inside gold counts only when it covers at least half of the gold tokens
      ("University of Pennsylvania" for "Wharton School of the University of Pennsylvania"
      passes; "Tony" for "eight Tony Awards" does not).
    """
    p, g = normalize_answer(prediction).split(), normalize_answer(gold).split()
    if not p or not g or is_abstention_text(prediction):
        return False
    if len(p) <= 3 * len(g) + 3 and _has_run(p, g):
        return True
    return 2 * len(p) >= len(g) and _has_run(g, p)


def _matches(prediction: str | None, target: str) -> bool:
    return bool(exact_match(prediction, target)) or contains(prediction, target)


def is_answered(trace: Trace) -> bool:
    """The pipeline answered: no abstention, no "insufficient", a non-empty answer."""
    if trace.abstain or trace.insufficient or not normalize_answer(trace.answer):
        return False
    return not is_abstention_text(trace.answer)


def outcome(trace: Trace, gold: str, slice: Slice | None = None) -> str:
    """One of ``OUTCOMES`` (see the module docstring)."""
    if not is_answered(trace):
        return "abstain"
    if exact_match(trace.answer, gold):
        return "correct"
    substitute = slice.substitute if slice and slice.kind == "misleading" else None
    if substitute and _matches(trace.answer, substitute):
        return "planted"
    return "correct" if contains(trace.answer, gold) else "hallucinate"


# ------------------------------------------------------------------- citations and context


def _titles(trace: Trace) -> dict[str, str]:
    return {c.id: c.title for c in trace.chunks}


def cited_lines(trace: Trace) -> list[tuple[str, int | None]]:
    """``(chunk title, sentence index)`` of every valid citation (index None: whole paragraph)."""
    titles = _titles(trace)
    out = []
    for n in trace.citations:
        if 1 <= n <= len(trace.context_refs):
            cid, sent = trace.context_refs[n - 1]
            out.append((titles.get(cid, cid), sent))
    return out


def line_is_supporting(title: str, sent: int | None, facts: Collection[tuple[str, int]]) -> bool:
    """A context line is a gold supporting sentence, or (paragraph lines) holds one."""
    if sent is None:
        return any(t == title for t, _ in facts)
    return (title, sent) in facts


def citation_stats(trace: Trace, facts: Collection[tuple[str, int]]) -> dict[str, int]:
    """Counts behind citation validity and support.

    - ``cited``: valid citations plus dropped ones (pointing to a line that does not exist)
    - ``valid``: citations that point to an existing line
    - ``supported``: valid citations whose line is a gold supporting sentence
    """
    lines = cited_lines(trace)
    return {
        "cited": len(trace.citations) + len(trace.citations_dropped),
        "valid": len(trace.citations),
        "supported": sum(line_is_supporting(t, s, facts) for t, s in lines),
    }


def approx_tokens(text: str) -> int:
    """About four characters per token, the estimate the LLM client uses."""
    return math.ceil(len(text) / 4)


def facts_in_context(trace: Trace, facts: Collection[tuple[str, int]]) -> bool:
    """Every supporting fact is among the lines sent to the generator."""
    titles = _titles(trace)
    have = {(titles.get(cid, cid), sent) for cid, sent in trace.context_refs}
    return bool(facts) and all((t, i) in have or (t, None) in have for t, i in facts)


def context_stats(trace: Trace, facts: Collection[tuple[str, int]]) -> dict[str, Any]:
    return {
        "context_lines": len(trace.context),
        "context_tokens": sum(approx_tokens(line) for line in trace.context),
        "all_facts": facts_in_context(trace, facts),
    }


# ---------------------------------------------------------------------- per-question rows


def finalize_trace(trace: Trace, raw_output: str | None) -> Trace:
    """``VerifiedRAG.finalize`` without needing a pipeline: it only reads the trace."""
    return VerifiedRAG.finalize(None, trace, raw_output)  # type: ignore[arg-type]


def apply_abstain_threshold(trace: Trace, tau_abstain: float) -> Trace:
    """The trace with the abstain decision re-taken at ``tau_abstain``.

    Traces of arms with sufficiency are prepared with abstention off (so the prompt exists
    for every question); the real threshold is applied afterwards.
    """
    abstain, reason = abstain_decision(
        trace.sufficiency_prob, tau_abstain, has_context=bool(trace.context)
    )
    return replace(trace, abstain=abstain, abstain_reason=reason)


def evaluate_trace(
    trace: Trace,
    gold: str,
    facts: Collection[tuple[str, int]],
    slice: Slice | None = None,
    tau_abstain: float | None = None,
) -> dict[str, Any]:
    """The per-question record: outcome and every metric that feeds the aggregation.

    With ``tau_abstain`` the trace is first re-decided at that threshold. ``outcome_open`` is
    always the outcome of the trace as given, which is the no-threshold outcome when the trace
    was prepared with abstention off (it feeds the risk-coverage sweep).
    """
    open_outcome = outcome(trace, gold, slice)
    if tau_abstain is not None:
        trace = apply_abstain_threshold(trace, tau_abstain)
    result = outcome(trace, gold, slice)
    answered = result in ANSWERED
    ctx = context_stats(trace, facts)
    return {
        "qid": trace.qid,
        "arm": trace.arm,
        "slice": trace.slice_kind,
        "outcome": result,
        "outcome_open": open_outcome,
        "answered": answered,
        "em": exact_match(trace.answer, gold) if answered else None,
        "f1": f1(trace.answer, gold) if answered else None,
        "contains": contains(trace.answer, gold) if answered else None,
        "answer": trace.answer,
        "gold": gold,
        "abstain_reason": trace.abstain_reason,
        "generator_insufficient": trace.insufficient,
        "output_valid": trace.output_valid,
        "sufficiency_prob": trace.sufficiency_prob,
        **ctx,
        **{f"cite_{k}": v for k, v in citation_stats(trace, facts).items()},
        "llm_calls": trace.llm_calls,
    }


# ------------------------------------------------------------------------ aggregation


def _mean(values: Iterable[float | bool | None]) -> float | None:
    xs = [float(v) for v in values if v is not None]
    return sum(xs) / len(xs) if xs else None


def _ratio(num: float, den: float) -> float | None:
    return num / den if den else None


def aggregate(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Metrics of one (arm, slice): rates over all questions, quality over answered ones.

    - ``correct`` / ``abstain`` / ``hallucinate`` / ``planted``: share of all questions
    - ``coverage``: answered / total; ``selective_accuracy``: correct / answered
    - ``em`` / ``f1`` / ``contains``: mean over answered questions
    - ``correct_without_gold``: missing slice only, the share of questions answered correctly
      although the gold paragraphs were removed
    - ``correct_without_facts``: correct although not every supporting fact is in the context
    - ``citation_validity``: valid / all citations; ``citation_support``: supporting / valid
      citations (both pooled over answers); ``cited``: share of answers with a valid citation
    """
    n = len(records)
    count = Counter(r["outcome"] for r in records)
    answered = [r for r in records if r["answered"]]
    cited = sum(r["cite_cited"] for r in answered)
    valid = sum(r["cite_valid"] for r in answered)
    slice_kinds = {r["slice"] for r in records}
    return {
        "n": n,
        **{k: _ratio(count[k], n) for k in OUTCOMES},
        "answered": len(answered),
        "coverage": _ratio(len(answered), n),
        "selective_accuracy": _ratio(count["correct"], len(answered)),
        "em": _mean(r["em"] for r in answered),
        "f1": _mean(r["f1"] for r in answered),
        "contains": _mean(r["contains"] for r in answered),
        "correct_without_gold": _ratio(count["correct"], n) if slice_kinds == {"missing"} else None,
        "correct_without_facts": _ratio(
            sum(r["outcome"] == "correct" and not r["all_facts"] for r in records), n
        ),
        "citation_validity": _ratio(valid, cited),
        "citation_support": _ratio(sum(r["cite_supported"] for r in answered), valid),
        "cited": _ratio(sum(r["cite_valid"] > 0 for r in answered), len(answered)),
        "context_lines": _mean(r["context_lines"] for r in records),
        "context_tokens": _mean(r["context_tokens"] for r in records),
        "all_facts_in_context": _mean(r["all_facts"] for r in records),
        "llm_calls_per_question": _mean(r["llm_calls"] for r in records),
    }


def aggregate_all(records: Sequence[Mapping[str, Any]]) -> dict[str, dict[str, dict[str, Any]]]:
    """``{arm: {slice: aggregate}}``."""
    groups: dict[tuple[str, str], list[Mapping[str, Any]]] = defaultdict(list)
    for r in records:
        groups[(r["arm"], r["slice"])].append(r)
    out: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for (arm, kind), rows in sorted(groups.items()):
        out[arm][kind] = aggregate(rows)
    return dict(out)


def paired_values(
    records: Sequence[Mapping[str, Any]], arm_a: str, arm_b: str, kind: str, metric: str
) -> tuple[list[str], list[float], list[float]]:
    """Per-question 0/1 indicator of outcome ``metric`` for two arms on their shared questions."""
    by_arm: dict[str, dict[str, str]] = {arm_a: {}, arm_b: {}}
    for r in records:
        if r["slice"] == kind and r["arm"] in by_arm:
            by_arm[r["arm"]][r["qid"]] = r["outcome"]
    qids = sorted(by_arm[arm_a].keys() & by_arm[arm_b].keys())
    return (
        qids,
        [float(by_arm[arm_a][q] == metric) for q in qids],
        [float(by_arm[arm_b][q] == metric) for q in qids],
    )


# ---------------------------------------------------------------------- risk-coverage


def risk_coverage(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Selective accuracy against coverage as the abstain threshold on sufficiency sweeps.

    ``records`` come from one arm prepared with abstention off, so each has the outcome the
    generator would have produced (``outcome_open``) and ``sufficiency_prob``. At threshold t a
    question is answered when its probability is >= t and the open outcome is not an abstention.
    Questions without a context (no probability) never count as answered. Coverage is over all
    questions. ``auc`` is the area under the selective-accuracy step curve over
    coverage [0, max coverage]; ``auc_normalized`` divides it by the maximum coverage.
    """
    n = len(records)
    rows = [
        (r["sufficiency_prob"], r["outcome_open"])
        for r in records
        if r["sufficiency_prob"] is not None and r["outcome_open"] != "abstain"
    ]
    points: list[dict[str, float]] = []
    for t in sorted({p for p, _ in rows}, reverse=True):
        kept = [o for p, o in rows if p >= t]
        correct = sum(o == "correct" for o in kept)
        points.append(
            {
                "threshold": t,
                "coverage": len(kept) / n,
                "answered": len(kept),
                "selective_accuracy": correct / len(kept),
            }
        )
    area, prev = 0.0, 0.0
    for p in points:
        area += p["selective_accuracy"] * (p["coverage"] - prev)
        prev = p["coverage"]
    return {
        "n": n,
        "points": points,
        "auc": area,
        "max_coverage": prev,
        "auc_normalized": area / prev if prev else None,
    }


# ------------------------------------------------------------------------------ judge

JUDGE_SYSTEM = """You grade answers to factual questions against a reference answer.
Decide whether the candidate answer is correct: it must state the same fact as the \
reference answer (same entity, number, date or yes/no). Differences in wording, extra \
detail that does not contradict the reference, and number words versus digits are fine. \
A different entity, a hedge without a commitment, or a refusal is incorrect.
Reply with JSON only: {"correct": true or false, "reason": "<one short sentence>"}"""


def judge_messages(question: str, gold: str, answer: str) -> list[dict[str, str]]:
    user = f"Question: {question}\nReference answer: {gold}\nCandidate answer: {answer}"
    return [{"role": "system", "content": JUDGE_SYSTEM}, {"role": "user", "content": user}]


def parse_verdict(text: str | None) -> bool | None:
    """The judge's ``correct`` flag, or None when the reply has no usable verdict."""
    if not text:
        return None
    try:
        data = parse_json(re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL))
    except ValueError:
        return None
    value = data.get("correct") if isinstance(data, dict) else None
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in {"true", "false"}:
        return value.strip().lower() == "true"
    return None


def stratified_sample(
    records: Sequence[Mapping[str, Any]], n: int, seed: int = 0
) -> list[Mapping[str, Any]]:
    """Up to ``n`` answered records, spread evenly over (slice, outcome) strata.

    Records with the same question and the same normalized answer count once (arms often
    agree), so the judge never grades one answer twice. Strata are filled round-robin.
    """
    rng = random.Random(seed)
    seen: set[tuple[str, str, str]] = set()
    strata: dict[tuple[str, str], list[Mapping[str, Any]]] = defaultdict(list)
    for r in sorted(records, key=lambda r: (r["qid"], r["arm"], r["slice"])):
        key = (r["qid"], r["slice"], normalize_answer(r["answer"]))
        if not r["answered"] or key in seen:
            continue
        seen.add(key)
        strata[(r["slice"], r["outcome"])].append(r)
    for rows in strata.values():
        rng.shuffle(rows)
    picked: list[Mapping[str, Any]] = []
    queues = [strata[k] for k in sorted(strata)]
    while len(picked) < n and any(queues):
        for q in queues:
            if q and len(picked) < n:
                picked.append(q.pop())
    return picked


def judge_agreement(pairs: Sequence[tuple[bool, bool]]) -> dict[str, Any]:
    """Agreement of ``(judge says correct, deterministic outcome is correct)`` pairs."""
    n = len(pairs)
    tp = sum(j and d for j, d in pairs)
    tn = sum(not j and not d for j, d in pairs)
    fp = sum(j and not d for j, d in pairs)  # judge correct, outcome not
    fn = sum(not j and d for j, d in pairs)  # outcome correct, judge not
    observed = _ratio(tp + tn, n)
    expected = ((tp + fp) * (tp + fn) + (tn + fn) * (tn + fp)) / (n * n) if n else None
    kappa = (
        (observed - expected) / (1 - expected)
        if observed is not None and expected is not None and expected < 1
        else None
    )
    return {
        "n": n,
        "agreement": observed,
        "kappa": kappa,
        "both_correct": tp,
        "both_wrong": tn,
        "judge_only_correct": fp,
        "outcome_only_correct": fn,
    }
