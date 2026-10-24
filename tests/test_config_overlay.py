from pathlib import Path

from vrag.config import DEFAULT_CONFIG, REPO_ROOT, Config, get_config, load_config, merge

TUNED = REPO_ROOT / "configs" / "tuned.toml"


def test_merge_is_deep_and_pure():
    base = {"a": {"x": 1, "y": 2}, "b": 3}
    out = merge(base, {"a": {"y": 9}, "c": {"z": 1}})
    assert out == {"a": {"x": 1, "y": 9}, "b": 3, "c": {"z": 1}}
    assert base == {"a": {"x": 1, "y": 2}, "b": 3}


def test_overlay_wins_and_leaves_the_rest(tmp_path: Path):
    overlay = tmp_path / "o.toml"
    overlay.write_text('[pipeline]\ntau_hi = 0.81\n[verifier]\nmodel = "data/m"\n')
    base, cfg = load_config(), load_config(overlay=overlay)
    assert cfg.pipeline.tau_hi == 0.81
    assert cfg.pipeline.tau_lo == base.pipeline.tau_lo
    assert cfg.llm == base.llm and cfg.retrieval == base.retrieval
    assert cfg.verifier.model == REPO_ROOT / "data/m"  # relative paths anchor at the repo root
    assert cfg.verifier.calibration_passage is None


def test_no_overlay_is_plain_default():
    assert load_config() == load_config(DEFAULT_CONFIG, overlay=None)
    assert load_config().verifier.model is None


def test_env_overlay(tmp_path: Path, monkeypatch):
    overlay = tmp_path / "o.toml"
    overlay.write_text("[pipeline]\ntau_keep = 0.11\n")
    monkeypatch.setenv("VRAG_CONFIG_OVERLAY", str(overlay))
    get_config.cache_clear()
    try:
        assert get_config().pipeline.tau_keep == 0.11
    finally:
        get_config.cache_clear()


def test_tuned_toml_loads_as_overlay():
    cfg = load_config(overlay=TUNED)
    assert isinstance(cfg, Config)
    assert 0 < cfg.pipeline.tau_lo < cfg.pipeline.tau_hi <= 1
    assert cfg.verifier.calibration_passage is not None
    assert cfg.verifier.calibration_passage.name == "calibration_passage.json"
    assert cfg.llm == load_config().llm  # the overlay holds only tuned keys
