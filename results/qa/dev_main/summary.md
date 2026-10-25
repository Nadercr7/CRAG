# QA evaluation: dev_main

- split `dev`, arms ABCDEFG, generated 2026-10-25 01:49:36
- questions per slice: supportive 200, missing 200, misleading 149
- verifier `/home/user/crag/data/models/verifier-minilm-l6-v4-wise07/model`, arm B `cross-encoder/ms-marco-MiniLM-L6-v2`; overlay `configs/tuned.toml` (sha c915ae2a313c)
- abstain threshold applied at finalize: F 0.5, G 0.5; sufficiency `data/models/sufficiency-minilm-l12`

Rates are shares of all questions of the slice. Correct = answered with EM or containment; planted = answered with the substituted entity (misleading slice); selective accuracy = correct / answered; coverage = answered / total; EM, F1 and containment are over answered questions.

## supportive

_gold paragraphs present: answers are expected_

| Arm | n | Correct % | Abstain % | Halluc. % | Planted % | EM % | F1 % | Contains % | Sel. acc. % | Coverage % |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 200 | 52.5 | 23.0 | 24.5 | - | 53.9 | 69.7 | 68.2 | 68.2 | 77.0 |
| B | 200 | 51.5 | 25.5 | 23.0 | - | 55.0 | 71.1 | 69.1 | 69.1 | 74.5 |
| C | 200 | 54.5 | 23.0 | 22.5 | - | 56.5 | 72.9 | 70.8 | 70.8 | 77.0 |
| D | 200 | 55.5 | 29.0 | 15.5 | - | 59.9 | 77.7 | 78.2 | 78.2 | 71.0 |
| E | 200 | 55.0 | 29.5 | 15.5 | - | 59.6 | 77.6 | 78.0 | 78.0 | 70.5 |
| F | 200 | 50.5 | 36.0 | 13.5 | - | 59.4 | 78.2 | 78.9 | 78.9 | 64.0 |
| G | 200 | 50.5 | 36.0 | 13.5 | - | 59.4 | 78.2 | 78.9 | 78.9 | 64.0 |

| Arm | Ctx lines | Ctx tokens | All facts in ctx % | Correct w/o all facts % | Cite valid % | Cite support % | Groq calls/q |
|---|---|---|---|---|---|---|---|
| A | 8.00 | 1084 | 85.0 | 2.5 | 100.0 | 87.6 | 0.00 |
| B | 8.00 | 1066 | 86.5 | 3.0 | 100.0 | 85.8 | 0.00 |
| C | 5.92 | 717 | 89.0 | 1.0 | 100.0 | 88.0 | 0.00 |
| D | 5.22 | 229 | 59.0 | 16.0 | 100.0 | 86.3 | 0.00 |
| E | 5.26 | 230 | 60.0 | 15.0 | 100.0 | 86.8 | 0.42 |
| F | 5.22 | 225 | 60.0 | 10.5 | 100.0 | 88.3 | 0.42 |
| G | 5.20 | 224 | 59.0 | 11.0 | 100.0 | 88.3 | 0.04 |

## missing

_gold paragraphs removed: abstaining is the desired behaviour, and a correct answer is correct *without gold* (other paragraphs or parametric knowledge)_

| Arm | n | Correct % | Abstain % | Halluc. % | Planted % | EM % | F1 % | Contains % | Sel. acc. % | Coverage % |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 200 | 8.5 | 83.0 | 8.5 | - | 44.1 | 49.8 | 50.0 | 50.0 | 17.0 |
| B | 200 | 6.0 | 86.5 | 7.5 | - | 40.7 | 45.6 | 44.4 | 44.4 | 13.5 |
| C | 200 | 8.0 | 84.0 | 8.0 | - | 43.8 | 50.5 | 50.0 | 50.0 | 16.0 |
| D | 200 | 7.5 | 86.0 | 6.5 | - | 42.9 | 54.0 | 53.6 | 53.6 | 14.0 |
| E | 200 | 7.5 | 86.0 | 6.5 | - | 42.9 | 54.0 | 53.6 | 53.6 | 14.0 |
| F | 200 | 1.0 | 95.5 | 3.5 | - | 22.2 | 29.8 | 22.2 | 22.2 | 4.5 |
| G | 200 | 1.0 | 95.5 | 3.5 | - | 22.2 | 29.8 | 22.2 | 22.2 | 4.5 |

| Arm | Ctx lines | Ctx tokens | All facts in ctx % | Correct w/o all facts % | Cite valid % | Cite support % | Groq calls/q |
|---|---|---|---|---|---|---|---|
| A | 8.00 | 1155 | 0.0 | 8.5 | 100.0 | 0.0 | 0.00 |
| B | 8.00 | 1161 | 0.0 | 6.0 | 100.0 | 0.0 | 0.00 |
| C | 5.36 | 698 | 0.0 | 8.0 | 100.0 | 0.0 | 0.00 |
| D | 4.67 | 351 | 0.0 | 7.5 | 100.0 | 0.0 | 0.00 |
| E | 4.74 | 345 | 0.0 | 7.5 | 100.0 | 0.0 | 0.94 |
| F | 3.22 | 140 | 0.0 | 1.0 | 100.0 | 0.0 | 0.94 |
| G | 3.18 | 138 | 0.0 | 1.0 | 100.0 | 0.0 | 0.60 |

On this slice every correct answer is a *correct without gold*.

## misleading

_answer entity swapped in the gold paragraphs: planted is the failure to avoid_

| Arm | n | Correct % | Abstain % | Halluc. % | Planted % | EM % | F1 % | Contains % | Sel. acc. % | Coverage % |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 149 | 10.1 | 29.5 | 24.8 | 35.6 | 10.5 | 26.1 | 15.2 | 14.3 | 70.5 |
| B | 149 | 12.8 | 30.9 | 23.5 | 32.9 | 13.6 | 30.6 | 19.4 | 18.4 | 69.1 |
| C | 149 | 8.1 | 29.5 | 24.8 | 37.6 | 8.6 | 25.7 | 12.4 | 11.4 | 70.5 |
| D | 149 | 10.1 | 36.2 | 20.1 | 33.6 | 11.6 | 29.9 | 16.8 | 15.8 | 63.8 |
| E | 149 | 9.4 | 36.9 | 20.1 | 33.6 | 10.6 | 29.1 | 16.0 | 14.9 | 63.1 |
| F | 149 | 7.4 | 43.6 | 18.8 | 30.2 | 9.5 | 27.6 | 14.3 | 13.1 | 56.4 |
| G | 149 | 7.4 | 43.6 | 18.8 | 30.2 | 9.5 | 27.6 | 14.3 | 13.1 | 56.4 |

| Arm | Ctx lines | Ctx tokens | All facts in ctx % | Correct w/o all facts % | Cite valid % | Cite support % | Groq calls/q |
|---|---|---|---|---|---|---|---|
| A | 8.00 | 1096 | 83.2 | 0.7 | 100.0 | 84.6 | 0.00 |
| B | 8.00 | 1082 | 85.2 | 0.7 | 100.0 | 86.7 | 0.00 |
| C | 6.05 | 737 | 86.6 | 0.0 | 100.0 | 90.7 | 0.00 |
| D | 5.44 | 238 | 56.4 | 4.7 | 100.0 | 84.9 | 0.00 |
| E | 5.50 | 240 | 58.4 | 4.7 | 100.0 | 85.6 | 0.40 |
| F | 5.45 | 234 | 57.7 | 2.7 | 100.0 | 85.1 | 0.40 |
| G | 5.42 | 232 | 56.4 | 2.7 | 100.0 | 85.1 | 0.05 |

## Paired bootstrap

Difference of per-question rates, first arm minus second, on the questions both answered (10,000 resamples, seed 0, 95% CI in percentage points, two-sided p). A * marks a CI that excludes 0.

| Comparison | Slice | Metric | n | Diff (pp) | 95% CI (pp) | p |
|---|---|---|---|---|---|---|
| F vs A | supportive | correct | 200 | -2.0 | [-9.0, +5.0] | 0.613 |
| F vs A | supportive | hallucinate | 200 | -11.0 * | [-16.0, -6.0] | 0.000 |
| F vs A | missing | correct | 200 | -7.5 * | [-11.5, -4.0] | 0.000 |
| F vs A | missing | hallucinate | 200 | -5.0 * | [-8.5, -2.0] | 0.002 |
| F vs A | misleading | correct | 149 | -2.7 | [-7.4, +2.0] | 0.354 |
| F vs A | misleading | hallucinate | 149 | -6.0 | [-12.8, +0.0] | 0.080 |
| F vs A | misleading | planted | 149 | -5.4 | [-12.8, +2.0] | 0.198 |
| F vs B | supportive | correct | 200 | -1.0 | [-7.5, +5.0] | 0.815 |
| F vs B | supportive | hallucinate | 200 | -9.5 * | [-14.0, -5.5] | 0.000 |
| F vs B | missing | correct | 200 | -5.0 * | [-8.5, -2.0] | 0.002 |
| F vs B | missing | hallucinate | 200 | -4.0 * | [-7.0, -1.0] | 0.009 |
| F vs B | misleading | correct | 149 | -5.4 * | [-10.1, -0.7] | 0.034 |
| F vs B | misleading | hallucinate | 149 | -4.7 | [-10.7, +1.3] | 0.151 |
| F vs B | misleading | planted | 149 | -2.7 | [-9.4, +4.0] | 0.497 |
| D vs C | supportive | correct | 200 | +1.0 | [-4.5, +6.5] | 0.797 |
| D vs C | supportive | hallucinate | 200 | -7.0 * | [-11.5, -3.0] | 0.000 |
| D vs C | missing | correct | 200 | -0.5 | [-2.5, +1.5] | 0.825 |
| D vs C | missing | hallucinate | 200 | -1.5 | [-4.0, +1.0] | 0.335 |
| D vs C | misleading | correct | 149 | +2.0 | [-2.7, +6.7] | 0.492 |
| D vs C | misleading | hallucinate | 149 | -4.7 | [-10.7, +0.7] | 0.129 |
| D vs C | misleading | planted | 149 | -4.0 | [-10.1, +2.0] | 0.244 |
| E vs D | supportive | correct | 200 | -0.5 | [-2.5, +1.0] | 0.775 |
| E vs D | supportive | hallucinate | 200 | +0.0 | [+0.0, +0.0] | 1.000 |
| E vs D | missing | correct | 200 | +0.0 | [+0.0, +0.0] | 1.000 |
| E vs D | missing | hallucinate | 200 | +0.0 | [+0.0, +0.0] | 1.000 |
| E vs D | misleading | correct | 149 | -0.7 | [-2.0, +0.0] | 0.705 |
| E vs D | misleading | hallucinate | 149 | +0.0 | [+0.0, +0.0] | 1.000 |
| E vs D | misleading | planted | 149 | +0.0 | [+0.0, +0.0] | 1.000 |
| F vs E | supportive | correct | 200 | -4.5 * | [-7.5, -2.0] | 0.000 |
| F vs E | supportive | hallucinate | 200 | -2.0 * | [-4.0, -0.5] | 0.035 |
| F vs E | missing | correct | 200 | -6.5 * | [-10.0, -3.5] | 0.000 |
| F vs E | missing | hallucinate | 200 | -3.0 * | [-5.5, -1.0] | 0.004 |
| F vs E | misleading | correct | 149 | -2.0 | [-4.7, +0.0] | 0.096 |
| F vs E | misleading | hallucinate | 149 | -1.3 | [-3.4, +0.0] | 0.266 |
| F vs E | misleading | planted | 149 | -3.4 * | [-6.7, -0.7] | 0.015 |
| G vs F | supportive | correct | 200 | +0.0 | [+0.0, +0.0] | 1.000 |
| G vs F | supportive | hallucinate | 200 | +0.0 | [+0.0, +0.0] | 1.000 |
| G vs F | missing | correct | 200 | +0.0 | [+0.0, +0.0] | 1.000 |
| G vs F | missing | hallucinate | 200 | +0.0 | [+0.0, +0.0] | 1.000 |
| G vs F | misleading | correct | 149 | +0.0 | [+0.0, +0.0] | 1.000 |
| G vs F | misleading | hallucinate | 149 | +0.0 | [+0.0, +0.0] | 1.000 |
| G vs F | misleading | planted | 149 | +0.0 | [+0.0, +0.0] | 1.000 |

## Risk-coverage (arm F)

Abstain threshold swept over the sufficiency probability, with abstention off in the prepared traces, so every question has a generated answer. AUC is the area under selective accuracy over coverage [0, max coverage]; normalized = AUC / max coverage.

| Slice | n | Max coverage % | AUC | AUC normalized |
|---|---|---|---|---|
| supportive | 200 | 70.5 | 0.586 | 0.831 |
| missing | 200 | 12.5 | 0.047 | 0.374 |
| misleading | 149 | 63.1 | 0.080 | 0.127 |
| all | 549 | 47.4 | 0.261 | 0.552 |

**supportive**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|
| 0.1 | 10.0 | 80.0 | 0.998 |
| 0.2 | 20.0 | 80.0 | 0.997 |
| 0.3 | 30.0 | 83.3 | 0.996 |
| 0.4 | 40.0 | 83.8 | 0.994 |
| 0.5 | 50.0 | 84.0 | 0.986 |
| 0.6 | 60.0 | 82.5 | 0.874 |
| 0.7 | 70.0 | 77.9 | 0.001 |

**missing**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|
| 0.1 | 10.0 | 45.0 | 0.000 |

**misleading**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|
| 0.1 | 10.1 | 13.3 | 0.998 |
| 0.2 | 20.1 | 6.7 | 0.997 |
| 0.3 | 30.2 | 8.9 | 0.995 |
| 0.4 | 40.3 | 10.0 | 0.991 |
| 0.5 | 50.3 | 14.7 | 0.896 |
| 0.6 | 60.4 | 14.4 | 0.018 |

**all**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|
| 0.1 | 10.0 | 49.1 | 0.998 |
| 0.2 | 20.0 | 55.5 | 0.995 |
| 0.3 | 30.1 | 54.5 | 0.987 |
| 0.4 | 40.1 | 51.8 | 0.543 |

matplotlib is not installed: the PNG was skipped (the table above has the data)
