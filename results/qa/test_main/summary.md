# QA evaluation: test_main

- split `test`, arms ABCDEFG, generated 2026-10-25 01:57:22
- questions per slice: supportive 300, missing 300, misleading 239
- verifier `/home/user/crag/data/models/verifier-minilm-l6-v4-wise07/model`, arm B `cross-encoder/ms-marco-MiniLM-L6-v2`; overlay `configs/tuned.toml` (sha c915ae2a313c)
- abstain threshold applied at finalize: F 0.9, G 0.9; sufficiency `data/models/sufficiency-minilm-l12`

Rates are shares of all questions of the slice. Correct = answered with EM or containment; planted = answered with the substituted entity (misleading slice); selective accuracy = correct / answered; coverage = answered / total; EM, F1 and containment are over answered questions.

## supportive

_gold paragraphs present: answers are expected_

| Arm | n | Correct % | Abstain % | Halluc. % | Planted % | EM % | F1 % | Contains % | Sel. acc. % | Coverage % |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 300 | 48.7 | 26.7 | 24.7 | - | 57.7 | 71.1 | 66.4 | 66.4 | 73.3 |
| B | 300 | 46.7 | 27.3 | 26.0 | - | 55.0 | 69.3 | 64.2 | 64.2 | 72.7 |
| C | 300 | 52.3 | 23.3 | 24.3 | - | 60.0 | 73.0 | 68.3 | 68.3 | 76.7 |
| D | 300 | 47.7 | 31.3 | 21.0 | - | 60.7 | 73.0 | 69.4 | 69.4 | 68.7 |
| E | 300 | 48.0 | 30.3 | 21.7 | - | 60.3 | 72.6 | 68.9 | 68.9 | 69.7 |
| F | 300 | 43.7 | 38.0 | 18.3 | - | 60.8 | 74.0 | 70.4 | 70.4 | 62.0 |
| G | 300 | 43.3 | 38.7 | 18.0 | - | 60.9 | 74.2 | 70.7 | 70.7 | 61.3 |

| Arm | Ctx lines | Ctx tokens | All facts in ctx % | Correct w/o all facts % | Cite valid % | Cite support % | Groq calls/q |
|---|---|---|---|---|---|---|---|
| A | 8.00 | 1070 | 83.7 | 2.0 | 100.0 | 80.8 | 0.00 |
| B | 8.00 | 1068 | 82.3 | 2.3 | 100.0 | 83.3 | 0.00 |
| C | 5.99 | 752 | 89.7 | 2.0 | 100.0 | 84.3 | 0.00 |
| D | 5.19 | 221 | 57.3 | 12.3 | 100.0 | 81.0 | 0.00 |
| E | 5.24 | 223 | 58.0 | 12.3 | 100.0 | 81.2 | 0.45 |
| F | 5.18 | 217 | 57.7 | 8.3 | 100.0 | 81.6 | 0.45 |
| G | 5.14 | 215 | 57.0 | 8.3 | 100.0 | 81.4 | 0.03 |

## missing

_gold paragraphs removed: abstaining is the desired behaviour, and a correct answer is correct *without gold* (other paragraphs or parametric knowledge)_

| Arm | n | Correct % | Abstain % | Halluc. % | Planted % | EM % | F1 % | Contains % | Sel. acc. % | Coverage % |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 300 | 6.7 | 85.3 | 8.0 | - | 40.9 | 48.0 | 45.5 | 45.5 | 14.7 |
| B | 300 | 6.7 | 86.0 | 7.3 | - | 45.2 | 50.5 | 47.6 | 47.6 | 14.0 |
| C | 300 | 7.3 | 85.0 | 7.7 | - | 44.4 | 53.8 | 48.9 | 48.9 | 15.0 |
| D | 300 | 5.0 | 90.3 | 4.7 | - | 48.3 | 53.3 | 51.7 | 51.7 | 9.7 |
| E | 300 | 5.0 | 89.7 | 5.3 | - | 45.2 | 49.8 | 48.4 | 48.4 | 10.3 |
| F | 300 | 0.3 | 99.0 | 0.7 | - | 33.3 | 33.3 | 33.3 | 33.3 | 1.0 |
| G | 300 | 0.3 | 99.0 | 0.7 | - | 33.3 | 33.3 | 33.3 | 33.3 | 1.0 |

| Arm | Ctx lines | Ctx tokens | All facts in ctx % | Correct w/o all facts % | Cite valid % | Cite support % | Groq calls/q |
|---|---|---|---|---|---|---|---|
| A | 8.00 | 1145 | 0.0 | 6.7 | 100.0 | 0.0 | 0.00 |
| B | 8.00 | 1132 | 0.0 | 6.7 | 100.0 | 0.0 | 0.00 |
| C | 5.43 | 718 | 0.0 | 7.3 | 100.0 | 0.0 | 0.00 |
| D | 4.93 | 355 | 0.0 | 5.0 | 100.0 | 0.0 | 0.00 |
| E | 4.93 | 344 | 0.0 | 5.0 | 100.0 | 0.0 | 0.96 |
| F | 3.30 | 138 | 0.0 | 0.3 | 100.0 | 0.0 | 0.96 |
| G | 3.30 | 138 | 0.0 | 0.3 | 100.0 | 0.0 | 0.62 |

On this slice every correct answer is a *correct without gold*.

## misleading

_answer entity swapped in the gold paragraphs: planted is the failure to avoid_

| Arm | n | Correct % | Abstain % | Halluc. % | Planted % | EM % | F1 % | Contains % | Sel. acc. % | Coverage % |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 239 | 10.0 | 34.7 | 24.7 | 30.5 | 13.5 | 26.9 | 16.7 | 15.4 | 65.3 |
| B | 239 | 10.5 | 33.9 | 26.4 | 29.3 | 12.7 | 26.8 | 16.5 | 15.8 | 66.1 |
| C | 239 | 11.7 | 32.6 | 20.1 | 35.6 | 14.9 | 28.1 | 18.0 | 17.4 | 67.4 |
| D | 239 | 11.7 | 37.2 | 20.9 | 30.1 | 15.3 | 29.0 | 20.0 | 18.7 | 62.8 |
| E | 239 | 12.1 | 35.6 | 22.2 | 30.1 | 15.6 | 29.2 | 20.1 | 18.8 | 64.4 |
| F | 239 | 9.6 | 45.6 | 17.2 | 27.6 | 13.8 | 29.6 | 19.2 | 17.7 | 54.4 |
| G | 239 | 9.2 | 46.4 | 16.7 | 27.6 | 13.3 | 28.8 | 18.8 | 17.2 | 53.6 |

| Arm | Ctx lines | Ctx tokens | All facts in ctx % | Correct w/o all facts % | Cite valid % | Cite support % | Groq calls/q |
|---|---|---|---|---|---|---|---|
| A | 8.00 | 1086 | 80.8 | 2.1 | 100.0 | 84.5 | 0.00 |
| B | 8.00 | 1081 | 80.3 | 1.3 | 100.0 | 84.2 | 0.00 |
| C | 6.14 | 777 | 87.9 | 1.7 | 100.0 | 84.0 | 0.00 |
| D | 5.37 | 234 | 56.1 | 5.0 | 100.0 | 77.7 | 0.00 |
| E | 5.44 | 236 | 56.9 | 5.0 | 100.0 | 77.9 | 0.49 |
| F | 5.33 | 224 | 56.1 | 2.9 | 100.0 | 80.6 | 0.49 |
| G | 5.28 | 221 | 55.2 | 2.9 | 100.0 | 80.4 | 0.05 |

## Paired bootstrap

Difference of per-question rates, first arm minus second, on the questions both answered (10,000 resamples, seed 0, 95% CI in percentage points, two-sided p). A * marks a CI that excludes 0.

| Comparison | Slice | Metric | n | Diff (pp) | 95% CI (pp) | p |
|---|---|---|---|---|---|---|
| F vs A | supportive | correct | 300 | -5.0 | [-10.0, +0.0] | 0.060 |
| F vs A | supportive | hallucinate | 300 | -6.3 * | [-10.7, -2.0] | 0.004 |
| F vs A | missing | correct | 300 | -6.3 * | [-9.3, -3.7] | 0.000 |
| F vs A | missing | hallucinate | 300 | -7.3 * | [-10.3, -4.7] | 0.000 |
| F vs A | misleading | correct | 239 | -0.4 | [-4.2, +2.9] | 0.918 |
| F vs A | misleading | hallucinate | 239 | -7.5 * | [-13.0, -2.1] | 0.009 |
| F vs A | misleading | planted | 239 | -2.9 | [-8.4, +2.5] | 0.342 |
| F vs B | supportive | correct | 300 | -3.0 | [-8.0, +2.0] | 0.280 |
| F vs B | supportive | hallucinate | 300 | -7.7 * | [-12.3, -3.3] | 0.002 |
| F vs B | missing | correct | 300 | -6.3 * | [-9.0, -3.7] | 0.000 |
| F vs B | missing | hallucinate | 300 | -6.7 * | [-9.7, -4.0] | 0.000 |
| F vs B | misleading | correct | 239 | -0.8 | [-4.2, +2.5] | 0.728 |
| F vs B | misleading | hallucinate | 239 | -9.2 * | [-14.6, -3.8] | 0.002 |
| F vs B | misleading | planted | 239 | -1.7 | [-7.1, +3.8] | 0.582 |
| D vs C | supportive | correct | 300 | -4.7 | [-9.3, +0.0] | 0.055 |
| D vs C | supportive | hallucinate | 300 | -3.3 | [-7.3, +0.7] | 0.129 |
| D vs C | missing | correct | 300 | -2.3 * | [-4.7, -0.3] | 0.039 |
| D vs C | missing | hallucinate | 300 | -3.0 * | [-5.7, -0.7] | 0.018 |
| D vs C | misleading | correct | 239 | +0.0 | [-3.8, +3.8] | 1.000 |
| D vs C | misleading | hallucinate | 239 | +0.8 | [-3.8, +5.4] | 0.780 |
| D vs C | misleading | planted | 239 | -5.4 * | [-10.5, -0.4] | 0.039 |
| E vs D | supportive | correct | 300 | +0.3 | [-0.7, +1.7] | 0.786 |
| E vs D | supportive | hallucinate | 300 | +0.7 | [+0.0, +1.7] | 0.263 |
| E vs D | missing | correct | 300 | +0.0 | [+0.0, +0.0] | 1.000 |
| E vs D | missing | hallucinate | 300 | +0.7 | [+0.0, +1.7] | 0.267 |
| E vs D | misleading | correct | 239 | +0.4 | [+0.0, +1.3] | 0.731 |
| E vs D | misleading | hallucinate | 239 | +1.3 | [+0.0, +2.9] | 0.099 |
| E vs D | misleading | planted | 239 | +0.0 | [-1.3, +1.3] | 1.000 |
| F vs E | supportive | correct | 300 | -4.3 * | [-6.7, -2.3] | 0.000 |
| F vs E | supportive | hallucinate | 300 | -3.3 * | [-5.3, -1.3] | 0.000 |
| F vs E | missing | correct | 300 | -4.7 * | [-7.0, -2.3] | 0.000 |
| F vs E | missing | hallucinate | 300 | -4.7 * | [-7.3, -2.3] | 0.000 |
| F vs E | misleading | correct | 239 | -2.5 * | [-4.6, -0.8] | 0.003 |
| F vs E | misleading | hallucinate | 239 | -5.0 * | [-7.9, -2.5] | 0.000 |
| F vs E | misleading | planted | 239 | -2.5 * | [-4.6, -0.8] | 0.004 |
| G vs F | supportive | correct | 300 | -0.3 | [-1.7, +0.7] | 0.786 |
| G vs F | supportive | hallucinate | 300 | -0.3 | [-1.0, +0.0] | 0.733 |
| G vs F | missing | correct | 300 | +0.0 | [+0.0, +0.0] | 1.000 |
| G vs F | missing | hallucinate | 300 | +0.0 | [+0.0, +0.0] | 1.000 |
| G vs F | misleading | correct | 239 | -0.4 | [-1.3, +0.0] | 0.731 |
| G vs F | misleading | hallucinate | 239 | -0.4 | [-1.3, +0.0] | 0.737 |
| G vs F | misleading | planted | 239 | +0.0 | [-1.3, +1.3] | 1.000 |

## Risk-coverage (arm F)

Abstain threshold swept over the sufficiency probability, with abstention off in the prepared traces, so every question has a generated answer. AUC is the area under selective accuracy over coverage [0, max coverage]; normalized = AUC / max coverage.

| Slice | n | Max coverage % | AUC | AUC normalized |
|---|---|---|---|---|
| supportive | 300 | 69.7 | 0.511 | 0.734 |
| missing | 300 | 9.3 | 0.033 | 0.355 |
| misleading | 239 | 64.0 | 0.105 | 0.164 |
| all | 839 | 46.5 | 0.235 | 0.506 |

**supportive**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|
| 0.1 | 10.0 | 73.3 | 0.998 |
| 0.2 | 20.0 | 73.3 | 0.997 |
| 0.3 | 30.0 | 77.8 | 0.996 |
| 0.4 | 40.0 | 73.3 | 0.994 |
| 0.5 | 50.0 | 72.7 | 0.988 |
| 0.6 | 60.0 | 70.0 | 0.944 |

**missing**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|

**misleading**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|
| 0.1 | 10.0 | 16.7 | 0.997 |
| 0.2 | 20.1 | 16.7 | 0.996 |
| 0.3 | 30.1 | 12.5 | 0.994 |
| 0.4 | 40.2 | 15.6 | 0.991 |
| 0.5 | 50.2 | 16.7 | 0.973 |
| 0.6 | 60.3 | 18.1 | 0.327 |

**all**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|
| 0.1 | 10.0 | 52.4 | 0.997 |
| 0.2 | 20.0 | 52.4 | 0.995 |
| 0.3 | 30.0 | 49.6 | 0.988 |
| 0.4 | 40.0 | 47.9 | 0.685 |

matplotlib is not installed: the PNG was skipped (the table above has the data)
