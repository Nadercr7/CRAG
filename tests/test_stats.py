import numpy as np
import pytest

from vrag.eval.stats import paired_bootstrap


def test_clear_improvement_is_significant():
    a = [1.0] * 80 + [0.0] * 20
    b = [1.0] * 40 + [0.0] * 60
    r = paired_bootstrap(a, b, seed=1)
    assert r.mean_diff == pytest.approx(0.4) and r.n == 100
    assert 0.25 < r.ci_low < r.mean_diff < r.ci_high < 0.55
    assert r.p_value < 0.001 and r.significant


def test_identical_systems_have_zero_difference_and_p_one():
    x = [1.0, 0.0, 1.0, 1.0, 0.0]
    r = paired_bootstrap(x, x, seed=1)
    assert r.mean_diff == 0 and (r.ci_low, r.ci_high) == (0, 0) and r.p_value == 1.0
    assert not r.significant


def test_noise_around_zero_is_not_significant():
    rng = np.random.default_rng(0)
    a = (rng.random(200) < 0.5).astype(float)
    b = (rng.random(200) < 0.5).astype(float)
    r = paired_bootstrap(a, b, seed=1)
    assert r.ci_low < 0 < r.ci_high and r.p_value > 0.05


def test_seeded_and_antisymmetric():
    a, b = [1, 0, 1, 1, 0, 1, 0, 0], [0, 0, 1, 0, 0, 1, 1, 0]
    r1, r2 = paired_bootstrap(a, b, seed=7), paired_bootstrap(a, b, seed=7)
    assert r1 == r2
    rev = paired_bootstrap(b, a, seed=7)
    assert rev.mean_diff == -r1.mean_diff and rev.p_value == pytest.approx(r1.p_value)
    assert rev.ci_low == pytest.approx(-r1.ci_high) and rev.ci_high == pytest.approx(-r1.ci_low)


def test_resample_count_does_not_change_blocks():
    r = paired_bootstrap([1, 0, 1], [0, 0, 1], n_resamples=4500, seed=3)
    assert r.n == 3 and 0 <= r.p_value <= 1


def test_rejects_bad_input():
    with pytest.raises(ValueError):
        paired_bootstrap([1, 0], [1])
    with pytest.raises(ValueError):
        paired_bootstrap([], [])
