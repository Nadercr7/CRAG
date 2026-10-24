# Verified RAG: Project Plan

Status: draft for review (2026-10-24). Based on `research/01-04`.

## 1. Goal

A RAG pipeline with a small transformer **verifier** after retrieval. The verifier:

1. judges whether each retrieved chunk is relevant,
2. corrects the retrieval when it is bad,
3. trims chunks down to the sentences that matter,
4. decides whether the context is sufficient to answer, and abstains when it is not.

Every claim gets measured against plain RAG and against an off-the-shelf reranker, with confidence intervals.

**What is new compared with the papers** (from `research/01-papers.md` §10):

- CRAG's evaluator is a 770M T5. It was trained only on PopQA with random negatives, and its thresholds were set by hand. An independent reproduction found it behaves like an entity-name matcher.
  - Ours is a ~23-33M cross-encoder that runs on CPU.
  - It is trained on mixed data with hard negatives and counterfactual negatives.
  - Its thresholds are calibrated on a dev split, and we report a sensitivity grid for them.
- CRAG uses web search when retrieval fails. We replace it with query rewrite plus corpus re-retrieval, and we measure when that helps and when it hurts.
- Sufficient Context (Joren et al., ICLR 2025) uses giant autoraters. We distill sufficiency from a Groq teacher into a small local model on a fixed label budget.
- Neither CRAG nor Joren reports a Correct / Abstain / Hallucinate breakdown for a verifier pipeline. We do, on paired supportive / missing / misleading slices.

## 2. Architecture

```
query
  │
  ▼
Hybrid retrieval: BM25 (bm25s) + dense (bge-small, numpy), fused with RRF → top-20
  │
  ▼
Verifier (fine-tuned MiniLM cross-encoder) → calibrated P(relevant) per chunk
  │
  ▼
CRAG decision on max score with two thresholds (τ_hi, τ_lo), tuned on dev:
  ├─ Correct    → refine
  ├─ Incorrect  → LLM rewrites query → re-retrieve → re-verify (1 retry max)
  └─ Ambiguous  → refine + rewrite path, union, dedupe
  │
  ▼
Refine: split chunks into sentences → score with verifier → keep ≥ τ_keep (keep title, original order)
  │
  ▼
Sufficiency model (distilled) + verifier stats → abstain score
  │
  ├─ below threshold → "I don't have enough information" (+ what was found)
  ▼
LLM answer (Groq gpt-oss-120b): JSON with answer, sentence citations, confidence
  │
  ▼
Citation validator: drops/flags citations that point to nothing
```

Every request returns a **trace**: scores, decision, rewritten query, kept and dropped sentences, sufficiency, and per-stage latency. The UI renders this trace.

**Deliberately not done:**

- **Provence-style token head:** extra model surgery. Sentence scoring with the same cross-encoder gets most of the value; listed as a stretch goal.
- **P(True) sampling:** far over the Groq budget.
- **RAGAS as the main metric:** too many LLM calls.
- **LangChain, LlamaIndex and similar:** the pipeline is ~1k lines and clearer written plainly.

## 3. Data and models

| Use | Choice | Notes |
|---|---|---|
| Retrieval eval | BEIR SciFact, NFCorpus, FiQA (+ArguAna if time) | cc-by-sa-4.0, small enough for CPU |
| QA eval (main) | HotpotQA distractor, validation | Ships gold and distractor paragraphs, so no Wikipedia index is needed. Sample 300 test + 200 dev questions. |
| QA eval slices | Built from the same questions | **supportive** (gold kept), **missing** (gold removed), **misleading** (answer entity swapped in gold). Plus an unanswerable set. |
| Verifier training | MS MARCO subset (~50k queries) + HotpotQA train + BEIR train splits where they exist | Hard negatives mined from our own hybrid retriever, then counterfactual negatives. No test queries are ever used for training. |
| Embedder | `BAAI/bge-small-en-v1.5` (vs `thenlper/gte-small`, pick on dev) | 33M, MIT |
| Baseline rerankers | `cross-encoder/ms-marco-MiniLM-L6-v2`, `BAAI/bge-reranker-base` | Off-the-shelf arms |
| Our verifier | Init from `cross-encoder/ms-marco-MiniLM-L6-v2`; MiniLM-L12 / ModernBERT-base also trained on Kaggle, picked by dev quality vs CPU latency | Apache-2.0 |
| Sufficiency student | Second small cross-encoder over (query, refined context) | Teacher labels from gpt-oss-120b, Joren prompt (App. C.1) |
| LLM (eval) | Open ~8B instruct model on Kaggle via vLLM (same generator for every arm) | Chosen for budget: see §4 |
| LLM (Groq) | `openai/gpt-oss-120b` (demo answers, sufficiency teacher), `openai/gpt-oss-20b` (rewrite, slice substitutes) | Judge only where the deterministic metrics can't decide; the judge comes from a different family (`qwen/qwen3.8-27b`) |

**PopQA** is a stretch goal. It is what CRAG used, but it needs a Wikipedia retrieval corpus.

## 4. Evaluation

**Retrieval (no LLM, full test sets).** Metrics: nDCG@10, Recall@20/100, MRR. Arms:

- BM25
- dense
- hybrid
- hybrid + MiniLM
- hybrid + bge-reranker
- hybrid + our verifier

We rerank top-50 and say so. We check in-domain vs out-of-domain behaviour.

**End-to-end QA (HotpotQA, 300 test questions × slices).** Arms:

| Arm | What it is |
|---|---|
| A | Plain RAG (hybrid top-5) |
| B | + off-the-shelf reranker |
| C | + our verifier, relevance only |
| D | C + refinement |
| E | D + rewrite loop |
| F | E + sufficiency/abstain (full system) |
| G | F with a single threshold instead of two |

Metrics:

- EM / F1 / answer containment
- Correct / Abstain / Hallucinate rates, split by slice
- selective accuracy vs coverage curve
- abstention precision/recall
- citation validity
- faithfulness: claims supported by the cited sentences, checked locally with the verifier, with an LLM judge on a subset
- context tokens sent to the LLM
- latency p50/p95 per stage
- Groq calls per query

**Statistics:** paired bootstrap (10k resamples) with 95% CIs. Verifier trained with 3 seeds. Judge agreement is checked against ~100 hand-checked items.

**LLM budget.** Groq's free tier allows, per model: 1000 requests/day, 30 requests/min (paced: about 5 back-to-back requests trigger a 429), 8000 tokens/min, and **200,000 tokens/day**. The daily token cap was confirmed from a 429 on 2026-10-24 ("tokens per day (TPD): Limit 200000"). It is the binding limit: about 200 answer calls a day per model, so the ~5.4k answer calls of the QA evaluation would take about 4 weeks.

Decision (2026-10-24): the bulk QA evaluation runs on **Kaggle with an open model** (Qwen3-8B class, vLLM, 2× T4).
- Every arm is answered by the same generator, so the comparison stays fair.
- Thousands of answers take minutes instead of weeks.

Groq keeps the work that needs a strong model in small volume:
- sufficiency teacher labels (~1-1.5k calls, gpt-oss-120b)
- query rewrites in the live demo
- the live demo's answers
- an LLM-judge check on a subset

Every Groq call is cached in sqlite, so reruns cost nothing.

## 5. Repo layout

```
verified-rag/
  pyproject.toml  README.md  PLAN.md  research/
  configs/default.toml
  src/vrag/
    config.py
    data/        beir.py  hotpot.py  slices.py  chunking.py
    retrieval/   bm25.py  dense.py  hybrid.py
    verifier/    base.py  offshelf.py  ours.py  train.py  mine.py  calibrate.py
    pipeline/    decide.py  refine.py  rewrite.py  sufficiency.py  answer.py  pipeline.py
    llm/         client.py  cache.py  limiter.py  prompts.py
    eval/        retrieval_eval.py  qa_eval.py  stats.py  run.py
    api/         main.py  schemas.py
  web/           index.html (pipeline explorer)  results.html (dashboard)  css/  js/
  scripts/       build_index.py  train_verifier.py  label_sufficiency.py  run_eval.py
  tests/         unit tests for decide/refine/RRF/cache/limiter/metrics (no network)
  results/       metrics json, figures, report.md
  data/          gitignored: raw, indexes, models, llm cache
```

## 6. Phases

Each phase ends with a check before the next one starts. "Model" says who does the work.

| # | Phase | Output | Done when | Model |
|---|---|---|---|---|
| 0 | Setup | repo, pyproject with resolved pins, config, Groq client + cache + limiter, CI-free test run | `pytest` green; one cached Groq call | Haiku (scaffold), me (client review) |
| 1 | Data + retrieval | BEIR + HotpotQA loaders, slices, BM25/dense/hybrid, retrieval eval | Our bge-small nDCG@10 on SciFact within ~1 pt of the published 71.3 | Sonnet |
| 2 | Baseline rerankers | off-the-shelf arms, CPU latency benchmark | Table for arms 1-5 on 3 BEIR sets; L6 vs L12 latency decided | Haiku (runs), me (read results) |
| 3 | Verifier training | hard-negative mining, counterfactual negatives, training script, 3 seeds, calibration | Verifier ≥ MiniLM baseline on dev nDCG; thresholds + sensitivity grid saved | Sonnet + me (design, review) |
| 4 | Sufficiency | teacher labeling script (budgeted, cached), hand-check 100, student training, abstain logistic model | Teacher-human agreement reported; student vs teacher agreement measured | Sonnet; Haiku for the hand-check sheet |
| 5 | Pipeline | decide / refine / rewrite / answer / citations / trace | Unit tests; 20 hand-inspected traces look right | Sonnet, me (review) |
| 6 | QA evaluation | all arms × slices, bootstrap CIs, ablation tables, figures | `results/*.json` complete; numbers reproducible from cache | Sonnet (runner), Haiku (long runs, tables) |
| 7 | API + UI | FastAPI; pipeline explorer page; results dashboard page | Works on phone + desktop, light/dark; Playwright screenshots checked | Sonnet with frontend-design + UI UX Pro Max + dataviz; Impeccable audit at the end |
| 8 | Docs | README, technical report (`results/report.md`), architecture diagram | Humanizer pass; every number cross-checked against results json | Sonnet + humanizer; me (final check) |
| 9 | Review | code review, cleanup, final run from clean clone | `/code-review` findings fixed; fresh-clone reproduce works | me |

Phase 4 consumes Groq quota (teacher labels), so it starts early and runs in the background. Phases 3 and 6 run on Kaggle GPU. Phases 5 and 7 continue in parallel.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Groq quota slows eval | Bulk generation moved to Kaggle (vLLM); Groq only for teacher labels and the demo; caching everywhere |
| CPU latency of the verifier with 20 chunks + sentences | Measure in phase 2; MiniLM-L6; ONNX backend as a fallback |
| Kaggle quota/queue | Training runs are small (minutes to ~1 h each); CPU training of MiniLM-L6 remains a fallback |
| Verifier doesn't beat the off-the-shelf reranker on BEIR | Still a valid result. The project's value is in the decision/abstain behaviour, which a plain reranker doesn't provide. Report honestly. |
| Teacher labels noisy | Hand-check 100, report agreement, use the deterministic answer-containment signal as a second label source |
| Container is ephemeral | Push to GitHub after every phase |

## 8. Decisions made

- **Repo:** https://github.com/Nadercr7/CRAG. Pushed after every phase.
- **GPU:** verifier and sufficiency training run on **Kaggle GPU** (T4/P100, ~30 h/week). Notebooks are pushed and pulled via the Kaggle API from this session. CPU stays the target for *inference*.
  - With a GPU, the verifier candidates widen to MiniLM-L6 → MiniLM-L12 → ModernBERT-base (`gte-reranker-modernbert-base` init).
  - The pick depends on the dev quality vs CPU latency trade-off measured in phase 2.
