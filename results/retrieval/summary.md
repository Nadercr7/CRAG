| dataset | method | ndcg@10 | recall@20 | recall@100 | mrr |
|---|---|---|---|---|---|
| scifact | bm25 | 68.6 | 85.7 | 91.3 | 65.3 |
| scifact | dense | 71.3 | 87.3 | 94.2 | 68.7 |
| scifact | hybrid | 72.3 | 88.7 | 96.5 | 69.1 |
| scifact | hybrid + ms-marco-minilm-l6-v2 | 69.6 | 87.3 | 94.4 | 66.9 |
| nfcorpus | bm25 | 32.2 | 17.7 | 24.7 | 53.2 |
| nfcorpus | dense | 34.4 | 20.0 | 31.1 | 53.7 |
| nfcorpus | hybrid | 36.2 | 20.7 | 31.3 | 57.5 |
| fiqa | bm25 | 25.1 | 39.7 | 55.9 | 31.8 |
| fiqa | dense | 40.3 | 54.3 | 69.6 | 49.5 |
| fiqa | hybrid | 36.2 | 52.7 | 69.3 | 44.2 |

Embedder `BAAI/bge-small-en-v1.5`. Scores x100. Doc embedding time (s): scifact 337, nfcorpus 245, fiqa 1875
Rerankers score the hybrid top-50 only, so their recall@100 equals recall@50.
