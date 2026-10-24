# Verified RAG: literature notes (2026-10-24)

Method: arXiv PDFs fetched via curl and read as text (WebFetch cannot resolve arxiv.org in this sandbox). Numbers below were copied from the PDFs unless marked **[unverified]** (my memory or inference) or **[inference]**. Section 12 lists what I did NOT read.

Notation: "ours" = the Verified RAG project. "Verifier" = small cross-encoder scoring (query, chunk).

---

## 1. CRAG: Corrective Retrieval Augmented Generation
https://arxiv.org/abs/2401.15884 (Yan, Gu, Zhu, Ling; v3 Oct 2024)

**Problem.** RAG feeds retrieved docs to the generator regardless of quality; wrong retrieval misleads it.

**Method.**
- A lightweight retrieval evaluator scores each (question, doc) pair independently. Typically 10 docs per question (Contriever results borrowed from Self-RAG).
- Three actions, decided from per-document scores and two thresholds (upper, lower):
  - **Correct**: at least one doc scores above the upper threshold. Refine docs (decompose-then-recompose).
  - **Incorrect**: all docs score below the lower threshold. Discard; do web search.
  - **Ambiguous**: everything else. Use both: refined internal knowledge + web knowledge.
- Decompose-then-recompose: split each doc into "strips" (a doc of 1-2 sentences is one strip; longer docs are split into units of "a few sentences", exact size not specified in the paper). Score each strip with the same evaluator, drop strips below a filter threshold, keep top-k, concatenate in original order.
- Web path: LLM (GPT-3.5, few-shot prompt, Table 7) rewrites the question into at most 3 keywords ("Extract at most three keywords separated by comma ..."), Google Search API, top-5 URLs, Wikipedia pages preferred, page paragraphs scored by the same evaluator and filtered the same way.

**Concrete details.**
- Evaluator: T5-large (0.77B) fine-tuned. Labels +1 / -1; inference score in [-1, 1].
- Training data: PopQA only (14k questions; 1,399 held out for test, rest used for training). Positives = the passage of the gold Wikipedia subject title ("not 100% relevant but rather high-quality"). Negatives = randomly sampled from the retrieval results for the question. Not hard-negative mined. The same evaluator was transferred as-is to Biography, PubHealth, ARC.
- Thresholds (upper, lower), "set empirically", no tuning procedure described: PopQA (0.59, -0.99); PubHealth and ARC (0.5, -0.91); Biography (0.95, -0.91). Whether they were tuned on test data is not stated.
- Refinement: top-k = 5 strips, filter threshold -0.5. Web: top-k = 5 URLs.
- Generators: LLaMA2-hf-7b and SelfRAG-LLaMA2-7b. Plug-and-play (no generator tuning). Metrics: accuracy (PopQA, PubHealth, ARC), FactScore (Biography).
- Paper says Correct/Incorrect-only preliminary runs were "easily affected by the accuracy of the retrieval evaluator"; Ambiguous mitigates that.

**Results (Table 1; columns PopQA / Bio FactScore / PubHealth / ARC).**
| Generator | System | PopQA | Bio | Pub | ARC |
|---|---|---|---|---|---|
| LLaMA2-hf-7b | RAG | 50.5 | 44.9 | 48.9 | 43.4 |
| | CRAG | 54.9 | 47.7 | 59.5 | 53.7 |
| SelfRAG-LLaMA2-7b | RAG | 52.8 | 59.2 | 39.0 | 53.2 |
| | CRAG | 59.8 | 74.1 | 75.6 | 68.6 |
| | Self-RAG | 54.9 | 81.2 | 72.4 | 67.3 |
| | Self-CRAG | 61.8 | 86.2 | 74.8 | 67.2 |

- Evaluator accuracy for judging retrieval quality on PopQA (Table 4): T5 evaluator 84.3 vs ChatGPT 58.0, ChatGPT-CoT 62.4, ChatGPT-few-shot 64.7.
- Action ablation (Table 2, PopQA acc, LLaMA2-hf / SelfRAG-LLaMA2): CRAG 54.9 / 59.8; w/o Correct 53.2 / 58.3; w/o Incorrect 54.4 / 59.5; w/o Ambiguous 54.0 / 59.0. Ambiguous matters least (about -0.8 to -0.9); modest.
- Operation ablation (Table 3, PopQA): CRAG w/o refinement 49.8 / 54.2; w/o query rewriting 51.7 / 56.2; w/o selection 50.9 / 58.6. Refinement is worth about 5 points.
- Cost (Table 6): RAG 0.363 s/instance, CRAG 0.512 s (about +41%), TFLOPs/token 26.5 vs 27.2.

**Caveats (important for us).**
- The evaluator is trained on one entity-centric dataset (PopQA). Independent reproduction (Section 7, 2603.16169, single author, 9 SHAP samples, small-scale) reports it behaves like an entity-name matcher, and on ARC it labels 88.3% of questions Ambiguous. So thresholds and evaluator do not transfer across domains.
- No abstention path: Incorrect triggers web search, never "I don't know". No faithfulness / hallucination metrics.
- Web search is not available to us; the Incorrect/Ambiguous external-knowledge path must become corpus re-retrieval with a rewritten query. That is an untested variant (the paper's "w/o rewriting" ablation is about web-query keywords, not corpus re-retrieval).

**Adopt.** Three-way decision on max chunk score with two thresholds; refinement by re-scoring sub-units with the verifier then filtering; per-doc independent scoring; Ambiguous = union of both paths; ablate each action (their ablation protocol is a good template).
**Adapt.** Thresholds: calibrate on our own dev set, do not reuse (0.59, -0.99) (those are for a T5 score scale and PopQA). Replace web search with query-rewrite + re-retrieve (single retry).
**Skip.** T5-large (770M, too slow for CPU), PopQA-only training, Google search, keyword-style rewrite prompt (written for web search engines; ours targets BM25+dense so a different rewrite prompt is needed).

---

## 2. Self-RAG
https://arxiv.org/abs/2310.11511 (Asai, Wu, Wang, Sil, Hajishirzi; ICLR 2024)

**Problem.** Always-retrieve RAG hurts when retrieval is unneeded or irrelevant, and outputs are often not grounded.

**Method.** One LM (Llama2 7B/13B) is trained to emit reflection tokens inline with its output:
- `Retrieve` {Yes, No, continue}
- `IsRel` {Relevant, Irrelevant}: is the passage useful for the input
- `IsSup` {Fully supported, Partially supported, No support/Contradictory}: is the segment grounded in the passage
- `IsUse` {1..5}: utility of the whole response
Segment = one sentence. For each segment it processes several retrieved passages in parallel, then picks the best by a segment-level beam search with score = linear weighted sum of normalized reflection-token probabilities.

**Concrete details.**
- Critic training data: GPT-4 labels per token type. Counts (Appendix): 12,594 Retrieve (typo "1,2594" in the PDF), 11,181 IsSup, 19,317 IsRel, 3,831 IsUse. Authors manually checked 20 instances per aspect: agreement with GPT-4 95% (relevance), 95% (retrieval need), 90% (support), 80% (usefulness).
- Critic LM: Llama2-7B, trained with standard LM loss on the labels; ">90% agreement with GPT-4 predictions on most reflection token categories".
- Generator trained on 150k instruction-output pairs (Open-Instruct + knowledge-intensive sets) augmented offline with critic-inserted tokens.
- Inference defaults: weights IsRel 1.0, IsSup 1.0, IsUse 0.5; retrieval threshold 0.2 (0 for ALCE); beam width 2; top-5 docs from Contriever-MS MARCO (up to 10 retrieved).
- Results: Self-RAG 7B PopQA 54.9, Biography FactScore 81.2, PubHealth 72.4, ARC 67.3 (these four values taken from CRAG's Table 1 and consistent with the Self-RAG table; the full Self-RAG table interleaves columns and I did not re-derive ASQA numbers).

**Adopt.**
- The taxonomy: relevance and 3-level support are distinct labels. Use "Fully / Partially / No support" for answer-sentence-to-chunk attribution (citations + faithfulness metric).
- The recipe "strong LLM labels -> small trained critic, validate agreement (>90%) on a hand-checked sample". That is exactly our verifier recipe with gpt-oss-120b as teacher.
- Soft combination of signals through a tunable weighted score and a tunable threshold (we do this for sufficiency).
**Skip.** Fine-tuning a 7B generator with reflection tokens (impossible on our hardware and unnecessary; our generator is a Groq API model). Segment-level beam search over passages (too many LLM calls for a 1000 req/day budget).

---

## 3. Sufficient Context
https://arxiv.org/abs/2411.06037 (Joren, Zhang, Ferng, Juan, Taly, Rashtchian; ICLR 2025)

**Problem.** Are RAG errors due to the model not using context or to the context being insufficient? Relevance does not equal sufficiency.

**Definition.** An instance (Q, C) has sufficient context iff there exists a plausible answer A' to Q given C (no ground-truth answer needed; wrong-but-supported answers count as sufficient). Rules for multi-hop (no inferring unstated links), ambiguous queries (context must disambiguate), ambiguous contexts (must distinguish).

**Autorater.**
- Human-labeled set: 115 instances (PopQA, FreshQA, NQ, EntityQuestions), hard by design.
- Table 1 (F1 / acc / precision / recall; needs GT?):
  - Gemini 1.5 Pro 1-shot: 0.935 / 0.930 / 0.935 / 0.935 (no GT)
  - Gemini 1.5 Pro 0-shot: 0.878 / 0.870 / 0.885 / 0.871
  - FLAMe (fine-tuned PaLM 24B): 0.892 / 0.878 / 0.853 / 0.935
  - TRUE-NLI (fine-tuned T5 11B, needs GT answer): 0.818 / 0.826 / 0.938 / 0.726
  - "Contains GT answer string": 0.810 / 0.809 / 0.870 / 0.758
- Prompt (Appendix C.1, reproducible): role "expert LLM evaluator"; criterion "Sufficient Context: 1 IF the CONTEXT is sufficient to infer the answer ... 0 IF not"; asks first to list step-by-step sub-questions (including implicit assumptions, arithmetic), answer them, then output `### EXPLANATION` then `### JSON {"Sufficient Context": 1}`; one worked example (Roald Dahl / British Railways Board); uses a query timestamp.
- Context longer than 6k tokens gave no change in sufficiency (they truncate at 6000 tokens; FLAMe is applied to 1600-token chunks, sufficient if any chunk is).

**Findings.**
- Datasets: share with sufficient context is far from 100% (Figure 1 caption: 55.4% of Musique instances are insufficient; Figure 2 shows HotpotQA and Musique lower than FreshQA, and lower still at 2k tokens). FreshQA is highest because context is oracle URLs.
- With sufficient context, strong models still hallucinate more often than abstain.
- With insufficient context, models still answer correctly 35-62% of the time (parametric knowledge, yes/no luck, ambiguity clarification, rater error), so hard abstain-on-insufficient loses accuracy.
- RAG reduces abstention: Claude 3.5 Sonnet abstains on 84.1% of questions without RAG vs 52% with; GPT-4o 34.4% -> 31.2%; Gemini 1.5 Pro 100% -> 18.6%.
- Fine-tuning for abstention (changing some answers to "I don't know") did not reliably help: more correct answers in some cases but still hallucinates more than it abstains.

**Selective generation (Section 5.1).** Logistic regression over two features: (a) binary sufficient-context label from the small autorater (FLAMe), (b) model self-rated confidence (P(True): 20 samples x 5 judge queries, Kadavath et al.; or P(Correct) from a prompt giving top-2 answers with probabilities, for proprietary models). 100 iterations of random hyperparameter search. Abstain when the score is below a threshold; threshold sets coverage. Gains: "2-10%" in fraction correct among answered, over 10% for Gemma 27B on HotpotQA at the high-accuracy end, over 5% for Gemini 1.5 Pro near 70% coverage; no gain for Gemma 27B on Musique (overall accuracy 18.4%, the sufficiency coefficient is 0).

**Adopt.**
- The sufficiency definition and a prompt adapted from C.1 as the teacher labeler (gpt-oss-120b) for distilling a small sufficiency head.
- Selective generation = small logistic model over [sufficiency signal, confidence signals, verifier statistics], threshold chosen on a coverage vs selective-accuracy curve. Report the curve, not one point.
- Correct / Abstain / Hallucinate three-way outcome breakdown, stratified by sufficient vs insufficient context.
**Skip.** P(True) with 20 samples x 5 judge calls (far over budget). Use verbalized confidence (one extra field in the answer JSON) or the verifier statistics instead. Gemini/FLAMe themselves.

---

## 4. Context filtering / pruning

### 4a. FILCO
https://arxiv.org/abs/2311.08377 (Wang, Araki, Jiang, Parvez, Neubig)
- **Method.** A generative filter M_ctx reads (query + retrieved passages) and outputs the useful sentences; generator is trained on the filtered context. Sentences from spaCy. Oracle sentence selection (single best span per example) uses three measures:
  - StrInc: sentence contains the gold output string.
  - Lexical: unigram F1 with gold output (with query for fact verification), threshold lambda = 0.5 (0.1/0.3/0.5/0.7/0.9 tried, 0.5 best).
  - CXMI: generator log-likelihood ratio of gold output with vs without the sentence, threshold 0.0 (0.5/1.0/2.0 tried; footnote says 1.0 best, text says lambda = 0.0; the PDF is inconsistent here).
- **Training.** FLAN-T5-XL (3B) and Llama2-7B with LoRA; 3 epochs, lr 5e-5, batch 32, max length 1024, filter output at most 512 tokens, greedy decoding.
- **Best measure per task (Table 4, conflicts between sections 4.2 and 5.1 for WoW/FEVER):** StrInc for NQ/TQA, CXMI for HotpotQA/ELI5, Lexical or CXMI for FEVER/WoW.
- **Results.** Top-1 DPR passage only. Prompt length reduced 44-64%. NQ +4.3 EM (Flan-T5) / +8.6 (Llama2); TQA +1.1 / +0.2; HotpotQA +1.0 / +1.3 F1; FEVER +6.2 / +4.3 accuracy. Passage-level filtering baseline is worse; sentence-level is better. Context precision rises (Table 3), e.g. HotpotQA 2.6 -> 10.8.
- **Adopt.** Sentence is the right granularity; StrInc and Lexical-F1 are free silver labels for sentence-level "answer-bearing" supervision on QA datasets with gold answers. Their threshold ablation is a template.
- **Skip.** Generative (autoregressive) filtering: slow, and the oracle assumes one useful sentence, which breaks multi-hop. CXMI (needs a generator pass per sentence).

### 4b. RECOMP
https://arxiv.org/abs/2310.04408 (Xu, Shi, Choi; ICLR 2024)
- **Extractive compressor.** Contriever-initialized bi-encoder (110M), CLS embeddings, inner product. Positive = sentence maximizing LM log-likelihood of the gold answer when prepended; negatives = up to 5 top-Contriever sentences whose log-likelihood is lower than the positive by a margin epsilon; contrastive loss. Training sentences: top 20 sentences from top-5 retrieved docs, page title prepended to each sentence for decontextualization.
- **Abstractive compressor.** T5-large (775M) distilled from gpt-3.5-turbo summaries; summaries filtered by whether prepending them improves the end task; if no summary helps, the target is the empty string (selective augmentation).
- **Results (Flan-UL2 20B reader, top-5 docs).** NQ EM: full top-5 (660 tokens) 39.39; extractive ours (1 sentence, 37 tokens) 36.57; abstractive ours (36 tokens) 37.04; top-1 doc (132 tokens) 33.07; no retrieval 21.99. TQA EM: 62.37 -> 58.99 / 58.68. HotpotQA EM: 32.80 -> 30.40 (2 sentences, 75 tokens) / 28.20. Abstract claims 5-10% tokens with under 10% relative drop. Extractive oracle (best single sentence) far exceeds full docs (NQ 60.22 EM), showing noise removal can help a lot.
- **Adopt.** Positive/negative construction logic (utility-based labels, margin on negatives, title prepend); "empty output when retrieval is useless" is the same idea as our Incorrect/abstain.
- **Skip.** Bi-encoder scoring (Provence argues, with evidence, that cross-encoding the query with the sentence is better); abstractive compressor (hallucination risk, autoregressive cost).

### 4c. Provence
https://arxiv.org/abs/2501.16214 (Chirkova, Formal, Nikoulina, Clinchant; NAVER Labs; ICLR 2025). Model: https://huggingface.co/naver/provence-reranker-debertav3-v1

**Method.** Context pruning as sequence labeling: a cross-encoder reads [BOS] question + passage and predicts a per-token keep/drop mask (trained with sentence-level targets; "sentence rounding" at inference keeps a sentence if more than 0.5 of its tokens are kept). Optionally unified with reranking: the BOS position outputs a relevance score (second head), so pruning is "almost free" if you rerank anyway.

**Training details.**
- Data: MS MARCO document-ranking train queries (370k) + NQ train (87k) used in ablation; docs split into passages of N consecutive sentences, N random in 1..10; page title prepended. Per question, top-5 from SPLADE-v3 -> DeBERTa-v3 reranker.
- Silver labels: Llama-3-8B-Instruct prompted to answer the question using only the context, cite sentence indices `[i]`, and output "No answer" if nothing useful (prompt in their Table 6); greedy decoding; regex-parse citations; discard cases with neither a citation nor "No answer" (the LLM answered without citing, about 10%).
- Loss: token-level BCE + lambda * MSE between the BOS score and the original reranker's score (pointwise score distillation as regularizer), lambda = 0.05 (smallest value that did not hurt MS MARCO dev reranking). lr 3e-6, batch 48, 1 epoch. Final model starts from a trained DeBERTa-v3-large cross-encoder reranker (430M params), 512-token context.
- Inference: threshold T on token probability; T = 0.1 conservative (no or minimal drop), T = 0.5 more compression; same T works across domains; compression varied 50-80% by dataset.
- Ablations: DeBERTa-large only slightly raises compression vs base (so base-size is fine); full MS MARCO > NQ-only or downsampled MARCO; token-level labeling about equal to sentence-level (slightly better); the "answer with citations" oracle prompt beats a "list relevant info" prompt and is slightly better than a plain "output sentence indexes" prompt; unified and standalone about equal.
- Results: Pareto-front on NQ, TyDi, PopQA, HotpotQA, BioASQ, SyllabusQA, RGB with Llama-2-7B-chat reader (LLM-judge accuracy); at about 50% compression, 2x generation speedup at batch 256 on V100 (1.2-1.4x at batch 1). Extractive RECOMP and DSLR (sentence-by-sentence reranker scoring with a threshold) are the baselines it beats. Pruning cost (50 samples, top-5 docs): standalone Provence 25 s vs RECOMP-extr 12 s, DSLR 26 s, LongLLMLingua 194 s (hardware for that table not stated in the text I read).
- Weakness noted by authors: very first/last sentence positions are missed more often in the needle test.

**License.** HF model card metadata: CC BY-NC-ND 4.0 (card prose says "NonCommercial-ShareAlike"; inconsistent). Fine for use as a baseline; fine-tuning/redistributing a derivative is legally murky, so we reproduce the method instead of fine-tuning their checkpoint. Training code and data are in the BERGEN repo (https://github.com/naver/bergen).

**Follow-up.** XProvence, https://arxiv.org/abs/2601.18886 (Jan 2026): same recipe on BGE-reranker-v2-m3 for multilingual use, model naver/xprovence-reranker-bgem3-v2 (also CC BY-NC-ND). Only abstract and intro read.

**Adopt (core of our design).** One cross-encoder with a relevance head (for CRAG decision) and a per-token/per-sentence keep head (for refinement). Silver sentence labels from an LLM via "answer with citations / No answer" prompt, with the same filtering rule. MSE score-distillation regularizer to keep the reranker head sane. Threshold on kept-probability + sentence rounding.
**Skip.** DeBERTa-large (too slow for CPU); their full 370k-query training run.

---

## 5. Cross-encoder reranker training

- **monoBERT** (Nogueira & Cho, https://arxiv.org/abs/1901.04085): BERT [CLS] over (query, passage), binary relevance, pointwise cross-entropy over relevant and BM25 top-1000 non-relevant passages. MS MARCO dev MRR@10: BERT-Large 36.5 (BM25 18.4 in the monoT5 paper's table). Training data was large (MS MARCO scale); the paper's Fig. 1 shows effectiveness grows with number of training pairs.
- **monoT5** (Nogueira et al., https://arxiv.org/abs/2003.06713): T5 input `Query: q Document: d Relevant:`; trained to emit "true"/"false"; score = softmax over those two logits only (using the raw "true" logit or full-vocab softmax gave near-zero metrics). MS MARCO dev MRR@10: monoBERT-large .372, monoT5-base .363, -large .383, -3B .382 (BM25 .184). lr 1e-3, batch 128, 100k steps, 512 input tokens. Claims T5 is more data-efficient than BERT with 1k-10k training pairs (I read the claim, not the plot). Passage-length handling: sliding window of 10 sentences, stride 5, max passage score for long docs.
- **RankT5** (Zhuang et al., https://arxiv.org/abs/2210.10634): listwise softmax cross-entropy beats pointwise cross-entropy out of domain. Zero-shot BEIR (15 datasets, reranking BM25 top-1000, NDCG@10, RankT5-Enc): PointCE average 0.5024 vs Softmax 0.5241 (about +2.1%, significant, p <= 0.05). Training list size experiments (5-36) show larger lists help.
- **RocketQA** (Qu et al., https://arxiv.org/abs/2010.08191): retrieval-focused, but the training recipe is directly reusable: (1) cross-batch negatives; (2) denoised hard negatives: take top-ranked non-labeled passages from the retriever and drop those a strong cross-encoder rates as likely positive, because annotators label only a few passages, so unlabeled top-ranked passages are often false negatives; (3) the cross-encoder pseudo-labels extra unlabeled queries. I did not extract the exact confidence cutoffs.
- **Margin-MSE distillation** (Hofstatter et al., https://arxiv.org/abs/2010.02666): train a student to reproduce the teacher's score margin between positive and negative of a triple, rather than absolute scores; shown best among the KD losses they ablate, works across architectures, and a single strong cross-encoder teacher (ensemble teachers also tried) suffices.
- **Qwen3-Reranker** (https://arxiv.org/abs/2506.05176; Qwen3 Embedding tech report): decoder-LLM reranker; prompt with instruction/query/document, score = exp(P(yes)) / (exp(P(yes)) + exp(P(no))), trained with SFT on yes/no; sizes 0.6B / 4B / 8B; reranking benchmark table (MTEB-R etc.): 0.6B scores 65.80 on MTEB-R retrieval subsets, 4B 69.76, 8B 69.02. Apache-2.0. 0.6B is about 596M params, probably too slow for 20+ chunks/query on CPU **[inference, not measured]**, but a good GPU-side teacher/baseline.
- **Rank1** (Weller et al., https://arxiv.org/abs/2502.18418, COLM 2025): reasoning reranker distilled from 600k+ DeepSeek-R1 traces on MS MARCO; strong on reasoning/instruction retrieval; reasoning chains are long, so far too slow for per-chunk verification here. Only abstract/intro read.
- **Small off-the-shelf rerankers (HF metadata checked, quality numbers NOT verified from papers):** cross-encoder/ms-marco-MiniLM-L6-v2 (22.7M params, Apache-2.0, 71M downloads), mixedbread-ai/mxbai-rerank-base-v1 (184M, Apache-2.0), BAAI/bge-reranker-v2-m3 (568M, Apache-2.0), Qwen/Qwen3-Reranker-0.6B (596M, Apache-2.0). C-Pack (BGE paper, https://arxiv.org/abs/2309.07597) was fetched but its reranker training details were not found in the text (it covers embeddings; reranker is a release only).

**Adopt.**
- Pointwise yes/no (monoT5/Qwen3 style) or single-logit head for the CRAG score, trained from a pretrained small cross-encoder (not from scratch).
- Hard negatives from our own hybrid retriever, denoised with a stronger scorer (RocketQA); LLM teacher labels for the denoising.
- Margin-MSE or score-MSE distillation from a larger reranker/LLM score for the relevance head; listwise softmax loss over (1 positive + k hard negatives) as the main loss if we train a ranker head (RankT5 shows better OOD generalization on BEIR).
- Off-the-shelf comparison baseline: ms-marco-MiniLM-L6-v2 (fast, CPU-viable) and one larger (bge-reranker-v2-m3 or Qwen3-Reranker-0.6B on the GPU).
**Skip.** T5-3B-scale and reasoning rerankers (cost); training from scratch on MS MARCO scale.

---

## 6. RAG evaluation methodology

### 6a. RAGAS
https://arxiv.org/abs/2309.15217 (Es et al.)
- Reference-free metrics with gpt-3.5-turbo-16k:
  - Faithfulness = |supported statements| / |statements|: (1) LLM decomposes answer into statements (prompt: "create one or more statements from each sentence in the given answer"), (2) LLM verifies each against context with a Yes/No verdict.
  - Answer relevance = mean cosine between the question and n LLM-generated questions inferred from the answer (ada-002 embeddings).
  - Context relevance = (# sentences the LLM extracts as crucial) / (# sentences in context); the extraction prompt allows the output "Insufficient Information".
- Validation: WikiEval, 50 recent Wikipedia questions, pairwise human comparisons, annotator agreement about 95% (faithfulness, context relevance) and 90% (answer relevance). Accuracy vs humans: faithfulness 0.95 (GPT score 0.72, GPT ranking 0.54), answer relevance 0.78 (0.52, 0.40), context relevance 0.70 (0.63, 0.52).
- Weakness: small validation (50 items, constructed pairs), single judge model, "context relevance" is sentence-extraction-ratio and so is a proxy for pruning quality, not retrieval quality. ARES criticizes it as relying on a "fixed set of heuristically hand-written prompts" without guarantees.
- **Adopt.** Claim decomposition + per-claim verification for faithfulness (we can run the per-claim check with a local NLI/our verifier and spot-check with an LLM). **Skip.** Embedding-based answer relevance (weak); using RAGAS context relevance as a retrieval metric.

### 6b. ARES
https://arxiv.org/abs/2311.09476 (Saad-Falcon, Khattab, Potts, Zaharia)
- Pipeline: (1) generate synthetic query/answer pairs from the corpus with FLAN-T5 XXL (few-shot, 5+ in-domain examples) and filter queries that cannot retrieve their source passage; (2) fine-tune three lightweight judges, DeBERTa-v3-Large, for context relevance, answer faithfulness, answer relevance, with a contrastive-style setup and synthetic negatives (negatives for faithfulness/answer relevance = answers sampled from other passages); (3) score systems with prediction-powered inference (PPI) using a human-labeled validation set of at least about 150 datapoints to get confidence intervals.
- Success criterion used: Kendall's tau > 0.9 on system ranking. Their central claims: more accurate than RAGAS, robust to domain shift, needs only hundreds of human labels. I did not extract the exact result tables.
- **Adopt.** Two things: (i) the recipe is nearly identical to how we train our verifier (synthetic positives, negatives from other passages, DeBERTa-v3 judge), so evidence that this works for relevance and faithfulness judging; (ii) report a small human-labeled validation subset (about 100-150 items) and use it to estimate judge error and bootstrap CIs. **Skip.** Full PPI machinery unless time permits.

### 6c. LLM-as-judge pitfalls
https://arxiv.org/abs/2306.05685 (Zheng et al., MT-Bench/Chatbot Arena)
- GPT-4 agreement with humans above 80%, same as human-human.
- Position bias: consistency when swapping answer order: GPT-4 65.0%, GPT-3.5 46.2%, Claude-v1 23.8% (default prompt); biased toward first position in 30.0% / 50.0% / 75.0% of cases.
- Verbosity bias ("repetitive list" attack): failure rate GPT-4 8.7%, Claude-v1 and GPT-3.5 91.3%.
- Self-enhancement: GPT-4 favors itself with 10% higher win rate, Claude-v1 25%; but authors say data is too small to conclude.
- Reasoning limits: judging math, failure 14/20 (default), 6/20 (CoT), 3/20 (reference-guided).
- **Adopt, as hard rules for our judge setup.** Judge model family differs from the generator under test (we have gpt-oss and qwen); give the judge the gold answer / reference (reference-guided); randomize or swap order for any pairwise comparison; pointwise rubric with fixed JSON; temperature 0; cache; validate on a hand-labeled subset.

---

## 7. Newer work (2025-2026)
Read from arXiv PDFs. All are preprints; several are single-author and not peer-reviewed. Treat as hypotheses.

- **Open-source reproduction of CRAG**, https://arxiv.org/abs/2603.16169 (Mar 2026, single author). Phi-3-mini generator + Wikipedia API instead of Google; PopQA long-tail subset (1,385 questions): vanilla RAG 51.4, CRAG 54.4 (original 54.9). Action breakdown on PopQA (Table 3): Correct 754 (54.4%) acc 78.1%; Ambiguous 379 (27.4%) acc 19.3% (23.0% with Wikipedia fallback); Incorrect 252 (18.2%) acc 36.1%. ARC: evaluator calls 88.3% Ambiguous (domain shift). SHAP on 9 samples: evaluator mostly keys on named-entity overlap. Refinement implemented as 3-sentence strips, drop below -0.5, keep top-5. Use: confirms the decision-logic implementation details, and the warning that the CRAG evaluator is domain-fragile; sample is small.
- **GRAB-RAG** ("Prompt-Based Abstention Fails Under Misleading Context"), https://arxiv.org/abs/2608.22228 (Aug 2026, single author). Same questions under four contexts (supportive / degraded / missing / misleading, where the gold answer span in a gold passage is swapped for a plausible wrong span), three small models (3.8B-8B), NQ and HotpotQA. Models abstain when evidence is missing (answer rate at most 3%) but answer 41.6% of misleading cases even with explicit abstention prompts (13.6%-74.3% depending on model/dataset), 63% of them echoing the planted entity; CoT adds little; a generator-side conflict check cuts it to 13.3% but loses many correct answers; an NLI verifier recovers coverage but fails when parametric memory and the misleading passage agree. Takeaway: sufficiency (what Joren et al. measure) is not correctness; a relevance/sufficiency verifier will not catch fluent wrong evidence. The paired-condition design is cheap to copy.
- **DeclineCraft**, https://arxiv.org/abs/2610.28340 (Oct 2026). Abstention benchmark (Minecraft features added after the corpus cutoff), 27 LLMs. Single-shot retrieval raises correct-abstention rate in 38 of 40 configs vs no retrieval; iterative RAG (model self-assesses context, up to two more retrievals) lowers it in 30 of 40 (mean 46.4%) with little accuracy change (68.5 -> 69.3%); adding query rewriting and reranking to hybrid retrieval lowers correct-abstention rate for all 12 models tested. Relevance for us: our rewrite-and-re-retrieve and rerank steps may make abstention worse. Must measure, not assume.
- **XProvence**, https://arxiv.org/abs/2601.18886 (Jan 2026): multilingual Provence; see 4c.
- **SEAL-RAG**, https://arxiv.org/abs/2512.10787 (Dec 2025): training-free "replace, don't expand" controller for multi-hop RAG at fixed k (Search, Extract, Assess, Loop with entity-anchored gap specification); reports +3 to +13 pp over Self-RAG on HotpotQA (k=3) and evidence precision 96% vs 22% for CRAG on 2WikiMultiHopQA (k=5). Own re-implementations of baselines. Relevant idea: when re-retrieving, replace distractors under a fixed context budget rather than append. Abstract + intro only.
- **Conformal factuality control for multi-hop RAG**, https://arxiv.org/abs/2609.38222 (Sep 2026): split-conformal claim filtering; at a 95% target, 95.8-97.2% of responses fully supported (vs 55.6-76.0% unfiltered) but only 4.4-31.1% of claims retained and 9.7-51.4% of responses non-empty. Takeaway: report coverage together with reliability; calibration set needed. Abstract/intro only.
- **PassiveQA** (https://arxiv.org/abs/2604.04565) and **GRACE** (https://arxiv.org/abs/2601.04525): fine-tuning/RL for answer vs abstain (PassiveQA: macro-F1 55.6, abstain recall 13.3 -> 58.1, hallucination 42.7 -> 33.8; GRACE: RL with multi-stage gated reward for evidence sufficiency, extraction, answer or abstain, claims 10% of prior annotation cost). Both train the generator; abstracts only. Skipped (generator is a hosted API), but they support the claim that inference-time prompting alone is weak at abstention.
- Not relevant: RCL (2609.11023, code-generation sufficiency via call graphs), skipped.

---

## 8. What I could not get / did not read
- Not read at all: BEIR paper (Thakur et al.), RankZephyr / RankGPT / InPars / Promptagator (LLM-distilled rerankers), DSLR, COMPACT, Dense-X, LLMLingua family, FLAMe, TRUE-NLI paper, MTEB, RAGTruth/FaithBench-type hallucination benchmarks, ALCE citation metrics paper, jina/mxbai reranker reports.
- Read only abstracts/intros: Rank1, XProvence, SEAL-RAG, conformal factuality, PassiveQA, GRACE, DeclineCraft (abstract + intro), C-Pack (reranker part not found).
- Not extracted: Provence's per-dataset numeric tables (Appendix Tables 8-9), ARES result tables, Self-RAG ablation tables, RocketQA denoising cutoffs, Qwen3-Reranker BEIR-specific numbers.
- WebFetch could not reach arxiv.org (DNS); WebSearch returned only the Google blog for sufficient context. Everything above came from PDFs through the proxy and HF model-card APIs. Statements about CPU latency or Groq budgets are my arithmetic, marked [inference].

---

## 9. Recommended design decisions

### 9.1 Verifier architecture
- **One cross-encoder, three heads**, shared encoder: DeBERTa-v3-base (or ELECTRA-base / MiniLM-L12 as the fast variant) initialized from an existing ms-marco-style reranker checkpoint if licensing allows (ms-marco-MiniLM-L6-v2 and mxbai-rerank-base-v1 are Apache-2.0). Input: `[CLS] query [SEP] title + chunk [SEP]`, 512 tokens max.
  1. **Relevance head** (scalar at CLS): drives the CRAG decision. Loss = BCE on labels + listwise softmax CE over (1 pos + k hard negs) (RankT5) + small MSE to a teacher score (Provence lambda about 0.05 / Margin-MSE).
  2. **Sentence-keep head** (per-token sigmoid, pooled to sentences): Provence-style. Replaces CRAG's strip-by-strip re-scoring (CRAG needs one forward pass per strip; this needs one per chunk).
  3. **Answerability/sufficiency head** over (query, the refined context concatenated, truncated): small classifier trained on teacher sufficiency labels. Can be a separate small pass (the context is the concatenation of kept sentences, so it is a second input, not the same pass).
- **Why base, not large:** Provence's own ablation shows large only slightly improves compression over base; CPU has 4 cores. Train on the RTX 5060 (8 GB) in bf16 with gradient accumulation; inference on CPU. [Inference] 20 chunks x 512 tokens per query on 4 cores for a base model is roughly seconds, so measure it early and keep a MiniLM-sized fallback; ONNX/int8 is an option.
- **Training data (three layers, cheap to expensive):**
  1. Public: MS MARCO + NQ (+ HotpotQA, SQuAD-like, PopQA) positives from gold; negatives from OUR hybrid retriever top-k (BM25 + dense) excluding positives; denoise negatives with a strong reranker/LLM (RocketQA) to avoid false negatives. Add easy random negatives (CRAG used only random ones).
  2. Silver sentence labels with zero API cost where an answer string exists: StrInc and lexical-F1 (FILCO). Evaluate their label noise on 100 hand-checked chunks.
  3. LLM labels via Groq: Provence's "answer with citations, or output No answer" prompt on (question, chunk) -> sentence labels + relevance label; the sufficiency prompt (Joren C.1, adapted) for sufficiency labels on (question, top-k refined context). Use gpt-oss-120b as teacher; check agreement on about 100 hand-labeled items (target above 90% like Self-RAG's critic).
  4. Counterfactual hard negatives (GRAB-RAG-style entity-swapped passages, and topically-similar-but-answerless passages) so the verifier is not just an entity matcher (the CRAG reproduction found exactly that failure).
- **Budget arithmetic [inference]:** 1000 requests/day, 8000 tokens/min. One request that labels one query with 5 chunks (about 1.5-2k tokens) ties you to about 4-5 requests/min by the token limit, so about 200-250 min for 1000 requests. Plan about 1-3k labeled queries over a few days, batched (several chunks per request), cached to disk. Mix with the free labels above; do not rely on LLM labels for volume.
- Avoid test leakage: split queries (not chunks) train/dev/test; BEIR test queries never used for training; keep PopQA-style entity overlap in mind.

### 9.2 Decision logic (CRAG-style)
- Chunk score s_i = calibrated P(relevant) (Platt/isotonic on dev), so thresholds mean something and transfer better than raw logits.
- Per query: `Correct` if max_i s_i >= tau_hi; `Incorrect` if max_i s_i < tau_lo; else `Ambiguous`. This is exactly CRAG's definition (at least one above upper; all below lower).
- Choose tau_hi / tau_lo on the dev set: tau_hi where precision of chunks above it is at least about 0.8-0.9 (or maximizing answer F1 downstream); tau_lo where recall of "has at least one relevant chunk" among queries above it is at least 0.95. Report the grid, not one number. Do NOT reuse (0.59, -0.99).
- Actions:
  - Correct: keep chunks >= tau_hi (plus neighbors), refine (9.3), answer.
  - Incorrect: rewrite query (one LLM call, gpt-oss-20b), re-retrieve (hybrid), re-verify, then continue as Correct/Ambiguous on the new pool. Max one retry (latency, Groq budget).
  - Ambiguous: refine the above-threshold chunks AND run rewrite+re-retrieve; verify; union, dedupe, rank by score. (Mirrors CRAG; their ablation: removing Ambiguous costs about 0.8-0.9 PopQA points, small; so also test single-threshold variant and report honestly.)
- After the retry, if still Incorrect: go straight to abstain (skip generation) or answer-with-low-confidence flag; make this a tunable policy and report both.
- Ablations to run: no verifier; off-the-shelf reranker top-k; verifier relevance-only (no refinement); +refinement; +rewrite loop; +sufficiency/abstain; single vs two thresholds; rewrite loop off. DeclineCraft warns rewrite/rerank may reduce correct abstention; measure abstention on every ablation.

### 9.3 Refinement
- Sentence-level (not strip-level): split chunk with a robust sentence splitter (nltk punkt as Provence; spaCy as FILCO), prepend chunk title to each kept sentence group (RECOMP/Provence "always select title" trick for decontextualization).
- Keep sentences with keep-prob >= T_keep, T_keep = 0.1 conservative start (Provence recommendation); sweep {0.1, 0.3, 0.5} on dev, report accuracy vs context-token compression (Pareto, as Provence). Sentence rounding (0.5 of tokens). Keep original order. Hard cap total refined context (e.g. top-5 sentence groups) to bound Groq TPM.
- If the keep-head selects zero sentences in all chunks: treat as Incorrect, not as empty context.
- Compare against: CRAG strip scoring with the relevance head (3-sentence strips, drop below threshold), and RECOMP-style top-1/top-2 sentence extractive baseline.

### 9.4 Sufficiency / abstention
- Teacher: gpt-oss-120b with the adapted Joren prompt (Appendix C.1) on (query, refined context); validate on a hand-labeled set of about 100-150 (their rater: 93% accuracy on 115 hard items).
- Student: the sufficiency head (small, distilled); also keep a cheap variant: logistic regression over verifier statistics (max score, top-3 mean, count of kept sentences, retrieval agreement BM25 vs dense).
- Final abstain score = logistic regression over [sufficiency prob, verifier stats, verbalized confidence from the answer JSON], threshold tuned on a coverage vs selective-accuracy curve (Joren Section 5.1). Hard "abstain if insufficient" is only one point on that curve and loses correct answers (35-62% correct with insufficient context in their data).
- Generator prompt must also allow "insufficient information" (RAG suppresses abstention per Joren; prompts alone are weak per GRAB-RAG), and the answer JSON should include citations (chunk/sentence ids) + confidence.
- Post-hoc support check on the answer: per-claim support against cited sentences using the verifier or an NLI model (Self-RAG IsSup idea, RAGAS faithfulness), flag unsupported claims.
- Acknowledge limitation up front: sufficiency does not catch fluent misleading evidence (GRAB-RAG); test with a misleading-context slice.

### 9.5 Evaluation protocol
- **Retrieval (BEIR):** pick 4-5 small BEIR sets so CPU reranking is feasible, e.g. SciFact, NFCorpus, FiQA, ArguAna, SCIDOCS (sizes from memory, check before committing **[unverified]**). Metrics: nDCG@10, Recall@100/@20 (stage-1), MRR; compare BM25, dense, hybrid, hybrid + off-the-shelf reranker (MiniLM-L6 and one bigger), hybrid + our verifier. Rerank top-50 rather than 1000 (CPU) and say so. RankT5 and CRAG-style "domain transfer" are the story: test OOD vs in-domain training.
- **End-to-end QA:** NQ/HotpotQA/PopQA subset (500-1000 questions; Groq 1000 req/day is the binding constraint: one eval run is roughly questions x calls/question per system, so 500 questions x 5 systems x (answer 1 + rewrite about 0.3) is about 3,250 requests = 3-4 days; plan caching and fixed seeds). Include (GRAB-RAG-style) paired slices from the same questions: supportive, missing (gold removed), misleading (entity-swapped) to measure abstention properly, plus unanswerable questions.
- **Metrics:** accuracy (containment/EM/F1 deterministic first, LLM judge only for the residual); Correct / Abstain / Hallucinate three-way rates split by sufficient vs insufficient context (Joren); selective accuracy at fixed coverage and area under the coverage-accuracy curve; abstention precision/recall on unanswerable slice; faithfulness = fraction of answer claims supported by cited context (RAGAS claim decomposition, verified by local NLI / verifier, LLM judge on a subset); hallucination = answered and (wrong or unsupported); context precision of refined context and tokens passed to the LLM; latency per stage (retrieve, verify, refine, rewrite, LLM) on CPU, p50/p95; Groq requests per query.
- **Judge hygiene (Zheng et al.):** judge from a different family than the generator; reference-guided; fixed rubric JSON, temperature 0; swap order in any pairwise comparisons; hand-label 100-150 items, report judge-human agreement, and use it for CIs (ARES/PPI idea, at minimum a bootstrap); report LLM judge and deterministic metric side by side.
- Statistics: paired bootstrap over questions (10k resamples), report CIs; at 500 questions, differences below about 3-4 points in accuracy will be noisy **[inference]**; multiple seeds for the verifier training (at least 3, cheap).

---

## 10. Where our project can add something
1. **A single small verifier that does relevance scoring, sentence pruning, and sufficiency in one CPU-deployable model.** CRAG has a separate heavy T5-large relevance model with no pruning head and no abstention; Provence has relevance + pruning but no sufficiency; Joren et al. use giant external autoraters. A measured latency/quality comparison (CPU, p50/p95) of the combined design against no-verifier and an off-the-shelf reranker is not in any paper I read.
2. **Cross-domain behavior of a CRAG-style evaluator, measured properly.** CRAG trains on PopQA only; the only independent evidence we found (single-author, 9 SHAP samples) says it is an entity matcher and collapses to "Ambiguous" on ARC. Training on diverse, hard-negative-mined, LLM-denoised data and testing on BEIR domains plus QA gives a real answer to "does the CRAG decision logic survive a domain shift".
3. **Calibrated threshold selection with explicit risk-coverage reporting** instead of hand-set thresholds (CRAG: "set empirically", no procedure), including sensitivity of the three-way action split to the thresholds.
4. **Replace web search with corpus re-retrieval** and quantify when the Incorrect/Ambiguous paths help versus hurt. DeclineCraft suggests rewriting/reranking can lower correct abstention; nobody has combined that finding with a CRAG-type decision rule.
5. **Distilling sufficiency into a local head under a 1000 req/day budget.** Teacher labels (gpt-oss-120b, Joren prompt) are rationed, so label-efficiency (how many LLM labels are needed to match the teacher) is a small, concrete study.
6. **End-to-end abstention accounting for a verifier pipeline.** CRAG reports no abstention/faithfulness; Joren evaluates generators, not pipelines with a verifier. A paired supportive / missing / misleading evaluation (GRAB-RAG design) with Correct/Abstain/Hallucinate rates per ablation is new for this combination.
7. **Stretch:** counterfactual/entity-swapped hard negatives in verifier training, to test whether a trained verifier narrows the misleading-evidence gap that prompt-based abstention and NLI verifiers leave open (GRAB-RAG).

---

## 11. Quick reference: numbers to remember
- CRAG thresholds: PopQA (0.59, -0.99); Pub/ARC (0.5, -0.91); Bio (0.95, -0.91); strip filter -0.5, top-5 strips; evaluator T5-large 0.77B; evaluator vs ChatGPT on retrieval-quality judgment 84.3 vs 58.0-64.7; +41% latency (0.512 vs 0.363 s).
- Self-RAG: weights 1.0 / 1.0 / 0.5 for IsRel / IsSup / IsUse; retrieval threshold 0.2; critic agreement with GPT-4 above 90%.
- Joren: autorater 93.0% accuracy (Gemini 1.5 Pro 1-shot); FLAMe 87.8%; 35-62% correct with insufficient context; selective generation gain 2-10%.
- Provence: T = 0.1 (conservative) / 0.5 (aggressive); lambda 0.05; lr 3e-6, batch 48, 1 epoch; DeBERTa-v3-large 430M; compression 50-80%; about 2x generation speed-up at batch 256 on V100.
- FILCO: lexical threshold 0.5, CXMI threshold 0.0; 44-64% prompt reduction.
- RECOMP: 5-10% tokens, under 10% relative drop on QA (NQ 39.39 -> 36.57 EM with one extractive sentence).
- Judge biases: GPT-4 position consistency 65.0%; verbosity attack failure 8.7% (GPT-4) vs 91.3% (GPT-3.5, Claude-v1).
