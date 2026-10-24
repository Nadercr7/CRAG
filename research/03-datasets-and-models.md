# Datasets and Models for the Verified-RAG Project

Verified 2026-10-24. Every value below was read from the HF API (`https://huggingface.co/api/{datasets,models}/<id>?full=true`), a raw HF file, a GitHub README, or a cited paper page. Anything not checked is left out. Empty cells mean the value was not on the card and was not verified elsewhere.

Hardware target: CPU only, 4 cores, 15 GB RAM. Sizes below favour small models and subsets.

---

## 1. Retrieval benchmarks (BEIR)

Corpus and query repos (`BeIR/<name>`) hold parquet files. Qrels are in separate repos (`BeIR/<name>-qrels`) as TSV with columns `query-id, corpus-id, score`. All repos are tagged `license:cc-by-sa-4.0`.

| Dataset | HF corpus/query id | Corpus docs | Queries (total) | Test queries | Test qrels rows (excl. header) | Qrels location (HF repo files) | License (HF tag) |
|---|---|---|---|---|---|---|---|
| SciFact | `BeIR/scifact` | 5,183 | 1,109 | 300 | 339 | `BeIR/scifact-qrels`: `test.tsv`, `train.tsv` | cc-by-sa-4.0 |
| NFCorpus | `BeIR/nfcorpus` | 3,633 | 3,237 | 323 | 12,334 | `BeIR/nfcorpus-qrels`: `dev.tsv`, `test.tsv`, `train.tsv` | cc-by-sa-4.0 |
| FiQA-2018 | `BeIR/fiqa` | 57,638 | 6,648 | 648 | 1,706 | `BeIR/fiqa-qrels`: `dev.tsv`, `test.tsv`, `train.tsv` | cc-by-sa-4.0 |
| ArguAna | `BeIR/arguana` | 8,674 | 1,406 | 1,406 | 1,406 | `BeIR/arguana-qrels`: `test.tsv` | cc-by-sa-4.0 |
| SCIDOCS | `BeIR/scidocs` | 25,657 | 1,000 | 1,000 | 29,928 | `BeIR/scidocs-qrels`: `test.tsv` | cc-by-sa-4.0 |
| TREC-COVID | `BeIR/trec-covid` | 171,332 | 50 | 50 | 66,336 | `BeIR/trec-covid-qrels`: `test.tsv` | cc-by-sa-4.0 |

Qrels row counts come from downloading each `test.tsv` and counting lines. The header is excluded. Query counts for the test split are the number of distinct query ids in that file.

Notes:
- The "total" query count is the `queries` config on the HF card. It mixes splits, so use the qrels split for evaluation.
- Qrels were downloaded only for the test split. Train and dev splits exist but were not counted.

---

## 2. End-to-end QA datasets (short gold answers)

| Dataset | HF id | Size (verified) | Gold answers | Retrieval corpus or gold passages included? | License (HF tag) |
|---|---|---|---|---|---|
| PopQA | `akariasai/PopQA` | `test.tsv` is 5.2 MB, about 14.3k rows by line count | `possible_answers` list per question | No corpus. Each row has the subject and object Wikipedia page titles and Wikidata ids, not passages. | None on the card. The HF README has no license section. |
| HotpotQA (distractor) | `hotpotqa/hotpot_qa`, config `distractor` | train 90,447; validation 7,405 | `answer` | Yes. Each row has a `context` field with gold and distractor paragraphs. | cc-by-sa-4.0 |
| HotpotQA (fullwiki) | `hotpotqa/hotpot_qa`, config `fullwiki` | train 90,447; validation 7,405; test 7,405 | `answer` | No. Retrieval must run over Wikipedia. | cc-by-sa-4.0 |
| Natural Questions (open) | `google-research-datasets/nq_open` | train 87,925; validation 3,610 | `answer` list | No passages. | cc-by-sa-3.0 |
| TriviaQA (rc) | `mandarjoshi/trivia_qa`, config `rc` | train 138,384; validation 17,944; test 17,210 | `answer` | Yes. Rows include `entity_pages` and `search_results` evidence. Configs `rc.wikipedia` and `rc.web` split the evidence source. | `unknown` (HF tag) |
| NQ (BEIR) | `BeIR/nq` | corpus 2,681,468; queries 3,452 | Qrels (passage relevance), not short answers | Yes, a corpus with qrels in `BeIR/nq-qrels` | cc-by-sa-4.0 |
| HotpotQA (BEIR) | `BeIR/hotpotqa` | corpus 5,233,329; queries 97,852 | Qrels (passage relevance) | Yes, a corpus with qrels | cc-by-sa-4.0 |

Verified context for the requested sources:
- **CRAG paper uses PopQA.** arXiv 2401.15884 (Yan et al.) reports results on PopQA, Biography, PubHealth and Arc-Challenge. Code is at github.com/HuskyInSalt/CRAG. The paper's own PopQA numbers were not checked.
- **Sufficient Context (Google, ICLR 2025).** Paper: Joren et al., arXiv 2411.06037, ICLR 2025 poster at `iclr.cc/virtual/2025/poster/30092`. Code: `github.com/hljoren/sufficientcontext`. The README names HotpotQA, Musique-Ans and FreshQA as the datasets it analyses. It links no dataset download. I did not find a Hugging Face dataset for it: three guessed HF ids returned errors, and web search returned no HF release. Treat it as **no verified HF dataset**. Use the three sources above instead.

---

## 3. Training data for a cross-encoder (MS MARCO with hard negatives)

| Repo | Format | Size (verified) | Notes |
|---|---|---|---|
| `sentence-transformers/msmarco-bm25` | Configs `triplet` (502,931), `triplet-hard` (19,139,199), `triplet-all` (26,636,407) and `-ids` variants. Columns `query, positive, negative` (text). `triplet-50` has 8 negatives per row. | Up to 26.6M rows | Hard negatives mined with BM25. License not on card. |
| `sentence-transformers/msmarco` | Configs: `triplets` (397,226,027; `query_id, positive_id, negative_id`), `bert-ensemble-margin-mse` (39,780,704; with `score`), `bert-ensemble-mse` (79,561,408; with `score`), `labeled-list` (400,282; `query_id, doc_ids, labels`), `queries` (808,731), `corpus` (8,841,823; `passage_id, passage`). | Corpus 8.84M passages | `labeled-list` gives per-query lists of candidates with labels. Good for listwise training. License not on card. |
| `sentence-transformers/msmarco-hard-negatives` | Raw JSONL (`msmarco-hard-negatives.jsonl.gz`) with `qid`, `pos`, `neg` (dict of mined negatives per system). Also contains `cross-encoder-ms-marco-MiniLM-L-6-v2-scores.pkl.gz`. | Per the README, 160M cross-encoder scores | Built for bi-encoder training (MarginMSE). Its README says the scores come from `cross-encoder/ms-marco-MiniLM-L-6-v2`. License not on card. |
| `microsoft/ms_marco` | Parquet. Configs `v1.1` (train 82,326) and `v2.1` (train 808,731). | v2.1 train 808,731 | Official source. The card's licence section is "More Information Needed". |

Use with care: the MS MARCO sources have no explicit licence on HF. Check the official terms before any commercial use.

---

## 4. Small embedding models (<=150M params)

NDCG@10 values are read from the model's `model-index` metadata, keeping only `ndcg_at_10` on the `test` split. Blank means the card has no value for that dataset.

| Model | Params | Dims | License (HF tag) | SciFact NDCG@10 | NFCorpus NDCG@10 | FiQA NDCG@10 | ArguAna NDCG@10 |
|---|---|---|---|---|---|---|---|
| `BAAI/bge-small-en-v1.5` | 33.4M | 384 | MIT | 71.28 | 34.30 | 40.34 | 59.55 |
| `intfloat/e5-small-v2` | 33.4M | 384 | MIT | 68.85 | 32.45 | 37.43 | |
| `thenlper/gte-small` | 33.4M | 384 | MIT | 72.70 | 34.77 | 39.35 | |
| `Snowflake/snowflake-arctic-embed-s` | 33.2M | 384 | Apache-2.0 | 69.92 | 32.54 | 39.68 | 56.87 |
| `jinaai/jina-embeddings-v2-small-en` | 32.7M | 512 | Apache-2.0 | 63.89 | 30.40 | 33.43 | |
| `ibm-granite/granite-embedding-30m-english` | 30.3M | 384 | Apache-2.0 | | | | |
| `Snowflake/snowflake-arctic-embed-xs` | 22.6M | 384 | (empty on HF) | | | | |
| `mixedbread-ai/mxbai-embed-xsmall-v1` | 24.1M | 384 | Apache-2.0 | | | | |
| `nomic-ai/nomic-embed-text-v1.5` | 136.7M | 768 | Apache-2.0 | | | | |

Notes:
- The four 33M models use BERT with 12 layers and hidden size 384. Speed on this CPU is not benchmarked here.
- `granite-embedding-30m-english` has no BEIR values on its card.
- `snowflake-arctic-embed-xs` has no license tag on HF, so check its card before use.
- The `model-index` values are the model authors' self-reported MTEB runs.

---

## 5. Small cross-encoder rerankers

| Model | Params | Architecture / hidden / layers | Base model (from card or config) | License (HF tag) | Trained on | Fine-tune on CPU? |
|---|---|---|---|---|---|---|
| `cross-encoder/ms-marco-TinyBERT-L2-v2` | 4.4M | BERT, 2 layers (hidden 128 inferred from the base model name, not from config) | `nreimers/BERT-Tiny_L-2_H-128_A-2` | Apache-2.0 | MS MARCO passage ranking | Yes. Smallest, but weakest. |
| `cross-encoder/ms-marco-MiniLM-L6-v2` | 22.7M | BERT, 6 layers, hidden 384 | `cross-encoder/ms-marco-MiniLM-L12-v2` (card `base_model`) | Apache-2.0 | MS MARCO passage ranking | Yes. Best starting point for CPU. |
| `cross-encoder/ms-marco-MiniLM-L12-v2` | 33.4M | BERT, 12 layers | `microsoft/MiniLM-L12-H384-uncased` | Apache-2.0 | MS MARCO passage ranking | Yes, slower than L6. |
| `mixedbread-ai/mxbai-rerank-xsmall-v1` | 70.8M | DeBERTa-v2 arch, 12 layers, hidden 384 | | Apache-2.0 | | Possible, but slower. |
| `jinaai/jina-reranker-v1-tiny-en` | 33.0M | | | Apache-2.0 | | Not benchmarked. |
| `jinaai/jina-reranker-v1-turbo-en` | 37.8M | | | Apache-2.0 | | Not benchmarked. |
| `mixedbread-ai/mxbai-rerank-base-v1` | 184.4M | | | Apache-2.0 | | Too slow for CPU training. |
| `BAAI/bge-reranker-base` | 278.0M | XLM-R, 12 layers, hidden 768 | `xlm-roberta-base` (FlagEmbedding table) | MIT | | Slow on CPU. |
| `Alibaba-NLP/gte-reranker-modernbert-base` | 149.6M | ModernBERT, 22 layers, hidden 768 | `answerdotai/ModernBERT-base` | Apache-2.0 | | Slow on CPU. |
| `Alibaba-NLP/gte-multilingual-reranker-base` | 306.0M | | | Apache-2.0 | | Too slow for CPU training. |
| `BAAI/bge-reranker-v2-m3` | 567.8M | XLM-R, 24 layers, hidden 1024 | `BAAI/bge-m3` (FlagEmbedding table) | Apache-2.0 | | No (too big for this CPU). |
| `jinaai/jina-reranker-v2-base-multilingual` | 278.4M | | | cc-by-nc-4.0 | | Non-commercial license. |

No BEIR reranker scores are listed because they were not checked.

---

## Recommendation

**Retrieval evaluation (datasets):** Use **SciFact** (5,183 docs, 300 test queries), **NFCorpus** (3,633 docs, 323 test queries) and **FiQA** (57,638 docs, 648 test queries). All three are small and CC-BY-SA-4.0, and their qrels are in separate, easy-to-load TSVs. FiQA is the largest and will be the slowest to embed on CPU. Add **ArguAna** (8,674 docs, 1,406 queries) if a fourth set is wanted.

**End-to-end QA datasets:** Use **PopQA** because the CRAG paper uses it, and it matches the project's verifier setup. Note that it ships without a corpus, so a Wikipedia retrieval corpus must be built separately. For a self-contained run, use **HotpotQA distractor validation** (7,405 rows), which includes gold and distractor paragraphs in each row. **NQ-open validation** (3,610) is a light extra with short answers but no passages. Do not use the Sufficient Context paper's data as a dataset for this project: no HF release was found.

**Fine-tuning data:** Use a **subset** of `sentence-transformers/msmarco-bm25` (`triplet-hard`, 19.1M rows is too large for CPU) or the `labeled-list` config of `sentence-transformers/msmarco` (400k queries with candidate labels). Start with 50k to 100k queries, which fits 4 CPU cores. Check the MS MARCO license terms before use.

**Embedding model:** Start with **`BAAI/bge-small-en-v1.5`** (33.4M params, 384 dims, MIT). On the verified numbers it is close to **`thenlper/gte-small`** (also MIT, same size): gte-small is higher on SciFact (72.70 vs 71.28) and NFCorpus (34.77 vs 34.30), and bge-small is higher on FiQA (40.34 vs 39.35). Run both on the three BEIR sets above and keep the better one. Avoid jina-embeddings-v2-small-en for this setup (its verified NDCG@10 values are the lowest of the group).

**Reranker to fine-tune:** Start from **`cross-encoder/ms-marco-MiniLM-L6-v2`** (22.7M params, 6 layers, Apache-2.0). It is already trained for passage reranking on MS MARCO, so it needs less data to adapt to your verifier task, and it is the smallest of the usable options. Use `cross-encoder/ms-marco-TinyBERT-L2-v2` only if latency is the hard constraint, since it is much smaller and presumably weaker. Avoid `BAAI/bge-reranker-v2-m3` (568M, too large for CPU) and `jinaai/jina-reranker-v2-base-multilingual` (non-commercial license).

**Open items:** No CPU latency or fine-tuning time was measured. Those numbers need a benchmark on the target machine before committing. The verifier's accuracy on your own data is the real test.
