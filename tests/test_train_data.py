import random

from vrag.data.beir import BeirDataset
from vrag.verifier.train_data import (
    beir_candidates,
    false_negative_floor,
    filter_candidates,
    hotpot_pairs,
    sentence_text,
)


def hotpot_row():
    return {
        "id": "q1",
        "question": "Which city hosts the museum founded by Ada?",
        "answer": "Paris",
        "context": {
            "title": ["Ada", "Museum", "Noise1", "Noise2"],
            "sentences": [
                [" Ada was a collector.", " She founded the Orsay Annex."],
                [" The Orsay Annex is in Paris.", " It opened in 1990."],
                [" Noise one.", " More noise."],
                [" Noise two."],
            ],
        },
        "supporting_facts": {"title": ["Ada", "Museum"], "sent_id": [1, 0]},
    }


def test_hotpot_pairs_labels():
    pairs = hotpot_pairs(hotpot_row(), random.Random(0), n_distractors=2)
    passages = [p for p in pairs if p.level == "passage"]
    sentences = [p for p in pairs if p.level == "sentence"]

    assert {p.text for p in passages if p.label == 1} == {
        "Ada Ada was a collector. She founded the Orsay Annex.",
        "Museum The Orsay Annex is in Paris. It opened in 1990.",
    }
    stripped = {p.text for p in passages if p.source == "hotpot-stripped"}
    assert stripped == {"Ada Ada was a collector.", "Museum It opened in 1990."}
    assert all(p.label == 0 for p in passages if p.source != "hotpot")
    assert sum(p.source == "hotpot-distractor" for p in passages) == 2

    positives = {p.text for p in sentences if p.label == 1}
    assert positives == {
        sentence_text("Ada", " She founded the Orsay Annex."),
        sentence_text("Museum", " The Orsay Annex is in Paris."),
    }
    assert {p.group for p in pairs} == {"q1"}


def test_stripped_gold_skipped_when_answer_remains():
    row = hotpot_row()
    row["context"]["sentences"][1] = [" The Orsay Annex is in Paris.", " Paris is big."]
    pairs = hotpot_pairs(row, random.Random(0))
    assert not any(p.source == "hotpot-stripped" and p.text.startswith("Museum") for p in pairs)


def test_beir_candidates_exclude_judged_docs():
    ds = BeirDataset(
        "toy",
        "train",
        corpus={d: {"title": d.upper(), "text": "t"} for d in ("a", "b", "c", "d")},
        queries={"q": "query"},
        qrels={"q": {"a": 1, "b": 0}},
    )
    items = beir_candidates(ds, lambda q, k: [("b", 3.0), ("a", 2.0), ("c", 1.0), ("d", 0.5)])
    assert items[0]["positives"] == ["A t"]
    assert items[0]["candidates"] == ["C t", "D t"]  # judged-irrelevant "b" is skipped too
    assert items[0]["qid"] == "toy:q"


def test_filter_candidates_drops_likely_false_negatives():
    item = {
        "qid": "q",
        "query": "x",
        "source": "s",
        "positives": ["P"],
        "candidates": ["C1", "C2", "C3", "C4", "C5"],
    }
    # The teacher trusts the positive (0.7): anything scoring >= 0.7 is a likely positive.
    pairs = filter_candidates(
        item, [0.7], [0.95, 0.8, 0.5, 0.1, 0.0], random.Random(0), n_hard=2, n_random=1
    )
    negatives = [p.text for p in pairs if p.label == 0]
    assert negatives[:2] == ["C3", "C4"] and negatives[2] == "C5"


def test_false_negative_floor():
    assert false_negative_floor([0.7, 0.2]) == 0.7
    assert false_negative_floor([0.99]) == 0.9  # capped at the confident threshold
    assert false_negative_floor([0.1, 0.0]) == 0.9  # teacher disagrees with qrels: only 0.9


def test_beir_candidates_keep_highest_graded_positives():
    ds = BeirDataset(
        "toy",
        "train",
        corpus={d: {"title": d.upper(), "text": "t"} for d in ("a", "b", "c", "d", "e")},
        queries={"q": "query"},
        qrels={"q": {"a": 1, "b": 2, "c": 2, "d": 1}},
    )
    items = beir_candidates(ds, lambda q, k: [("e", 1.0), ("a", 0.5)], max_positives=2)
    assert items[0]["positives"] == ["B t", "C t"]
    assert items[0]["candidates"] == ["E t"]  # judged docs never become candidates


def test_easy_negatives_come_from_other_questions():
    from vrag.verifier.train_data import easy_negatives

    other = hotpot_row()
    other["id"], other["question"] = "q2", "Who painted the ceiling?"
    other["context"] = {"title": ["Chapel"], "sentences": [[" Michelangelo painted it."]]}
    pairs = easy_negatives(hotpot_row(), [other] * 4, random.Random(0))
    assert [p.level for p in pairs] == ["passage", "passage", "sentence", "sentence"]
    assert all(p.label == 0 and p.source == "hotpot-random" for p in pairs)
    assert all(p.query == hotpot_row()["question"] and "Michelangelo" in p.text for p in pairs)


def test_direct_titles_and_second_hop_modes():
    from vrag.verifier.train_data import direct_titles

    row = hotpot_row()
    row["type"] = "bridge"
    row["question"] = "Which city hosts the gallery founded by Ada?"  # never names "Museum"
    assert direct_titles(row) == {"Ada"}
    row["type"] = "comparison"
    assert direct_titles(row) == {"Ada", "Museum"}
    row["type"] = "bridge"

    skip_passage = hotpot_pairs(row, random.Random(0), second_hop="skip-passage")
    assert not any(p.level == "passage" and p.text.startswith("Museum") for p in skip_passage)
    assert any(p.level == "sentence" and p.text.startswith("Museum:") for p in skip_passage)

    skip = hotpot_pairs(row, random.Random(0), second_hop="skip")
    assert not any(p.text.startswith("Museum") for p in skip if p.source == "hotpot")
