# QA evaluation: dev_dryrun

- split `dev`, arms ACF, generated 2026-10-25 00:39:01
- questions per slice: supportive 10, missing 10, misleading 7
- verifier `/home/user/crag/data/models/verifier-minilm-l6-s13/model`, arm B `cross-encoder/ms-marco-MiniLM-L6-v2`; overlay `configs/tuned.toml` (sha dd7548fc8f9c)
- abstain threshold applied at finalize: F 0.5; sufficiency `verifier`
- **sufficiency is the verifier-relevance stand-in, not the trained student**

Rates are shares of all questions of the slice. Correct = answered with EM or containment; planted = answered with the substituted entity (misleading slice); selective accuracy = correct / answered; coverage = answered / total; EM, F1 and containment are over answered questions.

## supportive

_gold paragraphs present: answers are expected_

| Arm | n | Correct % | Abstain % | Halluc. % | Planted % | EM % | F1 % | Contains % | Sel. acc. % | Coverage % |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 10 | 40.0 | 0.0 | 60.0 | - | 0.0 | 5.3 | 40.0 | 40.0 | 100.0 |
| C | 10 | 40.0 | 0.0 | 60.0 | - | 0.0 | 5.3 | 40.0 | 40.0 | 100.0 |
| F | 10 | 20.0 | 40.0 | 40.0 | - | 0.0 | 7.4 | 33.3 | 33.3 | 60.0 |

| Arm | Ctx lines | Ctx tokens | All facts in ctx % | Correct w/o all facts % | Cite valid % | Cite support % | Groq calls/q |
|---|---|---|---|---|---|---|---|
| A | 5.00 | 645 | 80.0 | 0.0 | 100.0 | 90.0 | 0.00 |
| C | 2.50 | 319 | 40.0 | 10.0 | 100.0 | 80.0 | 0.00 |
| F | 2.90 | 135 | 30.0 | 10.0 | 100.0 | 83.3 | 0.70 |

## missing

_gold paragraphs removed: abstaining is the desired behaviour, and a correct answer is correct *without gold* (other paragraphs or parametric knowledge)_

| Arm | n | Correct % | Abstain % | Halluc. % | Planted % | EM % | F1 % | Contains % | Sel. acc. % | Coverage % |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 10 | 10.0 | 0.0 | 90.0 | - | 0.0 | 2.2 | 10.0 | 10.0 | 100.0 |
| C | 10 | 10.0 | 0.0 | 90.0 | - | 0.0 | 2.9 | 10.0 | 10.0 | 100.0 |
| F | 10 | 0.0 | 100.0 | 0.0 | - | - | - | - | - | 0.0 |

| Arm | Ctx lines | Ctx tokens | All facts in ctx % | Correct w/o all facts % | Cite valid % | Cite support % | Groq calls/q |
|---|---|---|---|---|---|---|---|
| A | 5.00 | 766 | 0.0 | 10.0 | 100.0 | 0.0 | 0.00 |
| C | 3.40 | 469 | 0.0 | 10.0 | 100.0 | 0.0 | 0.00 |
| F | 1.00 | 46 | 0.0 | 0.0 | - | - | 1.00 |

On this slice every correct answer is a *correct without gold*.

## misleading

_answer entity swapped in the gold paragraphs: planted is the failure to avoid_

| Arm | n | Correct % | Abstain % | Halluc. % | Planted % | EM % | F1 % | Contains % | Sel. acc. % | Coverage % |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 7 | 0.0 | 0.0 | 57.1 | 42.9 | 0.0 | 3.3 | 0.0 | 0.0 | 100.0 |
| C | 7 | 0.0 | 0.0 | 57.1 | 42.9 | 0.0 | 4.7 | 0.0 | 0.0 | 100.0 |
| F | 7 | 0.0 | 42.9 | 42.9 | 14.3 | 0.0 | 6.2 | 0.0 | 0.0 | 57.1 |

| Arm | Ctx lines | Ctx tokens | All facts in ctx % | Correct w/o all facts % | Cite valid % | Cite support % | Groq calls/q |
|---|---|---|---|---|---|---|---|
| A | 5.00 | 668 | 85.7 | 0.0 | 100.0 | 85.7 | 0.00 |
| C | 3.00 | 388 | 42.9 | 0.0 | 100.0 | 71.4 | 0.00 |
| F | 3.14 | 143 | 42.9 | 0.0 | 100.0 | 75.0 | 0.71 |

## Paired bootstrap

Difference of per-question rates, first arm minus second, on the questions both answered (10,000 resamples, seed 0, 95% CI in percentage points, two-sided p). A * marks a CI that excludes 0.

| Comparison | Slice | Metric | n | Diff (pp) | 95% CI (pp) | p |
|---|---|---|---|---|---|---|
| F vs A | supportive | correct | 10 | -20.0 | [-50.0, +0.0] | 0.211 |
| F vs A | supportive | hallucinate | 10 | -20.0 | [-60.0, +20.0] | 0.419 |
| F vs A | missing | correct | 10 | -10.0 | [-30.0, +0.0] | 0.689 |
| F vs A | missing | hallucinate | 10 | -90.0 * | [-100.0, -70.0] | 0.000 |
| F vs A | misleading | correct | 7 | +0.0 | [+0.0, +0.0] | 1.000 |
| F vs A | misleading | hallucinate | 7 | -14.3 | [-57.1, +28.6] | 0.761 |
| F vs A | misleading | planted | 7 | -28.6 | [-71.4, +0.0] | 0.186 |

## Risk-coverage (arm F)

Abstain threshold swept over the sufficiency probability, with abstention off in the prepared traces, so every question has a generated answer. AUC is the area under selective accuracy over coverage [0, max coverage]; normalized = AUC / max coverage.

| Slice | n | Max coverage % | AUC | AUC normalized |
|---|---|---|---|---|
| supportive | 10 | 90.0 | 0.406 | 0.451 |
| missing | 10 | 40.0 | 0.000 | 0.000 |
| misleading | 7 | 85.7 | 0.000 | 0.000 |
| all | 27 | 70.4 | 0.192 | 0.273 |

**supportive**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|
| 0.1 | 10.0 | 100.0 | 0.958 |
| 0.2 | 20.0 | 50.0 | 0.916 |
| 0.3 | 30.0 | 33.3 | 0.860 |
| 0.4 | 40.0 | 50.0 | 0.834 |
| 0.5 | 50.0 | 40.0 | 0.808 |
| 0.6 | 60.0 | 33.3 | 0.715 |
| 0.7 | 70.0 | 28.6 | 0.419 |
| 0.8 | 80.0 | 37.5 | 0.390 |
| 0.9 | 90.0 | 33.3 | 0.036 |

**missing**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|
| 0.1 | 10.0 | 0.0 | 0.279 |
| 0.2 | 20.0 | 0.0 | 0.154 |
| 0.3 | 30.0 | 0.0 | 0.145 |
| 0.4 | 40.0 | 0.0 | 0.036 |

**misleading**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|
| 0.1 | 14.3 | 0.0 | 0.955 |
| 0.2 | 28.6 | 0.0 | 0.918 |
| 0.3 | 42.9 | 0.0 | 0.808 |
| 0.5 | 57.1 | 0.0 | 0.731 |
| 0.6 | 71.4 | 0.0 | 0.451 |
| 0.8 | 85.7 | 0.0 | 0.036 |

**all**

| target coverage | coverage % | selective acc. % | threshold |
|---|---|---|---|
| 0.1 | 11.1 | 33.3 | 0.918 |
| 0.2 | 22.2 | 33.3 | 0.834 |
| 0.3 | 33.3 | 22.2 | 0.731 |
| 0.4 | 40.7 | 18.2 | 0.451 |
| 0.5 | 51.9 | 21.4 | 0.279 |
| 0.6 | 70.4 | 15.8 | 0.036 |

matplotlib is not installed: the PNG was skipped (the table above has the data)
