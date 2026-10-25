"""End-to-end QA evaluation (PLAN.md §4): arms A-G on the HotpotQA slices, generation elsewhere.

    run_qa_eval.py prepare --split test --arms A..G --out data/eval/<run>/
    # upload <run>/prompts.jsonl, generate on Kaggle (scripts/kaggle_job.py prompts / generate)
    run_qa_eval.py finalize --run data/eval/<run>/ --outputs <outputs.jsonl>
    run_qa_eval.py judge --run data/eval/<run>/ --n 100            # optional, Groq

prepare   builds the pipeline once, runs ``prepare()`` for every (question, slice, arm) and
          appends the traces to <run>/traces.jsonl (resumable: traces on disk are skipped).
          prompts.jsonl holds each distinct prompt once, under the key of the first trace that
          has it; prompt_map.json maps the prompt hash to every trace key sharing it.
          Arms with sufficiency (F, G) are prepared with abstention OFF so the prompt exists
          for every question: that is what the risk-coverage sweep needs. The configured
          threshold is applied in ``finalize`` (``--tau-abstain`` overrides it), so a new
          abstain threshold does not need a new prepare, and the generation is shared.
          The only LLM calls are query rewrites (Groq, cached). If the quota runs out the run
          stops, keeps everything done so far and can be resumed with the same command.
finalize  parses the outputs, computes outcomes and metrics and writes
          results/qa/<run>/{metrics.json, per_question.jsonl, summary.md[, risk_coverage.png]}.
choose-tau picks the abstain threshold on a finalized dev run with a rule fixed in advance
          (PLAN.md): on arm F, maximize the slice-averaged (correct - hallucinate - planted)
          over tau in 0.00, 0.05, ..., 0.95; ties go to the smaller tau.
judge     LLM judge of another model family on a stratified sample of answered questions;
          reports its agreement with the deterministic outcome.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from demo_trace import load_indexes

from vrag.config import REPO_ROOT, Config, load_config
from vrag.data.hotpot import HotpotData, load_hotpot
from vrag.data.slices import KINDS, Slice, build_slices
from vrag.eval import qa_eval as qa
from vrag.eval.stats import paired_bootstrap
from vrag.llm import CacheMiss, LLMClient, QuotaExhausted
from vrag.llm.cache import request_key
from vrag.pipeline.calibrate import PlattCalibrator
from vrag.pipeline.pipeline import (
    PRESETS,
    VerifiedRAG,
    export_prompts,
    hotpot_lookup,
    load_outputs,
    make_arm,
)
from vrag.pipeline.sufficiency import CrossEncoderSufficiency, NullSufficiency
from vrag.pipeline.types import Trace
from vrag.verifier.offshelf import CrossEncoderVerifier

OFFSHELF = "cross-encoder/ms-marco-MiniLM-L6-v2"
DEFAULT_OVERLAY = "configs/tuned.toml"
# (arm, baseline) pairs of PLAN.md §4, each reported as arm minus baseline.
COMPARISONS = [("F", "A"), ("F", "B"), ("D", "C"), ("E", "D"), ("F", "E"), ("G", "F")]
SEED = 0
RC_ARM = "F"


# ---------------------------------------------------------------------------- helpers


def read_jsonl(path: Path) -> list[dict]:
    # Split on "\n" only: str.splitlines also breaks on U+2028 inside JSON strings.
    return [json.loads(line) for line in path.read_text().split("\n") if line.strip()]


def parse_arms(tokens: list[str]) -> list[str]:
    """``A..G``, ``A C F`` or ``A,C,F`` -> ['A', ...] (in the order given, no repeats)."""
    arms: list[str] = []
    for token in tokens:
        for part in token.split(","):
            if ".." in part:
                lo, hi = part.split("..")
                arms += [chr(c) for c in range(ord(lo), ord(hi) + 1)]
            elif part:
                arms.append(part)
    unknown = [a for a in arms if a not in PRESETS]
    if unknown:
        raise SystemExit(f"unknown arms {unknown}; choose from {sorted(PRESETS)}")
    return list(dict.fromkeys(arms))


def prompt_hash(messages: list[dict[str, str]]) -> str:
    blob = json.dumps(messages, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(blob.encode()).hexdigest()[:16]


def pct(x: float | None, digits: int = 1) -> str:
    return "-" if x is None else f"{100 * x:.{digits}f}"


def num(x: float | None, digits: int = 2) -> str:
    return "-" if x is None else f"{x:.{digits}f}"


class MemoVerifier:
    """Caches (query, passage) -> logit: arms share most verifier calls on the same question."""

    def __init__(self, inner: CrossEncoderVerifier):
        self.inner = inner
        self.memo: dict[tuple[str, str], float] = {}

    def score(self, query: str, passages: list[str]) -> np.ndarray:
        todo = [p for p in dict.fromkeys(passages) if (query, p) not in self.memo]
        if todo:
            for p, s in zip(todo, self.inner.score(query, todo), strict=True):
                self.memo[(query, p)] = float(s)
        return np.array([self.memo[(query, p)] for p in passages], dtype=np.float32)


class MemoRetriever:
    """Caches searches: every arm retrieves the same hybrid list for the same question."""

    def __init__(self, inner):
        self.inner = inner
        self.memo: dict[tuple, list] = {}

    def search(self, query: str, k: int, exclude_ids=None):
        key = (query, k, frozenset(exclude_ids or ()))
        if key not in self.memo:
            self.memo[key] = self.inner.search(query, k, exclude_ids)
        return self.memo[key]


class VerifierSufficiency:
    """Stand-in sufficiency model: the calibrated verifier probability of (question, context).

    It judges relevance, not sufficiency, so it is only for plumbing checks. The real
    student model is passed with ``--sufficiency <path>``.
    """

    def __init__(self, verifier: MemoVerifier, calibrator: PlattCalibrator):
        self.verifier, self.calibrator = verifier, calibrator

    def score(self, question: str, context: str) -> float:
        return float(self.calibrator(self.verifier.score(question, [context]))[0])


class CountingLLM:
    """Counts the rewrite calls: all of them, and those that actually hit the network."""

    def __init__(self, inner: LLMClient):
        self.inner = inner
        self.calls = 0
        self.network = 0

    def complete(self, *args: Any, **kwargs: Any):
        completion = self.inner.complete(*args, **kwargs)
        self.calls += 1
        self.network += not completion.cached
        return completion


# ---------------------------------------------------------------------------- prepare


def load_data(cfg: Config) -> tuple[HotpotData, dict[str, dict[str, Slice]]]:
    d = cfg.data
    data = load_hotpot(
        d.hotpot_test_size, d.hotpot_dev_size, d.hotpot_seed, cfg.paths.data_dir / "raw"
    )
    path = cfg.paths.data_dir / "processed" / "hotpot_substitutes.json"
    subs = json.loads(path.read_text()) if path.exists() else {}
    return data, build_slices(data, d.slice_seed, subs)


def build_arms(
    cfg: Config, data: HotpotData, arms: list[str], llm: CountingLLM | None, sufficiency: str
) -> dict[str, VerifiedRAG]:
    """One pipeline per arm over shared retriever, verifiers and LLM client."""
    v = cfg.verifier
    if set(arms) - {"A", "B"} and not (v.model and v.calibration_passage):
        raise SystemExit("arms C-G need the tuned verifier: pass --overlay configs/tuned.toml")
    retriever = MemoRetriever(load_indexes(data, cfg, False))
    lookup = hotpot_lookup(data.pool)
    offshelf = MemoVerifier(CrossEncoderVerifier(OFFSHELF)) if "B" in arms else None
    tuned = cal_p = cal_s = None
    if set(arms) - {"A", "B"}:
        tuned = MemoVerifier(CrossEncoderVerifier(str(v.model)))
        cal_p = PlattCalibrator.load(v.calibration_passage)
        cal_s = PlattCalibrator.load(v.calibration_sentence) if v.calibration_sentence else cal_p
    suff = None
    if {"F", "G"} & set(arms):
        if sufficiency == "verifier":
            suff = VerifierSufficiency(tuned, cal_p)
        elif sufficiency == "none":
            suff = NullSufficiency()
        else:
            suff = CrossEncoderSufficiency(sufficiency)
    rags = {}
    for name in arms:
        # Abstention is applied in finalize; here every context gets a prompt.
        arm = make_arm(
            name, cfg.pipeline, **({"tau_abstain": 0.0} if PRESETS[name].get("sufficiency") else {})
        )
        verifier, cal = {"A": (None, None), "B": (offshelf, None)}.get(name, (tuned, cal_p))
        rags[name] = VerifiedRAG(
            retriever,
            verifier,
            cal,
            suff if arm.sufficiency else None,
            llm if arm.rewrite else None,
            lookup,
            arm,
            sentence_calibrator=cal_s if name not in ("A", "B") else None,
            rewrite_model=cfg.llm.rewrite_model,
        )
    return rags


def gold_record(q, kinds: dict[str, Slice]) -> dict[str, Any]:
    return {
        "question": q.question,
        "answer": q.answer,
        "type": q.type,
        "level": q.level,
        "facts": [list(f) for f in q.supporting_facts],
        "slices": {
            k: {"substitute": s.substitute, "original_answer": s.original_answer}
            for k, s in kinds.items()
        },
    }


def check_resume(old: dict, new: dict) -> None:
    """Refuse to mix traces made with different settings in one run directory."""
    problems = [k for k in ("split", "overlay_sha", "sufficiency") if old.get(k) != new.get(k)]
    problems += [
        f"arm {a}"
        for a, c in new["arm_configs"].items()
        if a in old["arm_configs"] and old["arm_configs"][a] != c
    ]
    if problems:
        raise SystemExit(
            f"this run directory was prepared with different settings ({', '.join(problems)}); "
            "use a new --out, or delete traces.jsonl to start over"
        )


def write_prompts(run: Path, traces: list[Trace]) -> tuple[int, int]:
    """Write prompts.jsonl (each distinct prompt once) and prompt_map.json.

    Returns (traces with a prompt, distinct prompts).
    """
    groups: dict[str, list[Trace]] = {}
    for t in traces:
        if t.prompt:
            groups.setdefault(prompt_hash(t.prompt), []).append(t)
    unique = export_prompts([g[0] for g in groups.values()], run / "prompts.jsonl", True)
    (run / "prompt_map.json").write_text(
        json.dumps({h: [t.key for t in g] for h, g in groups.items()}, indent=1)
    )
    return sum(map(len, groups.values())), unique


def cmd_prepare(args: argparse.Namespace) -> int:
    arms, kinds = parse_arms(args.arms), args.slices
    overlay = REPO_ROOT / args.overlay if args.overlay else None
    cfg = load_config(overlay=overlay)
    data, slices = load_data(cfg)
    questions = data.split(args.split)[: args.limit]
    pairs = [(q, k) for q in questions for k in kinds if k in slices[q.id]]
    print(
        f"{args.split}: {len(questions)} questions, {len(pairs)} (question, slice) pairs, "
        f"{len(pairs) * len(arms)} traces for arms {''.join(arms)}",
        flush=True,
    )
    if args.count_only:
        return 0

    if set(arms) & {"F", "G"} and not args.sufficiency:
        raise SystemExit(
            "arms F and G need a sufficiency model: --sufficiency <path to the cross-encoder>, "
            "'verifier' (relevance stand-in, plumbing checks only) or 'none' (never abstains)"
        )

    run = Path(args.out)
    run.mkdir(parents=True, exist_ok=True)
    if args.rewrite_model:
        cfg.llm.rewrite_model = args.rewrite_model
    llm = CountingLLM(LLMClient(offline=args.offline_rewrites))
    rags = build_arms(cfg, data, arms, llm, args.sufficiency)
    meta = {
        "split": args.split,
        "limit": args.limit,
        "slices": kinds,
        "arms": arms,
        "arm_configs": {a: rags[a].arm.to_dict() for a in arms},
        "tau_abstain": {a: cfg.pipeline.tau_abstain for a in arms if rags[a].arm.sufficiency},
        "sufficiency": args.sufficiency if set(arms) & {"F", "G"} else None,
        "verifier": str(cfg.verifier.model),
        "offshelf": OFFSHELF,
        "overlay": args.overlay,
        "rewrite_model": cfg.llm.rewrite_model,
        "overlay_sha": hashlib.sha1(overlay.read_bytes()).hexdigest()[:12] if overlay else None,
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    meta_path, traces_path, gold_path = (
        run / "meta.json",
        run / "traces.jsonl",
        run / "questions.json",
    )
    if meta_path.exists():
        old = json.loads(meta_path.read_text())
        check_resume(old, meta)
        meta["arms"] = list(dict.fromkeys([*old["arms"], *arms]))
        meta["slices"] = list(dict.fromkeys([*old["slices"], *kinds]))
        meta["arm_configs"] = {**old["arm_configs"], **meta["arm_configs"]}
        meta["tau_abstain"] = {**old["tau_abstain"], **meta["tau_abstain"]}
    meta_path.write_text(json.dumps(meta, indent=2))
    golds = json.loads(gold_path.read_text()) if gold_path.exists() else {}
    golds.update({q.id: gold_record(q, slices[q.id]) for q in questions})
    gold_path.write_text(json.dumps(golds, indent=1))

    done = (
        {t["qid"] + "|" + t["arm"] + "|" + t["slice_kind"] for t in read_jsonl(traces_path)}
        if traces_path.exists()
        else set()
    )
    todo = [(q, k, a) for q, k in pairs for a in arms if f"{q.id}|{a}|{k}" not in done]
    print(f"{len(done)} traces on disk, {len(todo)} to prepare", flush=True)
    stopped = None
    pending: dict[str, dict] = {}  # offline rewrites: request key -> payload
    start = time.perf_counter()
    with traces_path.open("a") as f:
        for n, (q, kind, arm) in enumerate(todo, start=1):
            try:
                trace = rags[arm].prepare(q.question, slices[q.id][kind], qid=q.id)
            except CacheMiss as miss:
                pending[request_key(miss.payload)] = miss.payload
                continue  # prepared again once the rewrite is imported
            if any(note.startswith("rewrite_failed") for note in trace.notes):
                stopped = next(note for note in trace.notes if note.startswith("rewrite_failed"))
                break  # the trace is incomplete: leave it for the next run
            f.write(json.dumps(trace.to_dict(), ensure_ascii=False) + "\n")
            f.flush()
            if n % 25 == 0:
                print(f"  {n}/{len(todo)} ({time.perf_counter() - start:.0f}s)", flush=True)

    traces = [Trace.from_dict(r) for r in read_jsonl(traces_path)]
    with_prompt, unique = write_prompts(run, traces)
    print(
        f"{len(traces)} traces, {with_prompt} with a prompt, {unique} prompts after dedupe "
        f"-> {run / 'prompts.jsonl'}\n"
        f"Groq rewrite calls this run: {llm.calls} "
        f"({llm.network} uncached, {llm.calls - llm.network} cached)"
    )
    if pending:
        out = run / "rewrite_prompts.jsonl"
        with out.open("w") as f:
            for key, payload in pending.items():
                row = {"id": key, "messages": payload["messages"], "payload": payload}
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(
            f"\n{len(pending)} rewrites are not cached yet -> {out}\n"
            "Generate them (scripts/kaggle_job.py prompts/generate), then run "
            "import-rewrites and prepare again.",
            file=sys.stderr,
        )
        return 3
    if stopped:
        print(
            f"\nSTOPPED: Groq quota exhausted ({stopped}).\n"
            "Nothing was lost: rerun the same command later to resume "
            f"({len(todo) - n + 1} traces left).",
            file=sys.stderr,
        )
        return 2
    return 0


# --------------------------------------------------------------------------- finalize


def load_run(run: Path) -> tuple[dict, dict, list[Trace]]:
    meta = json.loads((run / "meta.json").read_text())
    golds = json.loads((run / "questions.json").read_text())
    return meta, golds, [Trace.from_dict(r) for r in read_jsonl(run / "traces.jsonl")]


def raw_outputs(run: Path, outputs_path: Path) -> dict[str, str]:
    """Generator output per trace key, resolved through the prompt map."""
    outputs = load_outputs(outputs_path)
    raw: dict[str, str] = {}
    for keys in json.loads((run / "prompt_map.json").read_text()).values():
        if keys[0] in outputs:  # the id used in prompts.jsonl is the first key
            raw.update({k: outputs[keys[0]] for k in keys})
    return raw


def comparison_rows(records: list[dict]) -> list[dict]:
    rows = []
    for a, b in COMPARISONS:
        for kind in KINDS:
            for metric in (
                "correct",
                "hallucinate",
                *(("planted",) if kind == "misleading" else ()),
            ):
                qids, x, y = qa.paired_values(records, a, b, kind, metric)
                if not qids:
                    continue
                r = paired_bootstrap(x, y, 10_000, SEED)
                rows.append({"a": a, "b": b, "slice": kind, "metric": metric, **r.to_dict()})
    return rows


def rc_curves(records: list[dict]) -> dict[str, dict]:
    rows = [r for r in records if r["arm"] == RC_ARM]
    out = {}
    for kind in (*KINDS, "all"):
        sub = [r for r in rows if kind == "all" or r["slice"] == kind]
        if sub:
            out[kind] = qa.risk_coverage(sub)
    return out


def rc_plot(curves: dict[str, dict], path: Path) -> str | None:
    """Writes the PNG; returns a note instead when matplotlib is missing."""
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return "matplotlib is not installed: the PNG was skipped (the table above has the data)"
    fig, ax = plt.subplots(figsize=(6, 4))
    for kind, curve in curves.items():
        if curve["points"]:
            ax.plot(
                [p["coverage"] for p in curve["points"]],
                [p["selective_accuracy"] for p in curve["points"]],
                label=f"{kind} (AUC {curve['auc']:.2f})",
            )
    ax.set(xlabel="coverage", ylabel="selective accuracy", title=f"Arm {RC_ARM}: risk-coverage")
    ax.set_xlim(0, 1.02)
    ax.set_ylim(0, 1.02)
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return None


def table(headers: list[str], rows: list[list[Any]]) -> list[str]:
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    return lines + ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]


def rc_table(curve: dict, grid=(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0)) -> list[str]:
    """Rows at the first threshold reaching each coverage target."""
    rows, seen = [], set()
    for target in grid:
        p = next((p for p in curve["points"] if p["coverage"] >= target - 1e-9), None)
        if p and p["threshold"] not in seen:
            seen.add(p["threshold"])
            rows.append(
                [
                    f"{target:.1f}",
                    pct(p["coverage"]),
                    pct(p["selective_accuracy"]),
                    f"{p['threshold']:.3f}",
                ]
            )
    return table(["target coverage", "coverage %", "selective acc. %", "threshold"], rows)


def planted_cell(kind: str, m: dict) -> str:
    return pct(m["planted"]) if kind == "misleading" else "-"


SLICE_NOTES = {
    "supportive": "gold paragraphs present: answers are expected",
    "missing": "gold paragraphs removed: abstaining is the desired behaviour, and a correct "
    "answer is correct *without gold* (other paragraphs or parametric knowledge)",
    "misleading": "answer entity swapped in the gold paragraphs: planted is the failure to avoid",
}
LEGEND = (
    "Rates are shares of all questions of the slice. Correct = answered with EM or containment; "
    "planted = answered with the substituted entity (misleading slice); selective accuracy = "
    "correct / answered; coverage = answered / total; EM, F1 and containment are over answered "
    "questions."
)


def render_summary(name, meta, agg, comps, curves, n_missing, png_note, n_questions) -> str:
    arms = [a for a in "ABCDEFG" if a in agg]
    per_slice = ", ".join(f"{k} {n}" for k, n in n_questions.items())
    out = [f"# QA evaluation: {name}", ""]
    out += [
        f"- split `{meta['split']}`, arms {''.join(arms)}, generated {meta['generated']}",
        f"- questions per slice: {per_slice}",
        f"- verifier `{meta['verifier']}`, arm B `{meta['offshelf']}`; "
        f"overlay `{meta['overlay']}` (sha {meta['overlay_sha']})",
    ]
    if meta.get("tau_abstain"):
        taus = ", ".join(f"{a} {t}" for a, t in meta["tau_abstain"].items())
        out.append(
            f"- abstain threshold applied at finalize: {taus}; sufficiency `{meta['sufficiency']}`"
        )
        if meta["sufficiency"] == "verifier":
            out.append(
                "- **sufficiency is the verifier-relevance stand-in, not the trained student**"
            )
    if n_missing:
        out.append(f"- **{n_missing} traces had no generator output** (counted as abstain)")
    out += ["", LEGEND, ""]
    for kind in KINDS:
        rows = [(a, agg[a][kind]) for a in arms if kind in agg[a]]
        if not rows:
            continue
        out += [f"## {kind}", "", f"_{SLICE_NOTES[kind]}_", ""]
        out += table(
            ["Arm", "n", "Correct %", "Abstain %", "Halluc. %", "Planted %", "EM %", "F1 %",
             "Contains %", "Sel. acc. %", "Coverage %"],
            [
                [a, m["n"], pct(m["correct"]), pct(m["abstain"]), pct(m["hallucinate"]),
                 planted_cell(kind, m),
                 pct(m["em"]), pct(m["f1"]), pct(m["contains"]), pct(m["selective_accuracy"]),
                 pct(m["coverage"])]
                for a, m in rows
            ],
        )  # fmt: skip
        out.append("")
        out += table(
            ["Arm", "Ctx lines", "Ctx tokens", "All facts in ctx %", "Correct w/o all facts %",
             "Cite valid %", "Cite support %", "Groq calls/q"],
            [
                [a, num(m["context_lines"]), num(m["context_tokens"], 0),
                 pct(m["all_facts_in_context"]), pct(m["correct_without_facts"]),
                 pct(m["citation_validity"]), pct(m["citation_support"]),
                 num(m["llm_calls_per_question"])]
                for a, m in rows
            ],
        )  # fmt: skip
        if kind == "missing":
            out += ["", "On this slice every correct answer is a *correct without gold*."]
        out.append("")

    out += [
        "## Paired bootstrap",
        "",
        "Difference of per-question rates, first arm minus second, on the questions both "
        "answered (10,000 resamples, seed 0, 95% CI in percentage points, two-sided p). "
        "A * marks a CI that excludes 0.",
        "",
    ]
    out += table(
        ["Comparison", "Slice", "Metric", "n", "Diff (pp)", "95% CI (pp)", "p"],
        [
            [
                f"{c['a']} vs {c['b']}", c["slice"], c["metric"], c["n"],
                f"{100 * c['mean_diff']:+.1f}" + (" *" if c["ci_low"] * c["ci_high"] > 0 else ""),
                f"[{100 * c['ci_low']:+.1f}, {100 * c['ci_high']:+.1f}]", f"{c['p_value']:.3f}",
            ]
            for c in comps
        ],
    )  # fmt: skip
    out += ["", f"## Risk-coverage (arm {RC_ARM})", ""]
    if not curves:
        out += [f"Arm {RC_ARM} is not in this run.", ""]
        return "\n".join(out)
    out += [
        "Abstain threshold swept over the sufficiency probability, with abstention off in the "
        "prepared traces, so every question has a generated answer. AUC is the area under "
        "selective accuracy over coverage [0, max coverage]; normalized = AUC / max coverage.",
        "",
    ]
    out += table(
        ["Slice", "n", "Max coverage %", "AUC", "AUC normalized"],
        [
            [k, c["n"], pct(c["max_coverage"]), num(c["auc"], 3), num(c["auc_normalized"], 3)]
            for k, c in curves.items()
        ],
    )
    out.append("")
    for kind, c in curves.items():
        out += [f"**{kind}**", "", *rc_table(c), ""]
    out += [png_note if png_note else "![risk-coverage](risk_coverage.png)", ""]
    return "\n".join(out)


def cmd_finalize(args: argparse.Namespace) -> int:
    cfg = load_config()
    run = Path(args.run)
    meta, golds, traces = load_run(run)
    raw = raw_outputs(run, Path(args.outputs))
    needs = [t for t in traces if t.prompt and not (t.abstain)]
    missing = [t.key for t in needs if t.key not in raw]
    if missing and not args.allow_missing:
        raise SystemExit(
            f"{len(missing)} of {len(needs)} traces have no generator output (e.g. {missing[:3]}); "
            "pass --allow-missing to count them as abstentions"
        )
    records = []
    for t in traces:
        gold = golds[t.qid]
        info = gold["slices"].get(t.slice_kind) or {}
        sl = Slice(
            t.slice_kind,
            original_answer=info.get("original_answer"),
            substitute=info.get("substitute"),
        )
        facts = {(title, i) for title, i in gold["facts"]}
        tau = None
        if t.arm in meta["tau_abstain"]:
            tau = args.tau_abstain if args.tau_abstain is not None else meta["tau_abstain"][t.arm]
        done = qa.finalize_trace(t, raw.get(t.key))
        records.append(qa.evaluate_trace(done, gold["answer"], facts, sl, tau))
        records[-1]["question"] = gold["question"]
        records[-1]["output_missing"] = t.key in missing
    if args.tau_abstain is not None:
        meta["tau_abstain"] = {a: args.tau_abstain for a in meta["tau_abstain"]}

    name = run.resolve().name
    out = cfg.paths.results_dir / "qa" / name
    out.mkdir(parents=True, exist_ok=True)
    agg = qa.aggregate_all(records)
    comps = comparison_rows(records)
    curves = rc_curves(records)
    png_note = rc_plot(curves, out / "risk_coverage.png") if curves else None
    n_questions = {k: len({r["qid"] for r in records if r["slice"] == k}) for k in KINDS}
    n_questions = {k: n for k, n in n_questions.items() if n}
    (out / "metrics.json").write_text(
        json.dumps(
            {
                "run": name,
                "meta": meta,
                "n_traces": len(records),
                "missing_outputs": len(missing),
                "aggregate": agg,
                "comparisons": comps,
                "risk_coverage": curves,
            },
            indent=1,
        )
    )
    with (out / "per_question.jsonl").open("w") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    summary = render_summary(name, meta, agg, comps, curves, len(missing), png_note, n_questions)
    (out / "summary.md").write_text(summary)
    print(summary)
    print(f"\nwrote {out}/metrics.json, per_question.jsonl, summary.md", file=sys.stderr)
    return 0


# ------------------------------------------------------------------------- choose-tau

TAU_GRID = [round(0.05 * i, 2) for i in range(20)]


def utility_at(records: list[dict], tau: float) -> dict[str, dict[str, float]]:
    """Per slice: outcome rates when arm traces abstain below ``tau`` (from the open outcome)."""
    out = {}
    for kind in KINDS:
        sub = [r for r in records if r["slice"] == kind]
        if not sub:
            continue
        counts = dict.fromkeys(qa.OUTCOMES, 0)
        for r in sub:
            prob = r["sufficiency_prob"]
            low = prob is not None and prob < tau
            counts["abstain" if low else r["outcome_open"]] += 1
        rates = {k: v / len(sub) for k, v in counts.items()}
        rates["utility"] = rates["correct"] - rates["hallucinate"] - rates["planted"]
        out[kind] = rates
    return out


def cmd_choose_tau(args: argparse.Namespace) -> int:
    cfg = load_config()
    res = cfg.paths.results_dir / "qa" / Path(args.run).resolve().name
    records = [r for r in read_jsonl(res / "per_question.jsonl") if r["arm"] == args.arm]
    if not records:
        raise SystemExit(f"no arm {args.arm} records in {res}/per_question.jsonl")
    rows, best = [], None
    for tau in TAU_GRID:
        per = utility_at(records, tau)
        mean = float(np.mean([v["utility"] for v in per.values()]))
        rows.append((tau, per, mean))
        if best is None or mean > best[1] + 1e-12:
            best = (tau, mean)
    kinds = list(rows[0][1])
    lines = [
        f"# Abstain threshold on {res.name} (arm {args.arm})",
        "",
        "Rule fixed before looking at the results: maximize the slice-averaged utility",
        "(correct - hallucinate - planted) over the grid; ties go to the smaller threshold.",
        "",
        f"**Chosen tau_abstain = {best[0]:.2f}** (mean utility {best[1]:.3f}).",
        "",
        *table(
            ["tau", *[f"{k} C/H/P/A %" for k in kinds], "mean utility"],
            [
                [
                    f"{tau:.2f}",
                    *[
                        "/".join(
                            f"{100 * per[k][o]:.0f}"
                            for o in ("correct", "hallucinate", "planted", "abstain")
                        )
                        for k in kinds
                    ],
                    f"{mean:.3f}",
                ]
                for tau, per, mean in rows
            ],
        ),
    ]
    out = cfg.paths.results_dir / "tuning" / f"tau_abstain_{res.name}.md"
    out.write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nwrote {out}", file=sys.stderr)
    return 0


# ------------------------------------------------------------------------------ judge


def cmd_judge(args: argparse.Namespace) -> int:
    cfg = load_config()
    run = Path(args.run)
    out = cfg.paths.results_dir / "qa" / run.resolve().name
    records = read_jsonl(out / "per_question.jsonl")
    sample = qa.stratified_sample(records, args.n, args.seed)
    print(f"judging {len(sample)} answers with {cfg.llm.judge_model}", flush=True)
    llm = LLMClient()
    done, stopped = [], False
    for n, r in enumerate(sample, start=1):
        try:
            c = llm.complete(
                qa.judge_messages(r["question"], r["gold"], r["answer"]),
                cfg.llm.judge_model,
                max_tokens=args.max_tokens,
                temperature=0.0,
                json_mode=True,
            )
        except QuotaExhausted as e:
            print(
                f"\nSTOPPED: Groq quota exhausted ({e}).\n"
                "Rerun to resume: finished calls are cached.",
                file=sys.stderr,
            )
            stopped = True
            break
        verdict = qa.parse_verdict(c.text)
        done.append({**r, "judge_correct": verdict, "judge_raw": c.text})
        if n % 20 == 0:
            print(f"  {n}/{len(sample)}", flush=True)
    valid = [d for d in done if d["judge_correct"] is not None]
    agreement = qa.judge_agreement([(d["judge_correct"], d["outcome"] == "correct") for d in valid])
    report = {
        "judge_model": cfg.llm.judge_model,
        "sampled": len(sample),
        "judged": len(done),
        "unparsable": len(done) - len(valid),
        "complete": not stopped,
        **agreement,
    }
    (out / "judge.json").write_text(json.dumps(report, indent=1))
    with (out / "judge.jsonl").open("w") as f:
        for d in done:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    print(json.dumps(report, indent=1))
    for d in valid:
        if d["judge_correct"] != (d["outcome"] == "correct"):
            print(
                f"  disagree [{d['arm']}/{d['slice']}] {d['outcome']}: "
                f"gold={d['gold']!r} answer={d['answer']!r}"
            )
    return 2 if stopped else 0


# -------------------------------------------------------------------------------- main


def cmd_import_rewrites(args: argparse.Namespace) -> int:
    """Put batch-generated rewrites into the LLM cache under their original requests."""
    run = Path(args.run)
    outputs = {r["id"]: r["output"] for r in read_jsonl(Path(args.outputs))}
    cache = LLMClient(offline=True).cache
    n = 0
    for row in read_jsonl(run / "rewrite_prompts.jsonl"):
        if row["id"] in outputs:
            payload = row["payload"]
            cache.put(
                payload,
                {
                    "text": outputs[row["id"]],
                    "model": payload["model"],
                    "usage": {},
                    "finish_reason": "stop",
                },
            )
            n += 1
    print(f"imported {n} rewrites into the cache")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)

    p = sub.add_parser("prepare", help="retrieve, verify and build prompts for every trace")
    p.add_argument("--split", choices=["test", "dev"], required=True)
    p.add_argument("--arms", nargs="+", default=["A..G"], help="e.g. A..G, 'A C F' or A,C,F")
    p.add_argument("--slices", nargs="+", choices=KINDS, default=list(KINDS))
    p.add_argument("--out", required=True, help="run directory, e.g. data/eval/<run>/")
    p.add_argument("--limit", type=int, help="only the first N questions of the split")
    p.add_argument(
        "--overlay", default=DEFAULT_OVERLAY, help="config overlay with the tuned values"
    )
    p.add_argument("--sufficiency", help="arms F/G: model path, 'verifier' (stand-in) or 'none'")
    p.add_argument(
        "--count-only", action="store_true", help="print the trace count and stop (no models)"
    )
    p.add_argument("--rewrite-model", help="model name for rewrites (cache key)")
    p.add_argument(
        "--offline-rewrites",
        action="store_true",
        help="never call Groq: traces whose rewrite is not cached are deferred and their "
        "prompts written to rewrite_prompts.jsonl for batch generation",
    )
    p.set_defaults(func=cmd_prepare)

    p = sub.add_parser("import-rewrites", help="load batch-generated rewrites into the cache")
    p.add_argument("--run", required=True)
    p.add_argument("--outputs", required=True, help='{"id", "output"} JSONL from the generator')
    p.set_defaults(func=cmd_import_rewrites)

    p = sub.add_parser("finalize", help="parse outputs, compute metrics, write results/qa/<run>/")
    p.add_argument("--run", required=True)
    p.add_argument("--outputs", required=True, help="outputs.jsonl from the generator")
    p.add_argument("--tau-abstain", type=float, help="override the abstain threshold of F/G")
    p.add_argument(
        "--allow-missing", action="store_true", help="count missing outputs as abstentions"
    )
    p.set_defaults(func=cmd_finalize)

    p = sub.add_parser("choose-tau", help="pick tau_abstain on a finalized dev run")
    p.add_argument("--run", required=True)
    p.add_argument("--arm", default="F")
    p.set_defaults(func=cmd_choose_tau)

    p = sub.add_parser("judge", help="LLM judge on a stratified sample (Groq)")
    p.add_argument("--run", required=True)
    p.add_argument("--n", type=int, default=100)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--max-tokens", type=int, default=512)
    p.set_defaults(func=cmd_judge)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
