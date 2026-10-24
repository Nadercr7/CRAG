| dataset | method | ndcg@10 | recall@20 | recall@100 | mrr |
|---|---|---|---|---|---|
| scifact | bm25 | 68.6 | 85.7 | 91.3 | 65.3 |
| scifact | dense | 71.3 | 87.3 | 94.2 | 68.7 |
| scifact | hybrid | 72.3 | 88.7 | 96.5 | 69.1 |
| scifact | hybrid + ms-marco-minilm-l6-v2 | 69.6 | 87.3 | 94.4 | 66.9 |
| scifact | hybrid + ms-marco-minilm-l12-v2 | 69.4 | 87.5 | 94.4 | 66.8 |
| scifact | hybrid + bge-reranker-base | 71.9 | 89.8 | 94.4 | 69.1 |
| nfcorpus | bm25 | 32.2 | 17.7 | 24.7 | 53.2 |
| nfcorpus | dense | 34.4 | 20.0 | 31.1 | 53.7 |
| nfcorpus | hybrid | 36.2 | 20.7 | 31.3 | 57.5 |
| nfcorpus | hybrid + ms-marco-minilm-l6-v2 | 35.8 | 20.3 | 26.5 | 58.9 |
| nfcorpus | hybrid + ms-marco-minilm-l12-v2 | 33.0 | 20.2 | 26.5 | 52.9 |
| nfcorpus | hybrid + bge-reranker-base | 32.5 | 19.4 | 26.5 | 55.1 |
| fiqa | bm25 | 25.1 | 39.7 | 55.9 | 31.8 |
| fiqa | dense | 40.3 | 54.3 | 69.6 | 49.5 |
| fiqa | hybrid | 36.2 | 52.7 | 69.3 | 44.2 |
| fiqa | hybrid + ms-marco-minilm-l6-v2 | 37.1 | 52.6 | 63.6 | 44.9 |
| fiqa | hybrid + ms-marco-minilm-l12-v2 | 37.7 | 53.4 | 63.6 | 45.4 |
| fiqa | hybrid + bge-reranker-base | 34.8 | 52.3 | 63.6 | 42.9 |

Embedder `BAAI/bge-small-en-v1.5`. Scores x100. Doc embedding time (s): scifact 337, nfcorpus 245, fiqa 1875
Rerankers score the hybrid top-50 only, so their recall@100 equals recall@50.
