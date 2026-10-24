import pytest

from vrag.data.chunking import split_sentences


@pytest.mark.parametrize(
    "text, expected",
    [
        ("One. Two! Three?", ["One.", "Two!", "Three?"]),
        ("Dr. Smith met Mr. Jones. They talked.", ["Dr. Smith met Mr. Jones.", "They talked."]),
        ("Smith et al. showed this. It held.", ["Smith et al. showed this.", "It held."]),
        ("Use drugs, e.g. Aspirin, daily. Done.", ["Use drugs, e.g. Aspirin, daily.", "Done."]),
        ("That is, i.e. Tuesday. Next.", ["That is, i.e. Tuesday.", "Next."]),
        ("See Fig. 3 for details. Then stop.", ["See Fig. 3 for details.", "Then stop."]),
        (
            "Levels rose to 0.016 mg. Then fell by 3.5 units.",
            ["Levels rose to 0.016 mg.", "Then fell by 3.5 units."],
        ),
        ("Born in the U.S. army camp. He left.", ["Born in the U.S. army camp.", "He left."]),
        ("J. R. Smith left. He ran.", ["J. R. Smith left.", "He ran."]),
        ('He said "stop." Then he left.', ['He said "stop."', "Then he left."]),
        ("Treated vs. placebo differed. OK.", ["Treated vs. placebo differed.", "OK."]),
        ("First para.\n\nSecond para", ["First para.", "Second para"]),
        ("no capital here. so no split", ["no capital here. so no split"]),
        ("", []),
        ("   ", []),
    ],
)
def test_split_sentences(text, expected):
    assert split_sentences(text) == expected
