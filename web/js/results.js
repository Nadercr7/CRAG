/* Results dashboard. Every number is read from /api/runs/<run> and /api/retrieval at load time. */
(function () {
  "use strict";
  const { h, icon, fmt, getJSON, cssVar, onTheme } = V;

  const ARMS = ["A", "B", "C", "D", "E", "F", "G"];
  const ARM_NAME = {
    A: "plain RAG",
    B: "+ reranker",
    C: "+ verifier",
    D: "+ refine",
    E: "+ rewrite",
    F: "+ abstain (full)",
    G: "single threshold",
  };
  const SLICES = ["supportive", "missing", "misleading"];
  const SLICE_NOTE = {
    supportive: "The gold paragraphs are in the pool. Answering is expected.",
    missing: "The gold paragraphs were removed. Abstaining is the right move.",
    misleading: "The answer in the gold paragraphs was swapped. Repeating it is the failure.",
  };
  const OUTCOMES = [
    ["correct", "Correct", "--o-correct"],
    ["abstain", "Abstained", "--o-abstain"],
    ["hallucinate", "Wrong answer", "--o-hallucinate"],
    ["planted", "Planted answer", "--o-planted"],
  ];
  const METRIC_NAME = { correct: "Correct", hallucinate: "Wrong answer", planted: "Planted answer" };
  const GOOD_WHEN_UP = { correct: true, hallucinate: false, planted: false };
  const COMPARISON_TEXT = {
    "F-A": "full system vs plain RAG",
    "F-B": "full system vs plain RAG with a reranker",
    "D-C": "refinement vs verifier only",
    "E-D": "rewrite loop vs refinement",
    "F-E": "abstain gate vs rewrite loop",
    "G-F": "single threshold vs two thresholds",
  };
  const BEIR_METHODS = [
    ["hybrid", "Hybrid search only", "--s-hybrid"],
    ["hybrid + ms-marco-minilm-l6-v2", "MiniLM-L6 reranker, off the shelf", "--s-base"],
    ["hybrid + bge-reranker-base", "bge-reranker-base", "--s-bge"],
    ["hybrid + verifier-minilm-l6-v4", "Our verifier, fine-tuned", "--s-ft"],
    ["hybrid + verifier-minilm-l6-v4-wise07", "Our verifier, WiSE-FT (alpha 0.7)", "--s-wise"],
  ];
  const DATASETS = [["scifact", "SciFact"], ["nfcorpus", "NFCorpus"], ["fiqa", "FiQA"]];

  let charts = [];
  let drawers = [];
  const root = () => document.getElementById("results");

  /* ------------------------------------------------------------ helpers */

  function lum(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return 0;
    const c = [0, 2, 4].map((i) => {
      const v = parseInt(m[1].slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function inkOn(bg) {
    const l = lum(bg);
    return 1.05 / (l + 0.05) >= (l + 0.05) / 0.053 ? "#ffffff" : "#0b0b0b";
  }

  function chartDefaults() {
    Chart.defaults.font.family = cssVar("--sans");
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cssVar("--ink-2");
    Chart.defaults.borderColor = cssVar("--rule");
  }

  function tableDetails(summary, caption, headers, rows) {
    return h("details", { class: "disclosure" },
      h("summary", {}, summary),
      h("div", { class: "tbl-wrap" },
        h("table", { class: "data" },
          h("caption", {}, caption),
          h("thead", {}, h("tr", {}, headers.map((x) => h("th", { scope: "col" }, x)))),
          h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c, i) => (i === 0 ? h("th", { scope: "row", class: "l" }, c) : h("td", {}, c)))))))));
  }

  function legend(items) {
    return h("ul", { class: "legend" }, items.map(([name, color, line]) =>
      h("li", {}, h("span", { class: "sw" + (line ? " line" : ""), style: line ? { borderTopColor: color, borderTopStyle: line } : { background: color } }), name)));
  }

  function canvasBox(height, label) {
    const c = h("canvas", { role: "img", "aria-label": label });
    return [h("div", { class: "canvas-wrap", style: { height: height + "px" } }, c), c];
  }

  function track(fn) {
    drawers.push(fn);
    fn();
  }
  function redraw() {
    charts.forEach((c) => c.destroy());
    charts = [];
    chartDefaults();
    drawers.forEach((fn) => fn());
  }

  /* weighted pooled numbers across slices, from the aggregate */
  function pooled(agg, arm, field) {
    let num = 0;
    let den = 0;
    SLICES.forEach((s) => {
      const m = agg[arm] && agg[arm][s];
      if (m && m[field] !== null && m[field] !== undefined) {
        num += m[field] * m.n;
        den += m.n;
      }
    });
    return den ? num / den : null;
  }

  function cmp(run, a, b, slice, metric) {
    return run.comparisons.find((c) => c.a === a && c.b === b && c.slice === slice && c.metric === metric);
  }

  /* ------------------------------------------------------------ headline strip */

  function tile(run, def) {
    const agg = run.aggregate;
    const { slice, metric, label, why } = def;
    const f = agg.F[slice][metric];
    const a = agg.A[slice][metric];
    const c = cmp(run, "F", "A", slice, metric);
    let cls = "flat";
    let word = "No clear change";
    let ic = "eq";
    if (c) {
      const sig = c.ci_low * c.ci_high > 0;
      if (sig) {
        const better = GOOD_WHEN_UP[metric] ? c.mean_diff > 0 : c.mean_diff < 0;
        cls = better ? "good" : "bad";
        word = better ? "Better" : "Worse";
        ic = c.mean_diff > 0 ? "up" : "down";
      }
    }
    return h("div", { class: "cell " + cls },
      h("div", { class: "lbl" }, label),
      h("div", { class: "val" }, fmt.pct(f), h("small", {}, "  full system")),
      h("div", { class: "vs" }, "Plain RAG: " + fmt.pct(a) + " on " + fmt.int(agg.F[slice].n) + " " + slice + " questions"),
      c ? h("div", { class: "delta " + cls }, icon(ic), word + ": " + fmt.pp(c.mean_diff),
        h("span", { class: "muted", style: { fontWeight: 400 } }, "95% CI " + fmt.pp(c.ci_low) + " to " + fmt.pp(c.ci_high))) : null,
      h("div", { class: "why" }, why));
  }

  function tokenTile(run) {
    const a = pooled(run.aggregate, "A", "context_tokens");
    const f = pooled(run.aggregate, "F", "context_tokens");
    const cut = 1 - f / a;
    return h("div", { class: "cell good" },
      h("div", { class: "lbl" }, "Context sent to the answer model"),
      h("div", { class: "val" }, fmt.int(f), h("small", {}, "  tokens per question")),
      h("div", { class: "vs" }, "Plain RAG: " + fmt.int(a) + " tokens"),
      h("div", { class: "delta good" }, icon("down"), "Smaller: " + fmt.pct(cut, 0) + " fewer tokens"),
      h("div", { class: "why" }, "Mean over all slices. No confidence interval: it is a size, not a rate."));
  }

  function headline(run) {
    const defs = [
      { slice: "supportive", metric: "hallucinate", label: "Wrong answers when the evidence is there", why: "Lower is better." },
      { slice: "missing", metric: "hallucinate", label: "Wrong guesses when the answer is missing", why: "Lower is better." },
      { slice: "misleading", metric: "planted", label: "Planted wrong answer repeated", why: "Lower is better. Swapped-in entity." },
      { slice: "supportive", metric: "correct", label: "Correct answers when the evidence is there", why: "The price of abstaining: some answerable questions get no answer." },
      { slice: "missing", metric: "correct", label: "Right answers without the gold paragraphs", why: "Abstaining also removes lucky or knowledge-based answers." },
    ];
    return h("div", { class: "strip" }, [...defs.map((d) => tile(run, d)), tokenTile(run)]);
  }

  /* ------------------------------------------------------------ outcome bars */

  function outcomeCharts(run) {
    const agg = run.aggregate;
    const boxes = SLICES.filter((s) => agg.A && agg.A[s]).map((slice) => {
      const [wrap, canvas] = canvasBox(300, "Outcome shares per arm, " + slice + " slice");
      const n = agg.A[slice].n;
      track(() => {
        const active = OUTCOMES.filter(([k]) => k !== "planted" || slice === "misleading");
        const surface = cssVar("--surface");
        const chart = new Chart(canvas, {
          type: "bar",
          data: {
            labels: ARMS.filter((a) => agg[a]).map((a) => a + "  " + ARM_NAME[a]),
            datasets: active.map(([key, name, v]) => ({
              label: name,
              data: ARMS.filter((a) => agg[a]).map((a) => agg[a][slice][key] * 100),
              backgroundColor: cssVar(v),
              borderColor: surface,
              borderWidth: (c) => (c.raw ? 2 : 0),
              barPercentage: 0.82,
              categoryPercentage: 0.9,
            })),
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
              x: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => v + "%", stepSize: 25 }, grid: { color: cssVar("--rule") } },
              y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, color: cssVar("--ink") } },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (c) => c.dataset.label + ": " + c.raw.toFixed(1) + "% (" + Math.round((c.raw / 100) * n) + " of " + n + ")",
                },
              },
            },
          },
          plugins: [{
            id: "segLabels",
            afterDatasetsDraw(ch) {
              const { ctx } = ch;
              ctx.save();
              ctx.font = "700 11px " + cssVar("--sans");
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ch.data.datasets.forEach((ds, di) => {
                ch.getDatasetMeta(di).data.forEach((bar, i) => {
                  const v = ds.data[i];
                  if (v < 7) return;
                  ctx.fillStyle = inkOn(ds.backgroundColor);
                  ctx.fillText(Math.round(v) + "", (bar.x + bar.base) / 2, bar.y);
                });
              });
              ctx.restore();
            },
          }],
        });
        charts.push(chart);
      });
      const rows = ARMS.filter((a) => agg[a]).map((a) => [a + " " + ARM_NAME[a], ...OUTCOMES.map(([k]) => (k === "planted" && slice !== "misleading" ? "n/a" : fmt.pct(agg[a][slice][k])))]);
      return h("div", { class: "chart-box" },
        h("h3", {}, slice[0].toUpperCase() + slice.slice(1) + " (" + n + " questions)"),
        h("p", { class: "sub" }, SLICE_NOTE[slice]),
        wrap,
        tableDetails("View as table", slice + " slice, share of questions", ["Arm", ...OUTCOMES.map((o) => o[1])], rows));
    });
    return [
      legend(OUTCOMES.map(([, name, v]) => [name, "var(" + v + ")"])),
      h("div", { class: "charts-3" }, boxes),
    ];
  }

  /* ------------------------------------------------------------ risk-coverage */

  function riskCoverage(run) {
    const rc = run.risk_coverage;
    if (!rc || !rc.all) return h("p", { class: "cap" }, "This run has no arm F, so there is no risk-coverage curve.");
    const [wrap, canvas] = canvasBox(360, "Risk-coverage curves for arm F");
    const kinds = [["all", "All slices", null], ["supportive", "Supportive", [6, 4]], ["missing", "Missing", [2, 3]], ["misleading", "Misleading", [10, 3, 2, 3]]];
    const f = run.aggregate.F;
    let answered = 0;
    let right = 0;
    let total = 0;
    SLICES.forEach((s) => {
      if (f[s]) {
        answered += f[s].answered;
        right += f[s].correct * f[s].n;
        total += f[s].n;
      }
    });
    const op = { x: answered / total, y: right / answered };
    const tau = run.meta.tau_abstain && run.meta.tau_abstain.F;
    track(() => {
      const chart = new Chart(canvas, {
        type: "line",
        data: {
          datasets: [
            ...kinds.filter(([k]) => rc[k]).map(([k, name, dash]) => ({
              label: name,
              data: rc[k].points.map((p) => ({ x: p.coverage, y: p.selective_accuracy })),
              borderColor: k === "all" ? cssVar("--accent") : cssVar("--muted"),
              borderWidth: k === "all" ? 3 : 2,
              borderDash: dash || [],
              pointRadius: 0,
              pointHoverRadius: 5,
              tension: 0,
              order: k === "all" ? 0 : 1,
            })),
            {
              label: "Chosen threshold" + (tau !== undefined ? " (" + tau + ")" : ""),
              data: [op],
              type: "scatter",
              backgroundColor: cssVar("--surface"),
              borderColor: cssVar("--ink"),
              borderWidth: 3,
              pointRadius: 7,
              pointHoverRadius: 9,
              order: -1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "nearest", intersect: false, axis: "x" },
          scales: {
            x: { type: "linear", min: 0, max: 1, title: { display: true, text: "Coverage: share of questions answered" }, ticks: { callback: (v) => Math.round(v * 100) + "%" }, grid: { color: cssVar("--rule") } },
            y: { min: 0, max: 1, title: { display: true, text: "Selective accuracy: share of answers that are correct" }, ticks: { callback: (v) => Math.round(v * 100) + "%" }, grid: { color: cssVar("--rule") } },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: () => "",
                label: (c) => c.dataset.label + ": coverage " + fmt.pct(c.parsed.x) + ", accuracy " + fmt.pct(c.parsed.y),
              },
            },
          },
        },
      });
      charts.push(chart);
    });
    const rows = kinds.filter(([k]) => rc[k]).map(([k, name]) => [name, fmt.int(rc[k].n), fmt.pct(rc[k].max_coverage), fmt.num(rc[k].auc_normalized, 3)]);
    return [
      legend([
        ...kinds.filter(([k]) => rc[k]).map(([k, name, dash]) => [name, k === "all" ? "var(--accent)" : "var(--muted)", dash ? (k === "supportive" ? "dashed" : k === "missing" ? "dotted" : "dashed") : "solid"]),
        ["Chosen threshold (pooled)", "var(--ink)", null],
      ]),
      wrap,
      tableDetails("View as table", "Area under the selective-accuracy curve", ["Slice", "Questions", "Max coverage", "Normalized AUC"], rows),
    ];
  }

  /* ------------------------------------------------------------ context tokens */

  function tokenChart(run) {
    const agg = run.aggregate;
    const arms = ARMS.filter((a) => agg[a]);
    const [wrap, canvas] = canvasBox(280, "Mean context tokens per arm");
    track(() => {
      const values = arms.map((a) => pooled(agg, a, "context_tokens"));
      const chart = new Chart(canvas, {
        type: "bar",
        data: {
          labels: arms.map((a) => a + "  " + ARM_NAME[a]),
          datasets: [{
            data: values,
            backgroundColor: arms.map((a) => (a === "F" ? cssVar("--accent") : cssVar("--s-hybrid"))),
            borderRadius: 3,
            barPercentage: 0.7,
          }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          layout: { padding: { right: 44 } },
          scales: {
            x: { min: 0, grid: { color: cssVar("--rule") }, title: { display: true, text: "Tokens (about 4 characters each)" } },
            y: { grid: { display: false }, ticks: { autoSkip: false, color: cssVar("--ink") } },
          },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt.int(c.raw) + " tokens on average" } } },
        },
        plugins: [{
          id: "valueLabels",
          afterDatasetsDraw(ch) {
            const { ctx } = ch;
            ctx.save();
            ctx.font = "700 12px " + cssVar("--sans");
            ctx.fillStyle = cssVar("--ink");
            ctx.textBaseline = "middle";
            ch.getDatasetMeta(0).data.forEach((bar, i) => ctx.fillText(fmt.int(values[i]), bar.x + 6, bar.y));
            ctx.restore();
          },
        }],
      });
      charts.push(chart);
    });
    const rows = arms.map((a) => [a + " " + ARM_NAME[a], ...SLICES.map((s) => fmt.int(agg[a][s] && agg[a][s].context_tokens)), fmt.int(pooled(agg, a, "context_tokens"))]);
    return [wrap, tableDetails("View as table", "Mean context tokens per question", ["Arm", ...SLICES.map((s) => s[0].toUpperCase() + s.slice(1)), "All"], rows)];
  }

  /* ------------------------------------------------------------ bootstrap table */

  function forest(c, scale) {
    const W = 190;
    const x = (v) => W / 2 + (v / scale) * (W / 2 - 6);
    const sig = c.ci_low * c.ci_high > 0;
    const ns = "http://www.w3.org/2000/svg";
    const el = (n, a) => {
      const e = document.createElementNS(ns, n);
      Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v));
      return e;
    };
    const svg = el("svg", { viewBox: "0 0 " + W + " 22", "aria-hidden": "true" });
    svg.appendChild(el("line", { class: "zero", x1: x(0), x2: x(0), y1: 2, y2: 20 }));
    svg.appendChild(el("line", { class: "ci" + (sig ? " sig" : ""), x1: x(c.ci_low), x2: x(c.ci_high), y1: 11, y2: 11 }));
    svg.appendChild(el("circle", { class: "pt" + (sig ? " sig" : ""), cx: x(c.mean_diff), cy: 11, r: 4.5 }));
    return h("div", { class: "forest" }, svg);
  }

  function bootstrap(run) {
    const pairs = [...new Set(run.comparisons.map((c) => c.a + "-" + c.b))];
    const wrap = h("div", {});
    const sel = h("select", { id: "cmp-pick" }, pairs.map((p) => h("option", { value: p }, p.replace("-", " vs ") + ": " + (COMPARISON_TEXT[p] || ""))));
    sel.value = pairs.includes("F-A") ? "F-A" : pairs[0];
    const body = h("div", {});
    const draw = () => {
      const [a, b] = sel.value.split("-");
      const rows = run.comparisons.filter((c) => c.a === a && c.b === b);
      const scale = Math.max(0.02, ...rows.map((c) => Math.max(Math.abs(c.ci_low), Math.abs(c.ci_high))));
      body.replaceChildren(
        h("div", { class: "tbl-wrap" }, h("table", { class: "data" },
          h("caption", {}, a + " minus " + b + ", paired by question. Forest scale: ±" + fmt.pp(scale, 0).replace("+", "")),
          h("thead", {}, h("tr", {},
            h("th", { class: "l", scope: "col" }, "Slice"), h("th", { class: "l", scope: "col" }, "Metric"), h("th", { scope: "col" }, "n"),
            h("th", { scope: "col" }, "Difference"), h("th", { scope: "col" }, "95% CI"), h("th", { class: "l", scope: "col" }, "Interval vs zero"),
            h("th", { scope: "col" }, "p"), h("th", { class: "l", scope: "col" }, "Reading"))),
          h("tbody", {}, rows.map((c) => {
            const sig = c.ci_low * c.ci_high > 0;
            const better = GOOD_WHEN_UP[c.metric] ? c.mean_diff > 0 : c.mean_diff < 0;
            const reading = !sig ? "no clear difference" : (better ? a : b) + " is better";
            return h("tr", { class: sig ? "sig" : "" },
              h("td", { class: "l" }, c.slice),
              h("td", { class: "l" }, METRIC_NAME[c.metric] || c.metric),
              h("td", {}, c.n),
              h("td", {}, fmt.pp(c.mean_diff), h("span", { class: "sigmark", title: sig ? "95% CI excludes 0" : "" }, sig ? " *" : "")),
              h("td", {}, fmt.pp(c.ci_low) + " to " + fmt.pp(c.ci_high)),
              h("td", { class: "l" }, forest(c, scale)),
              h("td", {}, c.p_value.toFixed(3)),
              h("td", { class: "l" }, sig ? h("span", { class: "pill " + (better ? "correct" : "hallucinate") }, icon(better ? "check" : "x"), reading) : h("span", { class: "muted" }, reading)));
          })))));
    };
    sel.addEventListener("change", draw);
    draw();
    wrap.append(
      h("div", { class: "filters" }, h("label", {}, "Comparison", sel)),
      body,
      h("p", { class: "cap", style: { marginTop: "0.6rem" } }, "* the 95% interval excludes zero. Filled blue marks are those cases. The interval comes from 10,000 paired bootstrap resamples of the questions."));
    return wrap;
  }

  /* ------------------------------------------------------------ BEIR */

  function beir(rows) {
    const get = (ds, m) => rows.find((r) => r.dataset === ds && r.method === m);
    const avail = BEIR_METHODS.filter(([m]) => DATASETS.every(([d]) => get(d, m)));
    if (!avail.length) return h("p", { class: "cap" }, "The retrieval summary has none of the expected rows.");
    const [wrap, canvas] = canvasBox(300, "nDCG@10 per method and BEIR dataset");
    track(() => {
      const chart = new Chart(canvas, {
        type: "bar",
        data: {
          labels: DATASETS.map((d) => d[1]),
          datasets: avail.map(([m, name, v]) => ({
            label: name,
            data: DATASETS.map(([d]) => get(d, m)["ndcg@10"]),
            backgroundColor: cssVar(v),
            borderColor: cssVar("--surface"),
            borderWidth: 1,
            borderRadius: 2,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            y: { min: 0, title: { display: true, text: "nDCG@10 (x100)" }, grid: { color: cssVar("--rule") } },
            x: { grid: { display: false } },
          },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + c.raw.toFixed(1) } } },
        },
      });
      charts.push(chart);
    });
    const best = {};
    DATASETS.forEach(([d]) => (best[d] = Math.max(...avail.map(([m]) => get(d, m)["ndcg@10"]))));
    const table = h("div", { class: "tbl-wrap" }, h("table", { class: "data" },
      h("caption", {}, "nDCG@10 x100, test split, rerank depth 50. Best per dataset is shaded."),
      h("thead", {}, h("tr", {}, h("th", { class: "l", scope: "col" }, "Method"), DATASETS.map((d) => h("th", { scope: "col" }, d[1])), h("th", { scope: "col" }, "Mean"))),
      h("tbody", {}, avail.map(([m, name, v]) => {
        const vals = DATASETS.map(([d]) => get(d, m)["ndcg@10"]);
        return h("tr", {},
          h("th", { class: "l", scope: "row" }, h("span", { class: "sw", style: { display: "inline-block", width: "0.8rem", height: "0.8rem", borderRadius: "2px", marginRight: "0.5rem", background: "var(" + v + ")" } }), name),
          vals.map((x, i) => h("td", { class: x === best[DATASETS[i][0]] ? "best" : "" }, x.toFixed(1))),
          h("td", {}, (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)));
      }))));
    return [legend(avail.map(([, name, v]) => [name, "var(" + v + ")"])), wrap, table];
  }

  /* ------------------------------------------------------------ page */

  function section(title, caption, ...body) {
    return h("section", { class: "sec" }, h("h2", {}, title), caption ? h("p", { class: "cap" }, caption) : null, ...body);
  }

  function render(run, runs, retrieval) {
    drawers = [];
    charts.forEach((c) => c.destroy());
    charts = [];
    chartDefaults();
    const split = run.meta.split;
    const tau = run.meta.tau_abstain && run.meta.tau_abstain.F;
    const headlineRun = runs.headline === run.run;
    const nq = SLICES.map((s) => run.aggregate.F[s] && s + " " + run.aggregate.F[s].n).filter(Boolean).join(", ");
    const pick = h("select", { id: "run-pick", "aria-label": "Evaluation run" },
      runs.runs.filter((r) => !r.dryrun).map((r) => h("option", { value: r.name }, r.name + " (" + r.split + " split)" + (r.headline ? ", headline" : ""))));
    pick.value = run.run;
    pick.addEventListener("change", () => load(pick.value));

    const note = headlineRun
      ? "Showing the " + split + " split: it was not used to tune any threshold, so it is the number to trust."
      : split === "dev"
        ? "Showing the dev split. Thresholds were tuned on it, so these numbers are optimistic; the test split replaces them when it is available."
        : "Showing the " + split + " split.";

    root().replaceChildren(
      h("div", { class: "page-h" },
        h("div", {},
          h("h1", {}, "Does the verifier help, and where does it hurt?"),
          h("p", { class: "lede" }, "Full system (arm F) against plain RAG (arm A) on HotpotQA questions, each asked three ways: with the evidence, without it, and with a wrong answer planted in it.")),
        h("label", { class: "run-pick" }, "Run", pick)),
      h("p", { class: "run-note" }, note + " " + nq + " questions. Abstain threshold " + (tau !== undefined ? tau : "n/a") + ". Answers generated by one open model for every arm."),
      headline(run),

      section("What happened to each answer",
        "Each bar is one setup, split into what its answers turned out to be. More blue is better. Grey is a refusal: harmless on the missing slice, a cost on the supportive one. Orange and violet are wrong answers; violet is the planted entity.",
        ...outcomeCharts(run)),

      section("Answering fewer questions to be right more often",
        "Each point is an abstain threshold. Moving left answers fewer questions, and the share of correct answers among them should rise. A flat or falling line means the sufficiency score cannot tell good evidence from bad on that slice. The ringed dot is the threshold in use.",
        ...riskCoverage(run)),

      section("Less text for the answer model",
        "Mean tokens of context per question. The verifier keeps passages that look relevant and refinement keeps only their useful sentences, so arms D to G send far less than plain RAG.",
        ...tokenChart(run)),

      section("Is the difference real?",
        "Per-question differences between two setups with bootstrap intervals. A bar that crosses the zero line means the data cannot separate the two. Most small gaps do.",
        bootstrap(run)),

      retrieval ? section("Verifier as a reranker on BEIR",
        "BEIR is out of domain for the verifier, which was trained on HotpotQA and MS MARCO style data. The table shows what fine-tuning cost on these three sets and how much averaging with the base weights (WiSE-FT) gave back.",
        ...beir(retrieval.rows)) : null,
    );
    document.title = "Results (" + split + ") - Verified RAG";
  }

  let cache = { runs: null, retrieval: undefined };

  async function load(name) {
    root().replaceChildren(h("p", { class: "loading" }, "Loading results..."));
    try {
      if (!cache.runs) cache.runs = await getJSON("/api/runs");
      if (cache.retrieval === undefined) {
        try {
          cache.retrieval = await getJSON("/api/retrieval");
        } catch (e) {
          cache.retrieval = null;
        }
      }
      const target = name || cache.runs.headline;
      if (!target) {
        root().replaceChildren(h("div", { class: "empty" }, h("h2", {}, "No results yet"),
          "Run scripts/run_qa_eval.py finalize to write results/qa/<run>/metrics.json, then reload."));
        return;
      }
      const run = await getJSON("/api/runs/" + encodeURIComponent(target));
      render(run, cache.runs, cache.retrieval);
    } catch (e) {
      root().replaceChildren(h("div", { class: "notice err", role: "alert" }, h("b", {}, "Could not load results"),
        e.message + ". Start the server with: uvicorn vrag.api.app:app"));
    }
  }

  onTheme(() => redraw());
  document.addEventListener("DOMContentLoaded", () => load());
})();
