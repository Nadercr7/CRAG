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

## In flight (2026-10-25 ~01:35 UTC)
1. DONE rewrites r1: 799 prompts (dev+test merged in `data/eval/upload/rewrites_r1.jsonl`), Kaggle `vrag-gen-vrag-gen-rewrites-r1`, 798 valid JSON, imported into cache (dev 305, test 494).
2. DONE dev prepare (L6 sufficiency): `data/eval/dev_main/` 3843 traces, 2152 prompts, 0 uncached rewrites. Answers generating on Kaggle `vrag-gen-answers-dev` (outputs -> `data/kaggle/vrag-gen-answers-dev/output/outputs.jsonl`).
3. Test prepare (L6) running -> `data/eval/test_main/` (log `data/eval/test_main.log`).
4. Kaggle `vrag-train-sufficiency-l12` still running. Compare: `python scripts/eval_sufficiency.py data/kaggle/vrag-train-sufficiency-l6/output/model data/kaggle/vrag-train-sufficiency-l12/output/model --out results/tuning/sufficiency.md` (base 0.866/0.974/0.920, L6 0.886/0.989/0.937 missing-hop/no-evidence/pooled). If L12 wins: re-run both prepares into new dirs with L12 (8 min each, cache hits) — the answer prompts are identical, so the generated outputs can be reused (prompt ids are trace keys).
5. tau_abstain rule pre-registered in PLAN.md; `run_qa_eval.py choose-tau --run data/eval/dev_main` after finalize.

## Next steps (in order)
1. Upload both rewrite_prompts files (`kaggle_job.py prompts data/eval/rewrites_dev/rewrite_prompts.jsonl data/eval/rewrites_test/rewrite_prompts.jsonl` — note: same file name in both dirs; copy/rename to `rewrites_dev.jsonl` / `rewrites_test.jsonl` first), `generate` each (max_tokens 256), `wait`, then `run_qa_eval.py import-rewrites --run data/eval/rewrites_<split> --outputs data/kaggle/vrag-gen-<name>/output/outputs.jsonl`.
2. Full dev run: `prepare --split dev --arms A..G --out data/eval/dev_main/ --sufficiency <best model> --rewrite-model local/Qwen3-4B-Instruct-2507 --offline-rewrites` (G/F second-round rewrites may need one more generate+import loop). Then upload `prompts.jsonl`, generate answers, `finalize`. Choose `tau_abstain` on dev with a rule fixed beforehand (e.g. maximize correct − hallucinate pooled over slices; report the risk-coverage curve). Put it in `configs/tuned.toml`.
3. Same for test (`data/eval/test_main/`), finalize with the dev-chosen tau_abstain, bootstrap CIs; optional `judge --n 100` (Groq qwen, check quota).
4. Phase 7 UI: FastAPI + vanilla HTML/CSS/JS (pipeline explorer rendering Trace JSON + results dashboard, Chart.js 4.5.1). Use frontend-design skill, UI UX Pro Max, dataviz skill; Impeccable audit at end. Live demo answers via Groq gpt-oss-120b.
5. Phase 8 docs: README + `results/report.md` (include lessons learned v1-v4, Groq budget pivot, limitations: BEIR trade-off, tau grid-edge fallbacks, HotpotQA-derived sufficiency proxy). Humanizer skill (blader/humanizer). Cross-check every number vs results json.
6. Phase 9: /code-review, cleanup, fresh-clone reproduce, update PLAN.md, delete `notes/STATE.md` or keep as log.
