# 02 - Existing repos and tools for Verified RAG

Date: 2026-10-24. Versions from the PyPI JSON API on this date (Python 3.13.17 on dev box). Repo facts from READMEs/raw source via WebFetch/curl; GitHub API (stars, pushed_at) was NOT reachable from this session, so activity is judged from PyPI upload dates and README. Items marked (unverified) could not be confirmed from a primary source.

Legend: REUSE = depend on it / copy code. LEARN = port the ideas, write our own. SKIP = don't use.

---------------------------------------------------------------------------
## A. Reference implementations (CRAG / Self-RAG / Provence / framework examples)

### A1. Official CRAG - https://github.com/HuskyInSalt/CRAG
- Status: research code, 35 commits, last README note 2024-10-08 (prompt-format fix). License not shown on the page (check LICENSE before copying code verbatim). Needs OpenAI key + serper.dev for web search; ships shell scripts (`run_data_preprocess.sh`, `run_evaluator_training.sh`, `run_knowledge_preparation.sh`, `run_crag_inference.sh`, `run_selfcrag_preparation.sh`, `run_eval.sh`).
- Verified logic in `scripts/CRAG_Inference.py` (read raw source):
  - Evaluator is a T5 sequence model; per-passage score = raw logit (`float(outputs["logits"])`), not a probability.
  - Two thresholds: `score >= upper` -> Correct ('2'); `elif score >= lower` -> Ambiguous ('1'); else Incorrect ('0'). Defaults both 10, lower is negated (so Correct >= 10, Ambiguous >= -10).
  - Aggregation over a query's passages: ANY Correct -> Correct; elif ANY Ambiguous -> Ambiguous; else Incorrect ("strongest label wins").
  - Action: Correct -> use refined internal knowledge; Incorrect -> use external (web) knowledge only; Ambiguous -> internal + external concatenated. Passages joined with ` [sep] `, top `n_docs`.
  - Refinement (README): decompose modes `fixed_num` (word windows), `excerption` (sentence split), `selection` (no split); score strips with the evaluator, drop low ones, recompose.
  - Known bug to avoid: score list can misalign with per-query grouping (`n % 10 > n_docs-1` skip without append).
- What we get: the exact 3-way decision rule + strip-level refinement design, evaluator training recipe (query, passage, relevant/not) that maps onto our cross-encoder.
- Verdict: LEARN. Port the decision logic (~20 lines) and decompose-then-recompose idea. Do not use the code (T5 evaluator, dataset-specific scripts, web search dependency, no query-rewrite prompt in repo). Our cross-encoder replaces T5; sigmoid scores replace logits, so thresholds must be tuned on a dev split (do not reuse 10/-10).
- Adaptation notes: no web search in our setting -> "Incorrect" = LLM query rewrite + re-retrieve from same corpus (one round max); "Ambiguous" = keep refined sentences from original pass + merge results from rewritten query, dedupe by chunk id, rescore.

### A2. Self-RAG - https://github.com/AkariAsai/self-rag
- Status: MIT, 44 commits, initial release 2023.10, effectively dormant. Needs Llama-2 7B/13B fine-tuned with special reflection tokens + vLLM (GPU).
- Ideas: `[Retrieval]` gate with threshold (default 0.2) in `adaptive_retrieval` mode; critique tokens `[Relevant]`, `[Fully supported]`, `[Utility:1-5]`; segment-level beam search scoring with weights w_rel/w_sup/w_use. Training data (150k) is GPT-4-generated critic labels.
- Verdict: LEARN only. Reuse the concept of separate relevance / support / utility scores: our verifier = [Relevant], sufficiency check ~ [Supported]/[Utility]. Code is eval-script oriented, tied to vLLM and custom tokens; SKIP the code and models.

### A3. Provence (naver) - https://huggingface.co/naver/provence-reranker-debertav3-v1 ; training code in https://github.com/naver/bergen (scripts/provence); paper arXiv 2501.16214 (ICLR 2025)
- Status: HF model updated 2025-09-26; multilingual `naver/xprovence-reranker-bgem3-v1`. 430M params (DeBERTa-v3-large), 512 ctx, `trust_remote_code=True`, needs `nltk` + `punkt_tab`.
- API: `provence.process(question, context, threshold=0.1, always_select_title=True, reorder=False, top_k=5, batch_size=32)` -> `{'reranking_score', 'pruned_context'}`. Threshold 0.1 = conservative, 0.5 = aggressive compression. Single model does reranking AND sentence-level pruning (token-level sentence-mask head on a cross-encoder).
- License: HF metadata `cc-by-nc-nd-4.0` (card text says "NonCommercial-ShareAlike"; contradictory; NoDerivatives means we cannot fine-tune/redistribute weights). Research/non-commercial use only.
- Verdict: LEARN + optional baseline. Idea to copy: sentence selection as a second head / second pass over the same cross-encoder. Practical: use it as an optional "off-the-shelf pruner" baseline in eval (430M on CPU is slow: seconds per query for top-10 chunks). For our own refinement, implement simple version: split chunk into sentences (nltk punkt or regex), score (query, sentence) with the SAME verifier (as CRAG does), keep sentences >= threshold plus neighbours. Training our own Provence-style head = stretch goal only.

### A4. LangGraph CRAG tutorial (docs `tutorials/rag/langgraph_crag`) and LlamaIndex `CorrectiveRAGPack`
- I could not fetch the notebook/pack source in this session (404s on guessed paths); description below is from knowledge of those examples, (unverified against current main).
- LangGraph: graph of retrieve -> grade_documents (LLM yes/no per doc) -> [if any irrelevant] transform_query -> web_search -> generate. Binary LLM grader, "web_search = Yes if any doc irrelevant". Deviates from paper: no Ambiguous branch, no knowledge refinement, LLM instead of trained evaluator. LlamaIndex pack: LLM relevance prompt per node -> if any irrelevant, rewrite query and Tavily search, then synthesize. Same simplifications. LlamaIndex llama-packs are legacy-ish.
- Verdict: LEARN (prompt wording for query rewriting / graders). SKIP the frameworks: the control flow is ~30 lines of plain Python (see section F). A useful side result: the LLM-grader approach is a natural fourth baseline ("LLM-as-verifier", costs 1 Groq call per chunk batch; use one call grading all chunks in JSON to save the 1000 req/day budget).

---------------------------------------------------------------------------
## B. Training the verifier: sentence-transformers

- Link: https://github.com/huggingface/sentence-transformers ; docs https://sbert.net (cross_encoder/training_overview, loss_overview). Read raw docs from GitHub `docs/cross_encoder/`.
- Version: **6.2.0** (uploaded 2026-10-21), `requires_python >=3.10`, classifiers include 3.10-3.14 -> **supports Python 3.13**. (The brief mentioned v4/v5; current major is v6 - pin and re-read the changelog before coding; the API below was read from current main docs.)
- CrossEncoder training API (current):
  - `CrossEncoder(model_name, num_labels=1, model_kwargs={"torch_dtype": "float32"})`; train in fp32 (docs: small late updates round to zero in lower precision; with bf16 AMP via training args is fine on the 5060).
  - `CrossEncoderTrainer(model, args, train_dataset, eval_dataset, loss, evaluator)` and `CrossEncoderTrainingArguments` (subclass of HF `TrainingArguments`; adds `batch_sampler`, `multi_dataset_batch_sampler`, `learning_rate_mapping`). Datasets are HF `datasets.Dataset`; non-label columns are inputs in order; label column must be named `label/labels/score/scores`.
  - Losses (`sentence_transformers.cross_encoder.losses`): `BinaryCrossEntropyLoss` (pairs + 0/1 or float label; docs: "remains very challenging to outperform"), `CrossEntropyLoss`, `MultipleNegativesRankingLoss`, `CachedMultipleNegativesRankingLoss`, listwise `LambdaLoss`, `ListNetLoss`, `PListMLELoss`, `ListMLELoss`, `RankNetLoss`, `ADRMSELoss`; distillation `MSELoss`, `MarginMSELoss`.
  - Evaluators: `CrossEncoderRerankingEvaluator` (query, positives, negatives), `CrossEncoderClassificationEvaluator`, `CrossEncoderCorrelationEvaluator`, `CrossEncoderNanoBEIREvaluator` (downloads NanoBEIR from HF; handy periodic sanity check), `SequentialEvaluator`.
  - Hard negatives: `sentence_transformers.util.mine_hard_negatives(dataset, model, anchor_column_name, positive_column_name, corpus, cross_encoder=None, range_min, range_max, max_score, min_score, absolute_margin, relative_margin, num_negatives=3, sampling_strategy="top"|"random", include_positives, output_format="triplet"|"n-tuple"|"labeled-pair"|"labeled-list", output_scores, batch_size, use_faiss=False, ...)`. `labeled-pair` -> BCE; `labeled-list` -> LambdaLoss. Passing a `cross_encoder` plus margins/max_score filters false negatives (important with MS MARCO-style sparse labels). Needs a bi-encoder (`encode_query/encode_document/similarity`). FAISS only if `use_faiss=True`; numpy path fine at our scale.
- Also gives: bi-encoder for dense retrieval (`SentenceTransformer`), ONNX/OpenVINO backends for CPU inference (`backend="onnx"`), `CrossEncoder.rank()` / `.predict()` for the off-the-shelf reranker baseline.
- Verdict: **REUSE** (core dependency). Recipe: start from a small pretrained cross-encoder or encoder (e.g. `cross-encoder/ms-marco-MiniLM-L12-v2`, or `answerdotai/ModernBERT-base` / `microsoft/MiniLM-L12-H384-uncased` as from-scratch encoders), mine negatives with our own BM25+dense retriever on the training corpus, train BCE on `labeled-pair` (3 sentence classes later via an extra head if needed), calibrate thresholds on dev. Fits in 8GB with max_len 256-384 and batch 32 (bf16). Note torch must be a CUDA 12.8+ build for the RTX 5060 (Blackwell, sm_120); torch 2.14.1 has cp313 wheels - install the cu128+ index build on the GPU box, CPU wheel on the dev box.

---------------------------------------------------------------------------
## C. Rerankers (baselines)

### C1. rerankers (AnswerDotAI) - https://github.com/AnswerDotAI/rerankers
- v0.10.0, last upload 2025-05-22 (17 months stale), README labels it beta; Apache-2.0; requires_python >=3.8; core has zero deps, extras pull torch/transformers/litellm/etc.
- Gives: one `Reranker(name, model_type=...)`/`.rank(query, docs)` API over ST cross-encoders, T5, RankGPT, ColBERT, API rerankers (Cohere/Jina/Voyage/...), FlashRank.
- Verdict: SKIP. Our baseline is a single call to `CrossEncoder("BAAI/bge-reranker-base" or "cross-encoder/ms-marco-MiniLM-L6-v2").predict(pairs)`; the wrapper adds an indirection layer and a stale dependency. Worth a skim only if we later compare many API rerankers.

### C2. FlashRank - https://github.com/PrithivirajDamodaran/FlashRank
- v0.2.10, last upload 2025-01-06; Apache-2.0; deps tokenizers, onnxruntime, numpy, requests, tqdm (no torch). Models: ms-marco-TinyBERT-L-2-v2 (~4MB, default), ms-marco-MiniLM-L-12-v2 (~34MB), rank-T5-flan (~110MB), ms-marco-MultiBERT-L-12 (~150MB). Custom model loading undocumented.
- Verdict: OPTIONAL / SKIP by default. Good only as a "tiny CPU reranker" latency data point. sentence-transformers' ONNX backend gives the same effect with one fewer library. Skip.

---------------------------------------------------------------------------
## D. Retrieval

### D1. bm25s - https://github.com/xhluca/bm25s
- v0.3.15 (uploaded 2026-10-22; actively maintained). MIT. Core dep: numpy only; optional `PyStemmer` (cp313 wheel exists, v3.1.0), numba (cp313 wheel, 0.68.0), scipy for indexing extra.
- API: `bm25s.tokenize(corpus, stopwords="en", stemmer=Stemmer.Stemmer("english"))`, `r = bm25s.BM25(); r.index(tokens); docs, scores = r.retrieve(query_tokens, k=...)`, `.save(dir)`/`BM25.load(dir, mmap=True)`. Variants: Lucene (default, matches Pyserini/BEIR BM25), Robertson, ATIRE, BM25L, BM25+. README benchmark: SciFact ~953 q/s vs rank-bm25 ~48 q/s; ArguAna ~574 vs 2.
- Verdict: **REUSE**. Use `bm25s[core]` minus numba if install is awkward (numba optional; `pip install bm25s PyStemmer`).

### D2. rank_bm25 - https://pypi.org/project/rank-bm25/
- v0.2.2, last upload 2022-02-16, dead; scores all docs per query in Python (O(N) per query; ~20x-300x slower per bm25s benchmark).
- Verdict: SKIP.

### D3. FAISS vs numpy for 5k-50k docs
- faiss-cpu 1.15.1 (2026-09-16), abi3 wheels cover py3.13 (requires_python >=3.10). 
- Math: 50k chunks x 384-dim float32 = 77 MB (768-dim: 154 MB); exact brute-force `Q @ D.T` + `np.argpartition` for top-k is a few ms per query on 4 cores. FAISS `IndexFlatIP` gives the same exact result; ANN indexes add nothing at this size. Note: BEIR corpora can be larger than 50k (e.g. NQ 2.7M, MS MARCO 8.8M); pick small BEIR sets (SciFact 5k, NFCorpus 3.6k, FiQA 57k, ArguAna 8.7k, TREC-COVID 171k - the last is where numpy gets heavier at ~260MB@384d, still fine).
- Verdict: **numpy**, saved as `.npy` (mmap-able). SKIP FAISS (extra native dependency, no gain). Re-evaluate only above ~1M vectors.
- Fusion: implement Reciprocal Rank Fusion (k=60) by hand (5 lines); also expose normalized-score fusion as an ablation.

---------------------------------------------------------------------------
## E. Evaluation

### E1. Retrieval metrics: pytrec_eval-terrier / ir_measures / ranx
- pytrec-eval-terrier 0.5.11 (2026-10-16), cp313 manylinux wheel exists. C-extension wrapper of trec_eval: nDCG@k, recall@k, MAP, MRR (`recip_rank`) - exactly BEIR's numbers. Dict-in/dict-out API: `pytrec_eval.RelevanceEvaluator(qrels, {"ndcg_cut.10","recall.100","map","recip_rank"}).evaluate(run)`.
- ir-measures 0.4.3 (2025-11-25): nicer measure-spec strings (`nDCG@10`), wraps pytrec_eval; thin extra.
- ranx 0.3.21 (2025-08-07): has significance tests + fusion + comparison tables but pulls numba, pandas, scipy, ir-datasets, seaborn, fastparquet, cbor2, lz4, orjson, rich (heavy).
- Verdict: **REUSE pytrec-eval-terrier directly**; write our own paired bootstrap/permutation test (~20 lines over per-query nDCG@10) so we do not need ranx. ir-measures optional (skip). ranx SKIP (dependency weight).

### E2. beir package - https://github.com/beir-cellar/beir
- v2.2.0 (2025-06-04), Apache-2.0, python >=3.9, maintained-ish (491 commits, one release ~16 months ago; 67 issues). Deps: sentence-transformers, pytrec-eval-terrier, datasets. v2 reworked it for HF-datasets-based loading (unverified in detail).
- Gives: `util.download_and_unzip(url, dir)` (UKP server zips), `GenericDataLoader(folder).load(split="test")` -> `corpus, queries, qrels`; `EvaluateRetrieval`.
- Verdict: LEARN / minimal use. Dataset format (corpus.jsonl, queries.jsonl, qrels/test.tsv) is trivial; write a 40-line loader ourselves and download zips with urllib (or the HF `BeIR/*` / `mteb/*` datasets). This avoids beir's transitive deps (it pins nothing heavy but drags `datasets`, which we need anyway). If we want to save time, `pip install beir` is acceptable but not needed. Use BEIR's convention (nDCG@10 primary, Recall@100 secondary, qrels score>0 relevant) to remain comparable.

### E3. RAGAS - https://github.com/explodinggradients/ragas
- v0.4.3 (2026-01-13, ~9 months old). Deps include langchain, langchain-core, langchain-community, langchain_openai, instructor, openai, datasets, tiktoken, networkx, scikit-network, diskcache, typer, rich, pillow - heavy.
- Groq/OpenAI-compatible: 0.4 `llm_factory(model, client=<OpenAI client>, ...)` uses instructor adapters; docs list Groq as a supported provider and the pattern is: `OpenAI(base_url="https://api.groq.com/openai/v1", api_key=...)` passed as the client (inferred from docs search; I could not fetch docs.ragas.io - treat as unverified and test first). Pitfalls: faithfulness / answer-relevancy etc. make many LLM calls per sample (several each) -> with 1000 req/day and 8000 tokens/min, one 200-sample eval of 3 metrics x 3 pipelines would exceed the daily budget; answer relevancy also needs an embeddings model (local sentence-transformers needed); structured output via instructor against gpt-oss may fail intermittently.
- Verdict: SKIP for the main eval. Use deterministic QA metrics (Exact Match, token-F1, answer-contains-gold "accuracy" as in CRAG/Self-RAG papers), citation precision/recall computed by rule (does cited chunk contain a gold supporting passage / does verifier+NLI-free string check support it), abstention precision/recall (on unanswerable subset). Add ONE hand-written LLM-judge call ("is the answer correct given gold?" with batching of 10 items per request, cached) if semantic scoring is needed. Optionally run RAGAS faithfulness on a 50-sample subset as a cross-check, installed in a separate throwaway env.

### E4. QA datasets (for reference, not packages)
- Use HF `datasets` (v5.1.0) or direct jsonl downloads. Candidates: NQ-open/HotpotQA subsets via BEIR corpora (BEIR NQ/HotpotQA/FiQA/SciFact), plus a small unanswerable set (e.g. SQuAD 2.0-style / questions whose gold passage is removed) for abstention tests. (Another research note likely covers datasets; kept brief here.)

---------------------------------------------------------------------------
## F. LLM access, rate limits, caching

### F1. SDK choice: groq vs openai-with-base_url
- groq 1.7.0 (2026-08-26; py >=3.10; deps anyio, httpx, pydantic, distro, sniffio, typing-extensions) vs openai 3.37.0 (2026-10-22).
- Groq exposes an OpenAI-compatible endpoint: `https://api.groq.com/openai/v1`. Both SDKs give the same chat.completions interface, built-in retries (`max_retries`, default 2, honors `retry-after`), timeouts, async client.
- Verdict: **use `openai` with base_url** (one SDK: works with Groq, and later with any OpenAI-compatible server: Ollama/vLLM/llama.cpp for local fallback; RAGAS/instructor also expect the openai client). Use `groq` only if you need Groq-only params; gpt-oss-specific `reasoning_effort` / `reasoning_format` can be passed via `extra_body=`. Keep a thin `LLMClient` wrapper so the choice is one file.
- Do not include the user's email/keys anywhere; key from env `GROQ_API_KEY`.

### F2. Free-tier limits (secondary sources, NOT verified against Groq console - console.groq.com unreachable from this sandbox)
- openai/gpt-oss-120b free: ~30 RPM, **1,000 RPD, 8,000 TPM, 200,000 TPD**; limits are per organisation, not per key. (Task brief matches RPD and TPM; the **200k tokens/day** cap is the real constraint: ~1000 requests x 200 tokens only.) Limits for gpt-oss-20b and qwen3.8-27b not verified; read them from the console's limits page and put them in config.
- Budget implications: 8000 TPM means ~4 chunk-contexts of 1500 tokens per minute-call -> keep prompts to ~2-3k tokens (top-5 refined sentences, not whole chunks); response `max_tokens` small; reasoning tokens of gpt-oss count -> set `reasoning_effort="low"`. For evaluation of N questions x 3 systems x ~2 calls (rewrite, answer + sufficiency in a single JSON call) use <= ~150 questions per run and cache everything.
- 429 handling: Groq returns `retry-after` header (seconds) and `x-ratelimit-*` headers (remaining/reset for requests and tokens; names per Groq docs, unverified here).

### F3. Rate limiting and caching patterns (write ourselves; ~80 lines)
- Retry: `tenacity` 9.2.1 (`retry_if_exception_type(RateLimitError, APIConnectionError, InternalServerError)`, `wait_exponential_jitter`, honor `retry-after` if present, stop after ~6 tries), OR the SDK's own `max_retries=5` which already honors retry-after. Prefer SDK retries + a client-side limiter to avoid dependencies: skip tenacity.
- Client-side limiter: token-bucket with a sliding 60 s window tracking requests and estimated tokens (`len(text)/3.5` or tiktoken-free estimate, corrected by `usage.total_tokens` from responses); `asyncio.Semaphore(2-4)`; sleep before send when over budget. Persist a daily counter (SQLite/JSON) so a crashed eval run cannot exceed 1000 RPD.
- Cache: key = sha256(json.dumps({model, messages, temperature, max_tokens, response_format, seed}, sort_keys=True)); store in stdlib `sqlite3` (table: key PRIMARY KEY, response JSON, usage, ts). Temperature 0 for eval. Cache hits cost nothing -> reruns of ablations only pay for changed prompts. This replaces `diskcache`/`langchain` cache. Log token usage per call for the cost report.
- Structured output: ask for JSON (`response_format={"type":"json_object"}`; json_schema support on gpt-oss via Groq: verify) and parse with pydantic; fall back to regex repair + one retry.

---------------------------------------------------------------------------
## G. Frameworks: LangChain / LlamaIndex / Haystack / DSPy

Current: langchain 1.4.7, langgraph 1.2.17, llama-index 0.14.25, haystack-ai 3.4.1 (py >=3.11), dspy 3.4.1 (py <3.16). All support py3.13 per requires_python.

- LangChain/LangGraph: gives pipeline composition, tracing. Cost: dozens of transitive deps, rapid API churn, abstraction over a pipeline that is ~6 functions; stack traces and rate-limit control get harder; our custom verifier is not a first-class citizen. SKIP.
- LlamaIndex: strong ingestion/retriever abstractions, but fusion/rerank node-postprocessor interface would wrap our CrossEncoder anyway; heavy. SKIP.
- Haystack 3: cleanest of the frameworks (typed components, pipelines serialisable); still heavy; component boilerplate for each stage. SKIP.
- DSPy: optimises prompts with LLM calls - burns the 1000 req/day budget; not needed. SKIP (could be a stretch experiment on rewrite/answer prompts only).
- **Recommendation: write it plainly.** Reasons: (1) The novel part (training/evaluating a verifier, threshold calibration, ablations over components) needs fine control over scoring and caching that frameworks obscure. (2) The control flow is small: retrieve -> score -> decide -> (refine | rewrite+re-retrieve | both) -> sufficiency -> answer. A `Pipeline` class with pluggable `Retriever`, `Verifier` (protocol: `score(query, passages) -> list[float]`), `LLM` classes yields the three comparison arms (none / off-the-shelf reranker / our verifier) by swapping one object. (3) Free-tier LLM budget demands exact control over number/size of calls. (4) Fewer deps = reproducible on py3.13, faster CI, easier to explain in a mini-project report. (5) FastAPI + pydantic models give typed I/O and request tracing already. If we wanted a graph visual for the report, draw it; don't adopt LangGraph.

---------------------------------------------------------------------------
## Recommended stack

Runtime (backend, CPU dev box and API server):
```
python==3.13
numpy==2.5.4              # dense matrix search, RRF, thresholds (requires py>=3.12, ok)
bm25s==0.3.15
PyStemmer==3.1.0          # stemming for bm25s (cp313 wheel exists)
sentence-transformers==6.2.0   # bi-encoder, CrossEncoder inference + training
torch==2.14.1             # CPU wheel on dev box; cu128+ build on the RTX 5060 box
transformers==5.20.2      # pulled by sentence-transformers; pin for reproducibility
datasets==5.1.0           # training data + mine_hard_negatives (also dep of sentence-transformers training extra)
accelerate==1.15.0        # needed by Trainer (train extra)
openai==3.37.0            # Groq via base_url=https://api.groq.com/openai/v1
pydantic==2.14.1
fastapi==0.162.0
uvicorn==0.54.0           # (use uvicorn[standard] only if websockets/reload needed)
nltk==3.10.4              # punkt sentence splitter for refinement (or a regex splitter to drop this dep)
```
Eval/dev only (`requirements-dev.txt`):
```
pytrec-eval-terrier==0.5.11   # BEIR-identical nDCG/Recall/MAP/MRR (cp313 wheel)
pytest==9.1.1
ruff==0.17.2
httpx==0.28.1   # only for FastAPI TestClient (pulled by openai anyway)
```
Optional, not in default install: `faiss-cpu==1.15.1` (only if corpus >1M vectors or `mine_hard_negatives(use_faiss=True)` memory issue), `ragas==0.4.3` (separate env, faithfulness cross-check on <=50 items), `onnxruntime==1.31.0` (+ ST `backend="onnx"` for faster CPU rerank), `beir==2.2.0` (convenience only).
Explicitly NOT used: langchain*, llama-index, haystack-ai, dspy, rerankers, flashrank, rank-bm25, ranx, ir-measures, tenacity, diskcache.
Verify before pinning on install: pip resolves transformers/torch compat via sentence-transformers 6.2.0; re-pin from the resolved `pip freeze` into `requirements.lock`. Cache pieces all stdlib (`sqlite3`, `hashlib`, `json`, `asyncio`).

Model suggestions (to settle in later notes): bi-encoder `BAAI/bge-small-en-v1.5` or `sentence-transformers/all-MiniLM-L6-v2`; off-the-shelf reranker baseline `cross-encoder/ms-marco-MiniLM-L6-v2` (fast CPU) and `BAAI/bge-reranker-base`; our verifier initialised from `cross-encoder/ms-marco-MiniLM-L12-v2` (and/or ModernBERT-base), ~33M-150M params. Optional Provence baseline (non-commercial licence, 430M).

Proposed layout:
```
verified-rag/
  pyproject.toml            # deps above; extras: [train], [eval], [dev]
  README.md
  research/                 # notes (this file)
  configs/
    default.yaml|toml       # model names, k's, thresholds, groq limits (RPM/RPD/TPM/TPD per model)
  data/                     # gitignored: raw/, processed/, indexes/, cache/llm.sqlite
  src/vrag/
    config.py               # pydantic Settings
    data/
      beir_loader.py        # corpus/queries/qrels jsonl+tsv loader, downloader
      chunking.py           # chunk + sentence splitter
      qa_sets.py            # QA eval sets incl. unanswerable subset
    retrieval/
      bm25.py               # bm25s wrapper (build/save/load/search)
      dense.py              # ST bi-encoder + numpy matrix index (.npy)
      hybrid.py             # RRF / score fusion
    verifier/
      base.py               # Verifier protocol: score(query, passages)->list[float]
      none.py               # identity (no-verifier arm)
      offshelf.py           # CrossEncoder reranker arm (ms-marco / bge)
      ours.py               # loads fine-tuned CrossEncoder; calibrated thresholds
      train.py              # mine_hard_negatives -> CrossEncoderTrainer (BCE/Lambda)
      calibrate.py          # fit upper/lower thresholds on dev (CRAG-style 3-way)
    pipeline/
      decide.py             # Correct/Ambiguous/Incorrect aggregation (CRAG rule)
      refine.py             # sentence split -> score -> keep >= tau -> recompose
      rewrite.py            # LLM query rewrite
      sufficiency.py        # context sufficiency / abstain
      answer.py             # answer w/ citations ([n] ids) + citation validator
      pipeline.py           # orchestrates arms; returns trace for UI
    llm/
      client.py             # openai SDK -> Groq; limiter + retries
      cache.py              # sqlite response cache
      prompts.py
    eval/
      retrieval_eval.py     # pytrec_eval nDCG@10/Recall@k/MAP/MRR
      qa_eval.py            # EM/F1/accuracy, citation P/R, abstention P/R
      stats.py              # paired bootstrap / permutation test
      run.py                # CLI: arms x datasets -> results/*.json + tables
    api/
      main.py               # FastAPI: /query, /health, /trace; static mount
      schemas.py
  web/                      # vanilla index.html, style.css, app.js (shows chunks, verifier scores, decision, citations)
  scripts/                  # build_index.py, train_verifier.py, run_eval.py
  tests/                    # decide/refine/RRF/limiter/cache unit tests (no network)
  results/                  # metrics json + figures
```

Port-list summary (what to actually take from the repos): (1) CRAG: 2-threshold 3-way label + "strongest label wins" aggregation + strip-level decompose/filter/recompose + action table (Correct->refined internal; Incorrect->rewrite/re-retrieve; Ambiguous->both merged). (2) Self-RAG: separate relevance vs support/utility signals; adaptive-retrieval threshold idea (optional skip-retrieval gate; not planned). (3) Provence: sentence pruning with threshold 0.1 (conservative) .. 0.5 (aggressive) and "always keep title/first sentence" trick for Wikipedia-like chunks. (4) sentence-transformers: `mine_hard_negatives` (cross_encoder-filtered, `labeled-pair`) -> `BinaryCrossEntropyLoss`, `CrossEncoderRerankingEvaluator`/`CrossEncoderNanoBEIREvaluator` for in-training monitoring.
