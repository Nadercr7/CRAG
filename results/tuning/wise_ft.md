# WiSE-FT for the verifier (dev only)

Weight interpolation between the base checkpoint (`cross-encoder/ms-marco-MiniLM-L6-v2`) and the v4 fine-tune: theta = alpha * fine-tuned + (1 - alpha) * base. nDCG@10 on dev reranking samples. HotpotQA: 120 dev questions, gold vs distractor/stripped/random passages. BEIR: 60 dev queries each; every judged document in the hybrid top-50 vs the unjudged ones, the same protocol as the test evaluation.

| alpha | HotpotQA dev | NFCorpus dev | FiQA dev | BEIR dev mean |
|---|---|---|---|---|
| 0.0 (base) | 0.897 | 0.545 | 0.505 | 0.525 |
| 0.3 | 0.906 | 0.548 | 0.524 | 0.536 |
| 0.5 | 0.924 | 0.539 | 0.540 | 0.540 |
| **0.7** | **0.941** | 0.531 | 0.517 | 0.524 |
| 1.0 (v4) | 0.953 | 0.429 | 0.321 | 0.375 |

Rule, fixed before reading the table: the largest alpha whose BEIR dev mean is within 0.01 of the base checkpoint. That is alpha = 0.7. It keeps 79% of the HotpotQA gain (0.897 -> 0.941 of 0.953) at no measurable out-of-domain cost on dev.
