# Generated tables (scripts/report_tables.py)

## Test, all arms

**supportive** (n = 300)

| Arm | Correct | Abstain | Halluc. | Planted | Sel. acc. | Coverage | Ctx tokens |
|---|---|---|---|---|---|---|---|
| A | 48.7 | 26.7 | 24.7 | - | 66.4 | 73.3 | 1070 |
| B | 46.7 | 27.3 | 26.0 | - | 64.2 | 72.7 | 1068 |
| C | 52.3 | 23.3 | 24.3 | - | 68.3 | 76.7 | 752 |
| D | 47.7 | 31.3 | 21.0 | - | 69.4 | 68.7 | 221 |
| E | 48.0 | 30.3 | 21.7 | - | 68.9 | 69.7 | 223 |
| F | 43.7 | 38.0 | 18.3 | - | 70.4 | 62.0 | 217 |
| G | 43.3 | 38.7 | 18.0 | - | 70.7 | 61.3 | 215 |

**missing** (n = 300)

| Arm | Correct | Abstain | Halluc. | Planted | Sel. acc. | Coverage | Ctx tokens |
|---|---|---|---|---|---|---|---|
| A | 6.7 | 85.3 | 8.0 | - | 45.5 | 14.7 | 1145 |
| B | 6.7 | 86.0 | 7.3 | - | 47.6 | 14.0 | 1132 |
| C | 7.3 | 85.0 | 7.7 | - | 48.9 | 15.0 | 718 |
| D | 5.0 | 90.3 | 4.7 | - | 51.7 | 9.7 | 355 |
| E | 5.0 | 89.7 | 5.3 | - | 48.4 | 10.3 | 344 |
| F | 0.3 | 99.0 | 0.7 | - | 33.3 | 1.0 | 138 |
| G | 0.3 | 99.0 | 0.7 | - | 33.3 | 1.0 | 138 |

**misleading** (n = 239)

| Arm | Correct | Abstain | Halluc. | Planted | Sel. acc. | Coverage | Ctx tokens |
|---|---|---|---|---|---|---|---|
| A | 10.0 | 34.7 | 24.7 | 30.5 | 15.4 | 65.3 | 1086 |
| B | 10.5 | 33.9 | 26.4 | 29.3 | 15.8 | 66.1 | 1081 |
| C | 11.7 | 32.6 | 20.1 | 35.6 | 17.4 | 67.4 | 777 |
| D | 11.7 | 37.2 | 20.9 | 30.1 | 18.7 | 62.8 | 234 |
| E | 12.1 | 35.6 | 22.2 | 30.1 | 18.8 | 64.4 | 236 |
| F | 9.6 | 45.6 | 17.2 | 27.6 | 17.7 | 54.4 | 224 |
| G | 9.2 | 46.4 | 16.7 | 27.6 | 17.2 | 53.6 | 221 |

## Test, paired bootstrap

| Comparison | Slice | Metric | Diff (pp) | 95% CI (pp) | p |
|---|---|---|---|---|---|
| F vs A | supportive | correct | -5.0 | [-10.0, +0.0] | 0.060 |
| F vs A | supportive | hallucinate | -6.3 * | [-10.7, -2.0] | 0.004 |
| F vs A | missing | correct | -6.3 * | [-9.3, -3.7] | 0.000 |
| F vs A | missing | hallucinate | -7.3 * | [-10.3, -4.7] | 0.000 |
| F vs A | misleading | correct | -0.4 | [-4.2, +2.9] | 0.918 |
| F vs A | misleading | hallucinate | -7.5 * | [-13.0, -2.1] | 0.009 |
| F vs A | misleading | planted | -2.9 | [-8.4, +2.5] | 0.342 |
| D vs C | supportive | correct | -4.7 | [-9.3, +0.0] | 0.055 |
| D vs C | supportive | hallucinate | -3.3 | [-7.3, +0.7] | 0.129 |
| D vs C | missing | correct | -2.3 * | [-4.7, -0.3] | 0.039 |
| D vs C | missing | hallucinate | -3.0 * | [-5.7, -0.7] | 0.018 |
| D vs C | misleading | correct | +0.0 | [-3.8, +3.8] | 1.000 |
| D vs C | misleading | hallucinate | +0.8 | [-3.8, +5.4] | 0.780 |
| D vs C | misleading | planted | -5.4 * | [-10.5, -0.4] | 0.039 |
| E vs D | supportive | correct | +0.3 | [-0.7, +1.7] | 0.786 |
| E vs D | supportive | hallucinate | +0.7 | [+0.0, +1.7] | 0.263 |
| E vs D | missing | correct | +0.0 | [+0.0, +0.0] | 1.000 |
| E vs D | missing | hallucinate | +0.7 | [+0.0, +1.7] | 0.267 |
| E vs D | misleading | correct | +0.4 | [+0.0, +1.3] | 0.731 |
| E vs D | misleading | hallucinate | +1.3 | [+0.0, +2.9] | 0.099 |
| E vs D | misleading | planted | +0.0 | [-1.3, +1.3] | 1.000 |
| F vs E | supportive | correct | -4.3 * | [-6.7, -2.3] | 0.000 |
| F vs E | supportive | hallucinate | -3.3 * | [-5.3, -1.3] | 0.000 |
| F vs E | missing | correct | -4.7 * | [-7.0, -2.3] | 0.000 |
| F vs E | missing | hallucinate | -4.7 * | [-7.3, -2.3] | 0.000 |
| F vs E | misleading | correct | -2.5 * | [-4.6, -0.8] | 0.003 |
| F vs E | misleading | hallucinate | -5.0 * | [-7.9, -2.5] | 0.000 |
| F vs E | misleading | planted | -2.5 * | [-4.6, -0.8] | 0.004 |

## Dev, all arms (tau_abstain 0.90)

**supportive** (n = 200)

| Arm | Correct | Abstain | Halluc. | Planted | Sel. acc. | Coverage | Ctx tokens |
|---|---|---|---|---|---|---|---|
| A | 52.5 | 23.0 | 24.5 | - | 68.2 | 77.0 | 1084 |
| B | 51.5 | 25.5 | 23.0 | - | 69.1 | 74.5 | 1066 |
| C | 54.5 | 23.0 | 22.5 | - | 70.8 | 77.0 | 717 |
| D | 55.5 | 29.0 | 15.5 | - | 78.2 | 71.0 | 229 |
| E | 55.0 | 29.5 | 15.5 | - | 78.0 | 70.5 | 230 |
| F | 49.0 | 41.0 | 10.0 | - | 83.1 | 59.0 | 225 |
| G | 48.5 | 42.0 | 9.5 | - | 83.6 | 58.0 | 224 |

**missing** (n = 200)

| Arm | Correct | Abstain | Halluc. | Planted | Sel. acc. | Coverage | Ctx tokens |
|---|---|---|---|---|---|---|---|
| A | 8.5 | 83.0 | 8.5 | - | 50.0 | 17.0 | 1155 |
| B | 6.0 | 86.5 | 7.5 | - | 44.4 | 13.5 | 1161 |
| C | 8.0 | 84.0 | 8.0 | - | 50.0 | 16.0 | 698 |
| D | 7.5 | 86.0 | 6.5 | - | 53.6 | 14.0 | 351 |
| E | 7.5 | 86.0 | 6.5 | - | 53.6 | 14.0 | 345 |
| F | 0.5 | 97.5 | 2.0 | - | 20.0 | 2.5 | 140 |
| G | 0.5 | 97.5 | 2.0 | - | 20.0 | 2.5 | 138 |

**misleading** (n = 149)

| Arm | Correct | Abstain | Halluc. | Planted | Sel. acc. | Coverage | Ctx tokens |
|---|---|---|---|---|---|---|---|
| A | 10.1 | 29.5 | 24.8 | 35.6 | 14.3 | 70.5 | 1096 |
| B | 12.8 | 30.9 | 23.5 | 32.9 | 18.4 | 69.1 | 1082 |
| C | 8.1 | 29.5 | 24.8 | 37.6 | 11.4 | 70.5 | 737 |
| D | 10.1 | 36.2 | 20.1 | 33.6 | 15.8 | 63.8 | 238 |
| E | 9.4 | 36.9 | 20.1 | 33.6 | 14.9 | 63.1 | 240 |
| F | 7.4 | 50.3 | 13.4 | 28.9 | 14.9 | 49.7 | 234 |
| G | 7.4 | 51.7 | 12.8 | 28.2 | 15.3 | 48.3 | 232 |

