"""Tune the verified pipeline's calibration and thresholds on the HotpotQA dev questions.

Stages (all resumable; verifier scores are cached under data/tuning/<name>/):

    collect    retrieve under the supportive and missing slices, score every retrieved passage
               and every sentence of it with the verifier, label them against the gold
    calibrate  Platt scaling per level (passage, sentence); Brier and ECE before / after
    decide     tau_hi / tau_lo grid on the max passage probability, arm G's single threshold
    keep       tau_keep sweep on the supportive slice, over the chunks the pipeline would keep
    write      results/tuning/<name>.md (+ .json), configs/tuned.toml
    sanity     ``prepare()`` of arm F with the tuned values on a few dev questions x 3 slices

Only dev questions are used: the test questions are filtered out right after loading.
Scores are computed with the pipeline's own code (retriever, ``_make_chunks``, ``doc_text``,
``sentence_text``, ``decide``, ``_select``, ``refine``) so they match what ``prepare`` sees.
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path

import numpy as np
from demo_trace import load_indexes

from vrag.config import REPO_ROOT, PipelineConfig, get_config, load_config
from vrag.data.beir import doc_text
from vrag.data.hotpot import HotpotData, load_hotpot
from vrag.data.slices import build_slices
from vrag.llm import LLMClient
from vrag.pipeline.calibrate import PlattCalibrator, brier_score, expected_calibration_error
from vrag.pipeline.decide import decide
from vrag.pipeline.pipeline import VerifiedRAG, hotpot_lookup, make_arm
from vrag.pipeline.refine import kept, refine
from vrag.pipeline.sufficiency import NullSufficiency
from vrag.verifier.offshelf import CrossEncoderVerifier
from vrag.verifier.train_data import sentence_text

SLICES = ("supportive", "missing")
TAU_HI = [round(0.5 + 0.05 * i, 2) for i in range(10)]  # 0.50 .. 0.95
TAU_LO = [round(0.05 + 0.05 * i, 2) for i in range(10)]  # 0.05 .. 0.50
TAU_SINGLE = [round(0.05 + 0.05 * i, 2) for i in range(19)]  # 0.05 .. 0.95
TAU_KEEP = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]
MIN_PRECISION = 0.90
MAX_SUPPORTIVE_INCORRECT = 0.05
MIN_RECALL = 0.90
UNCAPPED = 10**6


# ------------------------------------------------------------------------------ collect


class _NoVerifier:
    """Stands in for the verifier when only the pipeline's selection / refine code runs."""

    def score(self, query: str, passages: list[str]) -> np.ndarray:
        raise RuntimeError("scores must come from the cache")


def make_rag(retriever, data: HotpotData, pcfg: PipelineConfig, verifier, **arm) -> VerifiedRAG:
    return VerifiedRAG(
        retriever,
        verifier,
        None,
        None,
        None,
        hotpot_lookup(data.pool),
        make_arm("F", pcfg, rewrite=False, **arm),
    )


def collect(args, cfg, data, dev, slices, rag, verifier) -> list[dict]:
    """One record per (question, slice); appended to a jsonl cache as it goes."""
    out_dir = cfg.paths.data_dir / "tuning" / args.name
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {"model": str(args.model), "retrieve_k": cfg.pipeline.retrieve_k, "n_dev": len(dev)}
    meta_path = out_dir / "meta.json"
    cache = out_dir / "scores.jsonl"
    if meta_path.exists() and json.loads(meta_path.read_text()) != meta:
        raise SystemExit(f"{meta_path} differs from {meta}; delete {out_dir} to re-collect")
    meta_path.write_text(json.dumps(meta, indent=2))

    records = {}
    if cache.exists():
        for line in cache.read_text().splitlines():
            r = json.loads(line)
            records[(r["qid"], r["slice"])] = r
    todo = [(q, k) for q in dev for k in SLICES if (q.id, k) not in records]
    print(f"collect: {len(records)} cached, {len(todo)} to score", flush=True)
    with cache.open("a") as f:
        for n, (q, kind) in enumerate(todo, start=1):
            sl = slices[q.id][kind]
            exclude = set(sl.exclude_ids) or None
            hits = rag.retriever.search(q.question, cfg.pipeline.retrieve_k, exclude)
            chunks = rag._make_chunks(hits, sl, 0)
            passages = [doc_text({"title": c.title, "text": c.text}) for c in chunks]
            logits = verifier.score(q.question, passages)
            pending = [
                (ci, i, sentence_text(c.title, s))
                for ci, c in enumerate(chunks)
                for i, s in enumerate(c.sentences)
                if s.strip()
            ]
            s_logits = verifier.score(q.question, [t for _, _, t in pending])
            facts = set(q.supporting_facts)
            rec = {
                "qid": q.id,
                "slice": kind,
                "chunks": [
                    {
                        "id": c.id,
                        "score": c.retrieval_score,
                        "label": int(c.id in q.gold_ids),
                        "logit": float(lg),
                        "sent": [],
                    }
                    for c, lg in zip(chunks, logits, strict=True)
                ],
            }
            for (ci, i, _), lg in zip(pending, s_logits, strict=True):
                label = int((chunks[ci].title, i) in facts)
                rec["chunks"][ci]["sent"].append([i, label, float(lg)])
            records[(q.id, kind)] = rec
            f.write(json.dumps(rec) + "\n")
            f.flush()
            if n % 20 == 0:
                print(f"  scored {n}/{len(todo)}", flush=True)
    return [records[(q.id, k)] for q in dev for k in SLICES]


# ---------------------------------------------------------------------------- calibrate


def calib_stats(probs, labels) -> dict:
    return {
        "brier": brier_score(probs, labels),
        "ece": expected_calibration_error(probs, labels, 10),
    }


def fit_level(records: list[dict], level: str, keep: dict | None = None) -> dict:
    """Platt fit on one level with a question-grouped 5-fold CV.

    ``keep`` maps (qid, slice) to the chunk ids whose items count; None keeps every candidate.
    """
    qids = sorted({r["qid"] for r in records})
    fold = {q: n % 5 for n, q in enumerate(qids)}
    x, y, f = [], [], []
    for r in records:
        for c in r["chunks"]:
            if keep is not None and c["id"] not in keep[(r["qid"], r["slice"])]:
                continue
            items = (
                [(c["label"], c["logit"])]
                if level == "passage"
                else [(label, logit) for _, label, logit in c["sent"]]
            )
            for label, logit in items:
                x.append(logit), y.append(label), f.append(fold[r["qid"]])
    x, y, f = np.array(x), np.array(y), np.array(f)
    cal = PlattCalibrator.fit(x, y)
    oof = np.empty(len(x))
    for k in range(5):
        m = f == k
        oof[m] = PlattCalibrator.fit(x[~m], y[~m])(x[m])
    return {
        "n": len(x),
        "positives": int(y.sum()),
        "calibrator": cal,
        "before": calib_stats(PlattCalibrator()(x), y),
        "after": calib_stats(cal(x), y),
        "after_cv": calib_stats(oof, y),
    }


# ------------------------------------------------------------------------------- decide


def max_probs(records: list[dict], cal: PlattCalibrator) -> dict[str, list[tuple[float, bool]]]:
    """Per slice and question: (max calibrated passage prob, candidates hold a gold paragraph)."""
    out: dict[str, list[tuple[float, bool]]] = {k: [] for k in SLICES}
    for r in records:
        probs = cal([c["logit"] for c in r["chunks"]])
        has_gold = any(c["label"] for c in r["chunks"])
        out[r["slice"]].append((float(max(probs, default=0.0)), has_gold))
    return out


def label_share(items, tau_hi, tau_lo) -> dict[str, float]:
    labels = [decide([p], tau_hi, tau_lo) for p, _ in items]
    return {k: labels.count(k) / len(labels) for k in ("correct", "ambiguous", "incorrect")}


def precision_correct(tops: dict, tau_hi: float) -> float:
    hits = [
        g for items in tops.values() for p, g in items if decide([p], tau_hi, tau_hi) == "correct"
    ]
    return sum(hits) / len(hits) if hits else math.nan


def decide_grid(tops: dict) -> dict:
    grid = []
    for hi in TAU_HI:
        for lo in TAU_LO:
            if lo >= hi:
                continue
            grid.append(
                {
                    "tau_hi": hi,
                    "tau_lo": lo,
                    "supportive": label_share(tops["supportive"], hi, lo),
                    "missing": label_share(tops["missing"], hi, lo),
                    "precision_correct": precision_correct(tops, hi),
                }
            )
    single = []
    for t in TAU_SINGLE:
        single.append(
            {
                "tau": t,
                "supportive_correct": label_share(tops["supportive"], t, t)["correct"],
                "missing_correct": label_share(tops["missing"], t, t)["correct"],
                "precision_correct": precision_correct(tops, t),
            }
        )
    return {"pairs": grid, "single": single}


def select_thresholds(grid: dict) -> dict:
    """The rule: smallest tau_hi with precision >= 0.90, largest tau_lo with <= 5% supportive
    incorrect. The best-trade-off fallbacks apply only when the grid has no such value."""
    notes = []
    prec = {p["tau_hi"]: p["precision_correct"] for p in grid["pairs"]}
    ok_hi = [t for t, v in sorted(prec.items()) if v >= MIN_PRECISION]
    if ok_hi:
        tau_hi = ok_hi[0]
    else:
        tau_hi = max(prec, key=lambda t: (-1 if math.isnan(prec[t]) else prec[t], -t))
        notes.append(f"no tau_hi reaches precision {MIN_PRECISION}; took the most precise")
    inc = {p["tau_lo"]: p["supportive"]["incorrect"] for p in grid["pairs"]}
    ok_lo = [t for t, v in sorted(inc.items()) if v <= MAX_SUPPORTIVE_INCORRECT and t < tau_hi]
    if ok_lo:
        tau_lo = ok_lo[-1]
    else:
        tau_lo = min(t for t in inc if t < tau_hi)
        notes.append("no tau_lo keeps supportive-incorrect <= 5%; took the smallest")
    ok_single = [
        s["tau"] for s in grid["single"] if 1 - s["supportive_correct"] <= MAX_SUPPORTIVE_INCORRECT
    ]
    tau_single = ok_single[-1] if ok_single else grid["single"][0]["tau"]
    if not ok_single:
        notes.append("no single tau keeps supportive-incorrect <= 5%; took the smallest")
    return {"tau_hi": tau_hi, "tau_lo": tau_lo, "tau_single": tau_single, "notes": notes}


# --------------------------------------------------------------------------------- keep


def select_chunks(records, rag, cal_p) -> dict[tuple[str, str], list]:
    """The chunks the pipeline hands to refinement, per (question, slice), via ``_select``."""
    out = {}
    for r in records:
        chunks = rag._make_chunks([(c["id"], c["score"]) for c in r["chunks"]], None, 0)
        for chunk, c in zip(chunks, r["chunks"], strict=True):
            chunk.verifier_logit = c["logit"]
            chunk.prob = float(cal_p([c["logit"]])[0])
        out[(r["qid"], r["slice"])] = rag._select(chunks)
    return out


def fact_ceilings(records, selected, sup_qs, pool) -> dict:
    """Share of supporting facts that sit in the retrieved / top-5 by logit / selected chunks."""
    by_q = {r["qid"]: r for r in records if r["slice"] == "supportive"}
    got = {"retrieved": 0, "top5_unfiltered": 0, "selected": 0}
    all_sel = 0
    total = 0
    for q in sup_qs:
        r = by_q[q.id]
        facts = set(q.supporting_facts)
        ids = [c["id"] for c in r["chunks"]]
        top5 = [c["id"] for c in sorted(r["chunks"], key=lambda c: -c["logit"])[:5]]
        sel = {c.id: c for c in selected[(q.id, "supportive")]}
        titles = {pid: pool[pid].title for pid in ids}
        total += len(facts)
        for name, pids in (("retrieved", ids), ("top5_unfiltered", top5), ("selected", list(sel))):
            n = {(titles[pid], i) for pid in pids for i in range(len(pool[pid].sentences))}
            got[name] += len(facts & n)
            if name == "selected":
                all_sel += facts <= n
    return {**{k: v / total for k, v in got.items()}, "all_facts_selected": all_sel / len(sup_qs)}


def keep_sweep(records, selected, cal_s, sup_qs, max_sentences) -> list[dict]:
    """tau_keep curve on the supportive slice, over the chunks chosen by the pipeline.

    Recall counts the supporting facts that sit in those chunks (what refinement can still
    lose); the share of facts that selection already lost is in ``fact_ceilings``.
    """
    by_q = {r["qid"]: r for r in records if r["slice"] == "supportive"}
    prepared = []
    for q in sup_qs:
        r = by_q[q.id]
        memo = {
            (c["id"], i): float(cal_s([logit])[0]) for c in r["chunks"] for i, _, logit in c["sent"]
        }
        prepared.append((q, selected[(q.id, "supportive")], memo))
    rows = []
    for tau in TAU_KEEP:
        row = {"tau_keep": tau}
        for tag, cap in (("uncapped", UNCAPPED), ("capped", max_sentences)):
            total = got = n_kept = all_kept = all_kept_in_sel = 0
            for q, sel, memo in prepared:
                scores = refine(q.question, sel, _NoVerifier(), lambda x: x, tau, cap, memo)
                titles = {c.id: c.title for c in sel}
                facts = set(q.supporting_facts)
                in_sel = facts & {(c.title, i) for c in sel for i in range(len(c.sentences))}
                found = {(titles[s.chunk_id], s.index) for s in kept(scores)} & facts
                total += len(in_sel)
                got += len(found)
                n_kept += len(kept(scores))
                all_kept += found == facts
                all_kept_in_sel += found == in_sel
            row[tag] = {
                "recall": got / total,
                "avg_kept": n_kept / len(prepared),
                "all_facts_kept": all_kept / len(prepared),
                "all_selected_facts_kept": all_kept_in_sel / len(prepared),
            }
        rows.append(row)
    return rows


def select_keep(rows: list[dict]) -> tuple[float, str]:
    ok = [r["tau_keep"] for r in rows if r["capped"]["recall"] >= MIN_RECALL]
    if ok:
        return ok[-1], ""
    best = max(rows, key=lambda r: (r["capped"]["recall"], -r["tau_keep"]))
    return best["tau_keep"], f"no tau_keep reaches recall {MIN_RECALL}; took the best recall"


# ------------------------------------------------------------------------------- sanity


def sanity(args, cfg, data, dev, slices, retriever, n: int) -> list[dict]:
    """``prepare`` (arm F, no sufficiency model, no generation) on n dev questions x 3 slices."""
    v = cfg.verifier
    verifier = CrossEncoderVerifier(str(v.model))
    llm = LLMClient()
    questions = [q for q in dev if len(slices[q.id]) == 3][:n]
    rows = []
    for rewrite in (True, False):
        rows = []
        rag = VerifiedRAG(
            retriever,
            verifier,
            PlattCalibrator.load(v.calibration_passage),
            NullSufficiency(),
            llm,
            hotpot_lookup(data.pool),
            make_arm("F", cfg.pipeline, rewrite=rewrite),
            sentence_calibrator=PlattCalibrator.load(v.calibration_sentence),
            rewrite_model=cfg.llm.rewrite_model,
        )
        for q in questions:
            for kind in ("supportive", "missing", "misleading"):
                t = rag.prepare(q.question, slices[q.id][kind], qid=q.id)
                refs = set(t.context_refs)
                titles = {c.id: c.title for c in t.chunks}
                got = {(titles[cid], i) for cid, i in refs if i is not None}
                facts = set(q.supporting_facts)
                rows.append(
                    {
                        "qid": q.id,
                        "question": q.question,
                        "slice": kind,
                        "rewrite": rewrite,
                        "decision": t.decision,
                        "final_decision": t.final_decision,
                        "kept_lines": len(t.context),
                        "gold_paragraphs_in_context": len(
                            {cid for cid, _ in refs} & set(q.gold_ids)
                        ),
                        "n_gold_paragraphs": len(q.gold_ids),
                        "facts_in_context": len(got & facts),
                        "n_facts": len(facts),
                        "notes": t.notes,
                        "queries": t.queries,
                    }
                )
        failed = any(any(s.startswith("rewrite_failed") for s in r["notes"]) for r in rows)
        if not rewrite or not failed:
            break
        print("rewrite hit its quota: rerunning the sanity check with rewrite=False", flush=True)
    return rows


# ------------------------------------------------------------------------------- output


def pct(x: float) -> str:
    return "n/a" if math.isnan(x) else f"{100 * x:.1f}"


def render(name, cal, grid, chosen, keep_rows, ceilings, tau_keep, keep_note, sanity_rows, ctx):
    L = []
    w = L.append
    w(f"# Verifier tuning on HotpotQA dev: {name}\n")
    w(
        f"Generated by `scripts/tune_dev.py`. {ctx['n_dev']} dev questions, "
        f"retrieval top-{ctx['k']} "
        "(hybrid), slices supportive and missing. Only dev questions are used. Thresholds are "
        "applied to Platt-calibrated probabilities fitted on the same candidates (in-sample; "
        "5-fold question-grouped CV in the last column of the first table).\n"
    )
    w("## Calibration (Platt, supportive + missing)\n")
    w(
        "| level | n | positives | Brier before | Brier after | ECE before | ECE after "
        "| ECE after (CV) |"
    )
    w("|---|---|---|---|---|---|---|---|")
    names = {
        "passage": "passage (all retrieved)",
        "sentence": "sentence (selected chunks, used)",
        "sentence_all": "sentence (all retrieved chunks)",
    }
    for level, c in cal.items():
        w(
            f"| {names[level]} | {c['n']} | {c['positives']} | {c['before']['brier']:.4f} | "
            f"{c['after']['brier']:.4f} | {c['before']['ece']:.4f} | {c['after']['ece']:.4f} | "
            f"{c['after_cv']['ece']:.4f} |"
        )
    w(
        "\n'Before' is sigmoid(raw logit). 10 equal-width bins. Fitted maps: "
        + "; ".join(
            f"{names[lv]} p = sigmoid({c['calibrator'].a:.3f} * logit + {c['calibrator'].b:.3f})"
            for lv, c in cal.items()
        )
        + ".\n\nThe sentence calibrator is fitted on the sentences of the chunks the pipeline "
        "selects (top-5 with prob >= tau_lo), because refinement only ever scores those; the "
        "base rate of supporting facts there is much higher than among all 20 retrieved "
        "chunks, and the all-retrieved fit (shown for comparison, not saved) would put every "
        "sentence far too low for the keep threshold.\n"
    )

    w("## Decision thresholds\n")
    w(
        "Decision on the max calibrated passage probability of the question's candidates. "
        "'Correct' depends only on tau_hi and 'incorrect' only on tau_lo, so the 100-pair grid "
        "factorises; the full grid (with ambiguous shares) is in the JSON. Precision of "
        "'correct' = share of correct-labelled questions (both slices pooled) with at least one "
        "gold paragraph among the candidates.\n"
    )
    w("| tau_hi | supportive correct % | missing correct % | precision(correct) % |")
    w("|---|---|---|---|")
    seen = {}
    for p in grid["pairs"]:
        seen.setdefault(p["tau_hi"], p)
    for hi, p in seen.items():
        mark = " **<- chosen**" if hi == chosen["tau_hi"] else ""
        w(
            f"| {hi:.2f} | {pct(p['supportive']['correct'])} | {pct(p['missing']['correct'])} | "
            f"{pct(p['precision_correct'])}{mark} |"
        )
    w("\n| tau_lo | supportive incorrect % | missing incorrect % |")
    w("|---|---|---|")
    seen = {}
    for p in grid["pairs"]:
        if p["tau_hi"] == TAU_HI[-1]:
            seen[p["tau_lo"]] = p
    for lo, p in seen.items():
        mark = " **<- chosen**" if lo == chosen["tau_lo"] else ""
        w(
            f"| {lo:.2f} | {pct(p['supportive']['incorrect'])}{mark} | "
            f"{pct(p['missing']['incorrect'])} |"
        )
    pair = next(
        p
        for p in grid["pairs"]
        if p["tau_hi"] == chosen["tau_hi"] and p["tau_lo"] == chosen["tau_lo"]
    )
    w(f"\nChosen pair (tau_hi {chosen['tau_hi']}, tau_lo {chosen['tau_lo']}):\n")
    w("| slice | correct % | ambiguous % | incorrect % |")
    w("|---|---|---|---|")
    for k in SLICES:
        s = pair[k]
        w(f"| {k} | {pct(s['correct'])} | {pct(s['ambiguous'])} | {pct(s['incorrect'])} |")
    w(f"\nprecision(correct) = {pct(pair['precision_correct'])} %.\n")
    w("**Selection rule.** tau_hi = smallest grid value with precision(correct) >= 0.90; ")
    w("tau_lo = largest grid value (below tau_hi) with <= 5% of supportive questions incorrect. ")
    w("Single threshold (arm G): the largest tau with <= 5% supportive questions incorrect.\n")
    for note in chosen["notes"]:
        w(f"- NOTE: {note}")
    w("\n| single tau | supportive correct % | missing correct % | precision(correct) % |")
    w("|---|---|---|---|")
    for s in grid["single"]:
        mark = " **<- chosen**" if s["tau"] == chosen["tau_single"] else ""
        w(
            f"| {s['tau']:.2f} | {pct(s['supportive_correct'])} | {pct(s['missing_correct'])} | "
            f"{pct(s['precision_correct'])}{mark} |"
        )

    w("\n## Sentence keep threshold (supportive slice)\n")
    w(
        f"Over the chunks the pipeline keeps (top {ctx['top_k_context']} with prob >= tau_lo = "
        f"{chosen['tau_lo']}). Recall = supporting facts kept / supporting facts inside those "
        f"chunks. 'Capped' applies max_sentences = {ctx['max_sentences']} as the pipeline does; "
        "the rule uses the capped columns. 'All facts kept' needs every supporting fact of the "
        "question (also those outside the selected chunks); 'all selected facts kept' only "
        "those inside.\n"
    )
    w(
        "Where the supporting facts are before refinement (all supportive questions): "
        f"{pct(ceilings['retrieved'])} % in the retrieved top-{ctx['k']}, "
        f"{pct(ceilings['top5_unfiltered'])} % in the top 5 by verifier logit, "
        f"{pct(ceilings['selected'])} % in the selected chunks; "
        f"{pct(ceilings['all_facts_selected'])} % of questions have all their facts in the "
        "selected chunks (the ceiling of 'all facts kept').\n"
    )
    w(
        "| tau_keep | recall % | recall % (uncapped) | avg kept | avg kept (uncapped) | "
        "all selected facts kept % | all facts kept % |"
    )
    w("|---|---|---|---|---|---|---|")
    for r in keep_rows:
        c, u = r["capped"], r["uncapped"]
        mark = " **<- chosen**" if r["tau_keep"] == tau_keep else ""
        w(
            f"| {r['tau_keep']}{mark} | {pct(c['recall'])} | {pct(u['recall'])} | "
            f"{c['avg_kept']:.2f} | {u['avg_kept']:.2f} | {pct(c['all_selected_facts_kept'])} | "
            f"{pct(c['all_facts_kept'])} |"
        )
    w("\nRule: the largest tau_keep with (capped) recall >= 0.90. " + keep_note + "\n")

    if sanity_rows:
        rw = sanity_rows[0]["rewrite"]
        w("## Sanity check: `prepare()` arm F, Null sufficiency, no generation\n")
        w(
            "Tuned values from `configs/tuned.toml`; query rewrite "
            + ("on (cached Groq)" if rw else "OFF (Groq quota exhausted)")
            + ".\n"
        )
        w(
            "| question | slice | decision -> final | kept lines | gold paragraphs in ctx "
            "| facts in ctx |"
        )
        w("|---|---|---|---|---|---|")
        for r in sanity_rows:
            w(
                f"| {r['question'][:60]} | {r['slice']} "
                f"| {r['decision']} -> {r['final_decision']} | "
                f"{r['kept_lines']} | {r['gold_paragraphs_in_context']}/{r['n_gold_paragraphs']} | "
                f"{r['facts_in_context']}/{r['n_facts']} |"
            )
    return "\n".join(L) + "\n"


def render_toml(name, chosen, tau_keep, model_dir) -> str:
    return (
        f"# Tuned values from results/tuning/{name}.md (HotpotQA dev, Platt-calibrated "
        "probabilities).\n"
        "# Use as an overlay on default.toml: VRAG_CONFIG_OVERLAY=configs/tuned.toml or "
        "load_config(overlay=...).\n\n"
        "[pipeline]\n"
        f"tau_hi = {chosen['tau_hi']}\n"
        f"tau_lo = {chosen['tau_lo']}\n"
        f"tau_single = {chosen['tau_single']}\n"
        f"tau_keep = {tau_keep}\n\n"
        "[verifier]\n"
        f'model = "{model_dir}/model"\n'
        f'calibration_passage = "{model_dir}/calibration_passage.json"\n'
        f'calibration_sentence = "{model_dir}/calibration_sentence.json"\n'
    )


def main() -> None:
    cfg = get_config()
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="verifier-minilm-l6-s13")
    ap.add_argument(
        "--model", type=Path, default=Path("data/kaggle/vrag-train-minilm-l6-s13/output/model")
    )
    ap.add_argument("--sanity-n", type=int, default=5)
    ap.add_argument("--skip-sanity", action="store_true")
    args = ap.parse_args()
    args.model = args.model if args.model.is_absolute() else REPO_ROOT / args.model

    d = cfg.data
    data = load_hotpot(
        d.hotpot_test_size, d.hotpot_dev_size, d.hotpot_seed, cfg.paths.data_dir / "raw"
    )
    dev = data.split("dev")  # the test questions are not used from here on
    assert len(dev) == d.hotpot_dev_size
    subs_path = cfg.paths.data_dir / "processed" / "hotpot_substitutes.json"
    subs = json.loads(subs_path.read_text()) if subs_path.exists() else {}
    slices = build_slices(
        data, d.slice_seed, {k: [v] if isinstance(v, str) else v for k, v in subs.items()}
    )
    retriever = load_indexes(data, cfg, False)

    verifier = CrossEncoderVerifier(str(args.model))
    rag = make_rag(retriever, data, cfg.pipeline, _NoVerifier())
    records = collect(args, cfg, data, dev, slices, rag, verifier)

    passage = fit_level(records, "passage")
    cal_p = passage["calibrator"]
    grid = decide_grid(max_probs(records, cal_p))
    chosen = select_thresholds(grid)
    print("chosen", chosen, flush=True)

    # Refinement only sees the chunks the pipeline selects, whose sentences are far more often
    # relevant than a random retrieved one: fit the sentence calibrator on that population.
    pcfg = cfg.pipeline.model_copy(
        update={k: chosen[k] for k in ("tau_hi", "tau_lo", "tau_single")}
    )
    sel_rag = make_rag(retriever, data, pcfg, _NoVerifier())
    selected = select_chunks(records, sel_rag, cal_p)
    keep_ids = {key: {c.id for c in chunks} for key, chunks in selected.items()}
    cal = {
        "passage": passage,
        "sentence": fit_level(records, "sentence", keep_ids),
        "sentence_all": fit_level(records, "sentence"),
    }
    cal_s = cal["sentence"]["calibrator"]
    model_dir = cfg.paths.data_dir / "models" / args.name
    cal_p.save(model_dir / "calibration_passage.json")
    cal_s.save(model_dir / "calibration_sentence.json")
    link = model_dir / "model"
    if not (link.is_symlink() or link.exists()):
        link.symlink_to(os.path.relpath(args.model, model_dir))

    ceilings = fact_ceilings(records, selected, dev, data.pool)
    keep_rows = keep_sweep(records, selected, cal_s, dev, pcfg.max_sentences)
    tau_keep, keep_note = select_keep(keep_rows)
    print("tau_keep", tau_keep, keep_note, ceilings, flush=True)

    rel = os.path.relpath(model_dir, REPO_ROOT)
    tuned = REPO_ROOT / "configs" / "tuned.toml"
    tuned.write_text(render_toml(args.name, chosen, tau_keep, rel))
    tuned_cfg = load_config(overlay=tuned)
    sanity_rows = (
        []
        if args.skip_sanity
        else sanity(args, tuned_cfg, data, dev, slices, retriever, args.sanity_n)
    )

    ctx = {
        "n_dev": len(dev),
        "k": cfg.pipeline.retrieve_k,
        "top_k_context": cfg.pipeline.top_k_context,
        "max_sentences": cfg.pipeline.max_sentences,
    }
    out = REPO_ROOT / cfg.paths.results_dir / "tuning"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{args.name}.md").write_text(
        render(
            args.name, cal, grid, chosen, keep_rows, ceilings, tau_keep, keep_note, sanity_rows, ctx
        )
    )
    full = {
        "calibration": {
            lv: {
                **{k: v for k, v in c.items() if k != "calibrator"},
                "a": c["calibrator"].a,
                "b": c["calibrator"].b,
            }
            for lv, c in cal.items()
        },
        "chosen": {**chosen, "tau_keep": tau_keep},
        "decision_grid": grid,
        "keep_sweep": keep_rows,
        "fact_ceilings": ceilings,
        "sanity": sanity_rows,
    }
    (out / f"{args.name}.json").write_text(json.dumps(full, indent=1))
    print(f"wrote {out / (args.name + '.md')}")


if __name__ == "__main__":
    main()
