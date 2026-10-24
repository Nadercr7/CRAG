| model | 1x20 passages p50 / p95 (ms) | 1x60 sentences p50 / p95 (ms) |
|---|---|---|
| cross-encoder/ms-marco-MiniLM-L6-v2 | 792 / 964 | 356 / 486 |
| cross-encoder/ms-marco-MiniLM-L12-v2 | 1615 / 1854 | 621 / 941 |
| BAAI/bge-reranker-base | 4416 / 4816 | 2027 / 2863 |
| Alibaba-NLP/gte-reranker-modernbert-base | 6262 / 6781 | 2350 / 3078 |

CPU, torch threads=4, batch size 16, max_length 512, 30 timed runs after 3 warmup runs, SciFact texts.
ONNX for MiniLM-L6 skipped: sentence-transformers' backend="onnx" needs onnxruntime and optimum, which are not installed (and no new dependencies were added).
