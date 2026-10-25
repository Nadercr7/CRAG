/* Verified RAG explainer. Every number comes from window.VRAG_DATA (or is quoted from results/report.md and marked "quoted").
   Figures are built per language part: the same builders run under #en and #ar and read their words from T[lang]. */
(function () {
  "use strict";
  var D = window.VRAG_DATA;
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var RM = function () { return reduceMQ.matches; };
  var HAS_GSAP = typeof window.gsap !== "undefined";
  if (HAS_GSAP && window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger);

  /* ---------------- helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "on") Object.keys(v).forEach(function (e) { el.addEventListener(e, v[e]); });
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function clean(s) { return String(s == null ? "" : s).replace(/&amp;/g, "&"); }
  function get(obj, path) { return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, obj); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  var f1 = function (v) { return v.toFixed(1); };
  var f2 = function (v) { return v.toFixed(2); };
  var f3 = function (v) { return v.toFixed(3); };
  var pct1 = function (v) { return (v * 100).toFixed(1) + "%"; };
  var intl = function (v) { return Math.round(v).toLocaleString("en"); };
  var sgn = function (v) { return (v < 0 ? "−" : "+") + Math.abs(v).toFixed(1); };
  function tpl(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ""; }); }
  function tween(el, from, to) { if (HAS_GSAP && !RM()) window.gsap.fromTo(el, from, to); }

  var ICON = {
    pass: '<path d="M3 8.5l3.2 3L13 4.5"/>',
    reject: '<path d="M4 4l8 8M12 4l-8 8"/>',
    hold: '<path d="M2.5 8c1.6-3 3.4-3 5.5 0s3.9 3 5.5 0"/>',
    abstain: '<circle cx="8" cy="8" r="5.8"/><path d="M5.2 8h5.6"/>',
    plant: '<path d="M4 14V2.2M4 3h8l-2 3 2 3H4"/>',
  };
  function icon(k, size) {
    var s = size || 14;
    return '<svg viewBox="0 0 16 16" width="' + s + '" height="' + s + '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + ICON[k] + "</svg>";
  }
  var STAR = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="currentColor"><path d="M8 1.6l1.9 4.1 4.4.5-3.3 3 .9 4.4L8 11.4l-3.9 2.2.9-4.4-3.3-3 4.4-.5z"/></svg>';
  function badge(k, text) { return h("span", { class: "badge", "data-k": k, html: icon(k) }, h("span", { text: text })); }
  var OUT2K = { correct: "pass", abstain: "abstain", hallucinate: "reject", planted: "plant" };

  /* ---------------- words ---------------- */
  var T = {
    en: {
      kinds: { pass: "Correct", abstain: "I don't know", reject: "Wrong answer", plant: "Repeated the planted answer", hold: "Ambiguous", low: "Incorrect" },
      sc: { support: "Documentaries", missing: "Cathedrals", fooled: "Uyoku dantai", fail: "Sun Valley", cost: "Williams play" },
      qgloss: {},
      scLabel: "Question:",
      cond: { supportive: "Supportive (right pages present)", missing: "Missing (right pages removed)", misleading: "Misleading (answer swapped)" },
      condShort: { supportive: "Supportive", missing: "Missing", misleading: "Misleading" },
      g: {
        q1: "What is the capital of France?", a1: "Paris.", q2: "Who won the Nile Language School quiz in 2019?", a2: "Mariam Hassan won it, with a perfect score.",
        known: "Real knowledge", made: "Made up", reveal: "Reveal which answer is made up", hide: "Hide the labels",
      },
      lib: {
        you: "You", libr: "Librarian", write: "Writer", shelf: "Library", q: "Question", pile: "Pile of pages", ans: "Answer", nocheck: "No check here",
        steps: [
          "You ask a question.",
          "The librarian runs to the shelves and picks pages that look related.",
          "The whole pile goes to the writer exactly as it is. Nobody checks it.",
          "The writer answers from the pile. It sounds sure, whether the pile was good or not.",
        ],
        next: "Next step", back: "Back", again: "Start over",
      },
      cases: {
        support: { title: "The right pages were there, and it still got it wrong.", why: "Two of the eight pages held the answer, mixed in with six that did not. Plain RAG answered “3”, which does not even fit the question, and gave no sign it was unsure." },
        missing: { title: "The right pages were missing, and it answered anyway.", why: "In this test we removed the pages that settle the question. The honest answer is “I can't tell”. Plain RAG said “no”. The true answer is “yes”, so it was wrong and sounded sure." },
        fail: { title: "A page was wrong, and it believed it.", why: "In this test we edited the right page on purpose, swapping the true answer for another of the same kind. Plain RAG repeated the planted answer." },
        pileHead: "Pile sent to the writer: {n} passages, {w} words", nothing: "None of these passages settles the question.", star: "This passage really holds the answer",
        answered: "Plain RAG answered", truth: "True answer", planted: "Planted answer", edited: "The edited passage says", shouldSay: "It should say",
      },
      rates: { supportive: "Right pages present: wrong answers", missing: "Right pages removed: wrong answers", misleading: "Answer swapped: other wrong answers", planted: "Answer swapped: repeated the planted answer", per100: "{v} of 100", scale: "Scale: 0 to 50 out of every 100 questions" },
      match: {
        query: "Search question", words: "By words", meaning: "By meaning", both: "Both, merged",
        pages: [
          ["Cheap flights to Cairo: weekly deals", "same words, same meaning"],
          ["Low-cost airfare to Egypt's capital", "other words, same meaning"],
          ["Cairo, Illinois: cheap flights from Chicago", "same words, other city"],
          ["Pyramids of Giza: opening hours", "neither"],
        ],
        found: "found", skipped: "not found", lower: "found, ranked lower",
        n: { words: "Matches the exact words. It finds page 3, which is about a different Cairo, and misses page 2, which says the same thing in other words.", meaning: "Matches the idea. It finds page 2, which shares no words with the question, and skips page 3.", both: "Merging the two lists keeps every page that either librarian found. Page 3 gets in on words alone, and the next station will deal with it." },
        real: "In a real run (the documentary question) the line gathered {n} candidate passages.",
      },
      gauge: { pick: "Question", best: "Best score in this pile", score: "Verifier score", click: "Click a page to point the needle at its score.", gold: "Holds the answer", gscale: "from 0 to 1" },
      band: { score: "Best verifier score", hi: "Correct", mid: "Ambiguous", lo: "Incorrect", next: { hi: "The pile moves on to trimming.", mid: "Keep this pile and also search again with new wording. Both piles are merged.", lo: "Throw this pile away and search again with new wording." }, taulo: "lower line", tauhi: "upper line", rl: "up to {a}", rm: "{a} to {b}", rh: "{b} and above", ticks: "Best scores of the five example questions", label: "Move the marker" },
      rw: { orig: "Your question", rew: "Rewritten", btn: "Search again with new wording", reset: "Hide the new queries", total: "After searching again, the line had {n} candidate passages in total.", none: "No rewrite was needed here." },
      trim: { cut: "Cut-off", def: "default", kept: "Kept {k} of {n} sentences.", plain: "Plain RAG sent {a} words to the writer. The full line sent {f}.", stars: "Mark the sentences that really hold the answer (the dataset knows)", lost: "A sentence that really held the answer was cut.", fine: "Every sentence that held the answer survived.", list: "Sentences from the retrieved pages", scoreL: "score", needed: "holds the answer" },
      scale: { pick: "Question", enough: "Enough: the writer answers.", notenough: "Not enough: the line says “I don't know”.", thr: "Threshold", q: "Question", s: "Score", now: "At your threshold", real: "What really happened at 0.90", ans: "Would answer", stop: "Would stop", score: "Sufficiency score" },
      ans: {
        answered: "Answer", cites: "Cites", cite: "Cite line", dontknow: "I don't know", reason: "The evidence scored {s}, below the {t} line, so the line stopped.", draft: "Behind the stamp, the writer's draft was “{a}”. The line held it back.", gins: "The writer also said the pages were not enough.",
        good: "The answer is right.", bad: "This one got through and it is wrong. It repeated the planted answer, and the line could not tell.", truth: "True answer", planted: "Planted answer", ctx: "Lines the writer was given", hint: "Click a citation to highlight its line.",
      },
      cmp: { q: "Question", a: "Plain RAG", f: "Full line", v: "Verdict", verdicts: { support: "Better: a right answer instead of a wrong one.", missing: "Better: honest instead of wrong.", fooled: "Better: stopped instead of repeating the planted answer.", fail: "Same failure: the planted answer got through.", cost: "The price: a right answer was lost." }, idk: "I don't know" },
      wise: { slide: "Blend with the original model", orig: "Original", tuned: "Tuned", txt: "{a} = {t}% tuned, {o}% original", final: "This is the blend we use.", hot: "HotpotQA dev (the topic it practised)", nf: "NFCorpus dev (other topic)", fq: "FiQA dev (other topic)", sci: "SciFact test, ranking quality (nDCG@10)", o: "Original model", f: "Fully tuned", b: "Blend 0.7 (final)", dev: "On dev samples", test: "Final check" },
      calib: { p: "Passages", s: "Sentences", before: "Before", after: "After", note: "Expected calibration error. Lower is better.", axis: "0 to 0.17" },
      suff: { names: ["Off-the-shelf model, no training", "Small model, 60k examples", "Ours: MiniLM-L12, 270k examples"], hop: "Missing a step", none: "No evidence", axis: "AUC from 0.5 (coin flip) to 1.0 (perfect)" },
      cond2: { pool: "The pool of passages for this question", removed: "removed", has: "has the answer", swapped: "answer swapped", sentence: "A key sentence in the right passage", nopage: "The passage that holds this sentence is not in the pool. The only honest answer is “I don't know”.", n: "{n} questions in the test set.", n2: "{n} questions in the test set, because only {n} of the {t} got a valid swap." },
      forest: { rows: { sh: "Wrong answers, supportive (lower is better)", mh: "Wrong answers, missing (lower is better)", lh: "Wrong answers, misleading (lower is better)", sc: "Correct answers, supportive (higher is better)", lp: "Planted answers, misleading (lower is better)" }, axis: "Difference in percentage points (F minus A)", solid: "Interval excludes zero", hollow: "Interval touches zero", zero: "no difference" },
      oc: { arms: { A: "Plain RAG", B: "A + reranker", C: "A + our filter", D: "C + trimming", E: "D + decision and search again", F: "E + sufficiency check (full system)", G: "F with one threshold" }, chips: "Add stations one at a time", correct: "Correct", abstain: "I don't know", reject: "Wrong answer", plant: "Planted answer", base: "Plain RAG (A)", baseOnly: "A is the baseline, so there is nothing to compare. Pick another setup.", table: "Show as table", chart: "Show as chart", n: "{n} questions", col: ["Condition", "Setup", "Correct", "Planted", "I don't know", "Wrong"], desc: { A: "A. Plain RAG: whatever search returns goes straight to the writer.", B: "B. A, with an off-the-shelf reranker (ms-marco MiniLM-L6) in front.", C: "C. Our inspector keeps only the passages that score well.", D: "D. C, plus trimming every passage down to its useful sentences.", E: "E. D, plus the Correct / Ambiguous / Incorrect decision and the second search. This is the rewrite step.", F: "F. E, plus the sufficiency check at 0.90. This is the full system.", G: "G. F, but with one threshold instead of two." } },
      tk: { a: "Plain RAG", f: "Full system", u: "tokens" },
      cc: { plain: "Plain RAG sent {w} words and answered “{a}”.", full: "The full line sent {w} words and said “I don't know”.", suf: "The sufficiency score was {s}. The writer itself also said the pages were not enough.", cut: "Why: the trimming step cut this sentence, which holds the answer. Its score was {p}, just under the {t} cut-off.", ret: "The line was held back by its own trimming." },
      judge: { both: "Both marked it correct", wrong: "Both marked it wrong", short: "Name variant", alias: "The judge accepted a name variant that the strict scoring rejected, such as “Chris Pine” for “Christopher Whitelaw Pine”", kappa: "Agreement {a}%, Cohen's kappa {k}" },
      hero: { st: ["Search", "Inspect", "Decide", "Weigh and answer"], part: "page" },
      machinePh: "The interactive machine appears here. It is built as a separate piece, and this placeholder stays until it is loaded.",
      machineErr: "The interactive machine could not start. The rest of the page works without it.",
    },
    ar: {
      kinds: { pass: "صح", abstain: "مش عارف", reject: "إجابة غلط", plant: "كرّر الإجابة المزروعة", hold: "Ambiguous", low: "Incorrect" },
      sc: { support: "الأفلام الوثائقية", missing: "الكاتدرائيات", fooled: "أويوكو دانتاي", fail: "سَن فالي", cost: "مسرحية ويليامز" },
      qgloss: {
        support: "أنهي فيلم وثائقي أقدم: The Private Life of Plants ولا Marx Reloaded؟",
        missing: "هل كاتدرائية جيلدفورد وكاتدرائية سانت بول الاتنين في إنجلترا؟",
        fooled: "جماعة زي Uyoku dantai بتندرج تحت أنهي توجهات؟",
        fail: "أنهي مدينة بتستضيف مؤتمر سنوي لتمويل الإعلام اتكلم فيه قطب إعلام أمريكي مولود في أستراليا؟",
        cost: "أنهي ممثلة مرشّحة لتماني جوايز أوسكار اختارها تينيسي ويليامز تلعب دور رئيسي في مسرحيته Clothes for a Summer Hotel؟",
      },
      scLabel: "السؤال:",
      cond: { supportive: "Supportive (الصفحات الصح موجودة)", missing: "Missing (الصفحات الصح اتشالت)", misleading: "Misleading (الإجابة اتبدّلت)" },
      condShort: { supportive: "Supportive", missing: "Missing", misleading: "Misleading" },
      g: {
        q1: "إيه عاصمة فرنسا؟", a1: "باريس.", q2: "مين كسب مسابقة مدرسة النيل للغات سنة 2019؟", a2: "مريم حسن هي اللي كسبت، بدرجة كاملة.",
        known: "معلومة حقيقية", made: "متألّفة", reveal: "وريني أنهي إجابة متألّفة", hide: "اخفي العلامات",
      },
      lib: {
        you: "إنت", libr: "أمينة المكتبة", write: "الكاتب", shelf: "المكتبة", q: "سؤال", pile: "كومة صفحات", ans: "إجابة", nocheck: "مفيش فحص هنا",
        steps: [
          "إنت بتسأل سؤال.",
          "أمينة المكتبة بتجري على الرفوف وبتجيب الصفحات اللي شكلها قريب من السؤال.",
          "الكومة كلها بتروح للكاتب زي ما هي. محدّش بيراجعها.",
          "الكاتب بيجاوب من الكومة. وبيجاوب بثقة، سواء الكومة كانت كويسة ولا لأ.",
        ],
        next: "الخطوة الجاية", back: "رجوع", again: "ابدأ من الأول",
      },
      cases: {
        support: { title: "الصفحات الصح كانت موجودة، ومع كده غلط.", why: "اتنين من التمان صفحات كان فيهم الإجابة، وسط ستة مالهمش علاقة. الـ RAG العادي جاوب «3»، ودي حتى مش بتنفع إجابة للسؤال، وماظهرش عليه إنه مش متأكد." },
        missing: { title: "الصفحات الصح كانت ناقصة، وجاوب برضه.", why: "في الاختبار ده شلنا الصفحات اللي بتحسم السؤال. الإجابة الأمينة هي «مقدرش أحكم». الـ RAG العادي قال «لأ». والإجابة الصح «أيوه»، يعني غلط وهو واثق." },
        fail: { title: "فيه صفحة كانت غلط، وصدّقها.", why: "في الاختبار ده عدّلنا الصفحة الصح قصدًا وبدّلنا الإجابة الحقيقية بإجابة تانية من نفس النوع. الـ RAG العادي كرّر الإجابة المزروعة." },
        pileHead: "الكومة اللي اتبعتت للكاتب: {n} فقرات، {w} كلمة", nothing: "ولا فقرة من دول بتحسم السؤال.", star: "الفقرة دي فعلًا فيها الإجابة",
        answered: "الـ RAG العادي جاوب", truth: "الإجابة الصح", planted: "الإجابة المزروعة", edited: "الفقرة المعدّلة بتقول", shouldSay: "المفروض تقول",
      },
      rates: { supportive: "الصفحات الصح موجودة: إجابات غلط", missing: "الصفحات الصح اتشالت: إجابات غلط", misleading: "الإجابة اتبدّلت: إجابات غلط تانية", planted: "الإجابة اتبدّلت: كرّر الإجابة المزروعة", per100: "{v} من 100", scale: "المقياس: من 0 لـ 50 من كل 100 سؤال" },
      match: {
        query: "سؤال البحث", words: "بالكلمات", meaning: "بالمعنى", both: "الاتنين مدموجين",
        pages: [
          ["Cheap flights to Cairo: weekly deals", "نفس الكلمات ونفس المعنى"],
          ["Low-cost airfare to Egypt's capital", "كلمات تانية ونفس المعنى"],
          ["Cairo, Illinois: cheap flights from Chicago", "نفس الكلمات بس مدينة تانية"],
          ["Pyramids of Giza: opening hours", "ولا واحد منهم"],
        ],
        found: "اتلاقت", skipped: "ماتلاقتش", lower: "اتلاقت، وترتيبها أقل",
        n: { words: "بيدوّر على نفس الكلمات بالظبط. بيلاقي صفحة 3 وهي عن كايرو تانية، ويفوّت صفحة 2 اللي بتقول نفس الكلام بكلمات تانية.", meaning: "بيدوّر على الفكرة. بيلاقي صفحة 2 اللي ماتشاركش السؤال في أي كلمة، ويسيب صفحة 3.", both: "دمج القايمتين بيحتفظ بأي صفحة واحدة من أمينتين المكتبة لقيتها. صفحة 3 دخلت بالكلمات بس، والمحطة اللي بعدها هتتعامل معاها." },
        real: "في تشغيل حقيقي (سؤال الأفلام الوثائقية) الخط جمّع {n} فقرة مرشّحة.",
      },
      gauge: { pick: "السؤال", best: "أحسن رقم في الكومة دي", score: "الـ verifier score", click: "دوس على صفحة عشان العقرب يروح لرقمها.", gold: "فيها الإجابة", gscale: "من 0 لـ 1" },
      band: { score: "أحسن verifier score", hi: "Correct", mid: "Ambiguous", lo: "Incorrect", next: { hi: "الكومة بتكمّل لمرحلة القص.", mid: "خلّي الكومة دي وابحث تاني بصياغة جديدة. الكومتين بيتدمجوا.", lo: "ارمي الكومة دي وابحث تاني بصياغة جديدة." }, taulo: "الخط الواطي", tauhi: "الخط العالي", rl: "لحد {a}", rm: "من {a} لـ {b}", rh: "{b} وأكتر", ticks: "أحسن رقم في كل سؤال من الخمس أسئلة", label: "حرّك العلامة" },
      rw: { orig: "سؤالك", rew: "اتعادت صياغته", btn: "ابحث تاني بصياغة جديدة", reset: "اخفي الجمل الجديدة", total: "بعد البحث التاني، الخط بقى معاه {n} فقرة مرشّحة إجمالًا.", none: "ماحتاجش إعادة صياغة هنا." },
      trim: { cut: "حد القص", def: "الأصلي", kept: "فضل {k} من {n} جملة.", plain: "الـ RAG العادي بعت {a} كلمة للكاتب. والخط الكامل بعت {f}.", stars: "علّم الجمل اللي فيها الإجابة فعلًا (الداتا عارفة)", lost: "جملة كان فيها الإجابة فعلًا اتقصّت.", fine: "كل جملة فيها الإجابة فضلت.", list: "جمل من الصفحات اللي اتجابت", scoreL: "الرقم", needed: "فيها الإجابة" },
      scale: { pick: "السؤال", enough: "كفاية: الكاتب بيجاوب.", notenough: "مش كفاية: الخط بيقول «مش عارف».", thr: "الـ threshold", q: "السؤال", s: "الرقم", now: "عند الحد بتاعك", real: "اللي حصل فعلًا عند 0.90", ans: "كان هيجاوب", stop: "كان هيقف", score: "رقم الكفاية" },
      ans: {
        answered: "إجابة", cites: "المصادر", cite: "سطر رقم", dontknow: "مش عارف", reason: "الدليل جاب {s}، وده أقل من خط {t}، فالخط وقف.", draft: "ورا الختم، مسودة الكاتب كانت «{a}». والخط منعها.", gins: "والكاتب نفسه قال إن الصفحات مش كفاية.",
        good: "الإجابة صح.", bad: "الإجابة دي عدّت وهي غلط. كرّرت الإجابة المزروعة، والخط ماعرفش يكشفها.", truth: "الإجابة الصح", planted: "الإجابة المزروعة", ctx: "السطور اللي اتدّت للكاتب", hint: "دوس على رقم مصدر عشان تنوّر سطره.",
      },
      cmp: { q: "السؤال", a: "الـ RAG العادي", f: "الخط الكامل", v: "الحكم", verdicts: { support: "أحسن: إجابة صح بدل غلط.", missing: "أحسن: أمين بدل ما يغلط.", fooled: "أحسن: وقف بدل ما يكرّر الإجابة المزروعة.", fail: "نفس الفشل: الإجابة المزروعة عدّت.", cost: "التمن: إجابة صح ضاعت." }, idk: "مش عارف" },
      wise: { slide: "الخلطة مع الـ model الأصلي", orig: "الأصلي", tuned: "المتمرّن", txt: "{a} = {t}% متمرّن، {o}% أصلي", final: "دي الخلطة اللي بنستخدمها.", hot: "HotpotQA dev (الموضوع اللي اتمرّن عليه)", nf: "NFCorpus dev (موضوع تاني)", fq: "FiQA dev (موضوع تاني)", sci: "اختبار SciFact، جودة الترتيب (nDCG@10)", o: "الـ model الأصلي", f: "متمرّن بالكامل", b: "خلطة 0.7 (النهائي)", dev: "على عيّنات dev", test: "الفحص النهائي" },
      calib: { p: "الفقرات", s: "الجمل", before: "قبل", after: "بعد", note: "expected calibration error. كل ما قلّ كان أحسن.", axis: "من 0 لـ 0.17" },
      suff: { names: ["model جاهز، من غير تدريب", "model صغير، 60 ألف مثال", "بتاعنا: MiniLM-L12، 270 ألف مثال"], hop: "خطوة ناقصة", none: "مفيش دليل", axis: "AUC من 0.5 (رمي عملة) لـ 1.0 (مثالي)" },
      cond2: { pool: "مجموعة الفقرات للسؤال ده", removed: "اتشالت", has: "فيها الإجابة", swapped: "الإجابة اتبدّلت", sentence: "جملة أساسية في الفقرة الصح", nopage: "الفقرة اللي فيها الجملة دي مش موجودة في المجموعة. الإجابة الأمينة الوحيدة هي «مش عارف».", n: "{n} سؤال في مجموعة الـ test.", n2: "{n} سؤال في مجموعة الـ test، لأن {n} بس من الـ {t} جابوا بديل مظبوط." },
      forest: { rows: { sh: "إجابات غلط، supportive (الأقل أحسن)", mh: "إجابات غلط، missing (الأقل أحسن)", lh: "إجابات غلط، misleading (الأقل أحسن)", sc: "إجابات صح، supportive (الأكتر أحسن)", lp: "إجابات مزروعة، misleading (الأقل أحسن)" }, axis: "الفرق بالنقط المئوية (F ناقص A)", solid: "الفترة بتستبعد الصفر", hollow: "الفترة بتلمس الصفر", zero: "مفيش فرق" },
      oc: { arms: { A: "RAG عادي", B: "A + reranker", C: "A + الفلتر بتاعنا", D: "C + القص", E: "D + القرار والبحث التاني", F: "E + فحص الكفاية (النظام الكامل)", G: "F بـ threshold واحد" }, chips: "زوّد المحطات واحدة واحدة", correct: "صح", abstain: "مش عارف", reject: "إجابة غلط", plant: "إجابة مزروعة", base: "RAG عادي (A)", baseOnly: "A هو الأساس، فمفيش حاجة نقارنه بيها. اختار إعداد تاني.", table: "اعرضه كجدول", chart: "اعرضه كرسم", n: "{n} سؤال", col: ["الحالة", "الإعداد", "صح", "مزروعة", "مش عارف", "غلط"], desc: { A: "A. RAG عادي: أي حاجة البحث يجيبها بتروح للكاتب على طول.", B: "B. A مع reranker جاهز (ms-marco MiniLM-L6) قدّامه.", C: "C. المفتّش بتاعنا بيسيب الفقرات اللي رقمها كويس بس.", D: "D. C مع قص كل فقرة لجملها المفيدة.", E: "E. D مع قرار Correct / Ambiguous / Incorrect والبحث التاني. دي خطوة إعادة الصياغة.", F: "F. E مع فحص الكفاية عند 0.90. ده النظام الكامل.", G: "G. F بس بـ threshold واحد بدل اتنين." } },
      tk: { a: "RAG عادي", f: "النظام الكامل", u: "token" },
      cc: { plain: "الـ RAG العادي بعت {w} كلمة وجاوب «{a}».", full: "الخط الكامل بعت {w} كلمة وقال «مش عارف».", suf: "رقم الكفاية كان {s}. والكاتب نفسه قال إن الصفحات مش كفاية.", cut: "السبب: خطوة القص قصّت الجملة دي وفيها الإجابة. رقمها كان {p}، تحت حد القص {t} بشوية.", ret: "الخط اتعطّل بسبب القص بتاعه." },
      judge: { both: "الاتنين حسبوها صح", wrong: "الاتنين حسبوها غلط", short: "صيغة تانية للاسم", alias: "الحَكَم قبل صيغة تانية للاسم والتصحيح الصارم رفضها، زي «Chris Pine» مكان «Christopher Whitelaw Pine»", kappa: "الاتفاق {a}%، Cohen's kappa {k}" },
      hero: { st: ["البحث", "الفحص", "القرار", "الوزن والإجابة"], part: "فقرة" },
      machinePh: "الماكينة التفاعلية بتظهر هنا. هي قطعة متبنية لوحدها، والمكان ده فاضل لحد ما تتحمّل.",
      machineErr: "الماكينة التفاعلية ماقدرتش تشتغل. باقي الصفحة شغال من غيرها.",
    },
  };

  var SC_KEYS = ["support", "missing", "fooled", "fail", "cost"];
  function SC(k) { return D.scenarios[k]; }

  /* ---------------- shared widgets ---------------- */
  function picker(t, keys, cur, onPick, label) {
    var wrap = h("div", { class: "pick", role: "group", "aria-label": label || t.gauge.pick });
    keys.forEach(function (k) {
      var b = h("button", { type: "button", "aria-pressed": String(k === cur), "data-k": k, text: t.sc[k], on: { click: function () { onPick(k); $$("button", wrap).forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.k === k)); }); } } });
      wrap.appendChild(b);
    });
    return wrap;
  }
  function qBlock(t, lang, key, glossOnly) {
    var s = SC(key);
    var out = h("p", { class: "mini" });
    if (lang === "ar" && t.qgloss[key]) out.appendChild(h("span", { class: "q-gloss", text: t.qgloss[key] }));
    if (!(glossOnly)) out.appendChild(h("span", { class: "q-en", lang: "en", dir: "ltr", text: clean(s.question) }));
    return out;
  }
  /* horizontal bar. value 0..max; transforms animate on update */
  function hbar(label, value, max, kind, valText, mark) {
    var fill = h("div", { class: "hb-fill", "data-k": kind, "data-grow": String(clamp(value / max, 0, 1)), style: "transform:scaleX(" + clamp(value / max, 0, 1) + ")" });
    var track = h("div", { class: "hb-track" }, fill);
    if (mark != null) track.appendChild(h("div", { class: "hb-mark", style: "left:" + (mark / max * 100) + "%" }));
    return h("div", { class: "hb-row" }, h("div", { class: "hb-lab" }, h("span", { text: label }), h("span", { class: "v", text: valText })), track);
  }
  function setHbar(row, value, max, valText) {
    var fill = $(".hb-fill", row);
    var s = clamp(value / max, 0, 1);
    fill.dataset.grow = String(s);
    fill.style.transform = "scaleX(" + s + ")";
    $(".v", row).textContent = valText;
  }

  /* dial: a half-circle gauge, 0 at the left, 1 at the right */
  function pt(v, r) { return [150 - r * Math.cos(Math.PI * v), 150 - r * Math.sin(Math.PI * v)]; }
  function dial(opts) {
    var ticks = "";
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      var a = pt(v, 100), b = pt(v, 120), l = pt(v, 136);
      ticks += '<line class="tick" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
      var lab = v === 0 || v === 1 ? String(v) : String(v);
      ticks += '<text x="' + l[0] + '" y="' + (l[1] + 4) + '" text-anchor="middle">' + lab + "</text>";
    });
    var extra = opts.zones ? "" : "";
    var svg = '<svg class="dial" viewBox="0 0 300 172" role="img" aria-label="' + (opts.label || "") + '">' +
      '<path class="arc" d="M 40 150 A 110 110 0 0 1 260 150"/>' + extra + ticks +
      (opts.thr ? '<line class="thr" x1="0" y1="0" x2="0" y2="0"/>' : "") +
      '<g class="needle-g" style="transform:rotate(0deg)"><line class="needle" x1="150" y1="150" x2="62" y2="150"/></g>' +
      '<circle class="hub" cx="150" cy="150" r="7"/></svg>';
    var wrap = h("div", { html: svg });
    return wrap.firstChild;
  }
  function setNeedle(svg, v) { $(".needle-g", svg).style.transform = "rotate(" + clamp(v, 0, 1) * 180 + "deg)"; }
  function setThr(svg, v) { var l = $(".thr", svg); var a = pt(v, 92), b = pt(v, 124); l.setAttribute("x1", a[0]); l.setAttribute("y1", a[1]); l.setAttribute("x2", b[0]); l.setAttribute("y2", b[1]); }
  /* needle settles when the figure scrolls into view */
  function settle(el, fn) {
    if (!HAS_GSAP || RM() || !window.ScrollTrigger) { fn(); return; }
    window.ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: function () { setTimeout(fn, 120); } });
  }

  function tail(text, from) { var r = text.slice(from, from + 70); return clean(r) + (text.length > from + 70 ? "…" : ""); }

  /* ---------------- figure builders ---------------- */
  var FIG = {};

  FIG.guesser = function (body, c) {
    var t = c.t, g = t.g;
    var wrap = h("div", { class: "g-body", "data-revealed": "false" });
    [[g.q1, g.a1, "pass", g.known], [g.q2, g.a2, "reject", g.made]].forEach(function (r) {
      wrap.appendChild(h("div", { class: "g-row" }, h("div", { class: "g-q", text: r[0] }), h("div", { class: "g-a", text: r[1] }), h("div", { class: "g-tag" }, badge(r[2], r[3]))));
    });
    var btn = h("button", { class: "btn", type: "button", "aria-pressed": "false", text: g.reveal });
    btn.addEventListener("click", function () {
      var on = wrap.getAttribute("data-revealed") !== "true";
      wrap.setAttribute("data-revealed", String(on));
      btn.setAttribute("aria-pressed", String(on));
      btn.textContent = on ? g.hide : g.reveal;
    });
    body.appendChild(wrap); body.appendChild(btn);
  };

  FIG.librarian = function (body, c) {
    var t = c.t, L = t.lib, rtl = c.lang === "ar", W = 640;
    var X = function (x, w) { return rtl ? W - x - (w || 0) : x; };
    var person = function (cx, name) {
      return '<g class="ink"><circle cx="' + cx + '" cy="96" r="14"/><path d="M' + (cx - 26) + " 140c0-18 12-26 26-26s26 8 26 26z\"/></g>" +
        '<text x="' + cx + '" y="166" text-anchor="middle">' + name + "</text>";
    };
    var shelfX = X(190, 100);
    var books = "";
    for (var r = 0; r < 3; r++) for (var i = 0; i < 6; i++) {
      books += '<rect class="ink fill-paper2" x="' + (shelfX + 8 + i * 15) + '" y="' + (62 + r * 30) + '" width="10" height="22" rx="1"/>';
    }
    var arrow = function (x1, x2, y, id) {
      return '<line class="ink" x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" marker-end="url(#ar-' + id + ')"/>';
    };
    var pileX = X(330, 40);
    var svg = '<svg viewBox="0 0 640 230" role="img" aria-label="' + L.steps.join(" ") + '">' +
      '<defs><marker id="ar-' + c.lang + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--ink)"/></marker></defs>' +
      /* people and shelf */
      person(X(60), L.you) + person(X(560), L.write) +
      '<g><rect class="ink fill-sheet" x="' + shelfX + '" y="48" width="100" height="106" rx="3"/>' + books +
      '<text x="' + (shelfX + 50) + '" y="176" text-anchor="middle">' + L.shelf + " / " + L.libr + "</text></g>" +
      /* step 1: question */
      '<g class="s on" data-s="1"><rect class="ink fill-sheet" x="' + X(80, 88) + '" y="34" width="88" height="32" rx="16"/><text x="' + X(124) + '" y="55" text-anchor="middle">' + L.q + " ?</text>" +
      arrow(X(150), X(184), 100, c.lang) + "</g>" +
      /* step 2: pile appears at the shelf */
      '<g class="s page-fly" data-s="2"><g class="pile" style="transform:translateX(' + (rtl ? "-" : "") + '0px)">' +
      '<rect class="ink fill-sheet" x="' + (pileX + 6) + '" y="86" width="40" height="52" rx="2"/><rect class="ink fill-sheet" x="' + (pileX + 3) + '" y="83" width="40" height="52" rx="2"/><rect class="ink fill-sheet" x="' + pileX + '" y="80" width="40" height="52" rx="2"/>' +
      '<path class="ink" d="M' + (pileX + 8) + " 94h24M" + (pileX + 8) + " 102h24M" + (pileX + 8) + ' 110h16"/>' +
      '<text x="' + (pileX + 22) + '" y="156" text-anchor="middle" class="muted">' + L.pile + "</text></g></g>" +
      /* step 3: gap and arrow to writer */
      '<g class="s" data-s="3">' + arrow(X(446), X(526), 106, c.lang) +
      '<path class="gap" d="M' + X(486) + " 70v72\"/><text class=\"gap-t\" x=\"" + X(486) + '" y="60" text-anchor="middle">' + L.nocheck + "</text></g>" +
      /* step 4: answer bubble */
      '<g class="s" data-s="4"><rect class="ink fill-sheet" x="' + X(500, 120) + '" y="188" width="120" height="30" rx="15"/><text x="' + X(560) + '" y="208" text-anchor="middle">' + L.ans + "</text>" +
      '<path class="ink" d="M' + X(498) + " 203H" + X(112) + '" marker-end="url(#ar-' + c.lang + ')"/></g>' +
      "</svg>";
    var holder = h("div", { class: "lib", html: svg });
    var step = 1;
    var txt = h("p", { class: "lib-step", "aria-live": "polite" });
    var dots = h("span", { class: "dots", "aria-hidden": "true" });
    for (var d = 0; d < 4; d++) dots.appendChild(h("i"));
    var back = h("button", { class: "btn", type: "button", text: L.back });
    var next = h("button", { class: "btn primary", type: "button", text: L.next });
    function render() {
      $$(".s", holder).forEach(function (g) { g.classList.toggle("on", +g.dataset.s <= step); });
      var pile = $(".pile", holder);
      if (pile) pile.style.transform = step >= 3 ? "translateX(" + (rtl ? "-" : "") + "70px)" : "translateX(0)";
      txt.textContent = L.steps[step - 1];
      $$("i", dots).forEach(function (i, ix) { i.classList.toggle("on", ix < step); });
      back.disabled = step === 1;
      next.textContent = step === 4 ? L.again : L.next;
    }
    back.addEventListener("click", function () { step = Math.max(1, step - 1); render(); });
    next.addEventListener("click", function () { step = step === 4 ? 1 : step + 1; render(); });
    body.appendChild(holder);
    body.appendChild(h("div", { class: "lib-ctl" }, back, next, dots, txt));
    render();
  };

  FIG.cases = function (body, c) {
    var t = c.t, K = t.cases;
    var grid = h("div", { class: "cases" });
    ["support", "missing", "fail"].forEach(function (key) {
      var s = SC(key), a = s.A;
      var pile = h("div", { class: "pile" });
      a.passages.forEach(function (p) {
        pile.appendChild(h("span", { class: "chip" + (p.gold ? " gold" : ""), title: p.gold ? K.star : null }, p.gold ? h("span", { class: "star", html: STAR, "aria-label": K.star, role: "img" }) : null, clean(p.title)));
      });
      var card = h("div", { class: "case" },
        h("h4", { text: K[key].title }),
        h("div", { class: "qtext" }, c.lang === "ar" ? h("span", { class: "q-gloss", text: t.qgloss[key] }) : null, h("span", { class: "q-en", lang: "en", dir: "ltr", text: clean(s.question) })),
        h("div", {}, h("p", { class: "mini", style: "margin:0 0 6px", text: tpl(K.pileHead, { n: a.passages.length, w: a.words_sent }) }), pile,
          a.passages.some(function (p) { return p.gold; }) ? null : h("p", { class: "mini", style: "margin:6px 0 0", text: K.nothing })),
        h("div", { class: "speech" }, h("small", { text: K.answered }), h("b", { lang: "en", dir: "ltr", text: clean(a.answer) })));
      if (key === "fail") {
        var sent = s.F.sentences.filter(function (x) { return x.text.indexOf(s.planted) >= 0; })[0];
        if (sent) {
          var i = sent.text.indexOf(s.planted);
          card.appendChild(h("div", {}, h("p", { class: "mini", style: "margin:0 0 4px", text: K.edited }),
            h("div", { class: "sent", lang: "en", dir: "ltr" }, clean(sent.text.slice(0, i)), h("mark", { text: s.planted }), tail(sent.text, i + s.planted.length))));
          card.appendChild(h("p", { class: "mini", style: "margin:0" }, K.shouldSay + ": ", h("b", { class: "en", lang: "en", text: s.gold })));
        }
      }
      card.appendChild(h("p", { class: "why", text: K[key].why }));
      card.appendChild(h("div", { class: "meta" }, badge(OUT2K[a.outcome], t.kinds[OUT2K[a.outcome]])));
      grid.appendChild(card);
    });
    body.appendChild(grid);
    body.style.cssText = "background:none;border:0;box-shadow:none;padding:0;min-height:0";
  };

  FIG.plainrates = function (body, c) {
    var t = c.t, R = t.rates, A = D.test.aggregate.A;
    var hb = h("div", { class: "hb" });
    var rows = [["supportive", A.supportive.hallucinate, "reject"], ["missing", A.missing.hallucinate, "reject"], ["misleading", A.misleading.hallucinate, "reject"], ["planted", A.misleading.planted, "plant"]];
    rows.forEach(function (r) { hb.appendChild(hbar(R[r[0]], r[1], 0.5, r[2], tpl(R.per100, { v: f1(r[1] * 100) }))); });
    body.appendChild(hb);
    body.appendChild(h("p", { class: "mini", style: "margin:12px 0 0", text: R.scale }));
  };

  FIG.matching = function (body, c) {
    var M = c.t.match, mode = "both";
    var found = { words: [1, 0, 1, 0], meaning: [1, 1, 0, 0], both: [1, 1, 1, 0] };
    var seg = h("div", { class: "seg", role: "group", "aria-label": M.query });
    var list = h("ul", { class: "m-list" });
    var note = h("p", { class: "m-note", "aria-live": "polite" });
    ["words", "meaning", "both"].forEach(function (m) {
      seg.appendChild(h("button", { type: "button", "data-m": m, "aria-pressed": String(m === mode), text: M[m], on: { click: function () { mode = m; render(); } } }));
    });
    function render() {
      $$("button", seg).forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === mode)); });
      clear(list);
      M.pages.forEach(function (p, i) {
        var on = found[mode][i];
        var lowRank = mode === "both" && i === 2;
        list.appendChild(h("li", { "data-found": String(!!on) },
          h("span", { class: "plate", "aria-hidden": "true", text: i + 1 }), h("span", { class: "t", lang: "en", dir: "ltr", text: p[0] }),
          h("span", { class: "why", text: on ? (lowRank ? M.lower : M.found) : M.skipped })));
      });
      note.textContent = M.n[mode];
    }
    body.appendChild(h("p", { class: "m-query" }, M.query + ": ", h("b", { lang: "en", dir: "ltr", text: "cheap flights to Cairo" })));
    body.appendChild(h("div", { class: "ctl" }, seg));
    body.appendChild(list); body.appendChild(note);
    body.appendChild(h("p", { class: "m-real", text: tpl(M.real, { n: SC("support").F.n_retrieved }) }));
    render();
  };

  FIG.gauge = function (body, c) {
    var t = c.t, G = t.gauge, key = "support", sel = 0;
    var svg = dial({ label: G.score });
    var big = h("div", { class: "readout-big", "aria-live": "polite" });
    var list = h("ul", { class: "g-list" });
    var qb = h("div");
    var bestP = h("p", { class: "mini", style: "text-align:center;margin:6px 0 0" });
    function render(first) {
      var tops = SC(key).F.top;
      clear(list); clear(qb); qb.appendChild(qBlock(t, c.lang, key));
      tops.forEach(function (p, i) {
        var b = h("button", { type: "button", "aria-pressed": String(i === sel), on: { click: function () { sel = i; update(); } } },
          h("span", { class: "tt" }, p.gold ? h("span", { class: "star", html: STAR + " ", role: "img", "aria-label": G.gold, title: G.gold }) : null, " " + clean(p.title)),
          h("span", { class: "vv", text: f3(p.prob) }),
          h("span", { class: "bar" }, h("i", { style: "transform:scaleX(" + p.prob + ")" })));
        list.appendChild(h("li", {}, b));
      });
      update(first);
      bestP.textContent = G.best + ": " + f3(SC(key).F.best_prob);
    }
    function update(first) {
      var p = SC(key).F.top[sel];
      $$("button", list).forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === sel)); });
      big.textContent = f3(p.prob);
      if (first) settle(body, function () { setNeedle(svg, p.prob); }); else setNeedle(svg, p.prob);
    }
    body.appendChild(picker(t, SC_KEYS, key, function (k) { key = k; sel = 0; render(false); }));
    body.appendChild(qb);
    body.appendChild(h("div", { class: "gauge-grid" }, h("div", {}, svg, big, bestP), h("div", {}, list)));
    body.appendChild(h("p", { class: "mini", style: "margin:10px 0 0", text: G.click }));
    render(true);
  };

  FIG.band = function (body, c) {
    var t = c.t, B = t.band, th = D.thresholds, key = "support";
    var lo = th.tau_lo, hi = th.tau_hi;
    var zones = h("div", { class: "band-zones" },
      h("div", { class: "z-lo", style: "flex:0 0 " + lo * 100 + "%" }, h("span", { html: icon("reject"), "aria-hidden": "true" }), h("span", { text: B.lo })),
      h("div", { class: "z-mid", style: "flex:1 1 0" }, h("span", { html: icon("hold"), "aria-hidden": "true" }), h("span", { text: B.mid })),
      h("div", { class: "z-hi", style: "flex:0 0 " + (1 - hi) * 100 + "%" }, h("span", { html: icon("pass"), "aria-hidden": "true" }), h("span", { text: B.hi })));
    var range = h("input", { type: "range", min: "0", max: "1", step: "0.005", value: String(SC(key).F.best_prob), "aria-label": B.score + ". " + B.label, class: "slide" });
    var line = function (v, lab) { return h("div", { class: "band-line", style: "left:" + v * 100 + "%" }, h("b", { text: lab + " " + f2(v) })); };
    var ticks = h("div", { class: "band-ticks", "aria-hidden": "true" });
    SC_KEYS.forEach(function (k) { ticks.appendChild(h("span", { class: "tk", style: "left:" + SC(k).F.best_prob * 100 + "%", title: t.sc[k] })); });
    var band = h("div", { class: "band" }, zones, line(lo, "τ low"), line(hi, "τ high"), ticks, range);
    var out = h("div", { class: "band-out", "aria-live": "polite" });
    function render() {
      var v = parseFloat(range.value);
      var k = v >= hi ? "hi" : v > lo ? "mid" : "lo";
      var bk = k === "hi" ? "pass" : k === "mid" ? "hold" : "reject";
      clear(out);
      out.appendChild(h("div", { class: "big" }, h("span", { class: "readout", text: B.score + " " + f3(v) }), badge(bk, B[k])));
      out.appendChild(h("p", { text: B.next[k] }));
      range.setAttribute("aria-valuetext", f3(v) + ", " + B[k]);
    }
    range.addEventListener("input", render);
    var pk = picker(t, SC_KEYS, key, function (k) { key = k; var v = SC(k).F.best_prob; range.value = v; render(); });
    var lg = h("div", { class: "hb-legend", style: "margin-top:0" },
      h("span", {}, badge("reject", B.lo), " " + tpl(B.rl, { a: f2(lo) })), h("span", {}, badge("hold", B.mid), " " + tpl(B.rm, { a: f2(lo), b: f2(hi) })), h("span", {}, badge("pass", B.hi), " " + tpl(B.rh, { b: f2(hi) })));
    body.appendChild(pk);
    body.appendChild(band); body.appendChild(lg); body.appendChild(out);
    render();
  };

  FIG.rewrite = function (body, c) {
    var t = c.t, R = t.rw, key = "support", shown = false;
    var list = h("ul", { class: "rw-q" });
    var total = h("p", { class: "mini", "aria-live": "polite" });
    var btn = h("button", { class: "btn primary", type: "button" });
    var qb = h("div");
    function render(animate) {
      var s = SC(key), qs = s.F.queries;
      clear(list); clear(qb); qb.appendChild(qBlock(t, c.lang, key, true));
      qs.forEach(function (q, i) {
        var li = h("li", { class: i === 0 ? "orig" : "new" }, h("span", { class: "tag", text: i === 0 ? R.orig : R.rew }), h("span", { class: "t", lang: "en", dir: "ltr", text: clean(q) }));
        if (i > 0 && !shown) li.hidden = true;
        list.appendChild(li);
      });
      btn.textContent = shown ? R.reset : R.btn;
      btn.setAttribute("aria-pressed", String(shown));
      total.textContent = shown ? tpl(R.total, { n: s.F.n_retrieved }) : "";
      if (animate && shown) tween($$("li.new", list), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.15, ease: "power2.out", clearProps: "transform,opacity" });
    }
    btn.addEventListener("click", function () { shown = !shown; render(true); });
    body.appendChild(picker(t, SC_KEYS, key, function (k) { key = k; shown = false; render(false); }));
    body.appendChild(qb); body.appendChild(list);
    body.appendChild(h("div", { class: "ctl" }, btn)); body.appendChild(total);
    render(false);
  };

  FIG.trim = function (body, c) {
    var t = c.t, Tm = t.trim, key = "support", th = D.thresholds.tau_keep, cut = th, stars = false;
    var MAX = 0.5;
    var range = h("input", { type: "range", min: "0", max: String(MAX), step: "0.005", value: String(cut), "aria-label": Tm.cut });
    var def = h("div", { class: "tr-def", style: "left:calc(11px + (100% - 22px) * " + th / MAX + ")", title: Tm.def + " " + f2(th) });
    var readout = h("span", { class: "readout" });
    var list = h("ul", { class: "tr-list", tabindex: "0", role: "group", "aria-label": Tm.list });
    list.style.cssText = "max-height:340px;overflow:auto";
    var sum = h("div", { class: "tr-sum", "aria-live": "polite" });
    var qb = h("div");
    var tog = h("label", { class: "toggle" }, h("input", { type: "checkbox", on: { change: function (e) { stars = e.target.checked; paint(); } } }), h("span", { text: Tm.stars }));
    function build() {
      var s = SC(key); clear(list); clear(qb); qb.appendChild(qBlock(t, c.lang, key));
      s.F.sentences.forEach(function (x) {
        list.appendChild(h("li", { "data-gold": String(!!x.gold) }, h("span", { class: "ic" }), h("span", { class: "tx", lang: "en", dir: "ltr", title: clean(x.text) }), h("span", { class: "pv", text: f3(x.prob) })));
      });
      paint();
    }
    function paint() {
      var s = SC(key), n = 0, lost = false;
      cut = parseFloat(range.value);
      readout.textContent = Tm.cut + " " + f3(cut) + (Math.abs(cut - th) < 0.0001 ? " (" + Tm.def + ")" : "");
      $$("li", list).forEach(function (li, i) {
        var x = s.F.sentences[i], kept = x.prob >= cut;
        if (kept) n++; else if (x.gold) lost = true;
        li.setAttribute("data-kept", String(kept));
        $(".ic", li).innerHTML = icon(kept ? "pass" : "reject", 15);
        var tx = $(".tx", li); tx.textContent = (stars && x.gold ? "★ " : "") + clean(x.text);
        li.classList.toggle("is-needed", stars && x.gold);
      });
      clear(sum);
      sum.appendChild(h("p", { text: tpl(Tm.kept, { k: n, n: s.F.sentences.length }) }));
      sum.appendChild(h("p", { text: tpl(Tm.plain, { a: s.A.words_sent, f: s.F.words_sent }) }));
      if (stars) sum.appendChild(h("p", {}, lost ? badge("reject", Tm.lost) : badge("pass", Tm.fine)));
    }
    range.addEventListener("input", paint);
    body.appendChild(picker(t, SC_KEYS, key, function (k) { key = k; build(); }));
    body.appendChild(qb);
    body.appendChild(h("div", { class: "tr-slide" }, h("div", { class: "row" }, readout), h("div", { class: "tr-range" }, range, def)));
    body.appendChild(tog); body.appendChild(list); body.appendChild(sum);
    build();
  };

  FIG.scale = function (body, c) {
    var t = c.t, S = t.scale, key = "support", thr = D.thresholds.tau_abstain;
    var svg = dial({ label: S.score, thr: true });
    var big = h("div", { class: "readout-big", "aria-live": "polite" });
    var verdict = h("p", { class: "m-note", style: "text-align:center;min-height:2.6em", "aria-live": "polite" });
    var range = h("input", { type: "range", min: "0", max: "1", step: "0.01", value: String(thr), "aria-label": S.thr });
    var rl = h("p", { class: "mini", style: "margin:4px 0 0" });
    var tbody = h("tbody");
    function render() {
      var s = SC(key), v = s.F.sufficiency;
      thr = parseFloat(range.value);
      big.textContent = S.score + " " + f3(v);
      setNeedle(svg, v); setThr(svg, thr);
      clear(verdict); verdict.appendChild(v >= thr ? badge("pass", S.enough) : badge("abstain", S.notenough));
      rl.textContent = S.thr + ": " + f2(thr);
      range.setAttribute("aria-valuetext", f2(thr));
      clear(tbody);
      SC_KEYS.forEach(function (k) {
        var x = SC(k), up = x.F.sufficiency >= thr, o = OUT2K[x.F.outcome];
        var b = h("button", { type: "button", text: t.sc[k], on: { click: function () { key = k; render(); } } });
        tbody.appendChild(h("tr", { "aria-selected": String(k === key) }, h("td", { "data-th": S.q }, b), h("td", { class: "rn", "data-th": S.s, text: f3(x.F.sufficiency) }),
          h("td", { "data-th": S.now }, up ? h("span", { class: "chip", style: "direction:inherit", text: S.ans }) : badge("abstain", S.stop)),
          h("td", { "data-th": S.real }, badge(o, t.kinds[o]))));
      });
    }
    range.addEventListener("input", render);
    body.appendChild(h("div", { class: "sc-top" }, svg, big, verdict, h("div", {}, range, rl)));
    var table = h("table", { class: "sc-tbl" }, h("thead", {}, h("tr", {}, h("th", { text: S.q }), h("th", { text: S.s }), h("th", { text: S.now }), h("th", { text: S.real }))), tbody);
    body.appendChild(h("div", { class: "tbl-wrap" }, table));
    // first paint without the needle moving; the needle settles when the figure scrolls into view
    render(); setNeedle(svg, 0);
    settle(body, function () { setNeedle(svg, SC(key).F.sufficiency); });
  };

  FIG.answer = function (body, c) {
    var t = c.t, A = t.ans, key = "support", cite = null;
    var card = h("div", { class: "an-card" });
    function render() {
      var s = SC(key), F = s.F; clear(card); cite = null;
      card.appendChild(qBlock(t, c.lang, key));
      var cited = F.abstain ? [] : F.citations || [];
      var stamp;
      if (!F.abstain) {
        var k = OUT2K[F.outcome];
        stamp = h("div", { class: "an-stamp", "data-k": k },
          h("div", {}, badge(k, F.outcome === "planted" ? t.kinds.plant : t.kinds.pass)),
          h("div", { class: "ans", lang: "en", dir: "ltr", text: clean(F.answer) }),
          h("div", { class: "cites" }, h("span", { text: A.cites + ":" }), cited.map(function (n) {
            return h("button", { class: "cite", type: "button", "aria-pressed": "false", "aria-label": A.cite + " " + n, text: "[" + n + "]", on: { click: function (e) { toggle(n, e.currentTarget); } } });
          })),
          h("p", { class: "an-note", text: F.outcome === "planted" ? A.bad : A.good }));
      } else {
        stamp = h("div", { class: "an-stamp", "data-k": "abstain" },
          h("div", {}, badge("abstain", A.dontknow)),
          h("p", { class: "an-note", text: tpl(A.reason, { s: f3(F.sufficiency), t: f2(D.thresholds.tau_abstain) }) }),
          F.answer ? h("p", { class: "an-note" }, tpl(A.draft, { a: clean(F.answer) })) : null,
          F.generator_insufficient ? h("p", { class: "an-note", text: A.gins }) : null);
      }
      card.appendChild(stamp);
      var ul = h("ul", { class: "an-ctx", "aria-label": A.ctx });
      F.context.forEach(function (line, i) {
        var m = /^\[(\d+)\]\s*/.exec(line), n = m ? +m[1] : i + 1;
        ul.appendChild(h("li", { "data-n": n, "data-cited": String(cited.indexOf(n) >= 0) }, h("span", { class: "n", text: "[" + n + "]" }), h("span", { class: "tx", lang: "en", dir: "ltr", text: clean(line.replace(/^\[\d+\]\s*/, "")) })));
      });
      card.appendChild(ul);
      var truth = h("p", { class: "an-truth" }, A.truth + ": ", h("b", { lang: "en", text: clean(s.gold) }));
      if (s.planted) truth.appendChild(document.createTextNode("  |  " + A.planted + ": ")), truth.appendChild(h("b", { lang: "en", text: clean(s.planted) }));
      card.appendChild(truth);
      if (cited.length) card.appendChild(h("p", { class: "mini", style: "margin:0", text: A.hint }));
    }
    function toggle(n, btn) {
      var on = btn.getAttribute("aria-pressed") !== "true";
      $$(".cite", card).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      $$(".an-ctx li", card).forEach(function (li) { li.classList.remove("hit"); });
      if (on) { btn.setAttribute("aria-pressed", "true"); var li = $('.an-ctx li[data-n="' + n + '"]', card); if (li) li.classList.add("hit"); }
    }
    body.appendChild(picker(t, SC_KEYS, key, function (k) { key = k; render(); }));
    body.appendChild(card);
    render();
  };

  FIG.compare = function (body, c) {
    var t = c.t, C = t.cmp;
    var tb = h("tbody");
    SC_KEYS.forEach(function (k) {
      var s = SC(k), a = s.A, f = s.F;
      var fcell = f.abstain ? [h("span", { class: "ans", text: C.idk })] : [h("span", { class: "ans", lang: "en", text: clean(f.answer) })];
      tb.appendChild(h("tr", {},
        h("td", { "data-th": C.q }, h("span", { class: "qn", text: t.sc[k] })),
        h("td", { "data-th": C.a }, h("span", { class: "ans", lang: "en", text: clean(a.answer) }), badge(OUT2K[a.outcome], t.kinds[OUT2K[a.outcome]])),
        h("td", { "data-th": C.f }, fcell, badge(OUT2K[f.outcome], t.kinds[OUT2K[f.outcome]])),
        h("td", { "data-th": C.v, text: C.verdicts[k] })));
    });
    body.appendChild(h("div", { class: "tbl-wrap" }, h("table", { class: "cmp" }, h("thead", {}, h("tr", {}, h("th", { text: C.q }), h("th", { text: C.a }), h("th", { text: C.f }), h("th", { text: C.v }))), tb)));
  };

  FIG.wise = function (body, c) {
    var t = c.t, W = t.wise, rows = D.wise_ft;
    var alphas = rows.map(function (r) { return parseFloat(r.alpha); });
    var idx = alphas.indexOf(0.7);
    var range = h("input", { type: "range", min: "0", max: String(rows.length - 1), step: "1", value: String(idx), "aria-label": W.slide });
    var mixO = h("i", { class: "m-orig" }), mixT = h("i", { class: "m-tuned" });
    var txt = h("p", { class: "m-note", "aria-live": "polite", style: "min-height:2.6em;margin:6px 0 10px" });
    var hb = h("div", { class: "hb" });
    var rH = hbar(W.hot, rows[idx].hotpot, 1, "accent", f3(rows[idx].hotpot));
    var rN = hbar(W.nf, rows[idx].nfcorpus, 1, "accent", f3(rows[idx].nfcorpus));
    var rF = hbar(W.fq, rows[idx].fiqa, 1, "accent", f3(rows[idx].fiqa));
    hb.appendChild(rH); hb.appendChild(rN); hb.appendChild(rF);
    var sci = function (m) { return D.beir.filter(function (b) { return b.dataset === "scifact" && b.method === m; })[0].ndcg10; };
    var sh = h("div", { class: "hb" },
      hbar(W.o, sci("hybrid + ms-marco-minilm-l6-v2"), 100, "abstain", f1(sci("hybrid + ms-marco-minilm-l6-v2"))),
      hbar(W.f, sci("hybrid + verifier-minilm-l6-v4"), 100, "reject", f1(sci("hybrid + verifier-minilm-l6-v4"))),
      hbar(W.b, sci("hybrid + verifier-minilm-l6-v4-wise07"), 100, "pass", f1(sci("hybrid + verifier-minilm-l6-v4-wise07"))));
    function render() {
      var i = +range.value, r = rows[i], a = alphas[i];
      mixO.style.flexGrow = String(1 - a + 0.0001); mixT.style.flexGrow = String(a + 0.0001);
      txt.textContent = tpl(W.txt, { a: a.toFixed(1), t: Math.round(a * 100), o: Math.round((1 - a) * 100) }) + (a === 0.7 ? ". " + W.final : "");
      setHbar(rH, r.hotpot, 1, f3(r.hotpot)); setHbar(rN, r.nfcorpus, 1, f3(r.nfcorpus)); setHbar(rF, r.fiqa, 1, f3(r.fiqa));
      range.setAttribute("aria-valuetext", "alpha " + a.toFixed(1));
    }
    range.addEventListener("input", render);
    body.appendChild(h("div", { class: "wise-grid" },
      h("div", {}, h("p", { class: "hb-gt", text: W.dev }), h("div", { class: "ctl-label", text: W.slide }), range,
        h("div", { class: "mix-lab" }, h("span", { text: W.orig }), h("span", { text: W.tuned })), h("div", { class: "mix" }, mixO, mixT), txt, hb),
      h("div", {}, h("p", { class: "hb-gt", text: W.test }), h("div", { class: "ctl-label", style: "margin-bottom:8px", text: W.sci }), sh)));
    render();
  };

  FIG.calib = function (body, c) {
    var C = c.t.calib;
    // quoted from results/report.md (Platt calibration, dev, 10 bins)
    var Q = { p: [0.085, 0.005], s: [0.156, 0.006] };
    var hb = h("div", { class: "hb" });
    ["p", "s"].forEach(function (k) {
      hb.appendChild(h("div", { class: "hb-group" }, h("p", { class: "hb-gt", text: C[k] }),
        hbar(C.before, Q[k][0], 0.17, "abstain", f3(Q[k][0])), hbar(C.after, Q[k][1], 0.17, "accent", f3(Q[k][1]))));
    });
    body.appendChild(hb);
    body.appendChild(h("p", { class: "mini", style: "margin:12px 0 0", text: C.note + " " + C.axis }));
  };

  FIG.suff = function (body, c) {
    var S = c.t.suff, rows = D.sufficiency_auc;
    var lo = 0.5, hi = 1, pos = function (v) { return (v - lo) / (hi - lo) * 100; };
    var wrap = h("div", { class: "lolli" });
    rows.forEach(function (r, i) {
      var ax = h("div", { class: "lolli-axis" }, h("div", { class: "base" }),
        h("span", { class: "val", style: "left:" + pos(r.missing_hop) + "%", text: f3(r.missing_hop) }),
        h("span", { class: "dot a", style: "left:" + pos(r.missing_hop) + "%" }),
        h("span", { class: "dot b", style: "left:" + pos(r.no_evidence) + "%" }));
      var nm = h("span", { class: "val", style: "left:" + pos(r.no_evidence) + "%;top:24px;transform:translateX(-80%)", text: f3(r.no_evidence) });
      ax.appendChild(nm);
      wrap.appendChild(h("div", { class: "lolli-row" }, h("div", { class: "hb-lab" }, h("span", { text: S.names[i] })), ax));
    });
    body.appendChild(wrap);
    body.appendChild(h("div", { class: "lolli-ticks" }, h("span", { text: "0.5" }), h("span", { text: "0.75" }), h("span", { text: "1.0" })));
    body.appendChild(h("div", { class: "hb-legend" },
      h("span", {}, h("i", { style: "background:var(--accent)" }), S.hop), h("span", {}, h("i", { style: "background:var(--hold)" }), S.none)));
    body.appendChild(h("p", { class: "mini", style: "margin:8px 0 0", text: S.axis }));
    // the second dot's value label sits under the line, so give each row room
    $$(".lolli-axis", body).forEach(function (a) { a.style.height = "52px"; });
  };

  FIG.conditions = function (body, c) {
    var t = c.t, C = t.cond2, key = "fail", s = SC(key), cond = "supportive";
    var seg = h("div", { class: "seg", role: "group", "aria-label": "conditions" });
    var pool = h("div", { class: "cond-pool" });
    var sent = h("div", { class: "cd-sent", "aria-live": "polite" });
    var n = h("p", { class: "cd-n" });
    ["supportive", "missing", "misleading"].forEach(function (k) {
      seg.appendChild(h("button", { type: "button", "aria-pressed": String(k === cond), "data-k": k, text: t.condShort[k], on: { click: function () { cond = k; render(); } } }));
    });
    var base = s.F.sentences.filter(function (x) { return x.text.indexOf(s.planted) >= 0; })[0].text;
    var i0 = base.indexOf(s.planted), pre = clean(base.slice(0, i0)), post = tail(base, i0 + s.planted.length);
    function render() {
      $$("button", seg).forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.k === cond)); });
      clear(pool);
      s.A.passages.forEach(function (p) {
        var cls = "cd-card", mk = null;
        if (p.gold) {
          if (cond === "missing") { cls += " gone"; mk = C.removed; } else { cls += " gold"; mk = cond === "misleading" ? C.swapped : C.has; }
        }
        pool.appendChild(h("div", { class: cls }, mk ? h("span", { class: "mk", text: (p.gold && cond !== "missing" ? "★ " : "") + mk }) : null, clean(p.title)));
      });
      sent.setAttribute("data-c", cond); clear(sent);
      if (cond === "supportive") { sent.appendChild(document.createTextNode(pre)); sent.appendChild(h("span", { class: "good", text: s.gold })); sent.appendChild(document.createTextNode(post)); }
      else if (cond === "misleading") { sent.appendChild(document.createTextNode(pre)); sent.appendChild(h("mark", { text: s.planted })); sent.appendChild(document.createTextNode(post)); }
      else sent.appendChild(h("span", { lang: c.lang, dir: c.lang === "ar" ? "rtl" : "ltr", text: C.nopage }));
      var cnt = D.test.aggregate.F[cond].n;
      n.textContent = cond === "misleading" ? tpl(C.n2, { n: cnt, t: D.test.aggregate.F.supportive.n }) : tpl(C.n, { n: cnt });
    }
    body.appendChild(h("div", { class: "ctl" }, seg));
    body.appendChild(qBlock(t, c.lang, key));
    body.appendChild(h("p", { class: "mini", style: "margin:10px 0 0", text: C.pool })); body.appendChild(pool);
    body.appendChild(h("p", { class: "mini", style: "margin:0 0 4px", text: C.sentence })); body.appendChild(sent); body.appendChild(n);
    render();
  };

  FIG.forest = function (body, c) {
    var F = c.t.forest, MIN = -15, MAX = 5;
    var pos = function (v) { return (v - MIN) / (MAX - MIN) * 100; };
    var pick = function (slice, metric) { return D.test.comparisons.filter(function (x) { return x.a === "F" && x.b === "A" && x.slice === slice && x.metric === metric; })[0]; };
    var rows = [["sh", pick("supportive", "hallucinate")], ["mh", pick("missing", "hallucinate")], ["lh", pick("misleading", "hallucinate")], ["sc", pick("supportive", "correct")], ["lp", pick("misleading", "planted")]];
    var wrap = h("div", { class: "fo" });
    rows.forEach(function (r) {
      var d = r[1], m = d.mean_diff * 100, lo = d.ci_low * 100, hi = d.ci_high * 100, zero = lo <= 0 && hi >= 0;
      var plot = h("div", { class: "fo-plot" }, h("div", { class: "fo-zero", style: "left:" + pos(0) + "%" }),
        h("div", { class: "whisk", style: "left:" + pos(lo) + "%;width:" + (pos(hi) - pos(lo)) + "%" }),
        h("div", { class: "cap", style: "left:" + pos(lo) + "%" }), h("div", { class: "cap", style: "left:" + pos(hi) + "%" }),
        h("div", { class: "pt", style: "left:" + pos(m) + "%" }));
      var label = sgn(m) + " pp [" + sgn(lo) + ", " + sgn(hi) + "]";
      wrap.appendChild(h("div", { class: "fo-row", "data-zero": String(zero), role: "group", "aria-label": F.rows[r[0]] + ": " + label + ". " + (zero ? F.hollow : F.solid), tabindex: "0" },
        h("div", { class: "fo-lab" }, h("span", { text: F.rows[r[0]] }), h("span", { class: "v", text: label })), plot));
    });
    var axis = h("div", { class: "fo-axis" });
    [-15, -10, -5, 0, 5].forEach(function (v) { axis.appendChild(h("span", { style: "left:" + pos(v) + "%", text: v > 0 ? "+" + v : v < 0 ? "−" + Math.abs(v) : "0" })); });
    body.appendChild(wrap); body.appendChild(axis);
    body.appendChild(h("p", { class: "mini", style: "margin:2px 0 0", text: F.axis }));
    body.appendChild(h("div", { class: "fo-key" }, h("span", {}, h("i"), F.solid), h("span", {}, h("i", { class: "hollow" }), F.hollow)));
  };

  FIG.outcomes = function (body, c) {
    var t = c.t, O = t.oc, arm = "F", asTable = false, cond3 = ["supportive", "missing", "misleading"];
    var chips = h("div", { class: "seg", dir: "ltr", role: "group", "aria-label": O.chips });
    "ABCDEFG".split("").forEach(function (a) {
      chips.appendChild(h("button", { type: "button", "data-a": a, "aria-pressed": String(a === arm), text: a, "aria-label": O.desc[a], title: O.desc[a], on: { click: function () { arm = a; render(true); } } }));
    });
    var desc = h("p", { class: "oc-desc", "aria-live": "polite" });
    var view = h("div");
    var tgl = h("button", { class: "btn", type: "button", on: { click: function () { asTable = !asTable; render(false); } } });
    var legend = h("div", { class: "oc-legend" });
    [["pass", O.correct, "✓"], ["plant", O.plant, "⚑"], ["abstain", O.abstain, "–"], ["reject", O.reject, "✕"]].forEach(function (l) { legend.appendChild(h("span", {}, h("i", { "data-k": l[0] }), l[2] + " " + l[1])); });
    var GL = { pass: "✓", plant: "⚑", abstain: "–", reject: "✕" };
    function segs(x) {
      return [["pass", x.correct], ["plant", x.planted], ["abstain", x.abstain], ["reject", x.hallucinate]].filter(function (s) { return s[1] > 0.0005; });
    }
    function bar(name, x) {
      var tr = h("div", { class: "oc-track", role: "img", "aria-label": name + ": " + segs(x).map(function (s) { return O[s[0] === "pass" ? "correct" : s[0]] + " " + f1(s[1] * 100) + "%"; }).join(", ") });
      segs(x).forEach(function (s) {
        tr.appendChild(h("div", { class: "oc-seg", "data-k": s[0], style: "flex:" + s[1] + " 1 0", title: O[s[0] === "pass" ? "correct" : s[0]] + " " + f1(s[1] * 100) + "%", text: s[1] >= 0.07 ? GL[s[0]] + " " + Math.round(s[1] * 100) : "" }));
      });
      return h("div", { class: "oc-bar" }, h("div", { class: "nm", text: name }), tr);
    }
    function render(animate) {
      $$("button", chips).forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.a === arm)); });
      desc.textContent = O.desc[arm];
      tgl.textContent = asTable ? O.chart : O.table;
      clear(view);
      var agg = D.test.aggregate;
      if (!asTable) {
        var wrap = h("div", { class: "oc-wrap" });
        cond3.forEach(function (k) {
          var g = h("div", { class: "oc-g" }, h("h4", { text: t.condShort[k] }), h("div", { class: "n", text: tpl(O.n, { n: agg.A[k].n }) }), bar("A: " + O.arms.A, agg.A[k]));
          if (arm !== "A") g.appendChild(bar(arm + ": " + O.arms[arm], agg[arm][k]));
          wrap.appendChild(g);
        });
        view.appendChild(wrap);
        view.appendChild(legend);
        if (arm === "A") view.appendChild(h("p", { class: "mini", style: "margin:10px 0 0", text: O.baseOnly }));
        if (animate) tween($$(".oc-track", view), { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power3.out", stagger: 0.05, clearProps: "transform" });
      } else {
        var rows = [];
        cond3.forEach(function (k) { ["A"].concat(arm === "A" ? [] : [arm]).forEach(function (a) { var x = agg[a][k]; rows.push(h("tr", {}, h("td", { text: t.condShort[k] }), h("td", { text: a }), h("td", { class: "r", text: pct1(x.correct) }), h("td", { class: "r", text: pct1(x.planted) }), h("td", { class: "r", text: pct1(x.abstain) }), h("td", { class: "r", text: pct1(x.hallucinate) }))); }); });
        view.appendChild(h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, O.col.map(function (x, i) { return h("th", { class: i > 1 ? "r" : "", text: x }); }))), h("tbody", {}, rows))));
      }
    }
    body.appendChild(h("div", { class: "oc-ctl" }, h("div", { class: "ctl-label", style: "margin-bottom:6px", text: O.chips }), chips));
    body.appendChild(desc); body.appendChild(view); body.appendChild(h("div", { class: "fig-foot" }, tgl));
    render(false);
    settle(body, function () { tween($$(".oc-track", view), { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: "power3.out", stagger: 0.08, clearProps: "transform" }); });
  };

  FIG.tokens = function (body, c) {
    var K = c.t.tk, agg = D.test.aggregate, MAX = 1250;
    ["supportive", "missing", "misleading"].forEach(function (k) {
      var a = agg.A[k].context_tokens, f = agg.F[k].context_tokens;
      body.appendChild(h("div", { class: "tk-g" }, h("h4", { text: c.t.condShort[k] }),
        h("div", { class: "hb" }, hbar(K.a, a, MAX, "abstain", intl(a) + " " + K.u), hbar(K.f, f, MAX, "accent", intl(f) + " " + K.u))));
    });
    growBars(body);
  };

  FIG.costcard = function (body, c) {
    var t = c.t, K = t.cc, s = SC("cost"), th = D.thresholds;
    var cut = s.F.sentences.filter(function (x) { return x.gold && !x.kept; })[0];
    var wrap = h("div", { class: "cc" }, qBlock(t, c.lang, "cost"),
      h("div", { class: "cc-row" }, badge("pass", t.kinds.pass), h("span", { text: tpl(K.plain, { w: s.A.words_sent, a: clean(s.A.answer) }) })),
      h("div", { class: "cc-row" }, badge("abstain", t.kinds.abstain), h("span", { text: tpl(K.full, { w: s.F.words_sent }) }), h("span", { class: "mini", text: tpl(K.suf, { s: f3(s.F.sufficiency) }) })));
    if (cut) wrap.appendChild(h("div", {}, h("p", { class: "mini", style: "margin:0 0 4px", text: tpl(K.cut, { p: f3(cut.prob), t: f2(th.tau_keep) }) }),
      h("div", { class: "cc-sent", lang: "en", dir: "ltr" }, clean(cut.text.slice(0, 170)) + "…")));
    body.appendChild(wrap);
  };

  FIG.judge = function (body, c) {
    var J = c.t.judge, j = D.judge;
    var w = h("div", { class: "waffle", role: "img", "aria-label": J.both + " " + j.both_correct + ", " + J.wrong + " " + j.both_wrong + ", " + j.judge_only_correct });
    var seq = [].concat(Array(j.both_correct).fill("pass"), Array(j.both_wrong).fill("reject"), Array(j.judge_only_correct).fill("hold"), Array(j.outcome_only_correct).fill("reject"));
    seq.forEach(function (k) { w.appendChild(h("i", { "data-k": k })); });
    var leg = h("div", { class: "wf-legend" },
      h("p", {}, h("span", { class: "n", text: j.both_correct }), badge("pass", J.both)),
      h("p", {}, h("span", { class: "n", text: j.both_wrong }), badge("reject", J.wrong)),
      h("p", {}, h("span", { class: "n", text: j.judge_only_correct }), h("span", {}, badge("hold", J.short), " " + J.alias)),
      h("p", { class: "mini", text: tpl(J.kappa, { a: Math.round(j.agreement * 100), k: f2(j.kappa) }) }));
    body.appendChild(w); body.appendChild(leg);
    settle(body, function () { tween($$("i", w), { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.35, stagger: { each: 0.008, from: "start" }, ease: "power2.out", clearProps: "transform,opacity" }); });
  };

  /* ---------------- scroll builds ---------------- */
  function growBars(root) {
    var els = $$("[data-grow]", root);
    if (!els.length || !HAS_GSAP || RM() || !window.ScrollTrigger) return;
    window.ScrollTrigger.create({
      trigger: root, start: "top 88%", once: true,
      onEnter: function () {
        els.forEach(function (e) { e.style.transition = "none"; });
        window.gsap.fromTo(els, { scaleX: 0 }, {
          scaleX: function (i, e) { return parseFloat(e.dataset.grow); }, duration: 0.8, ease: "power3.out", stagger: 0.06,
          onComplete: function () { els.forEach(function (e) { window.gsap.set(e, { clearProps: "transform,transition" }); e.style.transform = "scaleX(" + e.dataset.grow + ")"; }); },
        });
      },
    });
  }

  /* ---------------- hero strip: one orchestrated moment ---------------- */
  function buildHero(el, c) {
    var H = c.t.hero, rtl = c.lang === "ar", W = 1000;
    var X = function (x) { return rtl ? W - x : x; };
    var best = SC("support").F.best_prob;
    var st = [X(150), X(400), X(650), X(880)];
    var svg = '<svg viewBox="0 0 1000 150" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink)">' +
      '<line x1="20" y1="100" x2="980" y2="100" stroke-width="2"/>' +
      '<path d="M20 108h960" stroke-dasharray="2 10" style="color:var(--ink-3)" stroke="var(--ink-3)"/>' +
      /* search: magnifier */
      '<g transform="translate(' + (st[0] - 18) + ' 30)"><circle cx="14" cy="14" r="12"/><path d="M23 23l12 12"/></g>' +
      /* inspect: little dial */
      '<g transform="translate(' + (st[1] - 26) + ' 30)"><path d="M2 40a26 26 0 0 1 52 0"/><g class="hn" transform="rotate(0 28 40)"><path d="M28 40L12 40" stroke-width="2.2"/></g><circle cx="28" cy="40" r="2.5" fill="currentColor"/></g>' +
      /* decide: two gates */
      '<g transform="translate(' + (st[2] - 28) + ' 28)"><path d="M0 50V8M56 50V8M0 8h56" /><path d="M0 22h56M0 36h56" stroke-dasharray="3 4" stroke="var(--ink-3)"/></g>' +
      /* answer: stamp */
      '<g transform="translate(' + (st[3] - 22) + ' 28)"><g class="stamp"><circle cx="22" cy="22" r="21" stroke="var(--pass)" stroke-width="2"/><path d="M12 23l7 7 14-15" stroke="var(--pass)" stroke-width="2.4"/></g></g>' +
      /* the part */
      '<g class="part-g"><rect x="-17" y="62" width="34" height="38" rx="3" fill="var(--sheet)"/><path d="M-9 74h18M-9 82h18M-9 90h11"/></g>' +
      '<g font-family="var(--f-body)" font-size="15" fill="var(--ink-2)" stroke="none" text-anchor="middle">' +
      st.map(function (x, i) { return '<text x="' + x + '" y="136">' + H.st[i] + "</text>"; }).join("") + "</g></svg>";
    el.innerHTML = svg;
    var partG = $(".part-g", el), needle = $(".hn", el), stamp = $(".stamp", el);
    var rot = best * 180;
    var setNeedleDeg = function (d) { needle.setAttribute("transform", "rotate(" + d + " 28 40)"); };
    var setStamp = function (k) { stamp.setAttribute("transform", "translate(22 22) scale(" + k + ") translate(-22 -22)"); };
    function finalState() { partG.setAttribute("transform", "translate(" + st[3] + " 0)"); setNeedleDeg(rot); stamp.style.opacity = "1"; }
    if (!HAS_GSAP || RM()) { finalState(); return; }
    var g = window.gsap, p = { deg: 0, k: 0.6 };
    g.set(partG, { x: X(60) }); g.set(stamp, { opacity: 0 }); setStamp(p.k);
    // the part travels the line; the needle settles on the real score of the first example; the stamp lands last
    var tl = g.timeline({ delay: 0.5 });
    tl.to(partG, { x: st[0], duration: 0.9, ease: "power1.inOut" })
      .to(partG, { x: st[1], duration: 0.8, ease: "power1.inOut" })
      .to(p, { deg: rot, duration: 0.9, ease: "elastic.out(1,0.6)", onUpdate: function () { setNeedleDeg(p.deg); } }, "<0.4")
      .to(partG, { x: st[2], duration: 0.8, ease: "power1.inOut" }, "+=0.2")
      .to(partG, { x: st[3], duration: 0.7, ease: "power1.inOut" }, "+=0.15")
      .to(stamp, { opacity: 1, duration: 0.2 })
      .to(p, { k: 1, duration: 0.35, ease: "back.out(2)", onUpdate: function () { setStamp(p.k); } }, "<");
  }

  /* ---------------- machine ---------------- */
  var machines = {};
  function mountMachine(el, c) {
    var ph = function (msg) {
      clear(el);
      el.appendChild(h("div", { class: "machine-ph" }, h("div", { html: '<svg width="44" height="44" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 24h24M7 24V12l6 4V12l6 4V8h6v16"/></svg>' }), h("b", { text: "Verified RAG" }), h("span", { text: msg })));
    };
    if (window.VRAGMachine && typeof window.VRAGMachine.mount === "function") {
      try {
        machines[c.lang] = window.VRAGMachine.mount(el, { data: D, scenario: "support", lang: c.lang, mode: "manual", controls: true });
        return;
      } catch (e) { if (window.console) console.warn("VRAGMachine.mount failed", e); ph(c.t.machineErr); return; }
    }
    ph(c.t.machinePh);
  }

  /* ---------------- number binding ---------------- */
  function bindNumbers() {
    var F = { pct1: pct1, pct0: function (v) { return Math.round(v * 100) + "%"; }, num2: f2, int: intl, round10: function (v) { return intl(Math.round(v / 10) * 10); } };
    $$("[data-n]").forEach(function (el) {
      var v = get(D, el.dataset.n), f = F[el.dataset.f];
      if (typeof v === "number" && f) el.textContent = f(v);
    });
  }

  /* ---------------- page chrome ---------------- */
  function chrome() {
    var root = document.documentElement;
    var tbtn = $(".theme");
    tbtn.addEventListener("click", function () {
      var dark = root.getAttribute("data-theme") ? root.getAttribute("data-theme") === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      var next = dark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("vrag-theme", next); } catch (e) { /* storage may be blocked */ }
    });
    $$("[data-go]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("data-go"), target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: RM() ? "auto" : "smooth", block: "start" });
        try { history.replaceState(null, "", "#" + id); } catch (er) { /* file:// may refuse */ }
      });
    });
    var links = { en: $('.langswitch a[data-go="en"]'), ar: $('.langswitch a[data-go="ar"]') };
    function setCur(id) { Object.keys(links).forEach(function (k) { if (k === id) links[k].setAttribute("aria-current", "true"); else links[k].removeAttribute("aria-current"); }); }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) setCur(e.target.id); }); }, { rootMargin: "-45% 0px -55% 0px" });
      ["en", "ar"].forEach(function (id) { io.observe(document.getElementById(id)); });
    }
  }

  /* ---------------- init ---------------- */
  function init() {
    chrome();
    if (!D) { if (window.console) console.warn("VRAG_DATA missing"); return; }
    bindNumbers();
    $$(".part").forEach(function (part) {
      var lang = part.getAttribute("data-lang"), c = { lang: lang, t: T[lang] };
      $$("[data-hero]", part).forEach(function (el) { buildHero(el, c); });
      $$("[data-machine]", part).forEach(function (el) { mountMachine(el, c); });
      $$(".fig", part).forEach(function (f) {
        var name = f.getAttribute("data-fig"), body = $(".fig-body", f);
        try { if (FIG[name]) FIG[name](body, c); } catch (e) { if (window.console) console.error("figure " + name + " failed", e); }
        if (name !== "tokens") growBars(body);
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
