/* Pipeline explorer: renders a Trace (from examples.json or POST /api/ask) as a ledger of stages. */
(function () {
  "use strict";
  const { h, icon, fmt, getJSON } = V;

  const SLICES = {
    supportive: ["Supportive", "The paragraphs that hold the answer are in the pool. An answer is expected."],
    missing: ["Missing", "The paragraphs that hold the answer were removed. Abstaining is the right move."],
    misleading: ["Misleading", "The answer in the supporting paragraphs was swapped for a wrong entity. Repeating it is the failure."],
  };
  const OUTCOME = {
    correct: ["Correct", "check"],
    abstain: ["Abstained", "warn"],
    hallucinate: ["Wrong answer", "x"],
    planted: ["Repeated the planted answer", "x"],
  };
  const DECISION = {
    correct: ["Correct", "check", "Retrieval looks good."],
    ambiguous: ["Ambiguous", "warn", "Some evidence, not convincing."],
    incorrect: ["Incorrect", "x", "Nothing relevant was found."],
  };
  const ABSTAIN_WHY = {
    no_evidence: "No sentence survived refinement, so there was nothing to answer from.",
    insufficient_context: "The sufficiency model judged the remaining context too weak to answer from.",
  };
  const LAT_ORDER = ["retrieve", "verify", "refine", "rewrite", "sufficiency", "generate"];
  const LAT_NAME = {
    retrieve: "Retrieve",
    verify: "Verify",
    refine: "Refine",
    rewrite: "Rewrite",
    sufficiency: "Sufficiency",
    generate: "Answer",
  };

  const $ = (id) => document.getElementById(id);
  const state = { data: null, current: null, view: "compare", thresholds: null, live: false, busy: false };

  /* ------------------------------------------------------------ small parts */

  function pill(kind, text, ic) {
    return h("span", { class: "pill " + kind }, ic ? icon(ic) : null, text);
  }
  function outcomePill(o) {
    const [label, ic] = OUTCOME[o] || [o, "eq"];
    return pill(o, label, ic);
  }

  function titleOf(trace, chunkId) {
    const c = trace.chunks.find((x) => x.id === chunkId);
    return c ? c.title : chunkId;
  }

  function stage(n, title, reading, desc, body, opts = {}) {
    const mark = h("span", { class: "mark" + (opts.markClass ? " " + opts.markClass : ""), "aria-hidden": "true" },
      opts.markIcon ? icon(opts.markIcon) : String(n));
    return h("li", { class: "stage" },
      mark,
      h("div", { class: "stage-h" }, h("h3", {}, title), reading ? h("span", { class: "reading" }, reading) : null),
      desc ? h("p", { class: "stage-d" }, desc) : null,
      body ? h("div", { class: "stage-body" }, body) : null,
    );
  }

  function pbar(p, th) {
    const bar = h("div", { class: "pbar", role: "img", "aria-label": "probability " + fmt.prob(p) },
      h("i", { style: { width: Math.max(0, Math.min(1, p || 0)) * 100 + "%" } }));
    if (th) {
      [th.tau_lo, th.tau_hi].forEach((t) => bar.appendChild(h("s", { style: { left: t * 100 + "%" } })));
    }
    return bar;
  }

  /* ------------------------------------------------------------ stage bodies */

  function queriesBlock(trace) {
    const items = trace.queries.map((q, i) =>
      h("li", { class: i ? "rw" : "" }, h("span", { class: "tag" }, i ? "Rewritten query " + i : "Your question"), q));
    return h("ol", { class: "queries" }, items);
  }

  function passagesBlock(trace, th, ctx, ranked) {
    const sorted = ranked
      ? trace.chunks.slice().sort((a, b) => (b.prob ?? -1) - (a.prob ?? -1) || a.retrieval_rank - b.retrieval_rank)
      : trace.chunks.slice().sort((a, b) => a.round - b.round || a.retrieval_rank - b.retrieval_rank);
    const rounds = new Set(trace.chunks.map((c) => c.round));
    const row = (c) =>
      h("li", { class: "psg" + (ranked && !c.selected ? " out" : "") },
        h("div", { class: "psg-top" },
          h("span", { class: "psg-title" }, c.title),
          ranked && c.prob !== null ? h("span", { class: "psg-p" }, fmt.prob(c.prob)) : h("span", { class: "psg-p muted" }, "search rank " + c.retrieval_rank)),
        ranked && c.prob !== null ? pbar(c.prob, th) : null,
        h("div", { class: "psg-tags" },
          ranked ? h("span", { class: "chip" + (c.selected ? " in" : "") }, c.selected ? "passed the filter" : "filtered out") : null,
          rounds.size > 1 ? h("span", { class: "chip" }, c.round ? "after rewrite" : "first search") : null,
          ctx.examples && c.gold ? h("span", { class: "chip gold", title: "This paragraph holds a supporting fact" }, "has a supporting fact") : null,
          !ranked ? h("span", { class: "chip" }, "sent to the model") : null),
        h("details", { class: "ptext" }, h("summary", { class: "muted" }, "Show passage"), h("p", { class: "psg-text" }, c.text)),
      );
    const head = sorted.slice(0, ranked ? 6 : 8);
    const rest = sorted.slice(head.length);
    const frag = [];
    if (ranked) {
      frag.push(h("div", { class: "axis", "aria-hidden": "true" },
        h("span", {}, "0"), h("span", {}, "bars: P(relevant) 0 to 1; ticks at " + th.tau_lo + " and " + th.tau_hi), h("span", {}, "1")));
    }
    frag.push(h("ol", { class: "passages" }, head.map(row)));
    if (rest.length) {
      frag.push(h("details", { class: "more" },
        h("summary", {}, "Show " + rest.length + " more passages"),
        h("ol", { class: "passages" }, rest.map(row))));
    }
    return frag;
  }

  function scaleBlock(maxP, th) {
    const clampLeft = (p) => Math.min(Math.max(p, 0), 1) * 100;
    const needle = h("div", { class: "needle", style: { left: clampLeft(maxP) + "%" } },
      h("span", { style: maxP < 0.1 ? { transform: "none" } : maxP > 0.9 ? { transform: "translateX(-100%)" } : {} },
        "best " + fmt.prob(maxP)));
    return h("div", { class: "scale", role: "img",
      "aria-label": "Best passage probability " + fmt.prob(maxP) + " on a scale with thresholds " + th.tau_lo + " and " + th.tau_hi },
      h("div", { class: "zone z-incorrect", style: { left: 0, width: th.tau_lo * 100 + "%" } }),
      h("div", { class: "zone z-ambiguous", style: { left: th.tau_lo * 100 + "%", width: (th.tau_hi - th.tau_lo) * 100 + "%" } }),
      h("div", { class: "zone z-correct", style: { left: th.tau_hi * 100 + "%", right: 0 } }),
      h("div", { class: "tick", style: { left: th.tau_lo * 100 + "%" } }, h("span", {}, "τ low " + th.tau_lo)),
      h("div", { class: "tick", style: { left: th.tau_hi * 100 + "%" } }, h("span", {}, "τ high " + th.tau_hi)),
      needle);
  }

  function decisionBlock(trace, th) {
    const first = trace.chunks.filter((c) => c.round === 0 && c.prob !== null);
    const maxP = first.length ? Math.max(...first.map((c) => c.prob)) : 0;
    const [label, ic, blurb] = DECISION[trace.decision] || ["n/a", "eq", ""];
    const out = [
      scaleBlock(maxP, th),
      h("div", { class: "verdict" },
        pill("d-" + trace.decision, label, ic),
        h("span", { class: "rule-text" },
          "Best passage " + fmt.prob(maxP) + (trace.decision === "correct" ? " is at or above " + th.tau_hi
            : trace.decision === "incorrect" ? " is below " + th.tau_lo
              : " sits between " + th.tau_lo + " and " + th.tau_hi) + ". " + blurb)),
    ];
    if (trace.queries.length > 1) {
      out.push(h("p", { class: "rule-text", style: { marginTop: "0.6rem" } },
        "Not Correct, so the pipeline asked a model to rewrite the query and searched again. Final decision after the retry: ",
        h("b", {}, (DECISION[trace.final_decision] || [trace.final_decision])[0]), "."));
    } else if (trace.decision !== "correct" && trace.final_decision) {
      out.push(h("p", { class: "rule-text", style: { marginTop: "0.6rem" } },
        "A rewrite was attempted but produced no new query. Final decision: ", h("b", {}, (DECISION[trace.final_decision] || [trace.final_decision])[0]), "."));
    }
    return out;
  }

  function sentencesBlock(trace, th, ctx) {
    const byChunk = new Map();
    trace.sentences.forEach((s) => {
      if (!byChunk.has(s.chunk_id)) byChunk.set(s.chunk_id, []);
      byChunk.get(s.chunk_id).push(s);
    });
    const line = (s) =>
      h("li", { class: "sent" + (s.kept ? "" : " drop") },
        h("span", {}, s.text, ctx.examples && s.gold ? h("span", { class: "gold-mark" }, "  (supporting fact)") : null),
        h("span", { class: "sp" }, (s.kept ? "kept " : "dropped ") + fmt.prob(s.prob)));
    const groups = (kept) =>
      [...byChunk.entries()].map(([cid, ss]) => {
        const pick = ss.filter((s) => s.kept === kept);
        if (!pick.length) return null;
        return h("div", { class: "sent-group" }, h("h4", {}, titleOf(trace, cid)), h("ul", { class: "sents" }, pick.map(line)));
      });
    const nKept = trace.sentences.filter((s) => s.kept).length;
    const nDrop = trace.sentences.length - nKept;
    const out = [];
    out.push(nKept ? groups(true) : h("p", { class: "rule-text" }, "No sentence reached the keep threshold of " + th.tau_keep + "."));
    if (nDrop) {
      out.push(h("details", { class: "more" }, h("summary", {}, "Show " + nDrop + " dropped sentence" + (nDrop > 1 ? "s" : "")), groups(false)));
    }
    return out;
  }

  function sufficiencyBlock(trace, th) {
    const p = trace.sufficiency_prob;
    if (p === null || p === undefined) {
      return h("p", { class: "rule-text" }, "Skipped: no context was left to judge.");
    }
    const tick = h("div", { class: "tick", style: { left: th.tau_abstain * 100 + "%" } }, h("span", {}, "τ abstain " + th.tau_abstain));
    const val = h("div", { class: "val", style: { left: Math.min(Math.max(p, 0.04), 0.96) * 100 + "%" } }, fmt.prob(p));
    const ok = p >= th.tau_abstain;
    return [
      h("div", { class: "meter", role: "img", "aria-label": "Sufficiency " + fmt.prob(p) + ", threshold " + th.tau_abstain },
        h("i", { style: { width: p * 100 + "%" } }), val, tick),
      h("p", { class: "rule-text" }, ok
        ? "Sufficiency " + fmt.prob(p) + " is at or above " + th.tau_abstain + ": the context is judged enough, so the answer model runs."
        : "Sufficiency " + fmt.prob(p) + " is below " + th.tau_abstain + ": the pipeline abstains instead of answering."),
    ];
  }

  function ctxList(trace, laneId, ctx) {
    const cited = new Set(trace.citations || []);
    return h("ol", { class: "ctx" }, trace.context.map((raw, i) => {
      const n = i + 1;
      const ref = trace.context_refs[i];
      const title = ref ? titleOf(trace, ref[0]) : "";
      let body = raw.replace(/^\[\d+\]\s*/, "");
      if (title && body.startsWith(title + ": ")) body = body.slice(title.length + 2);
      const gold = ctx.examples && trace.context_gold && trace.context_gold[i];
      return h("li", { id: "ctx-" + laneId + "-" + n, class: cited.has(n) ? "cited" : "" },
        h("span", { class: "n" }, "[" + n + "]"),
        h("div", {},
          h("div", { class: "tt" }, title, ref && ref[1] !== null && ref[1] !== undefined ? ", sentence " + (ref[1] + 1) : ""),
          h("span", {}, body),
          (cited.has(n) || gold) ? h("div", { class: "badges" },
            cited.has(n) ? h("span", { class: "chip in" }, "cited") : null,
            gold ? h("span", { class: "chip gold" }, "supporting fact") : null) : null));
    }));
  }

  function approxTokens(lines) {
    return Math.round(lines.reduce((a, l) => a + l.length, 0) / 4);
  }

  function citeButtons(trace, laneId) {
    return (trace.citations || []).map((n) =>
      h("button", { class: "cite", type: "button", "aria-label": "Show context line " + n,
        onclick: () => jumpTo(laneId, n) }, "[" + n + "]"));
  }

  function jumpTo(laneId, n) {
    const li = document.getElementById("ctx-" + laneId + "-" + n);
    if (!li) return;
    for (let el = li.parentElement; el; el = el.parentElement) if (el.tagName === "DETAILS") el.open = true;
    li.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    li.classList.add("flash");
    li.setAttribute("tabindex", "-1");
    li.focus({ preventScroll: true });
    setTimeout(() => li.classList.remove("flash"), 1800);
  }

  function answerBlock(trace, laneId, ctx, th) {
    const out = [];
    const refused = trace.abstain || trace.insufficient || !trace.answer;
    let box;
    if (trace.abstain) {
      box = h("div", { class: "answer-box abstain" },
        h("div", { class: "answer-text" }, "I don't have enough information to answer."),
        h("div", { class: "answer-meta" }, ABSTAIN_WHY[trace.abstain_reason] || "The pipeline abstained."));
    } else if (refused) {
      box = h("div", { class: "answer-box abstain" },
        h("div", { class: "answer-text" }, "The answer model found no answer in the context."),
        h("div", { class: "answer-meta" }, "It replied that the context is insufficient."));
    } else {
      box = h("div", { class: "answer-box" },
        h("div", { class: "answer-text" }, trace.answer),
        h("div", { class: "answer-meta" },
          trace.citations.length ? h("span", {}, "Cited:") : h("span", {}, "No citations given."),
          citeButtons(trace, laneId),
          trace.confidence !== null && trace.confidence !== undefined ? h("span", {}, "model confidence " + fmt.num(trace.confidence, 2)) : null,
          trace.citations_dropped && trace.citations_dropped.length
            ? h("span", {}, "dropped invalid citations: " + trace.citations_dropped.join(", ")) : null));
    }
    out.push(box);
    if (ctx.examples && trace.outcome) {
      const gold = ctx.gold;
      out.push(h("p", { class: "rule-text", style: { marginTop: "0.6rem" } },
        outcomePill(trace.outcome), " ",
        trace.outcome === "planted" ? "Gold answer: " + gold + ". The swapped answer was " + ctx.planted + "."
          : trace.outcome === "abstain" ? "Gold answer would have been: " + gold + "." : "Gold answer: " + gold + "."));
    }
    if (trace.context.length) {
      const label = trace.abstain ? "Evidence it found (not sent to the answer model)" : "Context sent to the answer model";
      out.push(h("details", { class: "disclosure", open: trace.arm === "F" && !trace.abstain ? true : null },
        h("summary", {}, label + ": " + trace.context.length + " lines, about " + fmt.int(approxTokens(trace.context)) + " tokens"),
        ctxList(trace, laneId, ctx)));
    }
    return out;
  }

  function latencyBlock(lat) {
    const keys = LAT_ORDER.filter((k) => lat[k] !== undefined);
    const total = keys.reduce((a, k) => a + lat[k], 0) || 1;
    return [
      h("div", { class: "latency", role: "img", "aria-label": "Latency by stage" },
        keys.map((k, i) => h("i", { style: { width: (lat[k] / total) * 100 + "%", background: "var(--lat-" + (i + 1) + ")" }, title: LAT_NAME[k] + " " + fmt.ms(lat[k]) }))),
      h("ul", { class: "lat-list" }, keys.map((k, i) =>
        h("li", {}, h("span", { class: "sw", style: { background: "var(--lat-" + (i + 1) + ")" } }), LAT_NAME[k] + " ", h("b", { class: "num" }, fmt.ms(lat[k]))))),
      h("p", { class: "rule-text", style: { marginTop: "0.4rem" } }, "Whole request: " + fmt.ms(lat.total) + " on this machine (CPU for the models, network for the answer)."),
    ];
  }

  /* ------------------------------------------------------------ lanes */

  function laneF(trace, ctx, laneId) {
    const th = ctx.thresholds;
    const first = trace.chunks.filter((c) => c.round === 0);
    const rewrote = trace.queries.length > 1;
    const nSel = trace.chunks.filter((c) => c.selected).length;
    const nKept = trace.sentences.filter((s) => s.kept).length;
    const steps = [];
    steps.push(stage(1, "Retrieve", first.length + " passages" + (rewrote ? " + " + (trace.chunks.length - first.length) + " after rewrite" : ""),
      "Hybrid search (keyword plus embedding) over the paragraph pool.", queriesBlock(trace)));
    steps.push(stage(2, "Verify", nSel + " of " + trace.chunks.length + " pass",
      "A small cross-encoder scores each passage against the question: the probability that it is relevant.",
      passagesBlock(trace, th, ctx, true)));
    steps.push(stage(3, "Decide", (DECISION[trace.decision] || ["n/a"])[0],
      "Two thresholds on the best passage turn the scores into Correct, Ambiguous or Incorrect.", decisionBlock(trace, th)));
    steps.push(stage(4, "Refine", nKept + " of " + trace.sentences.length + " sentences kept",
      "Passages are cut to the sentences the verifier rates at or above " + th.tau_keep + ". The rest never reach the answer model.",
      trace.sentences.length ? sentencesBlock(trace, th, ctx) : h("p", { class: "rule-text" }, "No passage passed the filter, so there was nothing to refine.")));
    const suff = trace.sufficiency_prob;
    steps.push(stage(5, "Sufficiency", suff !== null && suff !== undefined ? fmt.prob(suff) + " vs " + th.tau_abstain : "skipped",
      "A second small model asks whether the refined context is enough to answer. If not, the pipeline abstains.", sufficiencyBlock(trace, th)));
    steps.push(stage(6, trace.abstain ? "Abstain" : "Answer", null, null, answerBlock(trace, laneId, ctx, th),
      { markIcon: trace.abstain || !trace.answer ? "x" : "check", markClass: trace.abstain || !trace.answer ? "stop" : "ok" }));
    if (ctx.latency) steps.push(stage(7, "Latency", fmt.ms(ctx.latency.total), "Wall-clock time per stage for this request.", latencyBlock(ctx.latency), { markClass: "off" }));
    return h("ol", { class: "ledger" }, steps);
  }

  function laneA(trace, ctx, laneId) {
    const steps = [];
    steps.push(stage(1, "Retrieve", trace.chunks.length + " passages",
      "The same hybrid search. The top " + trace.chunks.length + " go straight to the answer model, with no check.",
      [queriesBlock(trace), h("div", { style: { marginTop: "0.75rem" } }, passagesBlock(trace, ctx.thresholds, ctx, false))]));
    steps.push(stage(2, "No verification", "unchecked", "Nothing is scored, trimmed or rewritten, and there is no way to abstain on weak evidence.", null, { markClass: "off", markIcon: "eq" }));
    steps.push(stage(3, trace.abstain || !trace.answer ? "No answer" : "Answer", null, null, answerBlock(trace, laneId, ctx, ctx.thresholds),
      { markIcon: !trace.answer ? "x" : "check", markClass: !trace.answer ? "stop" : "ok" }));
    return h("ol", { class: "ledger" }, steps);
  }

  function lane(arm, trace, ctx, laneId) {
    const title = arm === "A" ? "Plain RAG (arm A)" : "Verified (arm F)";
    const sub = arm === "A" ? "top-8 passages, no checks" : "verify, refine, rewrite, abstain";
    return h("div", { class: "lane" },
      h("h2", {}, title, trace.outcome ? outcomePill(trace.outcome) : null, h("span", { class: "sub" }, sub)),
      arm === "A" ? laneA(trace, ctx, laneId) : laneF(trace, ctx, laneId));
  }

  /* ------------------------------------------------------------ views */

  function head(question, facts, extra) {
    return h("div", { class: "trace-head" }, h("h2", { class: "q-text" }, question), facts, extra);
  }

  function showExample(ex) {
    state.current = ex.id;
    const th = state.data.thresholds;
    const [sliceName, sliceNote] = SLICES[ex.slice];
    const facts = h("div", { class: "facts" },
      h("span", {}, "Slice: ", h("b", {}, sliceName)),
      h("span", {}, "Gold answer: ", h("b", {}, ex.gold)),
      ex.planted ? h("span", {}, "Planted answer: ", h("b", {}, ex.planted)) : null,
      h("span", {}, ex.type + ", " + ex.level));
    const sw = h("div", { class: "view-switch", role: "group", "aria-label": "View" },
      ["compare", "f"].map((v) => h("button", { type: "button", "aria-pressed": String(state.view === v),
        onclick: () => { state.view = v; showExample(ex); } }, v === "compare" ? "Compare A and F" : "Verified only")));
    const ctx = { thresholds: th, examples: true, gold: ex.gold, planted: ex.planted };
    const lanes = state.view === "compare"
      ? [lane("A", ex.arms.A, ctx, "A"), lane("F", ex.arms.F, ctx, "F")]
      : [lane("F", ex.arms.F, ctx, "F")];
    $("trace").replaceChildren(
      head(ex.question, facts, [h("p", { class: "slice-note" }, sliceNote + " Arm F abstains below " + th.tau_abstain + " sufficiency."), sw]),
      h("div", { class: "versus " + (lanes.length === 2 ? "two" : "") }, lanes));
    document.querySelectorAll(".ex").forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === ex.id)));
    try { history.replaceState(null, "", "#" + encodeURIComponent(ex.id)); } catch (e) { /* file: or sandbox */ }
  }

  function showLive(res, question) {
    state.current = null;
    document.querySelectorAll(".ex").forEach((b) => b.setAttribute("aria-current", "false"));
    const trace = res.trace;
    trace.arm = "F";
    const ctx = { thresholds: res.thresholds, examples: false, latency: res.latency_ms };
    $("trace").replaceChildren(
      head(question, h("div", { class: "facts" },
        h("span", {}, "Live run of arm F"),
        h("span", {}, "Answer model: ", h("b", {}, res.answer_model), res.answer_cached ? " (cached reply)" : "")),
        null),
      h("div", { class: "versus" }, lane("F", trace, ctx, "live")));
  }

  function notice(kind, title, text) {
    return h("div", { class: "notice " + kind, role: kind === "err" ? "alert" : null }, h("b", {}, title), text);
  }

  async function ask(question) {
    if (state.busy) return;
    state.busy = true;
    const btn = $("ask-btn");
    btn.disabled = true;
    $("trace").replaceChildren(h("p", { class: "loading", role: "status" },
      "Running: retrieve, verify, decide, refine, sufficiency, answer. The first question also loads the models, which can take 10 to 20 seconds."));
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof body.detail === "string" ? body.detail : "The request failed (" + res.status + ").";
        $("trace").replaceChildren(notice("err", res.status === 503 ? "Live answer unavailable" : "Request failed", detail));
      } else {
        showLive(body, question);
      }
    } catch (e) {
      $("trace").replaceChildren(notice("err", "Could not reach the server", "Start it with: uvicorn vrag.api.app:app"));
    } finally {
      state.busy = false;
      btn.disabled = !state.live;
    }
  }

  /* ------------------------------------------------------------ rail */

  function buildRail(data) {
    $("ex-count").textContent = data.examples.length + " traces";
    const groups = $("ex-groups");
    const mk = (ex) => {
      const v = ex.verdict;
      return h("li", {},
        h("button", { type: "button", class: "ex", "data-id": ex.id, "aria-current": "false", onclick: () => {
          state.view = state.view || "compare";
          showExample(ex);
          if (matchMedia("(max-width: 959px)").matches) { $("examples").open = false; $("trace").scrollIntoView({ behavior: "auto" }); }
        } },
          h("span", { class: "ex-q" }, ex.question),
          h("span", { class: "ex-out" }, v === "better" ? pill("correct", "F better", "up") : v === "worse" ? pill("hallucinate", "F worse", "down") : pill("neutral", "same", "eq")),
          h("span", { class: "ex-meta" }, ex.title)));
    };
    Object.keys(SLICES).forEach((k) => {
      const items = data.examples.filter((e) => e.slice === k);
      if (!items.length) return;
      groups.appendChild(h("div", { class: "ex-group" }, h("h3", {}, SLICES[k][0] + " (" + items.length + ")"), h("p", {}, SLICES[k][1]), h("ul", { class: "ex-list" }, items.map(mk))));
    });
  }

  async function init() {
    $("ask-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = $("q").value.trim();
      if (q.length >= 3) ask(q);
    });
    $("q").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("ask-form").requestSubmit();
    });
    if (matchMedia("(max-width: 959px)").matches) $("examples").open = false;

    getJSON("/api/status").then((s) => {
      state.live = s.live;
      state.thresholds = s.thresholds;
      $("ask-btn").disabled = !s.live;
      const el = $("live-state");
      el.textContent = s.live ? "Live mode ready. Ctrl+Enter runs it." : "Live mode is off here. The examples below still work.";
      el.classList.toggle("off", !s.live);
      if (!s.live) el.title = s.problems.join("; ");
    }).catch(() => {
      $("ask-btn").disabled = true;
      $("live-state").textContent = "Live mode needs the API server (uvicorn vrag.api.app:app). Examples still work.";
      $("live-state").classList.add("off");
    });

    try {
      let data;
      try { data = await getJSON("/api/examples"); } catch (e) { data = await getJSON("data/examples.json"); }
      state.data = data;
      buildRail(data);
      const wanted = decodeURIComponent((location.hash || "").slice(1));
      const ex = data.examples.find((e) => e.id === wanted) || data.examples[0];
      showExample(ex);
    } catch (e) {
      $("trace").replaceChildren(h("div", { class: "empty" }, h("h2", {}, "No examples found"),
        "Build them with python scripts/build_ui_examples.py, then reload. You can still ask a live question if live mode is on."));
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
