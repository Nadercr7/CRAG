/* Verified RAG slides: deck engine.
   Stage scaling, navigation with build steps, hash, notes, overview, theme.
   Slide content modules register through Deck.def() in slides-content.js. */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");
  var D = window.VRAG_DATA || {};
  var mqReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  var Deck = (window.Deck = { defs: {}, slides: [], cur: -1, step: 0, D: D });
  Deck.def = function (id, def) { Deck.defs[id] = def; };
  Deck.canAnim = function () { return !!window.gsap && !mqReduce.matches; };

  /* ---------- helpers ---------- */
  Deck.V = function (path) {
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, D);
  };
  var fmts = {
    pct1: function (v) { return (v * 100).toFixed(1); },
    pct0: function (v) { return Math.round(v * 100).toString(); },
    int: function (v) { return Math.round(v).toLocaleString("en-US"); },
    f1: function (v) { return Number(v).toFixed(1); },
    f2: function (v) { return Number(v).toFixed(2); },
    f3: function (v) { return Number(v).toFixed(3); },
    pp: function (v) { return (v < 0 ? "−" : "+") + Math.abs(v * 100).toFixed(1); },
    raw: function (v) { return String(v); }
  };
  Deck.fmt = fmts;
  Deck.bind = function (scope) {
    scope.querySelectorAll("[data-bind]").forEach(function (n) {
      var v = Deck.V(n.getAttribute("data-bind"));
      var f = fmts[n.getAttribute("data-fmt") || "raw"];
      if (v != null) n.textContent = f(v);
    });
  };
  Deck.svg = function (tag, attrs, parent) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (tag === "use") { e.setAttribute("width", 24); e.setAttribute("height", 24); }
    if (parent) parent.appendChild(e);
    return e;
  };
  Deck.html = function (tag, attrs, parent, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  Deck.tl = function (s, vars) {
    var t = window.gsap.timeline(vars || {});
    s.tls.push(t);
    return t;
  };
  Deck.countUp = function (s, tl, el, to, fmt, at, dur) {
    var o = { v: 0 };
    tl.to(o, { v: to, duration: dur || 1.1, ease: "power2.out", onUpdate: function () { el.textContent = fmt(o.v); } }, at || 0);
  };

  /* ---------- state ---------- */
  var stage, slidesEl, notesEl, gridEl, toolsEl, barEl, numEl;
  var slides = Deck.slides;
  var notesOpen = false;
  var outgoing = [];

  function finish(s) {
    if (!s) return;
    s.tls.forEach(function (t) { t.progress(1).kill(); });
    s.tls = [];
  }

  function maxStep(s) { return s.steps; }

  function applyState(s, step, anim) {
    var el = s.el;
    el.setAttribute("data-step", step);
    el.querySelectorAll(".frag[data-step]").forEach(function (f) {
      f.classList.toggle("on", +f.getAttribute("data-step") <= step);
    });
    if (s.def && s.def.apply) s.def.apply(el, step, { anim: anim && Deck.canAnim(), s: s });
  }

  function quiet(fn) {
    stage.classList.add("noanim");
    fn();
    void stage.offsetWidth;
    requestAnimationFrame(function () { stage.classList.remove("noanim"); });
  }

  function updateChrome() {
    var s = slides[Deck.cur];
    numEl.textContent = Deck.cur + 1 + " / " + slides.length;
    barEl.style.transform = "scaleX(" + (slides.length > 1 ? Deck.cur / (slides.length - 1) : 1) + ")";
    if (location.hash !== "#s-" + (Deck.cur + 1)) {
      try { history.replaceState(null, "", "#s-" + (Deck.cur + 1)); } catch (e) { location.hash = "s-" + (Deck.cur + 1); }
    }
    document.title = "Verified RAG: " + s.title;
    var np = notesEl.querySelector("p"), nh = notesEl.querySelector("h4");
    nh.textContent = "Slide " + (Deck.cur + 1) + ": " + s.title + (s.section ? "  (" + s.section + ")" : "");
    np.textContent = s.notes;
    if (s.def && s.def.live) s.def.live(s.el, true);
  }

  function show(i, where, dir) {
    if (i < 0 || i >= slides.length) return;
    var prev = slides[Deck.cur];
    var nxt = slides[i];
    if (prev === nxt && where === "start") return;
    if (prev) { finish(prev); if (prev.def && prev.def.leave) prev.def.leave(prev.el); }
    // clear stale outgoing slides
    outgoing.forEach(function (o) { if (window.gsap) window.gsap.killTweensOf(o); o.classList.remove("active"); o.style.opacity = ""; o.style.transform = ""; });
    outgoing = [];
    var anim = Deck.canAnim();
    if (prev && prev !== nxt) {
      if (anim) {
        outgoing.push(prev.el);
        prev.el.style.zIndex = 1;
        window.gsap.to(prev.el, { opacity: 0, duration: 0.3, ease: "power1.out", onComplete: function () {
          prev.el.classList.remove("active"); prev.el.style.opacity = ""; prev.el.style.zIndex = "";
          outgoing = outgoing.filter(function (x) { return x !== prev.el; });
        } });
      } else prev.el.classList.remove("active");
    }
    Deck.cur = i;
    var atEnd = where === "end" || where === "final";
    Deck.step = atEnd ? maxStep(nxt) : 0;
    nxt.el.classList.add("active");
    quiet(function () { applyState(nxt, Deck.step, false); });
    if (anim && prev && prev !== nxt && where !== "final") {
      window.gsap.fromTo(nxt.el, { opacity: 0, x: (dir || 1) * 28 }, { opacity: 1, x: 0, duration: 0.4, ease: "power2.out", clearProps: "opacity,transform" });
    }
    if (!atEnd && nxt.def && nxt.def.enter && anim) {
      nxt.tls = [];
      nxt.def.enter(nxt.el, { anim: true, s: nxt });
    }
    updateChrome();
  }

  function next() {
    var s = slides[Deck.cur];
    if (Deck.step < maxStep(s)) {
      finish(s);
      Deck.step++;
      applyState(s, Deck.step, true);
    } else show(Deck.cur + 1, "start", 1);
  }
  function prevFn() {
    var s = slides[Deck.cur];
    if (Deck.step > 0) {
      finish(s);
      Deck.step--;
      applyState(s, Deck.step, false);
    } else show(Deck.cur - 1, "end", -1);
  }
  Deck.next = next; Deck.prev = prevFn;
  Deck.goto = function (n, opts) { // n is 1-based
    show(Math.max(0, Math.min(slides.length - 1, n - 1)), opts && opts.final ? "final" : "start", 1);
  };

  /* ---------- fit ---------- */
  function fit() {
    var W = window.innerWidth, H = window.innerHeight - (notesOpen ? notesEl.offsetHeight : 0);
    var s = Math.min(W / 1920, H / 1080);
    stage.style.transform = "translate(" + (W - 1920 * s) / 2 + "px," + (H - 1080 * s) / 2 + "px) scale(" + s + ")";
    Deck.scale = s;
  }

  /* ---------- theme ---------- */
  function effTheme() {
    return root.getAttribute("data-theme") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  Deck.setTheme = function (t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("vrag-theme", t); } catch (e) {}
  };
  function toggleTheme() { Deck.setTheme(effTheme() === "dark" ? "light" : "dark"); }

  /* ---------- notes, grid ---------- */
  function toggleNotes(force) {
    notesOpen = force != null ? force : !notesOpen;
    notesEl.classList.toggle("open", notesOpen);
    fit();
  }
  function buildGrid() {
    var g = gridEl.querySelector(".gg");
    g.innerHTML = "";
    slides.forEach(function (s, i) {
      var b = document.createElement("button");
      b.className = "gridcard" + (i === Deck.cur ? " cur" : "");
      var th = document.createElement("div"); th.className = "th";
      var inner = document.createElement("div"); inner.className = "thumbs";
      inner.style.cssText = "background:var(--paper)";
      var clone = s.el.cloneNode(true);
      clone.classList.remove("active");
      clone.removeAttribute("id");
      clone.querySelectorAll("[id]").forEach(function (n) { n.removeAttribute("id"); });
      clone.querySelectorAll(".notes").forEach(function (n) { n.remove(); });
      clone.querySelectorAll("[data-live-mount]").forEach(function (n) { n.innerHTML = ""; });
      clone.querySelectorAll("use").forEach(function () {});
      inner.appendChild(clone);
      th.appendChild(inner);
      b.appendChild(th);
      var lb = document.createElement("span"); lb.className = "lb";
      lb.innerHTML = "<b>" + (i + 1) + "</b>";
      lb.appendChild(document.createTextNode(s.title));
      b.appendChild(lb);
      b.addEventListener("click", function () { toggleGrid(false); show(i, "start", 1); });
      g.appendChild(b);
    });
  }
  function scaleThumbs() {
    gridEl.querySelectorAll(".th").forEach(function (th) {
      var w = th.clientWidth; th.firstChild.style.transform = "scale(" + w / 1920 + ")";
    });
  }
  function toggleGrid(force) {
    var open = force != null ? force : !gridEl.classList.contains("open");
    if (open) {
      buildGrid();
      gridEl.classList.add("open");
      scaleThumbs();
      var c = gridEl.querySelector(".gridcard.cur"); if (c) { c.scrollIntoView({ block: "center" }); c.focus(); }
    } else { gridEl.classList.remove("open"); gridEl.querySelector(".gg").innerHTML = ""; }
  }

  /* ---------- init ---------- */
  function init() {
    stage = document.getElementById("stage");
    slidesEl = document.getElementById("slides");
    notesEl = document.getElementById("notes");
    gridEl = document.getElementById("grid");
    toolsEl = document.getElementById("tools");
    barEl = document.getElementById("bar");
    numEl = document.getElementById("num");
    try { var t = localStorage.getItem("vrag-theme"); if (t === "light" || t === "dark") root.setAttribute("data-theme", t); } catch (e) {}

    Deck.bind(document);
    var els = slidesEl.querySelectorAll(".slide");
    els.forEach(function (el, i) {
      var id = el.getAttribute("data-id");
      var def = Deck.defs[id] || {};
      var s = { el: el, id: id, def: def, tls: [], steps: 0, title: el.getAttribute("data-title") || id, section: "", notes: "" };
      var sec = el.querySelector(".marker");
      s.section = sec ? sec.querySelector("b").textContent + " \u00b7 " + sec.querySelector("span").textContent : "";
      var n = el.querySelector(".notes");
      s.notes = n ? n.textContent.trim() : "";
      slides.push(s);
      try { if (def.mount) def.mount(el, s); } catch (e) { console.error("mount " + id, e); }
      var fs = 0;
      el.querySelectorAll(".frag[data-step]").forEach(function (f) { fs = Math.max(fs, +f.getAttribute("data-step")); });
      s.steps = Math.max(def.steps || 0, fs);
    });
    slides.forEach(function (s, i) { s.el.setAttribute("data-n", i + 1); });

    fit();
    window.addEventListener("resize", function () { fit(); if (gridEl.classList.contains("open")) scaleThumbs(); });

    var start = 0;
    var m = /^#s-(\d+)/.exec(location.hash);
    if (m) start = Math.max(0, Math.min(slides.length - 1, +m[1] - 1));
    show(start, "force", 1);
    stage.classList.add("ready");

    window.addEventListener("hashchange", function () {
      var m2 = /^#s-(\d+)/.exec(location.hash);
      if (m2 && +m2[1] - 1 !== Deck.cur) show(Math.max(0, Math.min(slides.length - 1, +m2[1] - 1)), "start", 1);
    });

    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      var k = e.key;
      var onBtn = tag === "BUTTON";
      if (gridEl.classList.contains("open")) {
        if (k === "Escape" || k === "g" || k === "G") { toggleGrid(false); e.preventDefault(); }
        return;
      }
      if (k === "ArrowRight" || k === "PageDown" || k === "ArrowDown" || ((k === " " || k === "Enter") && !onBtn)) { next(); e.preventDefault(); }
      else if (k === "ArrowLeft" || k === "PageUp" || k === "ArrowUp" || k === "Backspace") { prevFn(); e.preventDefault(); }
      else if (k === "Home") { show(0, "start", -1); e.preventDefault(); }
      else if (k === "End") { show(slides.length - 1, "start", 1); e.preventDefault(); }
      else if (k === "n" || k === "N") toggleNotes();
      else if (k === "g" || k === "G") toggleGrid();
      else if (k === "t" || k === "T") toggleTheme();
      else if (k === "f" || k === "F") { if (document.fullscreenElement) document.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen().catch(function () {}); }
      else if (k === "Escape") toggleNotes(false);
    });

    stage.addEventListener("click", function (e) {
      if (e.target.closest("button,a,input,select,textarea,[data-no-nav]")) return;
      var r = stage.getBoundingClientRect();
      if (e.clientX - r.left < r.width * 0.1) prevFn(); else next();
    });

    // touch swipe
    var tx = null;
    stage.addEventListener("touchstart", function (e) { tx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      if (tx == null) return; var dx = e.changedTouches[0].clientX - tx; tx = null;
      if (Math.abs(dx) > 60) (dx < 0 ? next : prevFn)();
    }, { passive: true });

    // toolbar
    var hideT;
    function showTools() { toolsEl.classList.add("show"); clearTimeout(hideT); hideT = setTimeout(function () { toolsEl.classList.remove("show"); }, 2800); }
    document.addEventListener("mousemove", showTools);
    toolsEl.querySelector("[data-act=grid]").addEventListener("click", function () { toggleGrid(); });
    toolsEl.querySelector("[data-act=notes]").addEventListener("click", function () { toggleNotes(); });
    toolsEl.querySelector("[data-act=theme]").addEventListener("click", toggleTheme);
    toolsEl.querySelector("[data-act=full]").addEventListener("click", function () {
      if (document.fullscreenElement) document.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen().catch(function () {});
    });
    gridEl.querySelector(".gh button") && gridEl.querySelector(".gh button").addEventListener("click", function () { toggleGrid(false); });
    window.__deckReady = true;
  }

  Deck.start = init;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 0); });
  else setTimeout(init, 0);
})();
