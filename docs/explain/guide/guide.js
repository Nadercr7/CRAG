/* Speaker guide: theme toggle, active section in the TOC, thumbnail lightbox, subtle reveal. */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");

  /* theme: follow the system until the toggle is used; remember the choice if storage works */
  function stored() { try { return localStorage.getItem("vrag-guide-theme"); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem("vrag-guide-theme", v); } catch (e) { /* private mode */ } }
  var s = stored();
  if (s === "light" || s === "dark") root.setAttribute("data-theme", s);
  var btn = document.getElementById("theme");
  if (btn) btn.addEventListener("click", function () {
    var cur = root.getAttribute("data-theme");
    if (!cur) cur = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    var next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    save(next);
  });

  /* active chip in the sticky TOC */
  var links = {};
  [].forEach.call(document.querySelectorAll(".toc a"), function (a) { links[a.getAttribute("data-t")] = a; });
  var order = Object.keys(links);
  var toc = document.querySelector(".toc");
  function setActive(id) {
    order.forEach(function (k) { links[k].classList.toggle("on", k === id); });
    var a = links[id];
    if (a && toc) {
      var tr = toc.getBoundingClientRect(), ar = a.getBoundingClientRect();
      if (ar.left < tr.left + 8 || ar.right > tr.right - 8) toc.scrollTo({ left: toc.scrollLeft + (ar.left - tr.left) - (tr.width - ar.width) / 2, behavior: "auto" });
    }
  }
  var secs = order.map(function (k) { return document.getElementById(k); }).filter(Boolean);
  function onScroll() {
    var y = window.scrollY + 120, cur = secs[0] && secs[0].id;
    secs.forEach(function (el) { if (el.offsetTop <= y) cur = el.id; });
    if (cur) setActive(cur);
  }
  var tick = false;
  window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(function () { tick = false; onScroll(); }); } }, { passive: true });
  onScroll();

  /* lightbox */
  var lb = document.getElementById("lb");
  if (lb && lb.showModal) {
    var big = lb.querySelector("img");
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".thumb-btn");
      if (b) { var im = b.querySelector("img"); big.src = im.currentSrc || im.src; big.alt = im.alt; lb.showModal(); return; }
      if (e.target === lb || e.target.closest("dialog#lb")) lb.close();
    });
  }

  /* reveal on scroll; anything not revealed by the time it is printed is shown anyway */
  var slides = [].slice.call(document.querySelectorAll(".slide"));
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) {
    slides.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.04 });
    slides.forEach(function (el) { io.observe(el); });
    /* jumping to a hash must not leave the target faded out */
    window.addEventListener("hashchange", function () {
      var t = document.getElementById(location.hash.slice(1));
      if (t) { t.classList.add("in"); [].forEach.call(t.querySelectorAll(".slide"), function (x) { x.classList.add("in"); }); }
    });
  }
  window.addEventListener("beforeprint", function () { slides.forEach(function (el) { el.classList.add("in"); }); });
})();
