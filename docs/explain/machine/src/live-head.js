/* ------------------------------------------------------------------ VRAGMachine runtime
   Everything below the kit is plain browser JS. Every moving thing is a pure function of the
   time inside a step ("clips"), so any moment can be reproduced exactly (m.seek) and a step can be
   skipped to its end state (reduced motion, go()). */
const L = __LAYOUT__;
const ART = __ART__;
const P = L.P;
const TH = __THRESHOLDS__;
const RETRIEVE_TOP = 20; // results/report.md: "hybrid retrieval ... top 20"
const NS = "http://www.w3.org/2000/svg";
const STEP_IDS = ["ask", "search", "inspect", "decide", "trim", "weigh", "answer"];
const ST = Object.fromEntries(L.STATIONS.map((s) => [s.id, s]));
const BY = L.BELT_Y;
const XG = ST.gauge.toolX, XBAR = ST.gate.toolX, XP = ST.press.toolX, XPAN = ST.scale.toolX, XO = ST.output.toolX;
const XDEAL = L.FEEDER.x + L.FEEDER.w + L.DRAWER.open - 23; // centre of the stack when the drawer is open
const XBELT0 = L.BELT.x + 14;
const ZB = L.BELT_TOP;
const STACK_TOP = L.DRAWER.floor + 12 * L.STACK.sheet;
const BIN_MID = 1000 + vDepth(L.BIN.x + L.BIN.w / 2, L.BIN.y + L.BIN.d / 2, 6);

function vDepth(x, y, z) { return depthOf([x, y, z], P); }
const O = iso([0, 0, 0], P);
const off = (x, y, z) => { const p = iso([x, y, z], P); return [p[0] - O[0], p[1] - O[1]]; };
const tr = (x, y, z) => { const o = off(x, y, z); return `translate(${Math.round(o[0] * 100) / 100} ${Math.round(o[1] * 100) / 100})`; };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (p) => p * p * (3 - 2 * p);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeIn = (p) => p * p * p;
const prog = (t, a, b) => clamp((t - a) / (b - a || 1e-6));
const spring = (p) => { // under-damped step response over p in 0..1 (settles by the end)
  if (p >= 1) return 1;
  const w = 11, z = 0.46, T = 1.7, t = p * T, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
};
const fmt3 = (v) => v.toFixed(3);
const fmt2 = (v) => v.toFixed(2);
const decode = (s) => String(s == null ? "" : s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function wrapText(text, perLine, maxLines) {
  const words = decode(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (let w of words) {
    while (w.length > perLine) { if (cur) { lines.push(cur); cur = ""; } lines.push(w.slice(0, perLine)); w = w.slice(perLine); }
    if (!cur) cur = w; else if ((cur + " " + w).length <= perLine) cur += " " + w; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const cut = lines.slice(0, maxLines); cut[maxLines - 1] = cut[maxLines - 1].slice(0, Math.max(1, perLine - 1)).replace(/\s+$/, "") + "…"; return cut; }
  return lines;
}
const cleanText = (s) => decode(s).replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
const cut = (text, n) => { const t = decode(text); return t.length > n ? t.slice(0, n - 1).replace(/\s+$/, "") + "…" : t; };

/* ------------------------------------------------------------------ words, English and Egyptian Arabic */
const I18N = {
  en: {
    label: "Verified RAG inspection line: a bench where a question's evidence is checked, trimmed and weighed before an answer is stamped, or 'I don't know' is stamped instead.",
    steps: ["Ask", "Search", "Inspect", "Decide", "Trim", "Weigh", "Answer"],
    mode: { manual: "Manual", auto: "Auto" },
    modeLabel: "Mode",
    scenarioLabel: "Example",
    reset: "Start over",
    next: "Next step",
    lens: { idle: "The lens shows the station that is working.", askNote: "The question goes into the machine.", found: "paragraphs pulled", topShown: (n) => `top ${n} shown`, gold: "needed", best: "best score", again: "New questions", words: "Words sent", wordsA: "plain RAG", wordsF: "this line", kept: "kept", dropped: "dropped", enough: "enough", notEnough: "not enough", line: "line", cited: "Cited context", checked: "Context checked", rightAnswer: "Right answer", plain: "Plain RAG said", thisLine: "This line said", sufficiency: "sufficiency", gate: "Gate", sentences: "Sentences" },
    idea: "The big idea: check the evidence before you answer, and say 'I don't know' when it isn't there.",
    scn: { support: "Good evidence", missing: "Evidence missing", fooled: "Planted answer, caught", fail: "Planted answer, missed", cost: "Too careful" },
    plates: { feed: "Ask · Search", gauge: "Inspect", gate: "Decide", press: "Trim", scale: "Weigh", output: "Answer" },
    caps: { feed: "paragraphs", pips: "scored", best: "best score", words: "words sent", line: "line", cite: "sources", lo: "not enough", hi: "enough", bin: "dropped" },
    lamp: { pass: "Correct", hold: "Ambiguous", reject: "Incorrect" },
    stamp: { pass: "ANSWER", abstain: "I DON'T KNOW" },
    noEvidence: "not enough evidence",
    snd: { ask: "plop!", search: "shhk!", tick: "tick", ding: "ding!", whirr: "whirr", thunk: "THUNK!", plink: "plink", bong: "bong!", stamp: "KA-CHUNK!" },
    hints: {
      ask: () => "A question goes into the machine.",
      search: () => `A drawer pulls out the top ${RETRIEVE_TOP} paragraphs that might help.`,
      inspect: () => "A gauge gives every paragraph a score from 0 to 1: how much it helps.",
      decide: (M) => M.decision === "correct" ? `The best score is high (${fmt2(TH.tau_hi)} or more), so the gate lets the evidence straight through.` : M.decision === "incorrect" ? `The best score is low (${fmt2(TH.tau_lo)} or less), so a ticket goes back and the machine searches again with new questions.` : `The best score is in the middle, so a ticket goes back and the machine searches again with new questions.`,
      trim: () => "A press cuts each paragraph down to the sentences that matter. The rest fall in the bin.",
      weigh: () => `A scale weighs what is left. Is it enough to answer? The red line (${fmt2(TH.tau_abstain)}) is the minimum.`,
      answer: (M) => M.abstain ? "Not enough evidence, so the line stamps “I don't know” instead of guessing." : "Enough evidence, so the answer is stamped with the sources it came from.",
    },
    chips: {
      q: "Question", pulled: "Pulled from the drawer", pulledV: (n, top) => `${RETRIEVE_TOP} paragraphs, top ${top} shown`, best: "Best score", passed: "Passed the gauge", passedV: (a, b) => `${a} of ${b} paragraphs`,
      decision: "Gate", dec: { correct: "Correct", ambiguous: "Ambiguous", incorrect: "Incorrect" },
      decV: (d) => d === "correct" ? `high, ${fmt2(TH.tau_hi)} or more` : d === "incorrect" ? `low, ${fmt2(TH.tau_lo)} or less` : `between ${fmt2(TH.tau_lo)} and ${fmt2(TH.tau_hi)}`,
      again: "Searched again", total: "Paragraphs seen in all", sent: "Sentences", sentV: (k, d) => `${k} kept, ${d} dropped`, words: "Words sent to the answer model", enough: "Enough evidence?", enoughV: (p, ok) => `${fmt3(p)} vs line ${fmt2(TH.tau_abstain)}: ${ok ? "enough" : "not enough"}`,
      gold: "Right answer", plain: "Plain RAG said", line: "This line said", idk: "I don't know",
      out: { correct: "right", hallucinate: "wrong", planted: "planted answer", abstain: "didn't answer" },
    },
  },
  ar: {
    label: "خط فحص Verified RAG: ترابيزة بتفحص دليل السؤال وبتقصّه وبتوزنه قبل ما تختم الإجابة، أو تختم “مش عارف”.",
    steps: ["اسأل", "دوّر", "افحص", "قرّر", "قصّ", "زُن", "جاوب"],
    mode: { manual: "يدوي", auto: "أوتوماتيك" },
    modeLabel: "الوضع",
    scenarioLabel: "المثال",
    reset: "ابدأ من الأول",
    next: "الخطوة الجاية",
    lens: { idle: "العدسة بتوريك المحطة اللي شغالة.", askNote: "السؤال بيدخل الماكينة.", found: "فقرة اتسحبت", topShown: (n) => `أعلى ${n} معروضين`, gold: "مطلوبة", best: "أعلى درجة", again: "أسئلة جديدة", words: "الكلمات المبعوتة", wordsA: "RAG العادي", wordsF: "الخط ده", kept: "اتحفظت", dropped: "اتشالت", enough: "كفاية", notEnough: "مش كفاية", line: "الحد", cited: "السياق المستشهد بيه", checked: "السياق اللي اتفحص", rightAnswer: "الإجابة الصح", plain: "RAG العادي قال", thisLine: "الخط ده قال", sufficiency: "الكفاية", gate: "البوابة", sentences: "الجمل" },
    idea: "الفكرة الكبيرة: اتأكد من الدليل قبل ما تجاوب، وقول “مش عارف” لما الدليل مايكونش موجود.",
    scn: { support: "الدليل موجود", missing: "الدليل ناقص", fooled: "إجابة مزروعة واتمسكت", fail: "إجابة مزروعة وعدّت", cost: "حذر زيادة" },
    plates: { feed: "اسأل · دوّر", gauge: "افحص", gate: "قرّر", press: "قصّ", scale: "زُن", output: "جاوب" },
    caps: { feed: "فقرة", pips: "اتقاسوا", best: "أعلى درجة", words: "كلمات اتبعتت", line: "الحد", cite: "المصادر", lo: "مش كفاية", hi: "كفاية", bin: "اتشالت" },
    lamp: { pass: "صح", hold: "مش واضح", reject: "غلط" },
    stamp: { pass: "إجابة", abstain: "مش عارف" },
    noEvidence: "الدليل مش كفاية",
    snd: { ask: "بلوب!", search: "شخّ!", tick: "تك", ding: "دينج!", whirr: "زززز", thunk: "طخّ!", plink: "بلينك", bong: "بونج!", stamp: "كاتشونك!" },
    hints: {
      ask: () => "سؤال بيدخل الماكينة.",
      search: () => `الدرج بيطلّع أحسن ${RETRIEVE_TOP} فقرة ممكن تفيد.`,
      inspect: () => "المقياس بيدّي كل فقرة درجة من 0 لـ 1: قد إيه بتفيد.",
      decide: (M) => M.decision === "correct" ? `أعلى درجة عالية (${fmt2(TH.tau_hi)} أو أكتر)، فالبوابة بتعدّي الدليل علطول.` : M.decision === "incorrect" ? `أعلى درجة واطية (${fmt2(TH.tau_lo)} أو أقل)، فبترجّع تذكرة والماكينة بتدوّر تاني بأسئلة جديدة.` : `أعلى درجة في النص، فبترجّع تذكرة والماكينة بتدوّر تاني بأسئلة جديدة.`,
      trim: () => "المكبس بيقصّ كل فقرة لحد الجمل المهمة بس. الباقي بيقع في الصندوق.",
      weigh: () => `الميزان بيوزن اللي فضل. كفاية نجاوب ولا لأ؟ الخط الأحمر (${fmt2(TH.tau_abstain)}) هو الحد الأدنى.`,
      answer: (M) => M.abstain ? "الدليل مش كفاية، فالخط بيختم “مش عارف” بدل ما يخمّن." : "الدليل كفاية، فالإجابة بتتختم مع المصادر اللي جت منها.",
    },
    chips: {
      q: "السؤال", pulled: "اتسحب من الدرج", pulledV: (n, top) => `${RETRIEVE_TOP} فقرة، بنعرض أعلى ${top}`, best: "أعلى درجة", passed: "عدّت من المقياس", passedV: (a, b) => `${a} من ${b} فقرات`,
      decision: "البوابة", dec: { correct: "صح", ambiguous: "مش واضح", incorrect: "غلط" },
      decV: (d) => d === "correct" ? `عالية، ${fmt2(TH.tau_hi)} أو أكتر` : d === "incorrect" ? `واطية، ${fmt2(TH.tau_lo)} أو أقل` : `بين ${fmt2(TH.tau_lo)} و ${fmt2(TH.tau_hi)}`,
      again: "دوّرنا تاني", total: "فقرات اتشافت كلها", sent: "الجمل", sentV: (k, d) => `${k} اتحفظت، ${d} اتشالت`, words: "كلمات اتبعتت لموديل الإجابة", enough: "الدليل كفاية؟", enoughV: (p, ok) => `${fmt3(p)} مقابل الحد ${fmt2(TH.tau_abstain)}: ${ok ? "كفاية" : "مش كفاية"}`,
      gold: "الإجابة الصح", plain: "RAG العادي قال", line: "الخط ده قال", idk: "مش عارف",
      out: { correct: "صح", hallucinate: "غلط", planted: "إجابة مزروعة", abstain: "ماجاوبش" },
    },
  },
};

const ARC = (cx, cy, r, v0, v1, sweep, start) => {
  const pts = [];
  const n = Math.max(2, Math.ceil(Math.abs(v1 - v0) * 48));
  for (let i = 0; i <= n; i++) { const a = ((start + sweep * (v0 + ((v1 - v0) * i) / n)) * Math.PI) / 180; pts.push(`${(cx + r * Math.sin(a)).toFixed(1)} ${(cy - r * Math.cos(a)).toFixed(1)}`); }
  return "M" + pts.join("L");
};
const TICKS = (cx, cy, r, count, every, lens, sweep, start) => {
  let minor = "", major = "";
  for (let i = 0; i <= count; i++) {
    const a = ((start + (sweep * i) / count) * Math.PI) / 180, l = i % every === 0 ? lens[1] : lens[0];
    const d = `M${(cx + (r - l) * Math.sin(a)).toFixed(1)} ${(cy - (r - l) * Math.cos(a)).toFixed(1)}L${(cx + r * Math.sin(a)).toFixed(1)} ${(cy - r * Math.cos(a)).toFixed(1)}`;
    if (i % every === 0) major += d; else minor += d;
  }
  return { minor, major };
};
const ICON = {
  pass: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
  hold: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.8-3.8M3.2 2.6l1.8 1.8-2 .9"/></svg>',
  reject: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  plant: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V2.5M4 3h8l-2 2.8 2 2.7H4"/></svg>',
  abstain: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6"/><path d="M6.2 6.4a1.9 1.9 0 1 1 2.6 1.8c-.5.3-.8.7-.8 1.3M8 11.6v.1"/></svg>',
};

/* ------------------------------------------------------------------ the story of one scenario, from the trace */
function derive(D, key) {
  const s = D.scenarios[key], F = s.F, A = s.A;
  const first = F.top.filter((t) => !t.rewrite), later = F.top.filter((t) => t.rewrite);
  const decision = F.decision;
  const queries = F.queries.map(decode);
  const abstain = !!F.abstain || F.outcome === "abstain";
  const sentences = F.sentences.map((x) => ({ text: cleanText(x.text), prob: x.prob, kept: !!x.kept }));
  return {
    key, question: decode(s.question), gold: decode(s.gold), planted: s.planted && decode(s.planted), A, F,
    first, later, selFirst: first.filter((t) => t.selected), decision, finalDecision: F.final_decision || decision,
    newQ: queries.slice(1), rewrote: queries.length > 1 && decision !== "correct", best: F.best_prob,
    sentences, kept: sentences.filter((x) => x.kept), dropped: sentences.filter((x) => !x.kept),
    suff: F.sufficiency, abstain, answer: F.answer == null ? "" : decode(F.answer), citations: F.citations || [],
    wordsA: A.words_sent, wordsF: F.words_sent, aAnswer: decode(A.answer), aOutcome: A.outcome, fOutcome: F.outcome, nRetrieved: F.n_retrieved,
  };
}

/* ------------------------------------------------------------------ small drawing helpers (kit) */
const S = (paths, style) => solidSvg(paths, style);
const slab = (cx, cy, w, d, t, o = {}) => S(slabOf({ x: cx - w / 2, y: cy - d / 2, w, d, r: o.r ?? 1.2 }, 0, t, P, o.steps ?? 2, o.bevel ?? 0.25), { tone: o.tone ?? "mid", crease: o.crease ?? "faint", lit: o.lit });
const topPoly = (pts, z) => pathOf(pts.map(([x, y]) => iso([x, y, z], P)), true);
function slipArt(i, prob, sel) {
  const w = L.SLIP.w, d = L.SLIP.d, t = L.SLIP.t, z = t + 0.05;
  let s = slab(0, 0, w, d, t, { tone: "mid", crease: "none", r: 1.6 });
  s += lineSvg(lineOnTop([-w / 2 + 2.4, -d / 2 + 3.6], [w / 2 - 6, -d / 2 + 3.6], z, P) + lineOnTop([-w / 2 + 2.4, -d / 2 + 6.6], [w / 2 - 3, -d / 2 + 6.6], z, P), { tone: "lo", free: true });
  s += `<path class="vrm-bar" data-ref="bar" d="" style="display:none"/>`;
  s += `<path class="vrm-mark" data-ref="mark" d="${pathOf([iso([w / 2 - 7, d / 2 - 3.8, z], P), iso([w / 2 - 5.4, d / 2 - 2.2, z], P), iso([w / 2 - 2.8, d / 2 - 5.6, z], P)])}" style="display:none"/>`;
  return s;
}
const barPath = (wd) => (wd <= 0.05 ? "" : topPoly([[-L.SLIP.w / 2 + 2.4, L.SLIP.d / 2 - 5.6], [-L.SLIP.w / 2 + 2.4 + wd, L.SLIP.d / 2 - 5.6], [-L.SLIP.w / 2 + 2.4 + wd, L.SLIP.d / 2 - 2.8], [-L.SLIP.w / 2 + 2.4, L.SLIP.d / 2 - 2.8]], L.SLIP.t + 0.05));

