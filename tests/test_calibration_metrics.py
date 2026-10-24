import numpy as np
import pytest

from vrag.pipeline.calibrate import PlattCalibrator, brier_score, expected_calibration_error


def test_brier_score():
    assert brier_score([1.0, 0.0], [1, 0]) == 0.0
    assert brier_score([0.5, 0.5], [1, 0]) == pytest.approx(0.25)
    assert brier_score([0.0], [1]) == 1.0


def test_ece_perfect_and_worst():
    assert expected_calibration_error([0.0, 1.0, 1.0], [0, 1, 1]) == 0.0
    assert expected_calibration_error([1.0, 1.0], [0, 0]) == pytest.approx(1.0)


def test_ece_bins_by_hand():
    # bin [0.1, 0.2): two items, conf ~0.15, acc 0.5; bin [0.9, 1.0]: conf 0.95, acc 1.
    probs = [0.1, 0.2 - 1e-9, 0.9, 1.0]
    labels = [0, 1, 1, 1]
    expected = 0.5 * abs(0.5 - (0.1 + 0.2 - 1e-9) / 2) + 0.5 * abs(1.0 - 0.95)
    assert expected_calibration_error(probs, labels) == pytest.approx(expected)


def test_ece_one_lands_in_last_bin_and_bin_edges_are_lower_inclusive():
    # 0.5 is the lower edge of bin 5 of 10; 1.0 must not index a bin 10.
    assert expected_calibration_error([0.5, 1.0], [1, 1], n_bins=10) == pytest.approx(0.25)
    assert expected_calibration_error([0.5], [1], n_bins=2) == pytest.approx(0.5)


def test_ece_rejects_bad_input():
    with pytest.raises(ValueError):
        expected_calibration_error([], [])
    with pytest.raises(ValueError):
        expected_calibration_error([0.5], [1, 0])
    with pytest.raises(ValueError):
        expected_calibration_error([0.5], [1], n_bins=0)


def test_platt_fit_improves_overconfident_logits():
    rng = np.random.default_rng(0)
    logits = rng.normal(0, 6, 4000)
    labels = (rng.random(4000) < 1 / (1 + np.exp(-0.3 * logits))).astype(int)
    raw = 1 / (1 + np.exp(-logits))
    fitted = PlattCalibrator.fit(logits, labels)(logits)
    assert expected_calibration_error(fitted, labels) < expected_calibration_error(raw, labels)
    assert brier_score(fitted, labels) < brier_score(raw, labels)
