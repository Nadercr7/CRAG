"""WiSE-FT: interpolate fine-tuned and base weights (Wortsman et al., CVPR 2022).

Fine-tuning the verifier on HotpotQA raises in-domain ranking (dev passage nDCG@10
0.90 -> 0.95) but costs out-of-domain quality (NFCorpus dev 0.55 -> 0.43). Averaging the
two weight sets, theta = alpha * fine-tuned + (1 - alpha) * base, keeps most of the
in-domain gain and nearly all of the base model's out-of-domain ranking, with no extra
training. alpha is chosen on dev data (results/tuning/wise_ft.md).
"""

from __future__ import annotations

from collections.abc import Mapping

import torch


def interpolate(
    base: Mapping[str, torch.Tensor], tuned: Mapping[str, torch.Tensor], alpha: float
) -> dict[str, torch.Tensor]:
    """``alpha * tuned + (1 - alpha) * base`` for float tensors; others come from ``tuned``."""
    if not 0.0 <= alpha <= 1.0:
        raise ValueError(f"alpha must be in [0, 1], got {alpha}")
    if base.keys() != tuned.keys():
        raise ValueError("base and tuned models have different parameters")
    out = {}
    for name, t in tuned.items():
        if t.is_floating_point():
            mixed = alpha * t.float() + (1 - alpha) * base[name].float()
            out[name] = mixed.to(t.dtype)
        else:
            out[name] = t.clone()
    return out


def wise_ft(base_name: str, tuned_path: str, alpha: float, out_path: str) -> None:
    """Load both cross-encoders, interpolate, and save a CrossEncoder at ``out_path``."""
    from sentence_transformers import CrossEncoder

    base = CrossEncoder(base_name, device="cpu")
    tuned = CrossEncoder(tuned_path, device="cpu")
    tuned.model.load_state_dict(
        interpolate(base.model.state_dict(), tuned.model.state_dict(), alpha)
    )
    tuned.save_pretrained(out_path)
