"""CRAG-style decision on the best chunk probability (research §9.2)."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

Decision = Literal["correct", "ambiguous", "incorrect"]


def decide(probs: Sequence[float], tau_hi: float, tau_lo: float) -> Decision:
    """``correct`` if max >= tau_hi, ``incorrect`` if max < tau_lo, else ``ambiguous``.

    No chunks at all is ``incorrect``.
    """
    if tau_lo > tau_hi:
        raise ValueError(f"tau_lo ({tau_lo}) must not exceed tau_hi ({tau_hi})")
    if not len(probs):
        return "incorrect"
    top = max(probs)
    if top >= tau_hi:
        return "correct"
    return "incorrect" if top < tau_lo else "ambiguous"


def decide_single(probs: Sequence[float], tau: float) -> Decision:
    """One threshold, no ambiguous band (arm G): ``correct`` iff max >= tau."""
    return decide(probs, tau, tau)
