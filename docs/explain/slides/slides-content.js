/* Verified RAG slides: slide content modules. Every number comes from window.VRAG_DATA at runtime. */
(function () {
  "use strict";
  var Deck = window.Deck, D = window.VRAG_DATA, def = Deck.def;
  var SV = Deck.svg;
  var T = D.test.aggregate, DV = D.dev.aggregate;
  var SL = ["supportive", "missing", "misleading"];
  var P1 = function (v) { return (v * 100).toFixed(1); };
  var P0 = function (v) { return Math.round(v * 100).toString(); };
  var INT = function (v) { return Math.round(v).toLocaleString("en-US"); };
  var F3 = function (v) { return Number(v).toFixed(3); };
  var PP = Deck.fmt.pp;
  var esc = function (s) { return String(s).replace(/&amp;/g, "&").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
  var ic = function (n, c) { return '<svg class="i ' + (c || "") + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  var C = function (el) { return el.querySelector(".content"); };
  var SC = D.scenarios;
  var A = function (arm, sl) { return T[arm][sl]; };
  var cmp = function (a, b, sl, m) {
    return D.test.comparisons.filter(function (c) { return c.a === a && c.b === b && c.slice === sl && c.metric === m; })[0];
  };
  var NS = "http://www.w3.org/2000/svg";
  function svgBox(parent, w, h, cls) {
    var s = SV("svg", { viewBox: "0 0 " + w + " " + h, width: w, height: h, "class": cls || "", role: "img" }, parent);
    s.style.display = "block";
    return s;
  }
  function txt(parent, x, y, s, cls, anchor, extra) {
    var t = SV("text", { x: x, y: y, "class": cls || "lab" }, parent);
    if (anchor) t.setAttribute("text-anchor", anchor);
    if (extra) for (var k in extra) t.setAttribute(k, extra[k]);
    t.textContent = s;
    return t;
  }
  function rect(parent, x, y, w, h, cls, rx) {
    return SV("rect", { x: x, y: y, width: w, height: h, rx: rx == null ? 3 : rx, "class": cls || "" }, parent);
  }
  function line(parent, x1, y1, x2, y2, cls) { return SV("line", { x1: x1, y1: y1, x2: x2, y2: y2, "class": cls || "grid-l" }, parent); }
  function grow(tl, r, y, h, base, at, dur) {
    tl.from(r, { attr: { y: base, height: 0 }, duration: dur || 0.9, ease: "power3.out" }, at);
  }
  function fadeIn(tl, els, at, dur) { tl.from(els, { opacity: 0, duration: dur || 0.4, ease: "power1.out" }, at); }
  function wrapSvg(parent, str, x, y, maxChars, lh, cls, bottom) { // simple word wrap for svg text, returns lines count
    var words = str.split(" "), lines = [], cur = "";
    words.forEach(function (w) { if ((cur + " " + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; } else cur += " " + w; });
    if (cur.trim()) lines.push(cur.trim());
    if (bottom) y = y - (lines.length - 1) * lh;
    lines.forEach(function (l, i) { txt(parent, x, y + i * lh, l, cls); });
    return lines.length;
  }
  var QT = function (k) { return esc(SC[k].question); };
  var cleanTitle = function (t) { return esc(t); };

  /* arm colours: plain RAG neutral, full system accent */
  var armCls = function (a) { return a === "F" ? "bar-F" : (a === "A" ? "bar-A" : "bar-o"); };

  /* ============ 1. title ============ */
  function arcPath(cx, cy, r, s0, s1) {
    function pt(s) { var a = Math.PI * (1 - s); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
    var a = pt(s0), b = pt(s1);
    return "M" + a[0].toFixed(1) + " " + a[1].toFixed(1) + " A" + r + " " + r + " 0 0 1 " + b[0].toFixed(1) + " " + b[1].toFixed(1);
  }
  Deck.arcPath = arcPath;
  def("title", {
    mount: function (el) {
      var q = SC.support, score = q.F.best_prob;
      var h = '<h1 class="t1">Verified RAG</h1>' +
        '<p class="t2">A small inspector that checks the evidence before a language model answers.</p>' +
        '<p class="t3">A mini project, tested on ' + D.counts.test_questions + ' held-out HotpotQA questions.</p>';
      var box = document.createElement("div"); box.innerHTML = h;
      while (box.firstChild) el.appendChild(box.firstChild);
      // belt (behind card)
      var belt = SV("svg", { viewBox: "0 0 1920 1080", "class": "tl-belt" }, el);
      [[0, 920], [1380, 1920]].forEach(function (r) {
        line(belt, r[0], 900, r[1], 900, "ink-l");
        line(belt, r[0], 926, r[1], 926, "ink-l");
        for (var x = r[0] + 30; x < r[1]; x += 60) SV("circle", { cx: x, cy: 913, r: 6, "class": "roller" }, belt);
      });
      var card = document.createElement("div");
      card.className = "sheet qcard qtravel";
      card.innerHTML = '<span class="lab">Question</span>' + QT("support");
      el.appendChild(card);
      var bench = SV("svg", { viewBox: "0 0 1920 1080", "class": "tl-bench" }, el);
      var cx = 1150, cy = 660;
      SV("path", { d: "M1020 660 A130 130 0 0 1 1280 660 Z", "class": "face" }, bench);
      var th = D.thresholds;
      [[0, th.tau_lo, "z-reject"], [th.tau_lo, th.tau_hi, "z-hold"], [th.tau_hi, 1, "z-pass"]].forEach(function (z) {
        SV("path", { d: arcPath(cx, cy, 106, z[0], z[1]), "class": "zone " + z[2] }, bench);
      });
      txt(bench, 1034, 690, "0", "ax s", "start"); txt(bench, 1266, 690, "1", "ax s", "end");
      var body = rect(bench, 920, 660, 460, 300, "face", 8); body.setAttribute("stroke-width", 2);
      rect(bench, 920, 740, 26, 160, "slot", 2);
      var nd = SV("g", { "class": "needle", transform: "rotate(" + ((score - 0.5) * 180).toFixed(1) + " " + cx + " " + cy + ")" }, bench);
      line(nd, cx, cy, cx, cy - 96, "needle-l");
      SV("circle", { cx: cx, cy: cy, r: 11, "class": "hub" }, bench);
      var ro = txt(bench, cx, 790, score.toFixed(3), "readout", "middle");
      txt(bench, cx, 850, "verifier score", "ax", "middle");
      var out = document.createElement("div");
      out.className = "tl-out";
      out.innerHTML = '<span class="chip pass">' + ic("check") + '<span class="t">' + esc(q.F.answer) + '</span></span>';
      el.appendChild(out);
      el._ro = ro; el._nd = nd; el._card = card; el._out = out; el._cx = cx; el._cy = cy; el._score = score;
    },
    enter: function (el, ctx) {
      var g = window.gsap, tl = Deck.tl(ctx.s);
      var rot = (el._score - 0.5) * 180;
      tl.from(el.querySelectorAll(".t1,.t2,.t3"), { y: 28, opacity: 0, duration: 0.7, stagger: 0.12, ease: "power2.out" }, 0);
      tl.from(el._card, { x: -40, opacity: 0, duration: 0.5, ease: "power2.out" }, 0.5);
      tl.to(el._card, { x: 820, duration: 2.0, ease: "power2.inOut" }, 1.2);
      tl.fromTo(el._nd, { rotation: -90, svgOrigin: el._cx + " " + el._cy }, { rotation: 78, svgOrigin: el._cx + " " + el._cy, duration: 0.7, ease: "power2.inOut" }, 3.0);
      tl.to(el._nd, { rotation: rot, svgOrigin: el._cx + " " + el._cy, duration: 0.9, ease: "elastic.out(1,0.55)" }, 3.7);
      var o = { v: 0 };
      tl.fromTo(o, { v: 0 }, { v: el._score, duration: 1.4, ease: "power2.out", onUpdate: function () { el._ro.textContent = o.v.toFixed(3); } }, 3.0);
      tl.from(el._out, { x: -50, opacity: 0, duration: 0.6, ease: "power2.out" }, 4.5);
    }
  });

  /* ============ 2. RAG in one picture ============ */
  def("rag", {
    mount: function (el) {
      var c = C(el), sc = SC.support;
      c.style.top = "290px";
      var s = svgBox(c, 1680, 650, "rag-svg");
      var st = "stroke:var(--ink);stroke-width:2;";
      // question card
      rect(s, 0, 345, 340, 190, "sh", 8);
      txt(s, 24, 382, "Question", "lab m dim");
      wrapSvg(s, sc.question, 24, 420, 24, 36, "lab m");
      // arrows
      function arrow(x1, y, x2, step) {
        var g = SV("g", step ? { "class": "frag fade", "data-step": step } : {}, s);
        line(g, x1, y, x2 - 10, y, "ink-l");
        SV("path", { d: "M" + (x2 - 22) + " " + (y - 11) + " L" + x2 + " " + y + " L" + (x2 - 22) + " " + (y + 11), "class": "ink-l" }, g);
        return g;
      }
      arrow(350, 440, 440);
      // shelf
      rect(s, 300, 20, 460, 255, "sh", 6);
      line(s, 300, 100, 760, 100, "axis-l"); line(s, 300, 185, 760, 185, "axis-l");
      txt(s, 530, 308, "The pool: " + INT(D.counts.pool_paragraphs) + " paragraphs", "lab m dim", "middle");
      var fetched = [1, 3, 4];
      [0, 1, 2].forEach(function (row) {
        for (var i = 0; i < 6; i++) {
          if (row === 1 && fetched.indexOf(i) >= 0) continue;
          var x = 320 + i * 74, y = 56 + row * 85;
          rect(s, x, y, 60, 40, "mini", 3);
          line(s, x + 8, y + 12, x + 52, y + 12, "mini-l"); line(s, x + 8, y + 22, x + 44, y + 22, "mini-l"); line(s, x + 8, y + 32, x + 50, y + 32, "mini-l");
        }
      });
      // fetched cards: animate between shelf and desk with CSS transforms
      var desk = [[790, 330], [815, 360], [840, 390]];
      fetched.forEach(function (ci, k) {
        var g = SV("g", { "class": "fc" }, s);
        g.style.setProperty("--sx", (320 + ci * 74) + "px"); g.style.setProperty("--sy", (141 + 3) + "px");
        g.style.setProperty("--dx", desk[k][0] + "px"); g.style.setProperty("--dy", desk[k][1] + "px");
        g.style.transitionDelay = (k * 0.12) + "s";
        rect(g, 0, 0, 200, 112, "card-acc", 8);
        [24, 46, 68, 90].forEach(function (yy, j) { rect(g, 18, yy - 6, [150, 164, 120, 140][j], 8, "mini-fill", 3); });
      });
      // librarian
      var L = SV("g", { "class": "libr" }, s);
      SV("circle", { cx: 520, cy: 392, r: 36, "class": "sh" }, L);
      line(L, 484, 488, 450, 346, "ink-l"); line(L, 556, 488, 590, 346, "ink-l");
      SV("circle", { cx: 448, cy: 338, r: 11, "class": "sh" }, L); SV("circle", { cx: 592, cy: 338, r: 11, "class": "sh" }, L);
      SV("path", { d: "M440 610 C440 510 478 450 520 450 C562 450 600 510 600 610 Z", "class": "sh" }, L);
      SV("path", { d: "M486 388 q8 -8 16 0 M538 388 q8 -8 16 0", "class": "ink-l" }, L);
      var mag = SV("g", { transform: "translate(468 505) scale(2.4)", "class": "icon-g" }, L);
      SV("use", { href: "#i-search" }, mag);
      txt(s, 520, 650, "Search", "lab", "middle");
      // desk label, step 1
      var g1 = SV("g", { "class": "frag fade", "data-step": 1 }, s);
      txt(g1, 925, 560, "The top " + sc.A.passages.length + " paragraphs", "lab", "middle");
      arrow(1070, 440, 1128, 2);
      // model + answer, step 2
      var g2 = SV("g", { "class": "frag fade", "data-step": 2 }, s);
      rect(g2, 1140, 340, 200, 200, "sh", 12);
      [0, 1, 2].forEach(function (r) {
        for (var q = 0; q < 3; q++) SV("circle", { cx: 1190 + q * 50, cy: 395 + r * 50, r: 9, "class": "node" }, g2);
      });
      [[1190, 395, 1240, 445], [1240, 395, 1290, 445], [1190, 445, 1240, 495], [1290, 395, 1240, 445], [1240, 445, 1290, 495]].forEach(function (l) { line(g2, l[0], l[1], l[2], l[3], "mini-l"); });
      txt(g2, 1240, 585, "Language model", "lab", "middle");
      var g3 = SV("g", { "class": "frag fade", "data-step": 2 }, s);
      arrow(1350, 440, 1428, 2);
      rect(g3, 1430, 375, 250, 130, "sh ans", 10);
      txt(g3, 1555, 430, "Answer", "lab", "middle");
      txt(g3, 1555, 472, "from the paragraphs", "lab s dim", "middle");
      var sd = document.createElement("div"); sd.className = "abs rag-note";
      sd.innerHTML = '<p class="lede" style="color:var(--ink)">RAG stands for retrieval-augmented generation.</p><p class="cap" style="margin:14px 0 0">The model answers from the paragraphs it is handed, and from nothing else.</p>';
      c.appendChild(sd);
    },
    apply: function (el, step) { /* css driven */ }
  });

  /* ============ 3. failures ============ */
  def("fails", {
    mount: function (el) {
      var c = C(el);
      var items = [
        { k: "support", cond: ["doc", "Supportive: evidence present"], chip: ["reject", "x", "Hallucinated"], truth: "Right answer: " + SC.support.gold + ". Both paragraphs were in the context." },
        { k: "missing", cond: ["stop", "Missing: evidence removed"], chip: ["reject", "x", "Hallucinated"], truth: "Right answer was “I don’t know”. We had removed the evidence." },
        { k: "fail", cond: ["plant", "Misleading: answer swapped"], chip: ["plant", "plant", "Repeated the planted answer"], truth: "Right answer: " + SC.fail.gold + ". We swapped it for " + SC.fail.planted.split(",")[0] + " inside the evidence." }
      ];
      var h = '<p class="lede" style="margin:0 0 26px">Real answers from plain RAG on our test set. One generator, Qwen3-4B-Instruct-2507.</p><div class="fcards">';
      items.forEach(function (it, i) {
        var sc = SC[it.k];
        var ans = sc.A.answer;
        h += '<article class="sheet fcard frag" data-step="' + (i + 1) + '">' +
          '<span class="chip plain">' + ic(it.cond[0]) + '<span class="t">' + it.cond[1] + '</span></span>' +
          '<p class="q">' + esc(sc.question) + '</p>' +
          '<div class="ans"><small>Plain RAG answered</small><div class="a' + (ans.length > 9 ? " long" : "") + ' c-' + it.chip[0] + '">“' + esc(ans.split(",")[0]) + '”</div>' +
          '<span class="chip ' + it.chip[0] + '">' + ic(it.chip[1]) + it.chip[2] + '</span></div>' +
          '<p class="truth">' + esc(it.truth) + '</p></article>';
      });
      c.innerHTML = h + "</div>";
    }
  });

  /* ============ 4. rates ============ */
  def("rates", {
    mount: function (el) {
      var c = C(el), W = 1680, H = 650, base = 590, max = 60, sc = 510 / max;
      var s = svgBox(c, W, H, "rates-svg"); el._svg = s;
      [0, 20, 40, 60].forEach(function (v) {
        line(s, 120, base - v * sc, 1120, base - v * sc, v ? "grid-l" : "axis-l");
        txt(s, 100, base - v * sc + 9, v + "%", "ax", "end");
      });
      var cats = [["supportive", "Evidence present"], ["missing", "Evidence removed"], ["misleading", "Answer swapped"]];
      var bars = [];
      cats.forEach(function (ct, i) {
        var a = A("A", ct[0]), cx = 250 + i * 350, w = 190;
        var h1 = a.hallucinate * 100 * sc, h2 = a.planted * 100 * sc;
        var r1 = rect(s, cx - w / 2, base - h1, w, h1, "bar-rej", 4);
        var r2 = h2 ? rect(s, cx - w / 2, base - h1 - h2 - 2, w, h2, "bar-plant", 4) : null;
        var l1 = txt(s, cx, h1 > 70 ? base - h1 + 46 : base - h1 - 14, P1(a.hallucinate) + "%", h1 > 70 ? "val on" : "val", "middle");
        var l2 = r2 ? txt(s, cx, base - h1 - h2 - 2 + 46, P1(a.planted) + "%", "val on", "middle") : null;
        txt(s, cx, base + 40, ct[1], "lab", "middle");
        bars.push({ r1: r1, r2: r2, h1: h1, h2: h2, l1: l1, l2: l2, y1: base - h1, y2: base - h1 - h2 - 2 });
      });
      el._bars = bars; el._base = base;
      var p = document.createElement("div");
      p.className = "abs rates-side";
      p.innerHTML = '<p class="lede" style="color:var(--ink)">Even with the right paragraphs in context, about one answer in four is wrong.</p>' +
        '<p style="margin:34px 0 14px"><span class="chip reject">' + ic("x") + 'Hallucinated</span></p><p class="cap" style="margin:0">Answered, and wrong.</p>' +
        '<p style="margin:34px 0 14px"><span class="chip plant">' + ic("plant") + 'Planted</span></p><p class="cap" style="margin:0">Repeated the swapped answer.</p>';
      c.appendChild(p);
    },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s);
      el._bars.forEach(function (b, i) {
        grow(tl, b.r1, b.y1, b.h1, el._base, 0.2 + i * 0.25, 0.9);
        if (b.r2) tl.from(b.r2, { attr: { y: b.y1, height: 0 }, duration: 0.8, ease: "power3.out" }, 1.1 + i * 0.25);
        fadeIn(tl, b.l1, 0.9 + i * 0.25, 0.4);
        if (b.l2) fadeIn(tl, b.l2, 1.8, 0.4);
      });
      tl.from(el.querySelector(".rates-side"), { opacity: 0, x: 20, duration: 0.6 }, 1.3);
    }
  });

  /* ============ 5. the idea ============ */
  def("idea", {
    mount: function (el) {
      var c = C(el);
      var s = svgBox(c, 1680, 340, "idea-svg");
      function box(x, y, w, h, icon, label) {
        var g = SV("g", {}, s);
        rect(g, x, y, w, h, "sh", 10);
        var u = SV("g", { transform: "translate(" + (x + w / 2 - 28) + " " + (y + 22) + ") scale(2.3)", "class": "icon-g" }, g);
        SV("use", { href: "#i-" + icon }, u);
        txt(g, x + w / 2, y + h - 22, label, "lab", "middle");
        return g;
      }
      box(0, 100, 270, 150, "search", "Search");
      box(1410, 100, 270, 150, "answer", "Answer model");
      // plain arrow
      line(s, 280, 175, 1388, 175, "ink-l");
      SV("path", { d: "M1366 164 L1388 175 L1366 186", "class": "ink-l" }, s);
      var la = txt(s, 840, 40, "Plain RAG: whatever search returns goes straight in.", "lab out1", "middle");
      txt(s, 840, 40, "Verified RAG: the evidence is checked, trimmed and weighed first.", "lab frag fade", "middle", { "data-step": 1 });
      // inspector
      var ins = SV("g", { "class": "insp" }, s);
      rect(ins, 690, 70, 300, 200, "sh insp-box", 10);
      var u = SV("g", { transform: "translate(812 92) scale(2.3)", "class": "icon-g acc" }, ins);
      SV("use", { href: "#i-inspect" }, u);
      txt(ins, 840, 195, "Inspector", "lab disp", "middle", { "font-size": 34 });
      txt(ins, 840, 238, "measure, trim, weigh", "lab m dim", "middle");
      // abstain branch
      var br = SV("g", { "class": "frag fade", "data-step": 1 }, s);
      line(br, 840, 272, 840, 296, "ink-l");
      var chip = SV("g", { transform: "translate(700 296)" }, br);
      rect(chip, 0, 0, 280, 40, "chip-abs", 4);
      txt(chip, 140, 29, "or say “I don’t know”", "lab m", "middle");
      // credits
      var cr = document.createElement("div");
      cr.className = "abs credits frag"; cr.setAttribute("data-step", 2);
      cr.style.cssText = "left:0;right:0;top:400px";
      cr.innerHTML = '<div class="sheet cr"><h3>CRAG</h3><p class="src">Yan et al., 2024</p><p>Grade what retrieval returns as correct, ambiguous or incorrect, and fix it before answering.</p></div>' +
        '<div class="sheet cr"><h3>Sufficient Context</h3><p class="src">Joren et al., ICLR 2025</p><p>Ask whether the context is enough to answer. If it is not, abstain instead of guessing.</p></div>';
      c.appendChild(cr);
    }
  });

  /* ============ 6. seven stations ============ */
  var STN = [
    ["ask", "Ask", "A question comes in.", ""],
    ["search", "Search", "Keyword and meaning search return the top 20 paragraphs.", "BM25 and bge-small, merged by reciprocal rank fusion."],
    ["inspect", "Inspect", "A small model scores every paragraph from 0 to 1.", "The verifier reads question and paragraph together."],
    ["decide", "Decide", "Correct, ambiguous or incorrect. Weak evidence sends two new queries back to search.", "One extra round, then on to the next station."],
    ["trim", "Trim", "Keep only the sentences that matter.", "Each sentence is scored on its own."],
    ["weigh", "Weigh", "Is what is left enough to answer?", "A second small model gives a sufficiency score."],
    ["answer", "Answer", "Answer with citations, or say “I don’t know”.", "The generator only sees what survived."]
  ];
  def("stations", {
    steps: 7,
    mount: function (el) {
      var c = C(el), W = 1680;
      var s = svgBox(c, W, 420, "stn-svg"); el._svg = s;
      var cxs = STN.map(function (_, i) { return 75 + i * 255; });
      STN.forEach(function (st, i) {
        if (i) {
          line(s, cxs[i - 1] + 75, 175, cxs[i] - 75, 175, "conn");
          var p = line(s, cxs[i - 1] + 75, 175, cxs[i] - 75, 175, "conn prog"); p.setAttribute("data-i", i);
        }
      });
      STN.forEach(function (st, i) {
        var g = SV("g", { "class": "st" + (i >= 2 && i <= 5 ? " new" : ""), "data-i": i + 1 }, s);
        rect(g, cxs[i] - 75, 100, 150, 150, "st-box", 14);
        var u = SV("g", { transform: "translate(" + (cxs[i] - 36) + " 139) scale(3)", "class": "icon-g" }, g);
        SV("use", { href: "#i-" + st[0] }, u);
        txt(g, cxs[i] - 58, 132, String(i + 1), "mono st-n", "start");
        txt(g, cxs[i], 296, st[1], "st-l", "middle");
      });
      // rewrite loop
      var lp = SV("g", { "class": "frag fade", "data-step": 4 }, s);
      SV("path", { d: "M" + cxs[3] + " 96 C " + cxs[3] + " 50 " + cxs[1] + " 50 " + cxs[1] + " 92", "class": "loop" }, lp);
      SV("path", { d: "M" + (cxs[1] - 11) + " 74 L" + cxs[1] + " 94 L" + (cxs[1] + 11) + " 74", "class": "loop loopa" }, lp);
      txt(lp, (cxs[1] + cxs[3]) / 2, 26, "weak evidence: rewrite and search again", "lab m c-hold", "middle");
      // bracket
      var br = SV("g", { "class": "frag fade", "data-step": 7 }, s);
      line(br, cxs[2] - 75, 336, cxs[5] + 75, 336, "brk");
      line(br, cxs[2] - 75, 326, cxs[2] - 75, 336, "brk"); line(br, cxs[5] + 75, 326, cxs[5] + 75, 336, "brk");
      txt(br, (cxs[2] + cxs[5]) / 2, 380, "Plain RAG is this line with these four stations switched off.", "lab m", "middle");
      var d = document.createElement("div");
      d.className = "abs stations-detail";
      d.style.top = "448px";
      d.innerHTML = '<div class="d on" data-i="0">Press to build the line.</div>' + STN.map(function (st, i) {
        return '<div class="d" data-i="' + (i + 1) + '">' + st[2] + (st[3] ? "<small>" + st[3] + "</small>" : "") + "</div>";
      }).join("");
      c.appendChild(d);
    },
    apply: function (el, step) {
      var s = el._svg;
      s.querySelectorAll(".st").forEach(function (g) {
        var i = +g.getAttribute("data-i");
        g.classList.toggle("on", i === step);
        g.classList.toggle("done", i < step || step === 7 && i === 7);
        g.classList.toggle("future", i > step);
      });
      s.querySelectorAll(".prog").forEach(function (p) { p.classList.toggle("go", +p.getAttribute("data-i") < step); });
      el.querySelectorAll(".stations-detail .d").forEach(function (d) { d.classList.toggle("on", +d.getAttribute("data-i") === step); });
    }
  });

  /* ============ 7. live machine ============ */
  var LIVE = [["support", "Documentary"], ["missing", "Guildford"], ["fooled", "Uyoku dantai"], ["fail", "Sun Valley"], ["cost", "Geraldine Page"]];
  def("live", {
    mount: function (el, s) {
      var c = C(el);
      var sw = document.createElement("div"); sw.className = "live-switch"; sw.setAttribute("role", "group"); sw.setAttribute("aria-label", "Scenario");
      LIVE.forEach(function (l, i) {
        var b = document.createElement("button"); b.textContent = l[1]; b.setAttribute("data-k", l[0]); b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
        b.addEventListener("click", function () {
          sw.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
          s.scenario = l[0];
          if (s.machine && s.machine.setScenario) s.machine.setScenario(l[0]); else renderPh(el, l[0]);
        });
        sw.appendChild(b);
      });
      c.appendChild(sw);
      var wrap = document.createElement("div"); wrap.className = "live-wrap"; wrap.setAttribute("data-no-nav", "");
      wrap.innerHTML = '<div class="live-mount" data-live-mount></div>';
      c.appendChild(wrap);
      s.scenario = "support";
      el._sw = sw;
    },
    live: function (el, active) {
      var s = Deck.slides.filter(function (x) { return x.el === el; })[0];
      var host = el.querySelector(".live-mount");
      if (s.machine) { try { if (s.machine.reset) s.machine.reset(); } catch (e) {} return; }
      if (window.VRAGMachine && window.VRAGMachine.mount) {
        try {
          host.innerHTML = "";
          s.machine = window.VRAGMachine.mount(host, { data: D, scenario: s.scenario || "support", lang: "en", mode: "manual", controls: true });
          el.classList.add("has-machine");
          return;
        } catch (e) { console.error("machine mount", e); }
      }
      renderPh(el, s.scenario || "support");
    }
  });
  function renderPh(el, k) {
    var host = el.querySelector(".live-mount"), sc = SC[k], F = sc.F;
    var rows = [
      ["Search", F.n_retrieved + " paragraphs retrieved"],
      ["Inspect", "best score " + F.best_prob.toFixed(3)],
      ["Decide", F.final_decision],
      ["Trim", sc.A.words_sent + " words → " + F.words_sent + " words"],
      ["Weigh", "sufficiency " + F.sufficiency.toFixed(3) + (F.abstain ? ", below " + D.thresholds.tau_abstain.toFixed(2) : "")],
      ["Answer", F.abstain ? "I don’t know" : F.answer]
    ];
    host.innerHTML = '<div class="live-ph"><div><p class="lede" style="color:var(--ink);max-width:1200px;margin:0 auto 30px">' + esc(sc.question) + '</p>' +
      '<div class="ph-rows">' + rows.map(function (r) { return '<div><small>' + r[0] + '</small><b>' + esc(r[1]) + "</b></div>"; }).join("") + '</div>' +
      '<p class="cap" style="margin-top:34px">The interactive machine is not loaded in this build. This is the same trace as plain numbers.</p></div></div>';
  }

  /* ============ 8. verifier ============ */
  function ell(s, n) { s = esc(s).replace(/&amp;/g, "&"); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }
  function plain(s, n) { s = String(s).replace(/&amp;/g, "&"); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }
  def("verifier", {
    steps: 1,
    mount: function (el) {
      var c = C(el), sc = SC.support, top = sc.F.top;
      var L = svgBox(c, 700, 666, "ver-left abs"); L.style.left = 0; L.style.top = 0;
      // question and paragraph cards
      rect(L, 0, 0, 470, 100, "sh", 8);
      txt(L, 22, 34, "Question", "lab m dim");
      txt(L, 22, 76, plain(sc.question, 32), "lab m");
      rect(L, 0, 128, 470, 120, "sh", 8);
      txt(L, 22, 162, "Paragraph", "lab m dim");
      txt(L, 22, 202, plain(top[0].title, 30), "lab m", null, { "font-weight": 600 });
      txt(L, 22, 234, plain(sc.F.sentences[0].text, 36), "lab m dim");
      // join + verifier
      line(L, 470, 50, 520, 50, "ink-l"); line(L, 470, 188, 520, 188, "ink-l"); line(L, 520, 50, 520, 188, "ink-l");
      line(L, 520, 119, 560, 119, "ink-l");
      SV("path", { d: "M546 108 L562 119 L546 130", "class": "ink-l" }, L);
      rect(L, 566, 40, 134, 160, "sh ver-box", 10);
      var u = SV("g", { transform: "translate(603 62) scale(2.6)", "class": "icon-g acc" }, L);
      SV("use", { href: "#i-inspect" }, u);
      txt(L, 633, 170, "Verifier", "lab m", "middle", { "font-weight": 600 });
      var ro = txt(L, 350, 336, top[0].prob.toFixed(3), "readout lg", "middle");
      txt(L, 350, 380, "probability that this paragraph answers the question", "lab m dim", "middle");
      L.querySelector(".readout").setAttribute("text-anchor", "middle");
      el._ro = ro;
      // ECE card
      var e = document.createElement("div");
      e.className = "abs ece frag"; e.setAttribute("data-step", 1);
      e.style.cssText = "left:0;top:430px;width:700px";
      e.innerHTML = '<p class="cap" style="margin:0 0 14px;color:var(--ink)">Calibrated, so a score means what it says. Expected calibration error:</p>' +
        '<div class="eb"><span>before</span><i style="width:' + (0.085 / 0.085 * 360) + 'px" class="b-a"></i><b>0.085</b></div>' +
        '<div class="eb"><span>after</span><i style="width:' + Math.max(8, 0.005 / 0.085 * 360) + 'px" class="b-f"></i><b>0.005</b></div>';
      c.appendChild(e);
      // chart
      var R = svgBox(c, 920, 666, "ver-right abs"); R.style.left = "760px"; R.style.top = 0;
      var rh = 70, x0 = 480, W = 330, rows = [];
      txt(R, 0, 28, "Scores for the eight paragraphs search returned", "lab m dim");
      top.forEach(function (t, i) {
        var y = 60 + i * rh;
        txt(R, x0 - 16, y + 38, plain(t.title, 34), "lab m", "end");
        rect(R, x0, y + 8, W, 44, "track", 3);
        var b = rect(R, x0, y + 8, Math.max(2, t.prob * W), 44, t.gold ? "bar-F" : "bar-o", 3);
        var v = txt(R, x0 + Math.max(2, t.prob * W) + 12, y + 40, t.prob.toFixed(3), "val s");
        rows.push({ b: b, v: v, w: Math.max(2, t.prob * W) });
      });
      var lg = SV("g", { transform: "translate(0 " + (60 + 8 * rh + 6) + ")" }, R);
      rect(lg, x0, 0, 26, 26, "bar-F", 3); txt(lg, x0 + 38, 22, "holds the answer", "lab m");
      rect(lg, x0 + 270, 0, 26, 26, "bar-o", 3); txt(lg, x0 + 308, 22, "distractor", "lab m");
      el._rows = rows;
    },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s);
      el._rows.forEach(function (r, i) {
        tl.from(r.b, { attr: { width: 0 }, duration: 0.8, ease: "power3.out" }, 0.2 + i * 0.07);
        tl.from(r.v, { opacity: 0, duration: 0.3 }, 0.8 + i * 0.07);
      });
      var o = { v: 0 };
      tl.to(o, { v: SC.support.F.top[0].prob, duration: 1.0, ease: "power2.out", onUpdate: function () { el._ro.textContent = o.v.toFixed(3); } }, 0.2);
    }
  });

  /* ============ 9. decision band ============ */
  var BX = function (s) { return 40 + s * 1600; };
  def("band", {
    steps: 1,
    mount: function (el) {
      var c = C(el), th = D.thresholds, sc = SC.support, sv = sc.F.best_prob;
      var s = svgBox(c, 1680, 666, "band-svg"); el._svg = s;
      var y0 = 230, h = 84;
      [[0, th.tau_lo, "z-reject", "Incorrect", "x", "mid"], [th.tau_lo, th.tau_hi, "z-hold", "Ambiguous", "hold", "end"], [th.tau_hi, 1, "z-pass", "Correct", "check", "mid"]].forEach(function (z) {
        rect(s, BX(z[0]), y0, BX(z[1]) - BX(z[0]), h, "zb " + z[2], 0);
        var wTxt = z[3] === "Incorrect" ? 108 : z[3] === "Ambiguous" ? 138 : 98;
        var xEnd = z[5] === "end" ? BX(z[1]) - 30 : (BX(z[0]) + BX(z[1])) / 2 + (wTxt + 44) / 2;
        var g = SV("g", { "class": "zl " + z[2] }, s);
        var ig = SV("g", { transform: "translate(" + (xEnd - wTxt - 46) + " " + (y0 + 26) + ") scale(1.35)", "class": "icon-g" }, g);
        SV("use", { href: "#i-" + z[4] }, ig);
        txt(g, xEnd, y0 + 54, z[3], "lab disp", "end", { "font-size": 32 });
      });
      line(s, BX(th.tau_lo), y0 - 6, BX(th.tau_lo), y0 + h + 36, "thr");
      line(s, BX(th.tau_hi), y0 - 6, BX(th.tau_hi), y0 + h + 36, "thr");
      txt(s, BX(th.tau_lo), y0 + h + 72, th.tau_lo.toFixed(2), "val", "middle");
      txt(s, BX(th.tau_hi), y0 + h + 72, th.tau_hi.toFixed(2), "val", "middle");
      txt(s, BX(0), y0 + h + 72, "0", "ax", "start"); txt(s, BX(1), y0 + h + 72, "1", "ax", "end");
      // other pins (step 1)
      var pins = SV("g", { "class": "frag fade", "data-step": 1 }, s);
      [["missing", "Guildford", "A", "end", -8], ["cost", "Geraldine Page", "B", "start", 8], ["fail", "Sun Valley", "A", "middle", 0], ["fooled", "Uyoku dantai", "B", "middle", 0]].forEach(function (p) {
        var v = SC[p[0]].F.best_prob, x = BX(v), ty = p[2] === "A" ? y0 - 62 : y0 - 118;
        SV("circle", { cx: x, cy: y0 + h / 2, r: 11, "class": "pin" }, pins);
        line(pins, x, y0 + h / 2 - 11, x, ty + 36, "leader");
        txt(pins, x + p[4], ty, p[1], "lab m", p[3]);
        txt(pins, x + p[4], ty + 30, v.toFixed(3), "val s", p[3]);
      });
      // needle
      var nd = SV("g", { "class": "needle2", transform: "translate(" + BX(sv) + " 0)" }, s);
      SV("path", { d: "M-16 " + (y0 - 22) + " L16 " + (y0 - 22) + " L0 " + (y0 + 2) + " Z", "class": "tri" }, nd);
      line(nd, 0, 70, 0, y0 - 20, "needle-l");
      var lb = rect(nd, -86, 6, 172, 62, "sh", 6);
      var nt = txt(nd, 0, 50, sv.toFixed(3), "readout md", "middle");
      el._nd = nd; el._nt = nt; el._sv = sv;
      txt(s, 40, 24, "Best paragraph score. The needle shows the documentary question.", "lab m dim", "start");
      el._ttl = null;
      // zone explanation cards
      var d = document.createElement("div");
      d.className = "abs zcards"; d.style.cssText = "left:0;right:0;top:455px";
      d.innerHTML = [
        ["reject", "x", "Incorrect", "Do not trust these paragraphs. Write new queries and search again."],
        ["hold", "hold", "Ambiguous", "Weak evidence. Write two new queries, search again, check again."],
        ["pass", "check", "Correct", "Use the paragraphs. On to trimming."]
      ].map(function (z) {
        return '<div class="zc zc-' + z[0] + '"><span class="chip ' + z[0] + '">' + ic(z[1]) + z[2] + "</span><p>" + z[3] + "</p></div>";
      }).join("");
      c.appendChild(d);
    },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s), o = { s: 0 };
      function set() { var x = 40 + o.s * 1600; el._nd.setAttribute("transform", "translate(" + x.toFixed(1) + " 0)"); el._nt.textContent = o.s.toFixed(3); }
      set();
      tl.to(o, { s: 0.9, duration: 1.1, ease: "power2.inOut", onUpdate: set }, 0.3);
      tl.to(o, { s: el._sv, duration: 1.0, ease: "elastic.out(1,0.6)", onUpdate: set }, 1.5);
    }
  });

  /* ============ 10. trimming ============ */
  def("trim", {
    steps: 1,
    mount: function (el) {
      var c = C(el), sc = SC.support, F = sc.F, th = D.thresholds;
      var rows = F.sentences.map(function (s) {
        var cls = s.kept ? "keep" : "drop";
        return '<div class="srow ' + cls + '"><span class="si">' + (s.kept ? ic("check") : ic("x")) + '</span><span class="st trunc">' + esc(s.text) + '</span><span class="sp mono">' + s.prob.toFixed(3) + '</span><i class="cutline"></i></div>';
      }).join("");
      var L = document.createElement("div");
      L.className = "abs"; L.style.cssText = "left:0;top:0;width:1030px";
      L.innerHTML = '<p class="cap" style="margin:0 0 14px">Each sentence gets its own score. Keep it at ' + th.tau_keep.toFixed(2) + ' or above.</p><div class="srows">' + rows + "</div>";
      c.appendChild(L);
      var nk = F.sentences.filter(function (x) { return x.kept; }).length;
      L.insertAdjacentHTML("beforeend", '<p class="cap" style="margin:18px 0 0;color:var(--ink)">Kept ' + nk + ' of ' + F.sentences.length + ' sentences for this question.</p>');
      var tokA = A("A", "supportive").context_tokens, tokF = A("F", "supportive").context_tokens;
      var R = document.createElement("div");
      R.className = "abs trim-r"; R.style.cssText = "left:1120px;top:0;width:560px";
      R.innerHTML =
        '<p class="cap" style="margin:0 0 14px">Words sent to the model, this question</p>' +
        '<div class="tb"><span>Plain RAG</span><div class="tr"><i class="b-a" style="width:100%"></i></div><b class="mono w-a">' + INT(sc.A.words_sent) + '</b></div>' +
        '<div class="tb"><span>Verified</span><div class="tr"><i class="b-f cutbar" style="--r:' + (F.words_sent / sc.A.words_sent).toFixed(4) + '"></i></div><b class="mono w-f">' + INT(F.words_sent) + '</b></div>' +
        '<p class="cap" style="margin:46px 0 14px">Average context over the ' + D.counts.test_questions + ' test questions, in tokens</p>' +
        '<div class="tb"><span>Plain RAG</span><div class="tr"><i class="b-a" style="width:100%"></i></div><b class="mono">' + INT(tokA) + '</b></div>' +
        '<div class="tb"><span>Verified</span><div class="tr"><i class="b-f cutbar" style="--r:' + (tokF / tokA).toFixed(4) + '"></i></div><b class="mono">' + INT(tokF) + '</b></div>';
      c.appendChild(R);
      el._wf = R.querySelector(".w-f"); el._wfv = F.words_sent; el._wa = sc.A.words_sent;
    },
    apply: function (el, step, ctx) {
      if (step >= 1 && ctx.anim && window.gsap) {
        var o = { v: el._wa };
        window.gsap.to(o, { v: el._wfv, duration: 0.9, ease: "power2.out", onUpdate: function () { el._wf.textContent = INT(o.v); } });
      } else el._wf.textContent = INT(step >= 1 ? el._wfv : el._wa);
    },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s);
      tl.from(el.querySelectorAll(".srow"), { opacity: 0, x: -24, duration: 0.45, stagger: 0.09, ease: "power2.out" }, 0.1);
    }
  });

  /* ============ 11. sufficiency gate ============ */
  def("gate", {
    steps: 2,
    mount: function (el) {
      var c = C(el), th = D.thresholds;
      var s = svgBox(c, 1680, 666, "gate-svg"); el._svg = s;
      var ty = 215, X = function (v) { return 40 + v * 1600; };
      rect(s, X(0), ty - 12, X(th.tau_abstain) - X(0), 24, "tr-abs", 0);
      rect(s, X(th.tau_abstain), ty - 12, X(1) - X(th.tau_abstain), 24, "tr-pass", 0);
      [0, 0.25, 0.5, 0.75, 1].forEach(function (v) { line(s, X(v), ty + 12, X(v), ty + 24, "axis-l"); txt(s, X(v), ty + 54, v === 0 || v === 1 ? String(v) : v.toFixed(2), "ax s", "middle"); });
      var tl = line(s, X(th.tau_abstain), ty - 34, X(th.tau_abstain), ty + 30, "thr acc");
      var tt = txt(s, X(1), ty + 112, "Answer only at or above ", "lab m", "end"); tt.setAttribute("style", "font-weight:600");
      var ts = SV("tspan", { "class": "val acc" }, tt); ts.textContent = th.tau_abstain.toFixed(2);
      var g1 = SV("g", { "class": "gz" }, s);
      txt(g1, X(0), ty + 110, "Below: say “I don’t know”", "lab m c-abstain", "start", { "font-weight": 600 });
      var pins = SV("g", { "class": "gpins" }, s); el._pins = [];
      [["support", "Documentary", 150, "end", -8], ["fail", "Sun Valley", 95, "end", -8], ["missing", "Guildford", 150, "middle", 0], ["fooled", "Uyoku dantai", 95, "middle", 0], ["cost", "Geraldine Page", 150, "start", 0]].forEach(function (p) {
        var v = SC[p[0]].F.sufficiency, x = X(v);
        var g = SV("g", { "class": "gp" + (p[0] === "missing" ? " star" : " other") }, pins);
        line(g, x, p[2] + 12, x, ty - 12, "leader");
        SV("circle", { cx: x, cy: ty, r: 13, "class": "pin " + (SC[p[0]].F.abstain ? "abs" : "ans") }, g);
        txt(g, x + p[4], p[2], p[1] + " " + v.toFixed(3), "lab m", p[3]);
        el._pins.push(g);
      });
      // call-out (step 1)
      var G = SC.missing;
      var co = document.createElement("div");
      co.className = "abs gcall frag"; co.setAttribute("data-step", 1);
      co.style.cssText = "left:0;top:430px;width:820px";
      co.innerHTML = '<p style="margin:0 0 10px;font-size:34px;line-height:1.3;color:var(--ink)">' + esc(G.question) + '</p>' +
        '<p class="cap" style="margin:0"><span class="chip abstain" style="margin-right:12px">' + ic("stop") + "Verified: I don’t know</span>" +
        '<span class="chip reject">' + ic("x") + "Plain RAG: “" + esc(G.A.answer) + "”</span></p>";
      c.appendChild(co);
      var au = D.sufficiency_auc[2], ax = 0;
      var ap = document.createElement("div");
      ap.className = "abs auc frag"; ap.setAttribute("data-step", 2);
      ap.style.cssText = "left:900px;top:420px;width:780px";
      var bw = function (v) { return ((v - 0.5) / 0.5 * 400).toFixed(1); };
      ap.innerHTML = '<p class="cap" style="margin:0 0 14px;color:var(--ink)">How well it tells enough from not enough (AUC, dev)</p>' +
        '<div class="ab"><span>missing a hop</span><div class="tr"><i class="b-f" style="width:' + bw(au.missing_hop) + 'px"></i></div><b class="mono">' + au.missing_hop.toFixed(3) + '</b></div>' +
        '<div class="ab"><span>no evidence</span><div class="tr"><i class="b-f" style="width:' + bw(au.no_evidence) + 'px"></i></div><b class="mono">' + au.no_evidence.toFixed(3) + '</b></div>' +
        '<p class="cap dim" style="margin:10px 0 0">Bars start at chance, 0.5.</p>';
      c.appendChild(ap);
    },
    apply: function (el, step) {
      el._svg.classList.toggle("spot", step === 1);
    },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s);
      tl.from(el._pins, { y: -90, opacity: 0, duration: 0.7, stagger: 0.14, ease: "power3.out" }, 0.3);
    }
  });

  /* ============ 12. the bug ============ */
  var BEIR = function (ds, method) {
    var r = D.beir.filter(function (x) { return x.dataset === ds && x.method === method; })[0];
    return r ? r.ndcg10 : null;
  };
  var SCI = {
    base: BEIR("scifact", "hybrid + ms-marco-minilm-l6-v2"),
    ft: BEIR("scifact", "hybrid + verifier-minilm-l6-v4"),
    fin: BEIR("scifact", "hybrid + verifier-minilm-l6-v4-wise07")
  };
  def("bug", {
    steps: 2,
    mount: function (el) {
      var c = C(el);
      var p = document.createElement("p"); p.className = "lede"; p.style.cssText = "margin:0;position:absolute;left:0;top:0";
      p.textContent = "Trained on HotpotQA passages and sentences plus MS MARCO pairs, starting from a MiniLM-L6 ranker.";
      c.appendChild(p);
      var L = svgBox(c, 760, 580, "abs"); L.style.cssText += ";left:0;top:86px";
      var base = 480, max = 80, sc = 420 / max;
      txt(L, 0, 26, "SciFact nDCG@10, reranking the hybrid top 50", "lab m dim");
      [0, 20, 40, 60, 80].forEach(function (v) {
        var y = base - v * sc + 0; line(L, 70, y + 0, 730, y, v ? "grid-l" : "axis-l"); txt(L, 56, y + 9, String(v), "ax", "end");
      });
      var hb = SCI.base * sc, hf = SCI.ft * sc;
      var rb = rect(L, 140, base - hb, 190, hb, "bar-A", 4);
      var rf = rect(L, 440, base - hf, 190, hf, "bar-rej", 4);
      // ghost of the lost height
      var gh = rect(L, 440, base - hb, 190, hb - hf, "ghost", 4);
      txt(L, 235, base - hb - 14, SCI.base.toFixed(1), "val", "middle");
      var vf = txt(L, 535, base - hf + 48, SCI.ft.toFixed(1), "val on", "middle");
      var dl = txt(L, 535, base - hb + 46, "\u2212" + (SCI.base - SCI.ft).toFixed(1), "val c-reject", "middle");
      txt(L, 235, base + 44, "Base model", "lab", "middle");
      txt(L, 535, base + 44, "After fine-tuning", "lab", "middle");
      el._b = { rb: rb, rf: rf, gh: gh, vf: vf, dl: dl, base: base, hb: hb, hf: hf };
      // probe (step 1)
      var R = document.createElement("div");
      R.className = "abs frag"; R.setAttribute("data-step", 1);
      R.style.cssText = "left:860px;top:86px;width:820px";
      var X = function (v) { return 60 + (v + 10) / 11 * 700; };
      R.innerHTML = '<p class="cap" style="margin:0 0 6px;color:var(--ink)">Probe: a nonsense query against medical abstracts. It should score very low.</p>' +
        '<svg viewBox="0 0 820 190" width="820" height="190" style="display:block">' +
        '<line x1="60" x2="760" y1="120" y2="120" class="axis-l"/>' +
        [-10, -5, 0].map(function (v) { return '<line x1="' + X(v) + '" x2="' + X(v) + '" y1="114" y2="132" class="axis-l"/><text x="' + X(v) + '" y="166" class="ax s" text-anchor="middle">' + (v < 0 ? "\u2212" + (-v) : v) + "</text>"; }).join("") +
        '<circle cx="' + X(-9.6) + '" cy="120" r="16" class="pin base"/><circle cx="' + X(0.6) + '" cy="120" r="16" class="pin bad"/>' +
        '<text x="' + X(-9.6) + '" y="72" class="lab" text-anchor="start" style="font-weight:600">Base  <tspan class="mono">−9.6</tspan></text>' +
        '<text x="' + X(0.6) + '" y="72" class="lab c-reject" text-anchor="end" style="font-weight:600">Fine-tuned  <tspan class="mono">+0.6</tspan></text>' +
        "</svg>";
      c.appendChild(R);
      var W = document.createElement("div");
      W.className = "abs frag why"; W.setAttribute("data-step", 2);
      W.style.cssText = "left:860px;top:398px;width:820px";
      W.innerHTML = '<p>HotpotQA distractors share words with the question.</p><p>The real second-hop paragraph shares almost none.</p>' +
        '<p class="learned"><span class="chip reject">' + ic("x") + '<span class="t">What it learned: word overlap means irrelevant.</span></span></p>';
      c.appendChild(W);
    },
    enter: function (el, ctx) {
      var b = el._b, tl = Deck.tl(ctx.s);
      tl.from(b.rb, { attr: { y: b.base, height: 0 }, duration: 0.9, ease: "power3.out" }, 0.2);
      tl.fromTo(b.rf, { attr: { y: b.base, height: 0 } }, { attr: { y: b.base - b.hb, height: b.hb }, duration: 0.9, ease: "power3.out" }, 0.4);
      tl.to(b.rf, { attr: { y: b.base - b.hf, height: b.hf }, duration: 0.6, ease: "power3.in" }, 1.7);
      tl.from([b.vf, b.dl, b.gh], { opacity: 0, duration: 0.4 }, 2.2);
    }
  });

  /* ============ 13. WiSE-FT ============ */
  def("fix", {
    steps: 1,
    mount: function (el, s) {
      var c = C(el), tbl = D.wise_ft;
      var W = 1100, H = 660, x0 = 90, xw = 780, yb = 520, yt = 40;
      var Y = function (v) { return yb - (v - 0.3) / 0.7 * (yb - yt); };
      var alphas = tbl.map(function (r) { return parseFloat(r.alpha); });
      var X = function (a) { return x0 + a * xw; };
      var svg = svgBox(c, W, H, "abs fix-svg"); svg.style.left = 0; svg.style.top = 0;
      [0.3, 0.5, 0.7, 0.9].forEach(function (v) { line(svg, x0, Y(v), x0 + xw + 20, Y(v), "grid-l"); txt(svg, x0 - 14, Y(v) + 9, v.toFixed(1), "ax", "end"); });
      line(svg, x0, yb, x0 + xw + 20, yb, "axis-l");
      var series = [["hotpot", "HotpotQA", "ln-h"], ["nfcorpus", "NFCorpus", "ln-n"], ["fiqa", "FiQA", "ln-f"]];
      var paths = [];
      series.forEach(function (sr) {
        var d = tbl.map(function (r, i) { return (i ? "L" : "M") + X(alphas[i]).toFixed(1) + " " + Y(r[sr[0]]).toFixed(1); }).join(" ");
        var p = SV("path", { d: d, "class": "ln " + sr[2], fill: "none" }, svg); paths.push(p);
        tbl.forEach(function (r, i) { SV("circle", { cx: X(alphas[i]), cy: Y(r[sr[0]]), r: 8, "class": "pt " + sr[2] }, svg); });
        var last = tbl[tbl.length - 1][sr[0]];
        txt(svg, X(1) + 24, Y(last) + 9, sr[1], "lab m ln-t " + sr[2], "start");
      });
      tbl.forEach(function (r, i) { txt(svg, X(alphas[i]), yb + 44, i === 0 ? "0" : (i === tbl.length - 1 ? "1" : alphas[i].toFixed(1)), "ax", "middle"); });
      txt(svg, X(0), yb + 86, "base", "ax s", "middle"); txt(svg, X(1), yb + 86, "fine-tuned", "ax s", "middle");
      txt(svg, x0 - 14, 16, "nDCG@10 on dev", "ax s", "start", { x: 0 });
      txt(svg, X(0.5), yb + 120, "alpha, the share of fine-tuned weights", "lab m", "middle");
      // playhead
      var ph = SV("g", { "class": "playhead" }, svg);
      line(ph, 0, yt - 6, 0, yb, "ph-l");
      SV("circle", { cx: 0, cy: yt - 6, r: 14, "class": "ph-h" }, ph);
      el._ph = ph; el._X = X; el._alphas = alphas; el._tbl = tbl; el._paths = paths;
      // right panel
      var P = document.createElement("div");
      P.className = "abs fixp"; P.style.cssText = "left:1190px;top:0;width:490px";
      P.innerHTML = '<p class="cap" style="margin:0 0 10px;color:var(--ink)">Average the weights:</p>' +
        '<p class="formula mono">θ = α·tuned + (1−α)·base</p>' +
        '<div class="abtns" role="group" aria-label="alpha">' + alphas.map(function (a, i) { return '<button class="alpha-btn" data-i="' + i + '" aria-pressed="false">' + (a === 0 ? "0" : a === 1 ? "1" : a.toFixed(1)) + "</button>"; }).join("") + "</div>" +
        '<div class="ro">' + series.map(function (sr) { return '<div class="r ' + sr[2] + '"><span>' + sr[1] + '</span><b class="mono" data-k="' + sr[0] + '"></b></div>'; }).join("") + "</div>" +
        '<p class="cap" style="margin:26px 0 8px;color:var(--ink)">SciFact test nDCG@10</p>' +
        '<div class="sci"><div data-a="0"><span>base</span><b class="mono">' + SCI.base.toFixed(1) + '</b></div><div data-a="4"><span>fine-tuned</span><b class="mono c-reject">' + SCI.ft.toFixed(1) + '</b></div><div data-a="3"><span>α = 0.7</span><b class="mono c-pass">' + SCI.fin.toFixed(1) + "</b></div></div>";
      c.appendChild(P);
      el._P = P;
      P.querySelectorAll(".alpha-btn").forEach(function (b) {
        b.addEventListener("click", function () { setAlpha(el, +b.getAttribute("data-i")); });
      });
      setAlpha(el, 3, true);
    },
    apply: function (el, step) { setAlpha(el, step >= 1 ? 3 : 4); },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s);
      el._paths.forEach(function (p, i) {
        var len = p.getTotalLength();
        tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, 0.15 + i * 0.15);
      });
    }
  });
  function setAlpha(el, i, quietly) {
    var a = el._alphas[i], row = el._tbl[i];
    el._ph.style.transform = "translateX(" + el._X(a) + "px)";
    el._ph.setAttribute("data-i", i);
    el._P.querySelectorAll(".alpha-btn").forEach(function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-i") === i ? "true" : "false"); });
    el._P.querySelectorAll(".ro b").forEach(function (b) { b.textContent = Number(row[b.getAttribute("data-k")]).toFixed(3); });
    el._P.querySelectorAll(".sci div").forEach(function (d) { d.classList.toggle("on", +d.getAttribute("data-a") === i); });
  }

  /* ============ 14. more lessons ============ */
  function miniBars(parent, w, h, groups, max, fmt) {
    var s = svgBox(parent, w, h, "mini-bars"), base = h - 52, sc = (base - 34) / max, bw = 100;
    line(s, 0, base, w, base, "axis-l");
    var n = groups.reduce(function (a, g) { return a + g.bars.length; }, 0), gap = (w - n * bw) / (groups.length + 1 + (n - groups.length) * 0.0);
    var x = 0, rs = [];
    var slot = w / groups.length;
    groups.forEach(function (g, gi) {
      var gw = g.bars.length * bw + (g.bars.length - 1) * 14, gx = gi * slot + (slot - gw) / 2;
      g.bars.forEach(function (b, bi) {
        var bx = gx + bi * (bw + 14), bh = Math.max(3, b.v * sc);
        var r = rect(s, bx, base - bh, bw, bh, b.cls, 3);
        var t = txt(s, bx + bw / 2, base - bh - 10, b.label || fmt(b.v), "val s", "middle");
        rs.push({ r: r, t: t, y: base - bh, h: bh });
      });
      if (g.label) txt(s, gx + gw / 2, base + 36, g.label, "ax", "middle");
    });
    s._rs = rs; s._base = base;
    return s;
  }
  def("lessons", {
    mount: function (el) {
      var c = C(el);
      var items = [
        { h: "The dev check lied", t: "It made the broken model look better. We rebuilt it to match the test protocol.",
          g: [{ label: "dev check", bars: [{ v: 0.575, cls: "bar-rej" }, { v: 0.479, cls: "bar-A" }] }, { label: "real ranking", bars: [{ v: 0.280, cls: "bar-rej" }, { v: 0.681, cls: "bar-A" }] }], max: 0.8, f: F3, k: "NFCorpus MRR. In each pair: broken model, then base." },
        { h: "One threshold, two jobs", t: "The chunk filter got its own threshold. Questions keeping every supporting fact went up.",
          g: [{ label: "before", bars: [{ v: 56, cls: "bar-A", label: "56%" }] }, { label: "after", bars: [{ v: 89, cls: "bar-F", label: "89%" }] }], max: 100, f: P0, k: "Dev questions that keep all supporting facts" },
        { h: "The filter ate the data", t: "It dropped candidates too eagerly. Now it drops one only when the teacher is confident.",
          g: [{ label: "before", bars: [{ v: 57, cls: "bar-A", label: "57%" }] }, { label: "after", bars: [{ v: 4, cls: "bar-F", label: "1 to 4%" }] }], max: 65, f: P0, k: "BEIR training candidates dropped" }
      ];
      var row = document.createElement("div"); row.className = "lrow";
      items.forEach(function (it, i) {
        var a = document.createElement("article"); a.className = "sheet lcard frag"; a.setAttribute("data-step", i + 1);
        a.innerHTML = "<h3>" + it.h + '</h3><p class="k">' + it.k + "</p>";
        var holder = document.createElement("div"); a.appendChild(holder);
        miniBars(holder, 440, 260, it.g, it.max, it.f);
        var p = document.createElement("p"); p.className = "tx"; p.textContent = it.t; a.appendChild(p);
        row.appendChild(a);
      });
      c.appendChild(row);
    },
    apply: function (el, step, ctx) {
      if (!ctx.anim || !window.gsap || !step) return;
      var card = el.querySelectorAll(".lcard")[step - 1], sv = card && card.querySelector("svg");
      if (!sv || !sv._rs) return;
      sv._rs.forEach(function (r, i) {
        window.gsap.from(r.r, { attr: { y: sv._base, height: 0 }, duration: 0.8, delay: 0.3 + i * 0.1, ease: "power3.out" });
        window.gsap.from(r.t, { opacity: 0, duration: 0.3, delay: 0.9 + i * 0.1 });
      });
    }
  });

  /* ============ 15. conditions ============ */
  function cardStack(parent, items, w) {
    var s = svgBox(parent, w, 320, "cond-svg");
    items.forEach(function (it, i) {
      var y = i * 78, g = SV("g", {}, s);
      var r = rect(g, 0, y, w, 66, it.kind === "ghost" ? "cd ghost-d" : "cd" + (it.kind === "gold" ? " gold" : ""), 6);
      if (it.kind === "ghost") {
        txt(g, w / 2, y + 42, "supporting paragraph removed", "lab m dim", "middle");
      } else if (it.html) {
        var t = SV("text", { x: 18, y: y + 42, "class": "lab m" }, g);
        t.innerHTML = it.html;
      } else txt(g, 18, y + 42, plain(it.t, 34), "lab m" + (it.kind === "gold" ? "" : " dim"));
      if (it.tag) txt(g, w - 14, y + 42, it.tag, "lab s " + (it.tagc || "acc"), "end");
    });
    return s;
  }
  def("conditions", {
    mount: function (el) {
      var c = C(el), sup = SC.support.A.passages, fl = SC.fail;
      var swapped = fl.F.sentences[1].text; // sentence with the planted entity
      var cols = [
        { n: A("A", "supportive").n, h: "Supportive", sub: "The gold paragraphs are in the pool.",
          items: [{ t: sup[0].title, kind: "gold", tag: "gold" }, { t: sup[1].title, kind: "gold", tag: "gold" }, { t: sup[2].title }, { t: sup[3].title }],
          chip: ["pass", "check", "Answer from the evidence"] },
        { n: A("A", "missing").n, h: "Missing", sub: "The gold paragraphs are taken out.",
          items: [{ kind: "ghost" }, { kind: "ghost" }, { t: SC.missing.A.passages[0].title }, { t: SC.missing.A.passages[1].title }],
          chip: ["abstain", "stop", "Say “I don’t know”"] },
        { n: A("A", "misleading").n, h: "Misleading", sub: "The answer inside the gold text is swapped.",
          items: [{ html: "\u2026held in <tspan class=\"plant-t\">Lake Tahoe</tspan>\u2026", kind: "gold", tag: "swapped", tagc: "c-plant" }, { t: fl.A.passages[1].title, kind: "gold", tag: "gold" }, { t: fl.A.passages[2].title }, { t: fl.A.passages[3].title }],
          chip: ["plant", "plant", "Repeating the swap is “planted”"] }
      ];
      var row = document.createElement("div"); row.className = "crow";
      cols.forEach(function (cl, i) {
        var a = document.createElement("article"); a.className = "ccol frag"; a.setAttribute("data-step", i + 1);
        a.innerHTML = '<div class="ch"><h3>' + cl.h + '</h3><span class="mono n">' + cl.n + ' questions</span></div><p class="sub">' + cl.sub + "</p>";
        var h = document.createElement("div"); a.appendChild(h);
        cardStack(h, cl.items, 520);
        var p = document.createElement("p"); p.className = "rb"; p.innerHTML = '<span class="chip ' + cl.chip[0] + '">' + ic(cl.chip[1]) + cl.chip[2] + "</span>"; a.appendChild(p);
        row.appendChild(a);
      });
      c.appendChild(row);
      var f = document.createElement("p");
      f.className = "abs frag cap"; f.setAttribute("data-step", 3);
      f.style.cssText = "left:0;right:0;bottom:0;margin:0;text-align:center;color:var(--ink)";
      f.innerHTML = cols[0].n + " + " + cols[1].n + " + " + cols[2].n + " = <b class=\"mono\">" + (cols[0].n + cols[1].n + cols[2].n) + "</b> question and condition pairs";
      c.appendChild(f);
    }
  });

  /* ============ 16. discipline ============ */
  def("discipline", {
    steps: 2,
    mount: function (el) {
      var c = C(el), th = D.thresholds;
      var s = svgBox(c, 1680, 666, "disc-svg");
      function box(x, y, w, h, big, small, icon, cls) {
        var g = SV("g", { "class": cls || "" }, s);
        rect(g, x, y, w, h, "sh", 10);
        if (icon) { var u = SV("g", { transform: "translate(" + (x + w - 62) + " " + (y + 16) + ") scale(1.9)", "class": "icon-g" }, g); SV("use", { href: "#i-" + icon }, u); }
        txt(g, x + 22, y + 50, big, "lab disp", "start", { "font-size": 36 });
        wrapSvg(g, small, x + 22, y + 88, Math.floor((w - 30) / 14.5), 32, "lab m dim");
        return g;
      }
      function arr(x1, y, x2, g) {
        var p = g || s; line(p, x1, y, x2 - 8, y, "ink-l"); SV("path", { d: "M" + (x2 - 20) + " " + (y - 10) + " L" + x2 + " " + y + " L" + (x2 - 20) + " " + (y + 10), "class": "ink-l" }, p);
      }
      box(0, 245, 330, 150, "HotpotQA pool", INT(D.counts.pool_paragraphs) + " paragraphs, seed 13");
      // split
      SV("path", { d: "M330 320 C 372 320 372 90 410 90", "class": "ink-l", fill: "none" }, s);
      SV("path", { d: "M330 320 C 372 320 372 520 410 520", "class": "ink-l", fill: "none" }, s);
      box(420, 20, 330, 140, "Dev", D.counts.dev_questions + " questions", "gear");
      arr(750, 90, 850);
      box(860, 20, 400, 140, "Every choice here", "Thresholds, WiSE-FT alpha, filters.");
      arr(1260, 90, 1340);
      box(1350, 20, 330, 140, "τ = " + th.tau_abstain.toFixed(2), "the abstain threshold", null, "hl");
      // ruler (step 1)
      var rg = SV("g", { "class": "frag fade", "data-step": 1 }, s);
      var RX = function (t) { return 860 + t / 0.95 * 820; };
      for (var i = 0; i <= 19; i++) { var t = i * 0.05; line(rg, RX(t), 262, RX(t), i % 2 ? 272 : 282, "axis-l"); }
      line(rg, RX(0), 262, RX(0.95), 262, "axis-l");
      txt(rg, RX(0), 316, "0.00", "ax s", "middle"); txt(rg, RX(0.95), 316, "0.95", "ax s", "middle");
      txt(rg, 420, 280, "Mean utility by \u03c4", "lab m", "start");
      var mk = SV("g", { "class": "mk" }, rg);
      mk.style.transform = "translateX(" + RX(th.tau_abstain) + "px)";
      SV("path", { d: "M-12 232 L12 232 L0 258 Z", "class": "tri" }, mk);
      txt(rg, RX(0.9) - 4, 222, "+0.009", "val acc", "middle");
      txt(rg, RX(0), 222, "\u22120.014", "val", "middle");
      el._mk = mk; el._RX = RX;
      var rt = document.createElement("p");
      rt.className = "abs frag cap"; rt.setAttribute("data-step", 1);
      rt.style.cssText = "left:420px;top:338px;width:1260px;margin:0;color:var(--ink)";
      rt.innerHTML = "The rule was written into PLAN.md before any dev answer existed: take the τ with the best mean of <i>correct − hallucinate − planted</i>, ties to the smaller τ.";
      c.appendChild(rt);
      // test lane (step 2)
      var tg = SV("g", { "class": "frag fade", "data-step": 2 }, s);
      box.call(null, 420, 450, 330, 140, "Test", D.counts.test_questions + " questions", "lock");
      // move the last box into tg
      var last = s.lastChild; tg.appendChild(last);
      var l2 = SV("g", {}, tg);
      var save = s;
      function boxIn(g, x, y, w, h, big, small, icon) {
        rect(g, x, y, w, h, "sh", 10);
        txt(g, x + 22, y + 50, big, "lab disp", "start", { "font-size": 36 });
        wrapSvg(g, small, x + 22, y + 88, Math.floor((w - 30) / 14.5), 32, "lab m dim");
      }
      line(tg, 750, 520, 842, 520, "ink-l"); SV("path", { d: "M830 510 L850 520 L830 530", "class": "ink-l" }, tg);
      boxIn(tg, 860, 450, 400, 140, "Run once, at the end", "Nothing is tuned on it.");
      line(tg, 1260, 520, 1332, 520, "ink-l"); SV("path", { d: "M1320 510 L1340 520 L1320 530", "class": "ink-l" }, tg);
      boxIn(tg, 1350, 450, 330, 140, "Paired bootstrap", "10,000 resamples, 95% intervals.");
    },
    apply: function (el, step) {
      el._mk.style.transform = "translateX(" + el._RX(step >= 1 ? D.thresholds.tau_abstain : 0) + "px)";
    }
  });

  /* ============ 17. arms ladder ============ */
  var ARMS = [
    ["A", "Plain hybrid RAG, top 8 paragraphs"],
    ["B", "An off-the-shelf reranker"],
    ["C", "Our verifier filters paragraphs"],
    ["D", "Plus sentence trimming"],
    ["E", "Plus decision and query rewrite"],
    ["F", "Plus the sufficiency gate: the full system"],
    ["G", "F with one threshold instead of two"]
  ];
  def("arms", {
    mount: function (el) {
      var c = C(el), s = svgBox(c, 1680, 666, "arms-svg"), base = 600; el._rungs = [];
      txt(s, 0, 30, "Same generator and same prompts for every arm.", "lab", "start");
      line(s, 0, base, 1680, base, "axis-l");
      ARMS.forEach(function (a, i) {
        var x = i * 240, top = 500 - i * 50, g = SV("g", { "class": "rung" + (a[0] === "F" ? " full" : "") }, s);
        rect(g, x, top, 224, base - top, "rg", 8);
        txt(g, x + 20, base - 22, a[0], "arm-l", "start");
        wrapSvg(g, a[1], x, top - 18, 17, 34, "lab m" + (a[0] === "F" ? " fw" : ""), true);
        el._rungs.push(g);
      });
    },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s);
      tl.from(el._rungs, { y: 70, opacity: 0, duration: 0.6, stagger: 0.16, ease: "power3.out" }, 0.2);
    }
  });

  /* ============ 18. infrastructure pivot ============ */
  def("pivot", {
    steps: 2,
    mount: function (el) {
      var c = C(el), cells = "";
      for (var i = 0; i < 28; i++) cells += '<i style="--i:' + i + '"></i>';
      var L = document.createElement("div"); L.className = "abs pv-l"; L.style.cssText = "left:0;top:0;width:760px";
      L.innerHTML = '<p class="lede" style="color:var(--ink);margin:0 0 6px;font-weight:600">Groq free tier</p><p class="cap" style="margin:0 0 26px">200,000 tokens a day per model.</p>' +
        '<div class="cal">' + cells + '</div>' +
        '<p class="cap frag" data-step="1" style="margin:26px 0 0;color:var(--ink)">' + INT(5419) + ' distinct dev and test prompts at roughly 1,000 tokens each: <b>close to four weeks</b>.</p>';
      c.appendChild(L);
      var tr = A("A", "supportive"); // not used for counts
      var R = document.createElement("div"); R.className = "abs pv-r frag"; R.setAttribute("data-step", 2);
      R.style.cssText = "left:880px;top:0;width:800px";
      R.innerHTML = '<p class="lede" style="color:var(--ink);margin:0 0 6px;font-weight:600">Kaggle, 2 × T4, vLLM</p><p class="cap" style="margin:0 0 30px">One open model for every arm: Qwen3-4B-Instruct-2507.</p>' +
        '<div class="fb"><span>Test traces</span><div class="tr"><i class="b-a" style="width:100%"></i></div><b class="mono">' + INT(D.test.n_traces) + '</b></div>' +
        '<div class="fb"><span>Distinct prompts</span><div class="tr"><i class="b-f" style="width:' + (3267 / D.test.n_traces * 100).toFixed(1) + '%"></i></div><b class="mono">' + INT(3267) + '</b></div>' +
        '<p class="cap" style="margin:30px 0 0">Identical prompts are generated once and shared by every arm. Groq stays for the live demo and the judge.</p>';
      c.appendChild(R);
    }
  });

  /* ============ 19. headline results ============ */
  def("headline", {
    steps: 1,
    mount: function (el) {
      var c = C(el), base = 560, sc = 16, bw = 130;
      var s = svgBox(c, 1150, 666, "abs hl-svg"); s.style.left = 0; s.style.top = 0;
      [0, 10, 20, 30].forEach(function (v) { line(s, 80, base - v * sc, 1130, base - v * sc, v ? "grid-l" : "axis-l"); txt(s, 62, base - v * sc + 9, v + "%", "ax", "end"); });
      el._hb = [];
      SL.forEach(function (sl, i) {
        var cx = 270 + i * 380;
        [["A", -bw / 2 - 8], ["F", bw / 2 + 8]].forEach(function (a) {
          var v = A(a[0], sl).hallucinate * 100, h = Math.max(2, v * sc), x = cx + a[1] - bw / 2;
          var r = rect(s, x, base - h, bw, h, a[0] === "A" ? "bar-A" : "bar-F", 4);
          var t = txt(s, x + bw / 2, base - h - 14, v.toFixed(1), "val", "middle");
          el._hb.push({ r: r, t: t, y: base - h, h: h });
        });
        txt(s, cx, base + 42, sl[0].toUpperCase() + sl.slice(1), "lab", "middle");
      });
      var lg = SV("g", { transform: "translate(80 8)" }, s);
      rect(lg, 0, 0, 26, 26, "bar-A", 3); txt(lg, 40, 23, "A  plain RAG", "lab m");
      rect(lg, 300, 0, 26, 26, "bar-F", 3); txt(lg, 340, 23, "F  full system", "lab m");
      txt(s, 1130, 23, "hallucination rate, %", "ax s", "end");
      // paired differences
      var R = document.createElement("div"); R.className = "abs frag hl-r"; R.setAttribute("data-step", 1);
      R.style.cssText = "left:1240px;top:0;width:440px";
      var X = function (v) { return 14 + (v * 100 + 15) / 16 * 410; };
      var h = '<p class="cap" style="margin:0 0 4px;color:var(--ink)">F minus A, with 95% interval</p><svg viewBox="0 0 440 560" width="440" height="560" style="display:block">';
      h += '<text x="' + X(0) + '" y="42" class="ax s" text-anchor="middle">0</text>';
      SL.forEach(function (sl, i) {
        var cm = cmp("F", "A", sl, "hallucinate"), y = 70 + i * 165;
        h += '<text x="14" y="' + (y - 4) + '" class="lab m" >' + sl + '</text>';
        h += '<line x1="' + X(0) + '" x2="' + X(0) + '" y1="' + (y + 6) + '" y2="' + (y + 66) + '" class="axis-l" stroke-dasharray="5 5"/>';
        h += '<line x1="' + X(cm.ci_low) + '" x2="' + X(cm.ci_high) + '" y1="' + (y + 36) + '" y2="' + (y + 36) + '" class="ci-l"/>';
        h += '<line x1="' + X(cm.ci_low) + '" x2="' + X(cm.ci_low) + '" y1="' + (y + 24) + '" y2="' + (y + 48) + '" class="ci-l"/><line x1="' + X(cm.ci_high) + '" x2="' + X(cm.ci_high) + '" y1="' + (y + 24) + '" y2="' + (y + 48) + '" class="ci-l"/>';
        h += '<circle cx="' + X(cm.mean_diff) + '" cy="' + (y + 36) + '" r="11" class="ci-d"/>';
        h += '<text x="14" y="' + (y + 102) + '" class="val acc">' + PP(cm.mean_diff) + ' pp</text><text x="426" y="' + (y + 102) + '" class="ax" text-anchor="end">[' + PP(cm.ci_low) + ', ' + PP(cm.ci_high) + ']</text>';
      });
      h += "</svg>";
      R.innerHTML = h;
      c.appendChild(R);
    },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s);
      el._hb.forEach(function (b, i) {
        grow(tl, b.r, b.y, b.h, 560, 0.2 + Math.floor(i / 2) * 0.35 + (i % 2) * 0.1, 1.0);
        fadeIn(tl, b.t, 0.9 + Math.floor(i / 2) * 0.35 + (i % 2) * 0.1, 0.4);
      });
    },
    apply: function (el, step, ctx) {
      if (step === 1 && ctx.anim && window.gsap) {
        var r = el.querySelectorAll(".hl-r .ci-l,.hl-r .ci-d");
        window.gsap.from(r, { opacity: 0, duration: 0.6, delay: 0.3, stagger: 0.05 });
      }
    }
  });

  /* ============ 20. ladder results ============ */
  var ARMLIST = ["A", "B", "C", "D", "E", "F", "G"];
  function setBar(r, y, h, anim, extra) {
    if (anim && window.gsap) window.gsap.to(r, { attr: { y: y, height: h }, duration: 0.8, ease: "power3.out", overwrite: "auto" });
    else { r.setAttribute("y", y); r.setAttribute("height", h); }
  }
  def("ladder", {
    steps: 2,
    mount: function (el) {
      var c = C(el), base = 520, W = 790;
      var chips = document.createElement("div"); chips.className = "abs slice-chips"; chips.style.cssText = "left:0;top:0";
      chips.innerHTML = SL.map(function (sl, i) { return '<span class="chip plain" data-i="' + i + '"><span class="t">' + sl[0].toUpperCase() + sl.slice(1) + "</span></span>"; }).join("");
      c.appendChild(chips);
      el._chips = chips;
      function chart(left, title, unit) {
        var s = svgBox(c, W, 580, "abs"); s.style.left = left + "px"; s.style.top = "70px";
        txt(s, 0, 26, title, "lab m dim");
        line(s, 0, base, W, base, "axis-l");
        var bars = [];
        ARMLIST.forEach(function (a, i) {
          var x = 14 + i * 110;
          var r = rect(s, x, base, 84, 0, armCls(a), 4), t = txt(s, x + 42, base - 14, "", "val s", "middle");
          txt(s, x + 42, base + 40, a, "lab disp", "middle", { "font-weight": a === "F" ? 700 : 500 });
          bars.push({ r: r, t: t });
        });
        return bars;
      }
      el._tok = chart(0, "Context sent to the generator, tokens");
      el._hal = chart(850, "Hallucination rate, %");
      var n1 = document.createElement("p"); n1.className = "abs cap"; n1.style.cssText = "left:0;top:660px;margin:0"; // placeholder to keep height
      n1.remove();
      el._base = base;
      var cp = document.createElement("p"); cp.className = "abs cap"; cp.style.cssText = "left:0;top:664px;margin:0;color:var(--ink)";
      cp.textContent = "Context falls at trimming (arm D). The sufficiency gate (arm F) lowers hallucination in all three conditions.";
      c.appendChild(cp);
      this.draw(el, 0, false);
    },
    draw: function (el, i, anim) {
      var sl = SL[i], base = el._base, maxT = 1250, maxH = 30;
      ARMLIST.forEach(function (a, k) {
        var ag = A(a, sl), tv = ag.context_tokens, hv = ag.hallucinate * 100;
        var th = tv / maxT * 440, hh = Math.max(2, hv / maxH * 440);
        setBar(el._tok[k].r, base - th, th, anim); setBar(el._hal[k].r, base - hh, hh, anim);
        el._tok[k].t.textContent = INT(tv); el._tok[k].t.setAttribute("y", base - th - 12);
        el._hal[k].t.textContent = hv.toFixed(1); el._hal[k].t.setAttribute("y", base - hh - 12);
      });
      el._chips.querySelectorAll(".chip").forEach(function (ch) { ch.classList.toggle("act", +ch.getAttribute("data-i") === i); });
    },
    apply: function (el, step, ctx) { this.draw(el, step, ctx.anim && step > 0); },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s);
      var all = el._tok.concat(el._hal);
      all.forEach(function (b, i) {
        var y = +b.r.getAttribute("y"), h = +b.r.getAttribute("height");
        tl.from(b.r, { attr: { y: el._base, height: 0 }, duration: 0.8, ease: "power3.out" }, 0.2 + (i % 7) * 0.09);
        tl.from(b.t, { opacity: 0, duration: 0.3 }, 0.8 + (i % 7) * 0.09);
      });
    }
  });

  /* ============ 21. trade-off ============ */
  def("tradeoff", {
    steps: 1,
    mount: function (el) {
      var c = C(el), rc = D.test.risk_coverage.supportive, pts = rc.points;
      var W = 1040, x0 = 100, xw = 880, yb = 540, yh = 470;
      var X = function (v) { return x0 + v / 0.8 * xw; }, Y = function (v) { return yb - (v - 0.5) / 0.5 * yh; };
      var s = svgBox(c, W, 666, "abs"); s.style.left = 0; s.style.top = 0;
      [0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach(function (v) { line(s, x0, Y(v), x0 + xw, Y(v), v === 0.5 ? "axis-l" : "grid-l"); txt(s, x0 - 14, Y(v) + 9, P0(v) + "%", "ax", "end"); });
      [0, 0.2, 0.4, 0.6, 0.8].forEach(function (v) { txt(s, X(v), yb + 40, P0(v) + "%", "ax", "middle"); });
      txt(s, X(0.4), yb + 84, "share of questions answered", "lab m", "middle");
      txt(s, 0, 24, "share of answers that are right", "lab m", "start");
      var pts5 = pts.filter(function (p) { return p[0] >= 0.05; });
      var d = pts5.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(Math.max(0.5, p[1])).toFixed(1); }).join(" ");
      var path = SV("path", { d: d, "class": "curve", fill: "none" }, s);
      // operating point: threshold nearest tau_abstain
      var best = pts.reduce(function (b, p) { return Math.abs(p[2] - D.thresholds.tau_abstain) < Math.abs(b[2] - D.thresholds.tau_abstain) ? p : b; }, pts[0]);
      var fa = A("F", "supportive"), aa = A("A", "supportive");
      var opF = SV("g", { "class": "opF" }, s);
      SV("circle", { cx: X(fa.coverage), cy: Y(fa.selective_accuracy), r: 15, "class": "op f" }, opF);
      line(opF, X(fa.coverage), Y(fa.selective_accuracy) - 18, X(fa.coverage), 262, "leader");
      txt(opF, X(fa.coverage), 248, "Verified: " + P0(fa.coverage) + "% answered, " + P0(fa.selective_accuracy) + "% right", "lab m", "middle");
      var opA = SV("g", { "class": "opA" }, s);
      SV("circle", { cx: X(aa.coverage), cy: Y(aa.selective_accuracy), r: 15, "class": "op a" }, opA);
      line(opA, X(aa.coverage), Y(aa.selective_accuracy) + 18, X(aa.coverage), 440, "leader");
      txt(opA, X(aa.coverage) + 70, 474, "Plain RAG: " + P0(aa.coverage) + "% answered, " + P0(aa.selective_accuracy) + "% right", "lab m", "end");
      txt(s, X(0.07), Y(0.97), "Verified, sweeping the abstain threshold", "lab m acc", "start");
      el._path = path;
      var R = document.createElement("div"); R.className = "abs frag trade-r"; R.setAttribute("data-step", 1);
      R.style.cssText = "left:1100px;top:30px;width:580px";
      var cc = cmp("F", "A", "supportive", "correct");
      R.innerHTML =
        '<div class="st2"><span class="k">Answered</span><div class="v"><span class="from">' + P0(aa.coverage) + '</span><span class="ar">→</span><span class="to">' + P0(fa.coverage) + '</span><small>%</small></div></div>' +
        '<div class="st2"><span class="k">Correct</span><div class="v"><span class="from">' + P1(aa.correct) + '</span><span class="ar">→</span><span class="to">' + P1(fa.correct) + '</span><small>%</small></div>' +
        '<p class="cap" style="margin:6px 0 0">' + PP(cc.mean_diff) + ' pp, 95% interval [' + PP(cc.ci_low) + ', ' + PP(cc.ci_high) + '], p = ' + cc.p_value.toFixed(2) + '</p></div>';
      c.appendChild(R);
    },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s), len = el._path.getTotalLength();
      tl.fromTo(el._path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, 0.2);
      tl.from(el.querySelectorAll(".opA,.opF"), { opacity: 0, duration: 0.5, stagger: 0.3 }, 1.6);
    }
  });

  /* ============ 22. cost example ============ */
  def("cost", {
    steps: 1,
    mount: function (el) {
      var c = C(el), sc = SC.cost, F = sc.F;
      var q = document.createElement("p"); q.className = "abs"; q.style.cssText = "left:0;top:0;right:0;margin:0;font-size:34px;line-height:1.3;color:var(--ink)";
      q.textContent = sc.question; c.appendChild(q);
      var L = document.createElement("div"); L.className = "abs sheet cost-a"; L.style.cssText = "left:0;top:150px;width:500px;height:520px";
      L.innerHTML = '<span class="lab2">Plain RAG</span><p class="cap" style="margin:6px 0 20px"><b class="mono" style="color:var(--ink)">' + INT(sc.A.words_sent) + '</b> words sent</p>' +
        '<div class="ansbig">“' + esc(sc.A.answer) + '”</div><p style="margin:26px 0 0"><span class="chip pass">' + ic("check") + "Correct</span></p>";
      c.appendChild(L);
      var idx = [3, 7, 10, 11];
      var rows = idx.map(function (i) {
        var s = F.sentences[i], flag = s.gold && !s.kept;
        return '<div class="srow ' + (s.kept ? "keep" : "drop cut") + (flag ? " flag" : "") + '"><span class="si">' + (s.kept ? ic("check") : ic("x")) + '</span><span class="st trunc">' + esc(s.text) + '</span><span class="sp mono">' + s.prob.toFixed(3) + "</span>" + (s.gold ? '<span class="gt">holds the answer</span>' : "") + '<i class="cutline"></i></div>';
      }).join("");
      var R = document.createElement("div"); R.className = "abs sheet cost-f frag"; R.setAttribute("data-step", 1);
      R.style.cssText = "left:560px;top:150px;width:1120px;height:520px";
      R.innerHTML = '<span class="lab2">Verified RAG, after trimming</span><p class="cap" style="margin:6px 0 14px">Kept if the score is ' + D.thresholds.tau_keep.toFixed(2) + ' or above.</p><div class="srows tight">' + rows + "</div>" +
        '<p class="cap c-reject" style="margin:14px 0 8px;font-weight:600">The sentence with the answer scored ' + F.sentences[11].prob.toFixed(3) + ', just under the ' + D.thresholds.tau_keep.toFixed(2) + ' cut.</p><p class="cap" style="margin:0;color:var(--ink)"><b class="mono">' + INT(F.words_sent) + '</b> words left. Sufficiency <b class="mono">' + F.sufficiency.toFixed(3) + '</b>. <span class="chip abstain" style="margin-left:10px">' + ic("stop") + "I don’t know</span></p>";
      c.appendChild(R);
    }
  });

  /* ============ 23. judge ============ */
  def("judge", {
    steps: 1,
    mount: function (el) {
      var c = C(el), J = D.judge;
      var s = svgBox(c, 1000, 660, "abs judge-svg"); s.style.left = 0; s.style.top = 0;
      var groups = [["pass", J.both_correct, "Both say correct", 0, 8], ["rej", J.both_wrong, "Both say wrong", 370, 7], ["hold", J.judge_only_correct, "Judge accepts an alias", 730, 5]];
      var dots = [], pitch = 40, top = 90;
      groups.forEach(function (g) {
        var cols = g[4];
        for (var i = 0; i < g[1]; i++) {
          var gx = g[3] + 20 + (i % cols) * pitch, gy = top + 20 + Math.floor(i / cols) * pitch;
          var d = SV("circle", { cx: gx, cy: gy, r: 15, "class": "dot " + g[0] }, s);
          dots.push({ d: d, gx: gx, gy: gy, cls: g[0] });
        }
        var cx = g[3] + (cols * pitch) / 2;
        txt(s, g[3], 430, String(g[1]), "val big2 " + (g[0] === "pass" ? "c-pass" : g[0] === "rej" ? "c-reject" : "c-hold"), "start");
        txt(s, g[3], 480, g[2], "lab m", "start");
      });
      txt(s, 0, 36, "100 answered test questions, each graded twice", "lab m dim", "start");
      el._dots = dots;
      var R = document.createElement("div"); R.className = "abs frag jr"; R.setAttribute("data-step", 1);
      R.style.cssText = "left:1060px;top:20px;width:620px";
      R.innerHTML = '<div class="agree"><span class="mono">' + P0(J.agreement) + '</span><small>% agree, κ = ' + J.kappa.toFixed(2) + '</small></div>' +
        '<p class="cap" style="margin:6px 0 24px;color:var(--ink)">All ' + J.judge_only_correct + ' disagreements go one way: the judge accepts an alias that the strict metric rejects.</p>' +
        '<div class="alias"><i>answered</i><span>“Chris Pine”</span></div><div class="alias"><i>gold</i><span>“Christopher Whitelaw Pine”</span></div>' +
        '<div class="alias" style="margin-top:22px"><i>answered</i><span>“Jersey barriers”</span></div><div class="alias"><i>gold</i><span>“Jersey barrier”</span></div>' +
        '<p class="cap" style="margin:24px 0 0">So our hallucination rates are overstated for every arm.</p>';
      c.appendChild(R);
    },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s);
      el._dots.forEach(function (o, i) {
        var gx = 20 + (i % 10) * 40 + 280, gy = 110 + Math.floor(i / 10) * 40; // start: one 10x10 grid
        o.d.classList.add("n");
        tl.fromTo(o.d, { attr: { cx: gx, cy: gy } }, { attr: { cx: o.gx, cy: o.gy }, duration: 1.0, ease: "power3.inOut" }, 0.9 + i * 0.006);
        tl.call(function () { o.d.classList.remove("n"); }, null, 1.1 + i * 0.006);
      });
    }
  });

  /* ============ 24. limits ============ */
  def("limits", {
    mount: function (el) {
      var c = C(el), grid = document.createElement("div"); grid.className = "lgrid";
      var aP = A("A", "misleading").planted * 100, fP = A("F", "misleading").planted * 100, cp = cmp("F", "A", "misleading", "planted");
      var ed = D.test.comparisons.filter(function (x) { return x.a === "E" && x.b === "D"; });
      var maxE = Math.max.apply(null, ed.map(function (x) { return Math.abs(x.mean_diff * 100); }));
      var b = function (ds, m) { return BEIR(ds, m); };
      var tiles = [
        { h: "Planted answers mostly get through",
          t: "Down from " + aP.toFixed(1) + "% to " + fP.toFixed(1) + "%, and the interval includes zero. Altered but fluent text looks fine.",
          v: '<div style="width:100%"><div class="hb"><span>Plain RAG</span><div class="tr"><i class="b-pl" style="width:' + (aP / 40 * 100) + '%"></i></div><b class="mono">' + aP.toFixed(1) + '%</b></div><div class="hb"><span>Verified</span><div class="tr"><i class="b-pl" style="width:' + (fP / 40 * 100) + '%"></i></div><b class="mono">' + fP.toFixed(1) + "%</b></div></div>" },
        { h: "The rewrite step did nothing measurable",
          t: "Every difference between E and D is within " + maxE.toFixed(1) + " points. None is significant.",
          v: "nl" },
        { h: "Everything is trained on HotpotQA",
          t: "Out of domain, the verifier ranks 1.6 to 3.1 points below its own base model.",
          v: "beir" },
        { h: "The metric is strict",
          t: "15 of the 43 answers marked hallucinated were aliases the judge accepted.",
          v: "dots" }
      ];
      tiles.forEach(function (tl, i) {
        var a = document.createElement("article"); a.className = "sheet lt frag"; a.setAttribute("data-step", i + 1);
        a.innerHTML = "<h3>" + tl.h + '</h3><div class="vz"></div><p class="tx">' + tl.t + "</p>";
        var vz = a.querySelector(".vz");
        if (tl.v === "nl") {
          var s = svgBox(vz, 760, 130, "nl-svg"), X = function (v) { return 380 + v * 66; };
          rect(s, X(-1.3), 40, X(1.3) - X(-1.3), 50, "band-ns", 0);
          line(s, X(-5.5), 65, X(5.5), 65, "axis-l"); line(s, X(0), 30, X(0), 100, "ink-l");
          [-4, -2, 0, 2, 4].forEach(function (v) { txt(s, X(v), 124, (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v), "ax s", "middle"); });
          ed.forEach(function (x, k) { SV("circle", { cx: X(x.mean_diff * 100), cy: 65 + (k % 2 ? 14 : -14), r: 9, "class": "ci-d " + (x.ci_low > 0 || x.ci_high < 0 ? "sig" : "") }, s); });
          txt(s, 760, 20, "E minus D, points", "ax s", "end");
        } else if (tl.v === "beir") {
          var rows = [["SciFact", b("scifact", "hybrid + ms-marco-minilm-l6-v2"), b("scifact", "hybrid + verifier-minilm-l6-v4-wise07")], ["NFCorpus", b("nfcorpus", "hybrid + ms-marco-minilm-l6-v2"), b("nfcorpus", "hybrid + verifier-minilm-l6-v4-wise07")], ["FiQA", b("fiqa", "hybrid + ms-marco-minilm-l6-v2"), b("fiqa", "hybrid + verifier-minilm-l6-v4-wise07")]];
          var mb = miniBars(vz, 760, 140, rows.map(function (r) { return { label: r[0], bars: [{ v: r[1], cls: "bar-A", label: r[1].toFixed(1) }, { v: r[2], cls: "bar-F", label: r[2].toFixed(1) }] }; }), 80, P1);
          mb.style.width = "100%";
        } else if (tl.v === "dots") {
          var s2 = svgBox(vz, 760, 130, "dots-svg");
          for (var k = 0; k < 43; k++) SV("circle", { cx: 16 + (k % 22) * 34, cy: 30 + Math.floor(k / 22) * 40, r: 13, "class": "dot " + (k < 15 ? "hold" : "rej") }, s2);
          txt(s2, 16, 124, "15 aliases", "lab s c-hold", "start", { "font-size": 26 });
        } else vz.innerHTML = tl.v;
        grid.appendChild(a);
      });
      c.appendChild(grid);
    }
  });

  /* ============ 25. product UI ============ */
  def("ui", {
    mount: function (el) {
      var c = C(el), row = document.createElement("div"); row.className = "shots";
      [["explorer-desktop-light.png", "Pipeline explorer", "22 real traces: plain RAG next to the full system, plus a live box."],
       ["results-desktop-light.png", "Results dashboard", "Reads the metrics files, test split when it exists."]].forEach(function (s) {
        var d = document.createElement("div"); d.className = "shotcol";
        d.innerHTML = '<div class="shot"><div class="bar"><i></i><i></i><i></i></div><div class="view"><img src="../../screenshots/' + s[0] + '" alt="' + s[1] + ' screenshot"></div></div><h3>' + s[1] + "</h3><p>" + s[2] + "</p>";
        row.appendChild(d);
      });
      c.appendChild(row);
    },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s);
      el.querySelectorAll(".view img").forEach(function (im, i) {
        var view = im.parentNode, extra = Math.max(0, im.offsetHeight - view.offsetHeight);
        if (!extra) return;
        tl.to(im, { y: -Math.min(extra, 700), duration: 5, ease: "sine.inOut" }, 0.8 + i * 0.3).to(im, { y: 0, duration: 1.4, ease: "power2.inOut", clearProps: "transform" }, ">0.4");
      });
    }
  });

  /* ============ 26. next ============ */
  def("next", {
    mount: function (el) {
      var c = C(el);
      var items = [
        ["Planted answers get through", "Look for a different signal: paragraphs that disagree with each other, or a model trained on edited text."],
        ["The rewrite step adds nothing", "Drop it, or rework it with a stronger rewriter."],
        ["One dataset, one seed", "Train and test beyond HotpotQA, and repeat with three seeds."],
        ["The metric is strict", "Count aliases as correct, and add a claim-level faithfulness check."]
      ];
      var h = '<div class="nx">';
      items.forEach(function (it, i) {
        h += '<div class="nrow frag" data-step="' + (i + 1) + '"><span class="chip reject">' + ic("x") + '<span class="t">' + it[0] + '</span></span><svg class="nar" viewBox="0 0 80 24"><path d="M2 12h70M60 3l12 9-12 9"/></svg><p>' + it[1] + "</p></div>";
      });
      c.innerHTML = h + "</div>";
    }
  });

  /* ============ 27. close ============ */
  def("close", {
    mount: function (el) {
      var cs = D.test.comparisons.filter(function (x) { return x.a === "F" && x.b === "A" && x.metric === "hallucinate"; }).map(function (x) { return x.mean_diff * 100; });
      var lo = Math.min.apply(null, cs), hi = Math.max.apply(null, cs);
      var sup = A("F", "supportive"), supA = A("A", "supportive"), cc = cmp("F", "A", "supportive", "correct");
      var h = '<h2 class="cl1">Check the evidence before you answer.</h2><p class="cl2">Say “I don’t know” when it isn’t there.</p>' +
        '<div class="recap">' +
        '<div><span class="k">Hallucination</span><b class="mono">' + PP(hi / 100) + " to " + PP(lo / 100) + '</b><small>points, all three conditions</small></div>' +
        '<div><span class="k">Context</span><b class="mono">' + INT(supA.context_tokens) + " → " + INT(sup.context_tokens) + '</b><small>tokens sent to the model</small></div>' +
        '<div><span class="k">The price</span><b class="mono">' + PP(cc.mean_diff) + '</b><small>points of correct answers, supportive</small></div></div>' +
        '<p class="qa">Questions?</p>';
      var box = document.createElement("div"); box.className = "abs closebox"; box.innerHTML = h; el.appendChild(box);
      el._box = box;
    },
    enter: function (el, ctx) {
      var tl = Deck.tl(ctx.s), b = el._box;
      tl.from(b.querySelector(".cl1"), { y: 36, opacity: 0, duration: 0.9, ease: "power3.out" }, 0.1);
      tl.from(b.querySelector(".cl2"), { y: 24, opacity: 0, duration: 0.8, ease: "power3.out" }, 0.6);
      tl.from(b.querySelectorAll(".recap > div"), { y: 30, opacity: 0, duration: 0.7, stagger: 0.15, ease: "power3.out" }, 1.2);
      tl.from(b.querySelector(".qa"), { opacity: 0, duration: 0.6 }, 2.0);
    }
  });

  /* ============ appendix ============ */
  function table(cols, rows, hlRow, bestCols) {
    var h = '<table class="t"><thead><tr>' + cols.map(function (x) { return "<th>" + x + "</th>"; }).join("") + "</tr></thead><tbody>";
    rows.forEach(function (r, i) {
      h += "<tr" + (i === hlRow ? ' class="hl"' : "") + ">" + r.map(function (x, j) { return '<td class="' + (j < (bestCols && bestCols.textCols || 1) ? "l" : "") + (bestCols && bestCols.best && bestCols.best[j] === i ? " best" : "") + '">' + x + "</td>"; }).join("") + "</tr>";
    });
    return h + "</tbody></table>";
  }
  function num(x) { return parseFloat(String(x).replace(/,/g, "")); }
  function argmin(rows, j) { var b = 0; rows.forEach(function (r, i) { if (num(r[j]) < num(rows[b][j])) b = i; }); return b; }
  function argmax(rows, j) { var b = 0; rows.forEach(function (r, i) { if (num(r[j]) > num(rows[b][j])) b = i; }); return b; }
  def("a-arms", {
    mount: function (el) {
      var adds = { A: "plain hybrid RAG", B: "off-the-shelf reranker", C: "our verifier as filter", D: "sentence trimming", E: "decision and rewrite", F: "sufficiency gate (full)", G: "one threshold" };
      var rows = ARMLIST.map(function (a) {
        return [a, adds[a], P1(A(a, "supportive").hallucinate), P1(A(a, "supportive").correct), P1(A(a, "missing").hallucinate), P1(A(a, "misleading").hallucinate), P1(A(a, "misleading").planted), INT(A(a, "supportive").context_tokens)];
      });
      var best = { 2: argmin(rows, 2), 3: argmax(rows, 3), 4: argmin(rows, 4), 5: argmin(rows, 5), 6: argmin(rows, 6), 7: argmin(rows, 7) };
      C(el).innerHTML = table(["Arm", "Adds", "Hallu. supportive", "Correct supportive", "Hallu. missing", "Hallu. misleading", "Planted misleading", "Context tokens"], rows, 5, { textCols: 2, best: best }) +
        '<p class="cap" style="margin:18px 0 0">Test split, %, ' + A("A", "supportive").n + " / " + A("A", "missing").n + " / " + A("A", "misleading").n + " questions. Best value per column in blue. Context is the supportive average.</p>";
      C(el).querySelector("th:nth-child(2)").classList.add("l");
    }
  });
  def("a-beir", {
    mount: function (el) {
      var defs = [["BM25", "bm25"], ["Dense (bge-small)", "dense"], ["Hybrid, no reranker", "hybrid"], ["Hybrid + MiniLM-L6, the base", "hybrid + ms-marco-minilm-l6-v2"], ["Hybrid + MiniLM-L12", "hybrid + ms-marco-minilm-l12-v2"], ["Hybrid + bge-reranker-base", "hybrid + bge-reranker-base"], ["Hybrid + our fine-tune", "hybrid + verifier-minilm-l6-v4"], ["Hybrid + our final, WiSE-FT 0.7", "hybrid + verifier-minilm-l6-v4-wise07"]];
      var rows = defs.map(function (d) { return [d[0], BEIR("scifact", d[1]).toFixed(1), BEIR("nfcorpus", d[1]).toFixed(1), BEIR("fiqa", d[1]).toFixed(1)]; });
      var best = { 1: argmax(rows, 1), 2: argmax(rows, 2), 3: argmax(rows, 3) };
      C(el).innerHTML = table(["Method", "SciFact", "NFCorpus", "FiQA"], rows, 7, { textCols: 1, best: best }) +
        '<p class="cap" style="margin:18px 0 0">BEIR test nDCG@10 × 100, reranking the hybrid top 50. Best per column in blue. No reranker we tried beat hybrid retrieval on SciFact or NFCorpus.</p>';
    }
  });
  def("a-thr", {
    mount: function (el) {
      var th = D.thresholds;
      var rows = [
        ["τ_hi", th.tau_hi.toFixed(2), "Best paragraph at or above: correct", "Smallest grid value where at least 90% of questions called correct have a gold paragraph."],
        ["τ_lo", th.tau_lo.toFixed(2), "Best paragraph below: incorrect", "Largest value under τ_hi that calls 5% or fewer supportive questions incorrect."],
        ["τ_chunk", th.tau_chunk.toFixed(2), "Paragraphs below are dropped", "Fewest chunks with 90% recall of gold. No setting reached it, so the best was taken."],
        ["τ_keep", th.tau_keep.toFixed(2), "Sentences at or above stay", "Largest value with 90% recall of supporting facts. None reached it, so best recall."],
        ["τ_abstain", th.tau_abstain.toFixed(2), "Sufficiency at or above: answer", "Rule written into PLAN.md before dev answers existed: best mean of correct − hallucinate − planted."]
      ];
      var h = '<table class="t thr"><thead><tr><th>Threshold</th><th>Value</th><th class="l">What it does</th><th class="l">How it was chosen, on dev</th></tr></thead><tbody>';
      rows.forEach(function (r) { h += "<tr><td class=\"l mono\">" + r[0] + "</td><td class=\"mono\">" + r[1] + "</td><td class=\"l\">" + r[2] + "</td><td class=\"l\">" + r[3] + "</td></tr>"; });
      C(el).innerHTML = h + "</tbody></table>";
    }
  });

})();
