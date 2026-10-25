import pytest
import torch

from vrag.verifier.wise import interpolate


def test_interpolate_floats_and_keeps_ints():
    base = {"w": torch.zeros(2), "ids": torch.tensor([1, 2])}
    tuned = {"w": torch.ones(2), "ids": torch.tensor([3, 4])}
    out = interpolate(base, tuned, 0.7)
    assert torch.allclose(out["w"], torch.full((2,), 0.7))
    assert out["ids"].tolist() == [3, 4]
    assert torch.equal(interpolate(base, tuned, 0.0)["w"], base["w"])


def test_interpolate_validates():
    with pytest.raises(ValueError):
        interpolate({"w": torch.zeros(1)}, {"w": torch.zeros(1)}, 1.5)
    with pytest.raises(ValueError):
        interpolate({"a": torch.zeros(1)}, {"b": torch.zeros(1)}, 0.5)
