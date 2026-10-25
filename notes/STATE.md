# Project state (handoff) — 2026-10-25

Repo: https://github.com/Nadercr7/CRAG (local `/home/user/crag`, branch `main`, push after every step).
User: Egyptian Arabic, wants "perfect" but mini; reply in Arabic, explain briefly, use Sonnet/Haiku agents for heavy/simple work.
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01Rq2wM2rDEGe7F1rM1teX5E`.

## Environment
- venv `.venv` (py3.13, torch CPU, sentence-transformers 6.2). `.env` has `GROQ_API_KEY`, `KAGGLE_API_TOKEN` (gitignored). `~/.kaggle/access_token` set.
- Groq free tier per model: 1000 req/day, 30 rpm (burst ~5), 8k TPM, **200k tokens/day** (binding). gpt-oss-20b quota was exhausted on 2026-10-25 ~00:50.
- Kaggle: user `naderelakany`, 2×T4, max 2 concurrent GPU sessions, ~30 GPU h/week (~11 h used).
- `scripts/kaggle_job.py`: `dataset` (uploads data/processed/train/* to `vrag-train-data`), `prep`, `train <name> --base ... [--task sufficiency] [--hotpot-file] [--msmarco-file] [--exclude-sources]`, `run <name> --after <kernels> --cmd ... --out results` (runs repo scripts at pushed HEAD), `prompts <files>` (dataset `vrag-prompts`), `generate <name> --prompts <file>` (vLLM, Qwen/Qwen3-4B-Instruct-2507), `wait <slug>` (downloads to `data/kaggle/<slug>/output/`). HEAD must be pushed first.

## Done (phases 0-6 tooling)
- Retrieval: BM25+bge-small+RRF; BEIR numbers in `results/retrieval/summary.md` (dense SciFact 71.27 = published).
- Off-the-shelf rerankers don't beat hybrid on SciFact/NFCorpus (domain shift). CPU latency `results/latency.md` (MiniLM-L6 0.8 s / 20 passages).
- **Final verifier** = MiniLM-L6 fine-tuned (data v4: HotpotQA passages+sentences, stripped-gold, 2 distractors, 4 random paragraphs + 2 random sentences, MS MARCO + random negatives, no BEIR) then **WiSE-FT alpha 0.7** with base. Model: `data/models/verifier-minilm-l6-v4-wise07/model` (rebuild: `scripts/wise_ft.py data/kaggle/vrag-train-minilm-l6-v4/output/model <out> --alpha 0.7`). BEIR test nDCG@10 base/v4/final: SciFact 69.6/53.3/68.0, NFCorpus 35.8/27.9/33.8, FiQA 37.1/21.8/34.0. HotpotQA dev 0.897 -> 0.941. Story of v1..v4 (anti-lexical shortcut from hard-negative-only data; misleading dev evaluator fixed) is in commit messages + `results/tuning/wise_ft.md` -> goes to report "lessons learned".
- Dev tuning (final verifier): `configs/tuned.toml` (tau_hi .65, tau_lo .15, tau_single .15, tau_chunk .01, top_k_context 8, tau_keep .05) + calibrations; report `results/tuning/verifier-minilm-l6-v4-wise07.md`.
- Sufficiency data from HotpotQA supporting facts (`src/vrag/verifier/sufficiency_data.py`, 270k train / 600 dev). Model L6 (20k q): `data/kaggle/vrag-train-sufficiency-l6/output/model` — dev AUC missing-hop 0.886, no-evidence 0.989 (base 0.866/0.974).
- Pipeline `src/vrag/pipeline/*` (prepare/finalize, arms A-G), eval `src/vrag/eval/qa_eval.py`, `stats.py`, `scripts/run_qa_eval.py` (`prepare`, `finalize`, `judge`, `import-rewrites`; `--offline-rewrites --rewrite-model local/Qwen3-4B-Instruct-2507` defers traces whose rewrite isn't cached and writes `rewrite_prompts.jsonl`). Containment metric has length/coverage guards.
- Slices: supportive/missing/misleading; LLM substitutes in `data/processed/hotpot_substitutes.json` (old string format handled). Smoke generation on Kaggle worked (8 min).

## Status (2026-10-25 ~02:50 UTC): all phases done

- Dev and test QA runs finalized (`results/qa/{dev,test}_main`), tau_abstain 0.90 chosen on dev by the pre-registered rule, judge on 100 test answers.
- Report `results/report.md` (+ generated `results/report_tables.md`), numbers cross-checked by a separate agent.
- UI: `uvicorn vrag.api.app:app` (explorer + dashboard), screenshots in `docs/screenshots/`.
- Code review findings fixed; fresh clone passes tests and serves the UI.
- Models: private Kaggle dataset `naderelakany/vrag-models`; `python scripts/kaggle_job.py fetch-models`.

Possible follow-ups (not started): alias-aware correctness (the judge shows the strict metric over-counts hallucinations), a signal for tampered evidence (misleading slice), dropping the rewrite step, Impeccable audit of the UI.

## Presentation materials (2026-10-25)
- `docs/index.html` (project page, also the file for Drive), `docs/explainer.html` (EN + Egyptian), `docs/slides.html` (30 slides), `docs/speaker-guide.html` (Egyptian). Sources in `docs/explain/`; rebuild with `python scripts/build_explain_data.py && node docs/explain/build.mjs`.
- Repo settings the owner sets by hand (the proxy blocks settings writes): Pages from `main` /docs, description, homepage, topics.
