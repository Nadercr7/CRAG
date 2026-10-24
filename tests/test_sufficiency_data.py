import random

from vrag.verifier.sufficiency_data import context_lines, sufficiency_examples


def row():
    return {
        "id": "q1",
        "question": "Which city hosts the museum founded by Ada?",
        "context": {
            "title": ["Ada", "Museum", "Noise"],
            "sentences": [
                [" Ada was a collector.", " She founded the Orsay Annex."],
                [" The Orsay Annex is in Paris.", " It opened in 1990."],
                [" Noise one.", " Noise two.", " Noise three."],
            ],
        },
        "supporting_facts": {"title": ["Ada", "Museum"], "sent_id": [1, 0]},
    }


def lines(example):
    return [line.split("] ", 1)[1] for line in example.context.split("\n")]


def test_context_lines_numbering():
    assert context_lines(["A: x", "B: y"]) == "[1] A: x\n[2] B: y"


def test_three_kinds_with_correct_evidence():
    by_kind = {e.kind: e for e in sufficiency_examples(row(), random.Random(0))}
    assert set(by_kind) == {"sufficient", "missing-hop", "no-evidence"}

    sufficient = lines(by_kind["sufficient"])
    assert "Ada: She founded the Orsay Annex." in sufficient
    assert "Museum: The Orsay Annex is in Paris." in sufficient
    assert by_kind["sufficient"].label == 1

    missing = lines(by_kind["missing-hop"])
    evidence = {"Ada: She founded the Orsay Annex.", "Museum: The Orsay Annex is in Paris."}
    assert len(evidence & set(missing)) == 1
    assert by_kind["missing-hop"].label == 0

    assert all(line.startswith("Noise:") for line in lines(by_kind["no-evidence"]))
    assert by_kind["no-evidence"].label == 0


def test_paragraph_order_is_kept():
    for example in sufficiency_examples(row(), random.Random(3)):
        titles = [line.split(":", 1)[0] for line in lines(example)]
        order = {"Ada": 0, "Museum": 1, "Noise": 2}
        assert titles == sorted(titles, key=order.__getitem__)
