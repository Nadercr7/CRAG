| dataset | method | ndcg@10 | recall@20 | recall@100 | mrr |
|---|---|---|---|---|---|
| scifact | bm25 | 68.6 | 85.7 | 91.3 | 65.3 |
| scifact | dense | 71.3 | 87.3 | 94.2 | 68.7 |
| scifact | hybrid | 72.3 | 88.7 | 96.5 | 69.1 |
| scifact | hybrid + ms-marco-minilm-l6-v2 | 69.6 | 87.3 | 94.4 | 66.9 |
| scifact | hybrid + ms-marco-minilm-l12-v2 | 69.4 | 87.5 | 94.4 | 66.8 |
| scifact | hybrid + bge-reranker-base | 71.9 | 89.8 | 94.4 | 69.1 |
| scifact | hybrid + verifier-minilm-l6-lr7e6 | 51.8 | 77.2 | 94.4 | 48.9 |
| scifact | hybrid + verifier-minilm-l6-s13 | 52.7 | 81.4 | 94.4 | 49.6 |
| scifact | hybrid + verifier-minilm-l6-v2-nobeir | 47.1 | 80.8 | 94.4 | 42.5 |
| scifact | hybrid + verifier-minilm-l6-v2 | 54.4 | 82.1 | 94.4 | 50.9 |
| scifact | hybrid + verifier-minilm-l6-v4-wise07 | 68.0 | 89.2 | 94.4 | 66.0 |
| scifact | hybrid + verifier-minilm-l6-v4 | 53.3 | 86.0 | 94.4 | 48.1 |
| nfcorpus | bm25 | 32.2 | 17.7 | 24.7 | 53.2 |
| nfcorpus | dense | 34.4 | 20.0 | 31.1 | 53.7 |
| nfcorpus | hybrid | 36.2 | 20.7 | 31.3 | 57.5 |
| nfcorpus | hybrid + ms-marco-minilm-l6-v2 | 35.8 | 20.3 | 26.5 | 58.9 |
| nfcorpus | hybrid + ms-marco-minilm-l12-v2 | 33.0 | 20.2 | 26.5 | 52.9 |
| nfcorpus | hybrid + bge-reranker-base | 32.5 | 19.4 | 26.5 | 55.1 |
| nfcorpus | hybrid + verifier-minilm-l6-lr7e6 | 14.1 | 10.5 | 26.5 | 26.1 |
| nfcorpus | hybrid + verifier-minilm-l6-s13 | 16.1 | 12.9 | 26.5 | 28.6 |
| nfcorpus | hybrid + verifier-minilm-l6-v2-nobeir | 15.0 | 11.7 | 26.5 | 28.3 |
| nfcorpus | hybrid + verifier-minilm-l6-v2 | 16.8 | 13.0 | 26.5 | 29.2 |
| nfcorpus | hybrid + verifier-minilm-l6-v4-wise07 | 33.8 | 20.4 | 26.5 | 54.5 |
| nfcorpus | hybrid + verifier-minilm-l6-v4 | 27.9 | 19.7 | 26.5 | 44.6 |
| fiqa | bm25 | 25.1 | 39.7 | 55.9 | 31.8 |
| fiqa | dense | 40.3 | 54.3 | 69.6 | 49.5 |
| fiqa | hybrid | 36.2 | 52.7 | 69.3 | 44.2 |
| fiqa | hybrid + ms-marco-minilm-l6-v2 | 37.1 | 52.6 | 63.6 | 44.9 |
| fiqa | hybrid + ms-marco-minilm-l12-v2 | 37.7 | 53.4 | 63.6 | 45.4 |
| fiqa | hybrid + bge-reranker-base | 34.8 | 52.3 | 63.6 | 42.9 |
| fiqa | hybrid + verifier-minilm-l6-lr7e6 | 19.6 | 45.0 | 63.6 | 24.8 |
| fiqa | hybrid + verifier-minilm-l6-s13 | 20.7 | 46.8 | 63.6 | 25.2 |
| fiqa | hybrid + verifier-minilm-l6-v2-nobeir | 17.5 | 42.3 | 63.6 | 21.8 |
| fiqa | hybrid + verifier-minilm-l6-v2 | 20.8 | 47.3 | 63.6 | 24.9 |
| fiqa | hybrid + verifier-minilm-l6-v4-wise07 | 34.0 | 53.1 | 63.6 | 41.8 |
| fiqa | hybrid + verifier-minilm-l6-v4 | 21.8 | 46.2 | 63.6 | 27.1 |

Embedder `BAAI/bge-small-en-v1.5`. Scores x100. Doc embedding time (s): scifact 337, nfcorpus 245, fiqa 1875
Rerankers score the hybrid top-50 only, so their recall@100 equals recall@50.
