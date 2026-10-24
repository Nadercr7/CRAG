import pytest

from vrag.data.hotpot import build_hotpot, paragraph_id
from vrag.data.slices import (
    answer_kind,
    build_slices,
    misleading_slice,
    missing_slice,
    supportive_slice,
)


def make_row(i, answer, gold_text, qtype="bridge", shared=None):
    gold_titles = [f"G{i}a", f"G{i}b"]
    titles = [*gold_titles, *(f"D{i}_{n}" for n in range(8))]
    sents = [[gold_text, " Second sentence."], [" Other gold."]]
    sents += [[f"Distractor {i} {n}."] for n in range(8)]
    if shared:  # replace the last distractor with a paragraph shared with another question
        titles[-1], sents[-1] = shared
    return {
        "id": f"q{i:03d}",
        "question": f"Question {i}?",
        "answer": answer,
        "type": qtype,
        "level": "hard",
        "supporting_facts": {"title": [*gold_titles, gold_titles[0]], "sent_id": [0, 0, 1]},
        "context": {"title": titles, "sentences": sents},
    }


def make_rows():
    shared = ("Shared", ["Shared paragraph."])
    return [
        make_row(0, "Paris", "The capital is Paris.", shared=shared),
        make_row(1, "1994", "It was built in 1994 and 1994 again.", shared=shared),
        make_row(2, "1888", "Founded in 1888."),
        make_row(3, "yes", "Yes it is.", qtype="comparison"),
        make_row(4, "Berlin", "Nothing relevant here."),
        make_row(5, "New Paris", "Located in New Paris."),
        make_row(6, "Rome", "Rome is old."),
    ]


@pytest.fixture
def data():
    return build_hotpot(make_rows(), n_test=4, n_dev=3, seed=7)


def test_sampling_deterministic_and_disjoint(data):
    again = build_hotpot(list(reversed(make_rows())), n_test=4, n_dev=3, seed=7)
    assert [q.id for q in data.questions] == [q.id for q in again.questions]
    assert [q.split for q in data.questions] == ["test"] * 4 + ["dev"] * 3
    assert len({q.id for q in data.questions}) == 7
    other = build_hotpot(make_rows(), n_test=4, n_dev=3, seed=8)
    assert [q.id for q in other.questions] != [q.id for q in data.questions]
    with pytest.raises(ValueError):
        build_hotpot(make_rows(), n_test=5, n_dev=5, seed=7)


def test_pool_dedupes_identical_paragraphs(data):
    assert len(data.pool) == 7 * 10 - 1  # "Shared" appears in two questions, stored once
    shared_id = paragraph_id("Shared", "Shared paragraph.")
    owners = [q.id for q in data.questions if shared_id in q.paragraph_ids]
    assert sorted(owners) == ["q000", "q001"]
    assert all(len(q.paragraph_ids) == 10 for q in data.questions)


def test_gold_ids_and_text(data):
    q = next(q for q in data.questions if q.id == "q000")
    assert len(q.gold_ids) == 2  # a repeated supporting-fact title counts once
    assert data.pool[q.gold_ids[0]].text == "The capital is Paris. Second sentence."
    assert data.corpus()[q.gold_ids[0]]["title"] == "G0a"


def by_id(data, qid):
    return next(q for q in data.questions if q.id == qid)


def test_supportive_and_missing(data):
    q = by_id(data, "q000")
    s = supportive_slice(q)
    assert not s.exclude_ids and not s.replace_text
    assert missing_slice(q).exclude_ids == set(q.gold_ids)


def test_misleading_replaces_every_occurrence(data):
    answers = [q.answer for q in data.questions]
    q = by_id(data, "q001")  # number kind; only other number answer is 1888
    m = misleading_slice(q, data, answers, seed=1, allow_fallback=True)
    assert m.substitute == "1888" and m.original_answer == "1994"
    (text,) = m.replace_text.values()
    assert text == "It was built in 1888 and 1888 again. Second sentence."
    assert list(m.replace_text) == [q.gold_ids[0]]


def test_misleading_not_built_when_not_eligible(data):
    answers = [q.answer for q in data.questions]
    assert (
        misleading_slice(by_id(data, "q003"), data, answers, 1, allow_fallback=True) is None
    )  # yes/no
    assert (
        misleading_slice(by_id(data, "q004"), data, answers, 1, allow_fallback=True) is None
    )  # not in gold text
    assert answer_kind("1994") == "number" and answer_kind("Paris") == "other"


def test_misleading_substitute_rules(data):
    answers = [q.answer for q in data.questions]
    q = by_id(data, "q000")  # "Paris": New Paris contains it, so it can never be used
    for seed in range(30):
        m = misleading_slice(q, data, answers, seed, allow_fallback=True)
        assert m.substitute in {"Berlin", "Rome"}
        assert "Paris" not in next(iter(m.replace_text.values()))
    q = by_id(data, "q005")  # "New Paris": Paris is contained in it, so "Paris" is excluded
    for seed in range(30):
        assert misleading_slice(q, data, answers, seed, allow_fallback=True).substitute in {
            "Berlin",
            "Rome",
        }


def test_misleading_deterministic_by_seed(data):
    answers = [q.answer for q in data.questions]
    q = by_id(data, "q000")
    picks = {
        misleading_slice(q, data, answers, s, allow_fallback=True).substitute for s in range(40)
    }
    assert picks == {"Berlin", "Rome"}
    assert (
        misleading_slice(q, data, answers, 5, allow_fallback=True).substitute
        == misleading_slice(q, data, answers, 5, allow_fallback=True).substitute
    )


def test_build_slices(data):
    slices = build_slices(data, seed=3, allow_fallback=True)
    assert set(slices) == {q.id for q in data.questions}
    assert set(slices["q003"]) == {"supportive", "missing"}
    assert set(slices["q000"]) == {"supportive", "missing", "misleading"}


def test_load_hotpot_split_is_stable_across_cache(tmp_path, monkeypatch):
    import sys
    import types

    import vrag.data.hotpot as hotpot

    rows = [_cache_row(i) for i in range(40)]
    fake_pq = types.SimpleNamespace(
        read_table=lambda _: types.SimpleNamespace(to_pylist=lambda: rows)
    )
    monkeypatch.setitem(sys.modules, "pyarrow.parquet", fake_pq)
    monkeypatch.setattr("huggingface_hub.hf_hub_download", lambda *a, **k: "unused")

    fresh = hotpot.load_hotpot(n_test=6, n_dev=4, seed=3, raw_dir=tmp_path)
    cached = hotpot.load_hotpot(n_test=6, n_dev=4, seed=3, raw_dir=tmp_path)
    expected = hotpot.build_hotpot(rows, 6, 4, 3)
    for data in (fresh, cached):
        assert [(q.id, q.split) for q in data.questions] == [
            (q.id, q.split) for q in expected.questions
        ]


def _cache_row(i):
    return {
        "id": f"q{i:03d}",
        "question": f"question {i}?",
        "answer": f"answer {i}",
        "type": "bridge",
        "level": "easy",
        "context": {"title": [f"T{i}"], "sentences": [[f"Sentence about answer {i}."]]},
        "supporting_facts": {"title": [f"T{i}"], "sent_id": [0]},
    }


def test_proposed_substitute_used_when_valid_else_fallback():
    from vrag.data.hotpot import HotpotData, HotpotQuestion, Paragraph
    from vrag.data.slices import misleading_slice

    para = Paragraph("p1", "Opera", (" Gluck wrote Alceste in 1767.",))
    q = HotpotQuestion(
        "q1", "Which opera?", "Alceste", "bridge", "easy", "test", ("p1",), ("p1",), (("Opera", 0),)
    )
    data = HotpotData([q], {"p1": para})
    answers = ["Alceste", "Orfeo", "Gluck"]

    good = misleading_slice(q, data, answers, seed=1, proposed=["Armide"])
    assert good.substitute == "Armide"
    assert good.replace_text["p1"] == "Gluck wrote Armide in 1767."

    # Invalid proposals (contains the answer / already in the gold text) fall back.
    assert misleading_slice(q, data, answers, seed=1, proposed=["Gluck", "Armide"]).substitute == (
        "Armide"
    )
    for bad in ("Alceste II", "Gluck"):
        assert misleading_slice(q, data, answers, seed=1, proposed=[bad]) is None
        fallback = misleading_slice(q, data, answers, seed=1, proposed=[bad], allow_fallback=True)
        assert fallback.substitute == "Orfeo"
