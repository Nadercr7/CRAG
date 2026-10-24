"""Build the HotpotQA evaluation slices, with LLM-proposed misleading substitutes.

Writes data/processed/hotpot_substitutes.json and prints slice coverage per split.
LLM calls are cached, so re-running is free.
"""

import json
from collections import Counter

from vrag.config import get_config
from vrag.data.hotpot import load_hotpot
from vrag.data.slices import build_slices, propose_substitutes
from vrag.llm import LLMClient


def main() -> None:
    cfg = get_config()
    d = cfg.data
    data = load_hotpot(
        d.hotpot_test_size, d.hotpot_dev_size, d.hotpot_seed, cfg.paths.data_dir / "raw"
    )
    subs = propose_substitutes(data, LLMClient(), cfg.llm.rewrite_model)
    out = cfg.paths.data_dir / "processed" / "hotpot_substitutes.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(subs, indent=1, ensure_ascii=False))

    slices = build_slices(data, d.slice_seed, subs)
    for split in ("test", "dev"):
        qs = data.split(split)
        kinds = Counter(k for q in qs for k in slices[q.id])
        print(f"{split}: {len(qs)} questions, slices {dict(kinds)}")
    for q in data.split("test")[:8]:
        m = slices[q.id].get("misleading")
        print(f"  {q.answer!r:35} -> {m.substitute if m else None!r}")


if __name__ == "__main__":
    main()
